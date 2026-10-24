// Turns the current Acme implementation (mappings, rules, edge cases, checklist)
// into a versioned reusable pattern. Everything is derived from live state.

import { COUNTRIES, type CountryCode } from "@/data/countries";
import { DEST_BY_KEY, SOURCE_BY_KEY, destFieldsFor } from "@/data/schemas";
import type { EmployeeValidation, PopulationSummary } from "@/domain/employment";
import type { DiscoveryState, SnapshotState } from "@/domain/integration";
import type { CountryMappings } from "@/domain/mapping";
import type { ChecklistStep, IntegrationPattern, PatternEntry, Reusability } from "@/domain/pattern";
import type { Incentive } from "@/domain/payroll";
import { SCENARIO_LABEL, type WebhookDelivery, type WebhookSubscription } from "@/domain/webhook";
import { mappingStatus } from "./mapping-engine";
import { requiredMappingHealth } from "./readiness";

export interface PatternInput {
  mappings: Record<CountryCode, CountryMappings>;
  subscriptions: WebhookSubscription[];
  summary: PopulationSummary | null;
  nonReady: Record<string, EmployeeValidation>;
  deliveries: WebhookDelivery[];
  discovery: DiscoveryState;
  snapshot: SnapshotState;
  incentives: Incentive[];
  blockedEntityCount: number;
  credentialExpired: boolean;
  reconciled: boolean;
  previousVersion?: string;
}

export function classify(country: CountryCode, destKey: string, mapping: CountryMappings[string]): { r: Reusability; why: string } {
  const dest = DEST_BY_KEY[destKey];
  const src = mapping.source ? SOURCE_BY_KEY[mapping.source] : undefined;
  if (!mapping.source) {
    return dest?.requiredIn.includes(country) ? { r: "unsupported", why: "Required field with no source in AcmeHR" } : { r: "configurable", why: "Optional; left for the next customer to decide" };
  }
  if (dest?.custom || src?.custom) return { r: "customer_specific", why: "Customer-defined custom field" };
  if (destKey === "legal_entity_id") return { r: "customer_specific", why: "Entity codes are unique to each customer" };
  if (mapping.transform.type === "coalesce") return { r: "configurable", why: "Fallback order depends on the source HRIS setup" };
  if (dest && dest.countries.length < COUNTRIES.length) return { r: "configurable", why: `${country}-only rule` };
  return { r: "reusable", why: "Standard HRIS field, standard transformation" };
}

function checklist(i: PatternInput): ChecklistStep[] {
  const mh = requiredMappingHealth(i.mappings);
  const allStatuses = COUNTRIES.flatMap((c) => Object.values(i.mappings[c.code]).map((m) => mappingStatus(m, c.code)));
  const s = i.summary;
  return [
    { group: "Authentication", label: "Issue an environment-bound sandbox token", done: i.discovery.authentication === "ready" && !i.credentialExpired },
    { group: "Authentication", label: "Verify token against a customer endpoint", done: i.discovery.authentication === "ready" },
    { group: "Legal entities", label: "Confirm payroll eligibility for every legal entity", done: i.blockedEntityCount === 0 },
    { group: "Country configuration", label: "Load destination schemas for US, CA, GB, DE", done: true },
    { group: "Country configuration", label: "Confirm payroll calendars per country", done: i.discovery.payrollCalendarConfirmed },
    { group: "Data mapping", label: "Map every required field in every country", done: mh.healthy === mh.total },
    { group: "Data mapping", label: "Resolve customer mapping decisions", done: !allStatuses.includes("customer_decision") },
    { group: "Data mapping", label: "Save reusable mappings", done: COUNTRIES.some((c) => Object.values(i.mappings[c.code]).some((m) => m.savedReusable)) },
    { group: "Validation", label: "Run the onboarding dry run", done: !!s },
    { group: "Validation", label: "Clear schema validation errors", done: !!s && s.schema_error === 0 },
    { group: "Initial load", label: "Run the snapshot workforce load", done: i.snapshot.status === "done" },
    { group: "Webhooks", label: "Enable all webhook subscriptions", done: i.subscriptions.every((x) => x.enabled) },
    { group: "Webhooks", label: "Verify signatures and event deduplication", done: i.deliveries.some((d) => d.result === "duplicate_ignored") },
    { group: "Payroll", label: "Send a first incentive to the payroll queue", done: i.incentives.some((x) => x.status === "queued") },
    { group: "Observability", label: "Clear the webhook retry queue", done: !i.deliveries.some((d) => d.result === "failed") },
    { group: "Reconciliation", label: "Run a full reconciliation", done: i.reconciled },
    { group: "Customer acceptance", label: "Customer clears their action items", done: !!s && s.customer_action === 0 },
    { group: "Customer acceptance", label: "Payroll director go-live approval", done: i.discovery.constraints.approvals !== "open" },
  ];
}

function edgeCases(i: PatternInput) {
  const out: { title: string; detail: string }[] = [];
  const counts = new Map<string, { n: number; msg: string }>();
  for (const v of Object.values(i.nonReady)) {
    for (const iss of v.issues) {
      const k = `${v.country}:${iss.destKey}:${iss.kind}`;
      const cur = counts.get(k);
      counts.set(k, { n: (cur?.n ?? 0) + 1, msg: iss.message });
    }
  }
  for (const [k, { n, msg }] of counts) {
    const [country, destKey, kind] = k.split(":");
    out.push({ title: `${country} · ${DEST_BY_KEY[destKey]?.label ?? destKey} (${kind.replace("_", " ")})`, detail: `${n} record${n === 1 ? "" : "s"}. Example: ${msg}` });
  }
  // Lessons already resolved in this engagement stay in the pattern.
  const ca = i.mappings.CA["address_details.state_or_province"];
  if (ca?.source === "address.province_code") out.push({ title: "CA · Province stored outside the US state field", detail: "AcmeHR keeps Canadian provinces in province_code. Map per country, not globally." });
  const de = i.mappings.DE["contact_details.mobile_number"];
  if (de?.transform.type === "coalesce") out.push({ title: "DE · Mobile number needs a fallback", detail: `Work phone is empty for some German workers; fall back to ${de.transform.fallback}.` });
  const seen = new Set(i.deliveries.filter((d) => d.scenario).map((d) => d.scenario!));
  for (const sc of seen) out.push({ title: `Webhook · ${SCENARIO_LABEL[sc]}`, detail: "Observed during this engagement; handled by the receiver pipeline." });
  return out;
}

export function generatePattern(i: PatternInput): IntegrationPattern {
  const entries: PatternEntry[] = [];
  for (const c of COUNTRIES) {
    for (const d of destFieldsFor(c.code)) {
      const m = i.mappings[c.code][d.key];
      if (!m) continue;
      const { r, why } = classify(c.code, d.key, m);
      entries.push({ country: c.code, destKey: d.key, source: m.source, transform: m.transform.type, reusability: r, why });
    }
  }
  const reusability: Record<Reusability, number> = { reusable: 0, configurable: 0, customer_specific: 0, unsupported: 0 };
  for (const e of entries) reusability[e.reusability]++;

  // A standard mapping that repeats in every country counts once.
  const standardKeys = new Set(entries.filter((e) => e.reusability === "reusable").map((e) => `${e.destKey}<-${e.source}:${e.transform}`));
  const customKeys = new Set(entries.filter((e) => e.reusability === "customer_specific").map((e) => `${e.country}:${e.destKey}`));
  const countryRules = entries.filter((e) => e.reusability === "configurable" && DEST_BY_KEY[e.destKey]?.countries.length < COUNTRIES.length).length;
  const ec = edgeCases(i);
  const cl = checklist(i);
  const subs = i.subscriptions.filter((s) => s.enabled).map((s) => s.eventType);

  const [maj, min] = (i.previousVersion ?? "0.9").split(".").map(Number);
  const version = i.previousVersion ? `${maj}.${min + 1}` : "1.0";

  return {
    id: `pat_acmehr_remote_gp_${version.replace(".", "_")}`,
    name: "AcmeHR → Remote Global Payroll",
    version,
    createdAt: new Date().toISOString(),
    countries: COUNTRIES.map((c) => c.code),
    counts: {
      standardMappings: standardKeys.size,
      customMappings: customKeys.size,
      countryRules,
      webhookSubscriptions: subs.length,
      edgeCases: ec.length,
      checklistSteps: cl.length,
    },
    reusability,
    entries,
    edgeCases: ec,
    checklist: cl,
    subscriptions: subs,
  };
}
