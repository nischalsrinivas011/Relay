import { describe, expect, it } from "vitest";
import { generateWorkforce, initialMappings } from "@/data/seed";
import { applyTransform, computeCoverage, mappingStatus, suggestMappings } from "@/services/mapping-engine";
import { summarize, validateEmployee, validatePopulation } from "@/services/validation-engine";
import { buildDelivery, processDelivery, applyOutcome, retryDelayMs, RETRY_POLICY, isRetryable } from "@/services/webhook-engine";
import { computeReadiness } from "@/services/readiness";
import { computeReliability, rootCauses } from "@/services/reliability-engine";
import { generatePattern } from "@/services/pattern-engine";
import { aggregate, priorityScore, SYNTHETIC_OBSERVATIONS } from "@/services/feedback-engine";
import { buildInitialState } from "@/lib/initial-state";
import { employmentIndex } from "@/lib/derived";

const workforce = generateWorkforce();
const ctx = (mappings = initialMappings()) => ({ mappings, provisionedEntities: {} as Record<string, boolean> });
const byName = (n: string) => workforce.find((r) => r.values["employee.full_name"] === n)!;

describe("mapping transformations", () => {
  it("normalizes currency to minor units, including the x100 rule", () => {
    expect(applyTransform({ type: "currency_minor_units" }, "85000")).toEqual({ ok: true, value: "8500000" });
    expect(applyTransform({ type: "currency_minor_units" }, "abc").ok).toBe(false);
  });
  it("reformats US dates to ISO 8601", () => {
    expect(applyTransform({ type: "date_format", from: "MM/DD/YYYY" }, "07/04/1990")).toEqual({ ok: true, value: "1990-07-04" });
    expect(applyTransform({ type: "date_format", from: "MM/DD/YYYY" }, "1990-07-04").ok).toBe(false);
  });
  it("maps ISO-2 to ISO-3 and rejects unknown codes", () => {
    expect(applyTransform({ type: "country_iso3" }, "DE")).toEqual({ ok: true, value: "DEU" });
    expect(applyTransform({ type: "country_iso3" }, "UK").ok).toBe(false);
  });
  it("looks up codes and fails on a missing entry", () => {
    const t = { type: "lookup" as const, table: { E: "exempt" } };
    expect(applyTransform(t, "E")).toEqual({ ok: true, value: "exempt" });
    expect(applyTransform(t, "N").ok).toBe(false);
  });
  it("falls back to a second field when the first is empty", () => {
    const anna = byName("Anna Müller");
    const r = applyTransform({ type: "coalesce", fallback: "employee.mobile_phone" }, anna.values["employee.work_phone"], anna);
    expect(r.ok && r.value?.startsWith("+49")).toBe(true);
  });
  it("flags a direct mapping with incompatible formats as needing a transformation", () => {
    expect(mappingStatus({ destKey: "annual_gross_salary", source: "comp.base_salary", transform: { type: "direct" } }, "US")).toBe("needs_transformation");
    expect(mappingStatus({ destKey: "annual_gross_salary", source: "comp.base_salary", transform: { type: "currency_minor_units" } }, "US")).toBe("mapped");
  });
});

describe("synthetic workforce", () => {
  it("has 2,400 records split 1,200 / 450 / 400 / 350", () => {
    expect(workforce).toHaveLength(2400);
    const counts = Object.fromEntries(["US", "CA", "GB", "DE"].map((c) => [c, workforce.filter((r) => r.country === c).length]));
    expect(counts).toEqual({ US: 1200, CA: 450, GB: 400, DE: 350 });
  });
  it("is deterministic", () => {
    expect(generateWorkforce()[123].values["employee.full_name"]).toBe(workforce[123].values["employee.full_name"]);
  });
});

describe("country validation", () => {
  it("blocks all Canada on the missing province mapping, then clears it", () => {
    const m = initialMappings();
    const before = summarize(validatePopulation(workforce, ctx(m)));
    expect(before.byCountry.CA.ready).toBe(0);
    m.CA["address_details.state_or_province"] = { destKey: "address_details.state_or_province", source: "address.province_code", transform: { type: "direct" } };
    m.DE["contact_details.mobile_number"].transform = { type: "coalesce", fallback: "employee.mobile_phone" };
    const after = summarize(validatePopulation(workforce, ctx(m)));
    expect(after).toMatchObject({ ready: 2361, customer_action: 27, schema_error: 8, legal_entity_blocked: 4 });
  });
  it("applies country-specific required fields", () => {
    const de = byName("Anna Müller");
    const v = validateEmployee(de, ctx());
    expect(v.status).toBe("customer_action");
    expect(v.issues.map((i) => i.destKey)).toEqual(["contact_details.mobile_number"]);
    expect(v.requiredCount).toBe(18);
    expect(v.completeCount).toBe(17);
  });
  it("blocks workers on an unconfigured legal entity until it is provisioned", () => {
    const qc = workforce.find((r) => r.values["entity.code"] === "ACME-CA-QC")!;
    const m = initialMappings();
    m.CA["address_details.state_or_province"] = { destKey: "address_details.state_or_province", source: "address.province_code", transform: { type: "direct" } };
    expect(validateEmployee(qc, ctx(m)).status).toBe("legal_entity_blocked");
    expect(validateEmployee(qc, { mappings: m, provisionedEntities: { "ACME-CA-QC": true } }).status).toBe("ready");
  });
  it("masks national IDs in validation messages", () => {
    const bad = workforce.filter((r) => r.country === "US").find((r) => r.values["tax.ssn"] === "123456789")!;
    const msg = validateEmployee(bad, ctx()).issues.find((i) => i.destKey === "personal_details.ssn")!.message;
    expect(msg).not.toContain("123456789");
  });
});

describe("mapping suggestions", () => {
  it("suggests province_code for Canada at 94% and never applies it", () => {
    const m = initialMappings();
    const s = suggestMappings("CA", m.CA, workforce.filter((r) => r.country === "CA"));
    expect(s[0]).toMatchObject({ destKey: "address_details.state_or_province", source: "address.province_code", confidence: 94 });
    expect(m.CA["address_details.state_or_province"].source).toBeNull();
  });
  it("detects the German mobile gap and proposes a fallback", () => {
    const m = initialMappings();
    const cov = computeCoverage(m.DE["contact_details.mobile_number"], workforce.filter((r) => r.country === "DE"));
    expect(cov).toMatchObject({ filled: 347, total: 350 });
    expect(cov.fallbackCandidate?.source).toBe("employee.mobile_phone");
  });
});

describe("webhook processing", () => {
  const index = employmentIndex();
  const emp = workforce[10].id;
  it("deduplicates on event_id so state changes once", () => {
    const processed = new Set<string>();
    let applied = 0;
    for (const deliveryId of ["d1", "d2"]) {
      const d = buildDelivery({ eventId: "evt_same", type: "employment.updated", employeeId: emp, timestampMs: 1_700_000_000_000, source: "demo", deliveryId });
      const o = processDelivery(d, { processedEventIds: processed, employmentToEmployee: index, now: Date.now() });
      if (o.apply) {
        processed.add(o.apply.eventId);
        applied++;
      }
      if (deliveryId === "d2") expect(o.result).toBe("duplicate_ignored");
    }
    expect(applied).toBe(1);
  });
  it("rejects an invalid signature and never processes it", () => {
    const d = buildDelivery({ eventId: "evt_sig", type: "employment.updated", employeeId: emp, timestampMs: 1, scenario: "invalid_signature", source: "demo" });
    const o = processDelivery(d, { processedEventIds: new Set(), employmentToEmployee: index, now: 2 });
    expect(o.result).toBe("rejected");
    expect(o.apply).toBeUndefined();
  });
  it("fails a transient error first, then succeeds on replay", () => {
    let d = buildDelivery({ eventId: "evt_t", type: "employment.updated", employeeId: emp, timestampMs: 1, scenario: "processor_failure", source: "demo" });
    d = applyOutcome(d, processDelivery(d, { processedEventIds: new Set(), employmentToEmployee: index, now: 2 }));
    expect(d.result).toBe("failed");
    expect(isRetryable(d)).toBe(true);
    d = applyOutcome(d, processDelivery(d, { processedEventIds: new Set(), employmentToEmployee: index, now: 3 }));
    expect(d.result).toBe("processed");
    expect(d.attempts).toHaveLength(2);
  });
  it("uses exponential backoff", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000]);
    expect(RETRY_POLICY.maxAttempts).toBe(5);
  });
  it("seeds a retry queue of four transient failures", () => {
    const s = buildInitialState(1_800_000_000_000);
    expect(s.deliveries.filter(isRetryable)).toHaveLength(4);
    expect(s.deliveries.filter((d) => d.result === "duplicate_ignored")).toHaveLength(2);
  });
});

describe("readiness, reliability, pattern, feedback", () => {
  const s = buildInitialState(1_800_000_000_000);
  const heads = { "ACME-CA-QC": 4 };
  it("scores initial readiness at 68%", () => {
    const r = computeReadiness({ discovery: s.discovery, mappings: s.mappings, provisionedEntities: {}, entityHeadcount: heads, subscriptions: s.subscriptions, credentialExpired: false });
    expect(Math.round(r.score * 100)).toBe(68);
    expect(r.items.find((i) => i.key === "entities")?.status).toBe("blocked");
  });
  it("readiness reacts to discovery edits", () => {
    const base = { mappings: s.mappings, provisionedEntities: {}, entityHeadcount: heads, subscriptions: s.subscriptions, credentialExpired: false };
    const a = computeReadiness({ ...base, discovery: s.discovery }).score;
    const b = computeReadiness({ ...base, discovery: { ...s.discovery, payrollCalendarConfirmed: true } }).score;
    expect(b).toBeGreaterThan(a);
    expect(computeReadiness({ ...base, discovery: s.discovery, credentialExpired: true }).items.find((i) => i.key === "auth")?.status).toBe("blocked");
  });
  it("explains Canada's decline by tax_job_category once province is mapped", () => {
    const m = initialMappings();
    m.CA["address_details.state_or_province"] = { destKey: "address_details.state_or_province", source: "address.province_code", transform: { type: "direct" } };
    const results = validatePopulation(workforce, ctx(m));
    const nonReady = Object.fromEntries(results.filter((r) => r.status !== "ready").map((r) => [r.id, r]));
    const input = { summary: summarize(results), nonReady, deliveries: s.deliveries, syncEvents: [], apiLog: s.apiLog, incentives: [], now: 1_800_000_000_000 };
    const ca = rootCauses(input).find((c) => c.country === "CA")!;
    expect(ca.topField).toBe("tax_job_category");
    expect(ca.topCount).toBe(18);
    expect(computeReliability(input).byCountry.find((c) => c.country === "CA")!.success).toBeCloseTo(426 / 446, 5); // 18 missing tax category + 2 salary-currency mismatches
  });
  it("generates a pattern from the actual mappings", () => {
    const p = generatePattern({
      mappings: s.mappings,
      subscriptions: s.subscriptions,
      summary: s.run!.summary,
      nonReady: s.run!.nonReady,
      deliveries: s.deliveries,
      discovery: s.discovery,
      snapshot: s.snapshot,
      incentives: [],
      blockedEntityCount: 1,
      credentialExpired: false,
      reconciled: false,
    });
    expect(p.version).toBe("1.0");
    expect(p.counts.checklistSteps).toBe(18);
    expect(p.entries.find((e) => e.country === "CA" && e.destKey === "address_details.state_or_province")?.reusability).toBe("unsupported");
    expect(p.entries.find((e) => e.destKey === "custom_fields.cost_center")?.reusability).toBe("customer_specific");
    expect(p.counts.webhookSubscriptions).toBe(3);
  });
  it("surfaces legal-entity configuration in 3 of 4 implementations", () => {
    const acme = [{ customer: "Acme Global", issue: "legal_entity" as const, manualSteps: 4, blockers: 1 }];
    const le = aggregate([...SYNTHETIC_OBSERVATIONS, ...acme]).find((i) => i.issue === "legal_entity")!;
    expect(le.seenIn).toBe(3);
    expect(le.manualSteps).toBe(11);
    expect(le.blockers).toBe(3);
  });
  it("ranks priority with complexity as a penalty", () => {
    const hi = priorityScore({ customerImpact: 5, feasibility: 4, operationalComplexity: 1, repeatability: 5, revenue: 4 });
    const lo = priorityScore({ customerImpact: 5, feasibility: 4, operationalComplexity: 5, repeatability: 5, revenue: 4 });
    expect(hi.value).toBeGreaterThan(lo.value);
    expect(hi.tier).toBe("P0");
  });
});

describe("feedback ranking", () => {
  it("puts the issue that blocks customers first", () => {
    const acme = [{ customer: "Acme Global", issue: "legal_entity" as const, manualSteps: 4, blockers: 1 }];
    expect(aggregate([...SYNTHETIC_OBSERVATIONS, ...acme])[0].issue).toBe("legal_entity");
  });
});
