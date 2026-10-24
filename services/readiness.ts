// Integration readiness score. Simulated scoring model: each item contributes a
// weighted fraction; labels come from thresholds. Inputs are live app state.

import { COUNTRIES, LEGAL_ENTITIES, type CountryCode } from "@/data/countries";
import { destFieldsFor } from "@/data/schemas";
import { CONSTRAINTS, type DiscoveryState, type Readiness } from "@/domain/integration";
import type { CountryMappings } from "@/domain/mapping";
import type { WebhookSubscription } from "@/domain/webhook";
import { mappingStatus } from "./mapping-engine";

export interface ReadinessItem {
  key: string;
  label: string;
  status: Readiness;
  weight: number;
  fraction: number;
  detail: string;
}

export interface ReadinessInput {
  discovery: DiscoveryState;
  mappings: Record<CountryCode, CountryMappings>;
  provisionedEntities: Record<string, boolean>;
  entityHeadcount: Record<string, number>;
  subscriptions: WebhookSubscription[];
  credentialExpired: boolean;
}

const levelScore: Record<Readiness, number> = { ready: 1, partial: 0.5, not_started: 0, blocked: 0 };
const fromFraction = (f: number): Readiness => (f >= 1 ? "ready" : f > 0 ? "partial" : "not_started");

export function requiredMappingHealth(mappings: Record<CountryCode, CountryMappings>) {
  let total = 0;
  let healthy = 0;
  for (const c of COUNTRIES) {
    for (const d of destFieldsFor(c.code)) {
      if (!d.requiredIn.includes(c.code)) continue;
      total++;
      const m = mappings[c.code][d.key];
      if (m && mappingStatus(m, c.code) === "mapped") healthy++;
    }
  }
  return { total, healthy };
}

export function computeReadiness(input: ReadinessInput) {
  const { discovery: d } = input;
  const items: ReadinessItem[] = [];

  items.push({ key: "source", label: "Source access", status: d.sourceAccess, weight: 15, fraction: levelScore[d.sourceAccess], detail: "AcmeHR API credentials and export scope" });

  const authStatus: Readiness = input.credentialExpired ? "blocked" : d.authentication;
  items.push({
    key: "auth",
    label: "Authentication",
    status: authStatus,
    weight: 15,
    fraction: levelScore[authStatus],
    detail: input.credentialExpired ? "Destination token expired. Re-issue a sandbox token." : "Customer API token, environment-bound",
  });

  const mh = requiredMappingHealth(input.mappings);
  const mf = mh.total ? mh.healthy / mh.total : 0;
  items.push({ key: "mapping", label: "Field mapping", status: fromFraction(mf), weight: 20, fraction: mf, detail: `${mh.healthy} of ${mh.total} required mappings healthy` });

  const blockedEntities = LEGAL_ENTITIES.filter((e) => !(input.provisionedEntities[e.code] ?? e.provisioned) && (input.entityHeadcount[e.code] ?? 0) > 0);
  items.push({
    key: "entities",
    label: "Legal entities",
    status: blockedEntities.length ? "blocked" : "ready",
    weight: 15,
    fraction: blockedEntities.length ? 0 : 1,
    detail: blockedEntities.length ? `${blockedEntities.map((e) => e.name).join(", ")} not configured` : "All entities with workers are configured",
  });

  const enabled = input.subscriptions.filter((s) => s.enabled).length;
  const wf = input.subscriptions.length ? enabled / input.subscriptions.length : 0;
  items.push({ key: "webhooks", label: "Webhook configuration", status: fromFraction(wf), weight: 10, fraction: wf, detail: `${enabled} of ${input.subscriptions.length} subscriptions enabled` });

  const needsPayroll = d.goals.payroll || d.goals.variable_comp;
  const pf = !needsPayroll ? 1 : d.payrollCalendarConfirmed ? 1 : 0.5;
  items.push({ key: "payroll", label: "Payroll configuration", status: fromFraction(pf), weight: 10, fraction: pf, detail: d.payrollCalendarConfirmed ? "Payroll calendars confirmed" : "Payroll calendars not confirmed" });

  const resolved = CONSTRAINTS.filter((c) => d.constraints[c.key] !== "open").length;
  const rf = resolved / CONSTRAINTS.length;
  items.push({ key: "constraints", label: "Constraints cleared", status: fromFraction(rf), weight: 15, fraction: rf, detail: `${resolved} of ${CONSTRAINTS.length} constraints resolved or not applicable` });

  const score = items.reduce((s, i) => s + i.weight * i.fraction, 0) / items.reduce((s, i) => s + i.weight, 0);
  const label = score >= 0.95 ? "Ready to go live" : score >= 0.8 ? "Ready for validation" : score >= 0.5 ? "Integration design incomplete" : "Discovery in progress";
  return { score, label, items };
}
