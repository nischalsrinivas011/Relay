// Reliability metrics computed from live demo state plus a seeded 24h baseline.
// All values are DEMO metrics, never measured production performance.

import { COUNTRIES, COUNTRY_BY_CODE, type CountryCode } from "@/data/countries";
import { DEST_BY_KEY } from "@/data/schemas";
import type { EmployeeValidation, PopulationSummary } from "@/domain/employment";
import type { SyncEvent } from "@/domain/integration";
import type { Incentive } from "@/domain/payroll";
import type { WebhookDelivery } from "@/domain/webhook";
import { mulberry32, percentile } from "@/lib/utils";
import type { ApiCallLog } from "./remote-client";

export interface ReliabilityInput {
  summary: PopulationSummary;
  nonReady: Record<string, EmployeeValidation>;
  deliveries: WebhookDelivery[];
  syncEvents: SyncEvent[];
  apiLog: ApiCallLog[];
  incentives: Incentive[];
  now: number;
}

const rand = mulberry32(2400);
/** Seeded baseline samples so charts have history before the presenter acts. */
export const BASELINE = {
  syncLatencies: Array.from({ length: 240 }, () => 260 + Math.round(rand() * 520) + (rand() < 0.06 ? 900 : 0)),
  hourlyVolume: Array.from({ length: 24 }, (_, h) => 40 + Math.round(30 * Math.sin((h / 24) * Math.PI * 2 - 1.2) + rand() * 18)),
  latencyTrend: Array.from({ length: 24 }, (_, h) => 520 + Math.round(90 * Math.sin(h / 3) + rand() * 60)),
  manualTrend: [6.8, 6.1, 5.9, 5.2, 4.8, 4.4],
};

export type FailureCategory = "Authentication" | "Mapping" | "Validation" | "Rate limiting" | "Webhook" | "Customer configuration" | "Payroll" | "Unknown";

export function syncSuccessByCountry(summary: PopulationSummary) {
  return COUNTRIES.map((c) => {
    const b = summary.byCountry[c.code];
    const attempted = b.total - b.legal_entity_blocked - b.unsupported;
    return { country: c.code, name: c.name, success: attempted ? b.ready / attempted : 1, failing: attempted - b.ready, attempted };
  });
}

const RECOMMENDATIONS: Record<string, string> = {
  tax_job_category: "Add a required-field check for tax_job_category to the discovery data request, before workforce sync.",
  "address_details.state_or_province": "Ship a Canada mapping preset that reads province_code; the US state field does not carry Canadian provinces.",
  "personal_details.ni_number": "Collect NI numbers in the customer pre-onboarding form; block sync until present.",
  "contact_details.mobile_number": "Default the German mobile mapping to work phone with a mobile fallback.",
  salary_currency: "Validate pay currency against the legal entity's payroll currency at the source adapter.",
  legal_entity_id: "Confirm legal-entity eligibility during discovery, before mapping starts.",
  "address_details.postal_code": "Normalize postcode spacing in the transformation layer.",
  "personal_details.tax_id": "Validate Steuer-ID length (11 digits) at source and return the record to the customer.",
  "personal_details.ssn": "Normalize SSN formatting (add dashes) in the transformation layer.",
};

export function rootCauses(input: ReliabilityInput) {
  return syncSuccessByCountry(input.summary)
    .filter((c) => c.failing > 0)
    .map((c) => {
      const counts = new Map<string, number>();
      for (const v of Object.values(input.nonReady)) {
        if (v.country !== c.country || v.status === "legal_entity_blocked" || v.status === "unsupported") continue;
        for (const i of v.issues) counts.set(i.destKey, (counts.get(i.destKey) ?? 0) + 1);
      }
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["unknown", 0];
      return {
        country: c.country as CountryCode,
        name: COUNTRY_BY_CODE[c.country].name,
        success: c.success,
        failing: c.failing,
        topField: top,
        topLabel: DEST_BY_KEY[top]?.label ?? top,
        topCount: n,
        share: c.failing ? Math.min(1, n / c.failing) : 0,
        recommendation: RECOMMENDATIONS[top] ?? "Add a validation rule for this field before sync.",
      };
    })
    .sort((a, b) => a.success - b.success);
}

export function computeReliability(input: ReliabilityInput) {
  const s = input.summary;
  const attempted = s.total - s.legal_entity_blocked - s.unsupported;
  const syncSuccess = attempted ? s.ready / attempted : 1;

  const completedSync = input.syncEvents.filter((e) => e.status === "completed" && e.completedAt);
  const syncLatencies = [
    ...BASELINE.syncLatencies,
    ...completedSync.map((e) => new Date(e.completedAt!).getTime() - new Date(e.createdAt).getTime()),
  ];
  const p95Latency = percentile(syncLatencies, 0.95);

  const d = input.deliveries;
  const nonDup = d.filter((x) => x.result !== "duplicate_ignored");
  const webhookSuccess = nonDup.length ? nonDup.filter((x) => x.result === "processed").length / nonDup.length : 1;
  const duplicates = d.length - nonDup.length;

  const retried = [...d.filter((x) => x.attempts.length > 1), ...input.syncEvents.filter((e) => e.attempts > 1)];
  const retriedOk = d.filter((x) => x.attempts.length > 1 && x.result === "processed").length + input.syncEvents.filter((e) => e.attempts > 1 && e.status === "completed").length;
  const retrySuccess = retried.length ? retriedOk / retried.length : null;

  const recoveries = d
    .filter((x) => x.attempts.length > 1 && x.result === "processed")
    .map((x) => new Date(x.attempts[x.attempts.length - 1].at).getTime() - new Date(x.attempts[0].at).getTime());
  const mttrMs = recoveries.length ? recoveries.reduce((a, b) => a + b, 0) / recoveries.length : null;

  const manual = d.filter((x) => x.attempts.length > 1 || ["failed", "rejected", "ignored", "resolved"].includes(x.result)).length;
  const manualRate = d.length ? manual / d.length : 0;

  const authFailures = input.apiLog.filter((l) => l.status === 401 || l.status === 403).length;
  const apiErrorRate = input.apiLog.length ? input.apiLog.filter((l) => l.status >= 400).length / input.apiLog.length : 0;

  const categories: Record<FailureCategory, number> = {
    Authentication: authFailures,
    Mapping: 0,
    Validation: 0,
    "Rate limiting": input.apiLog.filter((l) => l.status === 429).length,
    Webhook: 0,
    "Customer configuration": 0,
    Payroll: input.incentives.filter((i) => i.status === "rejected").length,
    Unknown: 0,
  };
  for (const v of Object.values(input.nonReady)) {
    const kinds = new Set(v.issues.map((i) => i.kind));
    if (kinds.has("unmapped") || kinds.has("transform_error")) categories.Mapping++;
    else if (kinds.has("invalid") || kinds.has("entity_mismatch")) categories.Validation++;
    else if (kinds.has("missing") || kinds.has("entity_blocked")) categories["Customer configuration"]++;
  }
  for (const x of d) {
    if (x.result === "failed" || x.result === "rejected") {
      if (x.scenario === "rate_limit") categories["Rate limiting"]++;
      else if (x.scenario) categories.Webhook++;
      else categories.Unknown++;
    }
  }

  const hourly = BASELINE.hourlyVolume.map((base, i) => {
    const hourStart = input.now - (23 - i) * 3_600_000 - (input.now % 3_600_000);
    const live = d.filter((x) => x.timestampMs >= hourStart && x.timestampMs < hourStart + 3_600_000).length;
    return { hour: new Date(hourStart).toISOString().slice(11, 16), events: base + live };
  });

  return {
    syncSuccess,
    p95Latency,
    webhookSuccess,
    duplicates,
    schemaFailureRate: s.total ? s.schema_error / s.total : 0,
    retrySuccess,
    mttrMs,
    manualRate,
    authFailures,
    apiErrorRate,
    byCountry: syncSuccessByCountry(s),
    categories,
    hourly,
    latencyTrend: BASELINE.latencyTrend.map((v, i) => ({ hour: hourly[i].hour, p95: i === 23 ? Math.round(p95Latency) : v })),
    manualTrend: [...BASELINE.manualTrend, Number((manualRate * 100).toFixed(1))].map((v, i, arr) => ({ day: i === arr.length - 1 ? "Today" : `D-${arr.length - 1 - i}`, pct: v })),
  };
}

export type ReliabilityMetrics = ReturnType<typeof computeReliability>;
