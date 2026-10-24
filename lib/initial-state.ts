// Initial demo state for the Acme Global engagement. Deterministic except for
// timestamps, which are anchored to the moment the demo is (re)set.

import { COUNTRIES, type CountryCode } from "@/data/countries";
import { generateWorkforce, initialMappings } from "@/data/seed";
import type { Employment, EmployeeValidation, PopulationSummary } from "@/domain/employment";
import type { ActivityItem, DiscoveryState, SnapshotState, SyncEvent } from "@/domain/integration";
import type { CountryMappings } from "@/domain/mapping";
import type { IntegrationPattern } from "@/domain/pattern";
import type { Incentive, PayrollPeriod } from "@/domain/payroll";
import type { WebhookDelivery, WebhookEventType, WebhookScenario, WebhookSubscription } from "@/domain/webhook";
import { fnv1a, mulberry32 } from "@/lib/utils";
import type { FeedbackRecord } from "@/services/feedback-engine";
import type { ApiFailure } from "@/services/mock-remote-client";
import { INITIAL_PERIODS } from "@/services/payroll-engine";
import type { ApiCallLog } from "@/services/remote-client";
import { summarize, validatePopulation, type ValidationContext } from "@/services/validation-engine";
import { applyOutcome, buildDelivery, processDelivery } from "@/services/webhook-engine";
import { employmentIndex } from "./derived";

export interface ValidationRun {
  at: string;
  inputsVersion: number;
  summary: PopulationSummary;
  nonReady: Record<string, EmployeeValidation>;
}

export interface PersistedState {
  discovery: DiscoveryState;
  mappings: Record<CountryCode, CountryMappings>;
  inputsVersion: number;
  patches: Record<string, Record<string, string | null>>;
  terminated: Record<string, true>;
  requested: Record<string, string>;
  provisionedEntities: Record<string, boolean>;
  run: ValidationRun | null;
  syncPaused: boolean;
  snapshot: SnapshotState;
  syncEvents: SyncEvent[];
  reconciledAt: string | null;
  deliveries: WebhookDelivery[];
  processedEventIds: string[];
  remoteVersions: Record<string, number>;
  remoteStatus: Record<string, Employment["status"]>;
  subscriptions: WebhookSubscription[];
  apiLog: ApiCallLog[];
  incentives: Incentive[];
  periods: PayrollPeriod[];
  patterns: IntegrationPattern[];
  feedback: FeedbackRecord[];
  activity: ActivityItem[];
  demo: { armedApiFailure: ApiFailure | null; credentialExpired: boolean; forceWebhookFailure: boolean };
  mappingCountry: CountryCode;
  seq: number;
}

export function runValidation(ctx: ValidationContext, records = generateWorkforce(), inputsVersion = 1, at = new Date().toISOString()): ValidationRun {
  const results = validatePopulation(records, ctx);
  const nonReady: Record<string, EmployeeValidation> = {};
  for (const r of results) if (r.status !== "ready") nonReady[r.id] = r;
  return { at, inputsVersion, summary: summarize(results), nonReady };
}

const SUB_TYPES: WebhookEventType[] = [
  "employment.created",
  "employment.updated",
  "employment.status.updated",
  "employment.onboarding.updated",
  "incentive.created",
  "payslip.released",
];

function seedDeliveries(now: number) {
  const records = generateWorkforce();
  const types: WebhookEventType[] = ["employment.updated", "employment.onboarding.updated", "employment.status.updated", "employment.updated", "incentive.created", "payslip.released", "employment.created", "company.updated"];
  const scenarioAt: Record<number, WebhookScenario> = {
    8: "invalid_signature",
    11: "processor_failure",
    14: "processor_failure",
    20: "destination_timeout",
    23: "rate_limit",
    26: "processor_failure",
    29: "malformed_payload",
    31: "unknown_employee",
  };
  const duplicateOf: Record<number, number> = { 5: 2, 17: 14 };
  const out: WebhookDelivery[] = [];
  const processed = new Set<string>();
  const ctxBase = { processedEventIds: processed, employmentToEmployee: employmentIndex() };

  for (let i = 0; i < 34; i++) {
    const ts = now - (34 - i) * 40 * 60_000;
    let d: WebhookDelivery;
    if (duplicateOf[i] !== undefined) {
      const orig = out[duplicateOf[i]];
      d = buildDelivery({ eventId: orig.eventId, type: orig.type, employeeId: orig.employeeId, timestampMs: orig.timestampMs, scenario: "duplicate", source: "seed", deliveryId: `dlv_seed_${i}` });
    } else {
      const type = types[i % types.length];
      const rec = records[(i * 97 + 13) % records.length];
      const scenario = scenarioAt[i];
      d = buildDelivery({
        eventId: `evt_${fnv1a(`seed-${i}`)}`,
        type,
        employeeId: type === "company.updated" || scenario === "unknown_employee" ? null : rec.id,
        employmentId: scenario === "unknown_employee" ? "emp_unlinked_0042" : undefined,
        timestampMs: ts,
        scenario,
        source: "seed",
        deliveryId: `dlv_seed_${i}`,
        data: type === "incentive.created" ? { amount: 250000, currency: "USD" } : {},
      });
    }
    let outcome = processDelivery(d, { ...ctxBase, now: ts + 400 });
    d = applyOutcome(d, outcome);
    // One historical failure was already recovered by an automatic retry 6 minutes later.
    if (i === 14) {
      outcome = processDelivery(d, { ...ctxBase, now: ts + 6 * 60_000 });
      d = applyOutcome(d, outcome);
    }
    if (outcome.apply) processed.add(outcome.apply.eventId);
    out.push(d);
  }
  return { deliveries: out, processedEventIds: [...processed] };
}

function seedApiLog(now: number): ApiCallLog[] {
  const r = mulberry32(77);
  const paths: [ApiCallLog["method"], string][] = [
    ["GET", "/v1/employments"],
    ["PATCH", "/v1/employments/{id}"],
    ["GET", "/v1/countries"],
    ["POST", "/v1/incentives"],
    ["GET", "/v1/employments/{id}"],
  ];
  return Array.from({ length: 60 }, (_, i) => {
    const [method, path] = paths[i % paths.length];
    const status = i === 37 ? 429 : method === "POST" ? 201 : 200;
    return { at: new Date(now - (60 - i) * 24 * 60_000).toISOString(), method, path, status, ms: 90 + Math.round(r() * 310) };
  });
}

export function buildInitialState(now = Date.now()): PersistedState {
  const mappings = initialMappings();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const { deliveries, processedEventIds } = seedDeliveries(now);
  const discovery: DiscoveryState = {
    context: {
      company: "Acme Global",
      employeeCount: "2,400",
      countries: COUNTRIES.map((c) => c.name).join(", "),
      sourceHris: "AcmeHR",
      payrollSystem: "Remote-compatible Global Payroll (destination)",
      accountingSystem: "NetLedger (synthetic)",
      employmentModels: "Global Payroll on Acme-owned entities",
      legalEntities: "5: US, CA-Ontario, CA-Québec, UK, DE",
      customFields: "6: cost center, sales region, badge, Okta ID, T-shirt size, remote eligible",
      integrationOwner: "Dana Okoro, HRIS Lead (fictional)",
      technicalContact: "Sam Reyes, Integration Engineer (fictional)",
    },
    goals: {
      onboarding: true,
      updates: true,
      payroll: true,
      variable_comp: true,
      time_off: false,
      expenses: false,
      reporting: true,
      accounting: false,
      offboarding: false,
      custom_fields: true,
    },
    characteristics: {
      direction: "bi_directional",
      syncMethod: "hybrid",
      volume: "2,400 initial load; ~150 changes per day",
      latency: "Under 15 minutes for updates",
      sla: "99.5%",
      pii: "high",
      historicalMigration: false,
    },
    constraints: {
      auth_restrictions: "resolved",
      api_availability: "resolved",
      data_residency: "open",
      approvals: "open",
      change_windows: "resolved",
      security_review: "open",
      country_requirements: "resolved",
    },
    sourceAccess: "ready",
    authentication: "ready",
    payrollCalendarConfirmed: false,
  };

  return {
    discovery,
    mappings,
    inputsVersion: 1,
    patches: {},
    terminated: {},
    requested: {},
    provisionedEntities: {},
    run: runValidation({ mappings, provisionedEntities: {} }, generateWorkforce(), 1, iso(2 * 3_600_000)),
    syncPaused: false,
    snapshot: { status: "idle", pagesFetched: 0, totalPages: 24, fetched: 0, normalized: 0, rejected: 0 },
    syncEvents: [],
    reconciledAt: null,
    deliveries,
    processedEventIds,
    remoteVersions: {},
    remoteStatus: {},
    subscriptions: SUB_TYPES.map((t, i) => ({ eventType: t, enabled: i < 3 })),
    apiLog: seedApiLog(now),
    incentives: [],
    periods: INITIAL_PERIODS.map((p) => ({ ...p })),
    patterns: [],
    feedback: [],
    activity: [
      { id: "a6", at: iso(25 * 60_000), kind: "retry", message: "Retry completed for employment.updated after a processor failure" },
      { id: "a5", at: iso(70 * 60_000), kind: "webhook", message: "Webhook employment.onboarding.updated processed" },
      { id: "a4", at: iso(2 * 3_600_000), kind: "validation", message: "Onboarding validation run: 1,932 of 2,400 ready" },
      { id: "a3", at: iso(3 * 3_600_000), kind: "mapping", message: "Mapping changed: DE contact_details.mobile_number <- employee.work_phone" },
      { id: "a2", at: iso(5 * 3_600_000), kind: "payroll", message: "Sandbox incentive created for a test worker" },
      { id: "a1", at: iso(26 * 3_600_000), kind: "pattern", message: "Implementation recipe updated: discovery questionnaire v3" },
    ],
    demo: { armedApiFailure: null, credentialExpired: false, forceWebhookFailure: false },
    mappingCountry: "US",
    seq: 0,
  };
}
