// Webhook receiver pipeline: verify signature -> parse -> deduplicate -> resolve
// employee -> process -> reconcile. Pure: returns the outcome; the store applies it.
//
// SIMULATED signature: Remote documents X-Remote-Signature as HMAC-SHA256 (hex) over
// raw_body + ":" + millisecond timestamp. Relay keeps the same base string but uses a
// synchronous FNV-based digest so the demo runs without a secret or Web Crypto.

import { z } from "zod";
import { fnv1a } from "@/lib/utils";
import {
  TRANSIENT_SCENARIOS,
  WEBHOOK_EVENT_TYPES,
  type DeliveryAttempt,
  type DeliveryResult,
  type ProcessingStep,
  type WebhookDelivery,
  type WebhookEventType,
  type WebhookScenario,
} from "@/domain/webhook";

export const DEMO_WEBHOOK_SECRET = "demo-signing-secret"; // not a credential; demo only

export function signatureBase(rawBody: string, timestampMs: number) {
  return `${rawBody}:${timestampMs}`;
}

export function simulatedSignature(rawBody: string, timestampMs: number, secret = DEMO_WEBHOOK_SECRET) {
  const base = signatureBase(rawBody, timestampMs);
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => fnv1a(`${secret}|${i}|${base}`)).join("");
}

export function verifySignature(d: Pick<WebhookDelivery, "rawBody" | "timestampMs" | "signature">, secret = DEMO_WEBHOOK_SECRET) {
  return simulatedSignature(d.rawBody, d.timestampMs, secret) === d.signature;
}

export const PayloadSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.enum(WEBHOOK_EVENT_TYPES),
  company_id: z.string().min(1),
  employment_id: z.string().nullable(),
  occurred_at: z.string(),
  data: z.record(z.unknown()).optional(),
});

export const RETRY_POLICY = { maxAttempts: 5, baseDelayMs: 30_000, factor: 2, jitter: "full" as const };
export const retryDelayMs = (attempt: number) => RETRY_POLICY.baseDelayMs * RETRY_POLICY.factor ** Math.max(0, attempt - 1);

export const employmentIdFor = (employeeId: string) => `emp_${fnv1a(`acme:${employeeId}`)}${fnv1a(employeeId)}`.slice(0, 20);

export function buildDelivery(input: {
  eventId: string;
  type: WebhookEventType;
  employeeId: string | null;
  employmentId?: string | null;
  timestampMs: number;
  scenario?: WebhookScenario;
  source: WebhookDelivery["source"];
  data?: Record<string, unknown>;
  deliveryId?: string;
}): WebhookDelivery {
  const employmentId = input.employmentId ?? (input.employeeId ? employmentIdFor(input.employeeId) : null);
  const payload = {
    event_id: input.eventId,
    event_type: input.type,
    company_id: "cmp_acme_global_demo",
    employment_id: employmentId,
    occurred_at: new Date(input.timestampMs).toISOString(),
    data: input.data ?? {},
  };
  let rawBody = JSON.stringify(payload);
  if (input.scenario === "malformed_payload") rawBody = rawBody.replace(`"event_type":"${input.type}",`, "");
  const signature =
    input.scenario === "invalid_signature" ? simulatedSignature(rawBody, input.timestampMs, "wrong-secret") : simulatedSignature(rawBody, input.timestampMs);
  return {
    deliveryId: input.deliveryId ?? `dlv_${fnv1a(`${input.eventId}:${input.timestampMs}:${Math.random()}`)}`,
    eventId: input.eventId,
    type: input.type,
    employmentId,
    employeeId: input.employeeId,
    timestamp: payload.occurred_at,
    timestampMs: input.timestampMs,
    rawBody,
    signature,
    scenario: input.scenario,
    result: "failed",
    signatureStatus: "valid",
    attempts: [],
    steps: [],
    source: input.source,
  };
}

export interface ProcessContext {
  processedEventIds: Set<string>;
  employmentToEmployee: Record<string, string>;
  now: number;
  /** Demo control: force a transient failure even on retry. */
  forceFailure?: boolean;
}

export interface ProcessOutcome {
  result: DeliveryResult;
  steps: ProcessingStep[];
  attempt: DeliveryAttempt;
  errorReason?: string;
  signatureStatus: "valid" | "invalid";
  normalized?: Record<string, unknown>;
  /** Present when the event changed destination state and must be applied once. */
  apply?: { eventId: string; employeeId: string | null; type: WebhookEventType };
}

/** Deterministic latency per delivery+attempt, so metrics are stable. */
function latencyFor(d: WebhookDelivery, attemptNo: number) {
  const h = parseInt(fnv1a(`${d.deliveryId}:${attemptNo}`).slice(0, 6), 16);
  return 80 + (h % 420);
}

export function processDelivery(d: WebhookDelivery, ctx: ProcessContext): ProcessOutcome {
  const attemptNo = d.attempts.length + 1;
  const latencyMs = latencyFor(d, attemptNo);
  const at = new Date(ctx.now).toISOString();
  const steps: ProcessingStep[] = [];
  const skipRest = (from: string[]) => from.forEach((name) => steps.push({ name, status: "skipped", detail: "Not reached" }));
  const ALL = ["Verify signature", "Parse payload", "Deduplicate", "Resolve employee", "Process", "Reconcile"];

  // 1. Signature
  if (!verifySignature(d)) {
    steps.push({ name: ALL[0], status: "failed", detail: "Signature does not match raw_body + ':' + timestamp." });
    skipRest(ALL.slice(1));
    return {
      result: "rejected",
      steps,
      signatureStatus: "invalid",
      errorReason: "Invalid signature. Rejected with 401; the sender will not be told why.",
      attempt: { at, outcome: "rejected", error: "invalid_signature", latencyMs },
    };
  }
  steps.push({ name: ALL[0], status: "ok", detail: "Signature verified." });

  // 2. Parse
  let parsed: z.infer<typeof PayloadSchema>;
  try {
    const json = JSON.parse(d.rawBody);
    const res = PayloadSchema.safeParse(json);
    if (!res.success) throw new Error(res.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    parsed = res.data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unparseable body";
    steps.push({ name: ALL[1], status: "failed", detail: msg });
    skipRest(ALL.slice(2));
    return {
      result: "failed",
      steps,
      signatureStatus: "valid",
      errorReason: `Malformed payload: ${msg}`,
      attempt: { at, outcome: "failure", error: "malformed_payload", latencyMs },
    };
  }
  steps.push({ name: ALL[1], status: "ok", detail: `${parsed.event_type} for ${parsed.employment_id ?? "company"}.` });

  // 3. Dedupe on event_id: a redelivered event must not change state twice.
  if (ctx.processedEventIds.has(parsed.event_id)) {
    steps.push({ name: ALL[2], status: "ok", detail: `event_id ${parsed.event_id} already processed. Ignored.` });
    skipRest(ALL.slice(3));
    return {
      result: "duplicate_ignored",
      steps,
      signatureStatus: "valid",
      normalized: parsed,
      attempt: { at, outcome: "duplicate", latencyMs },
    };
  }
  steps.push({ name: ALL[2], status: "ok", detail: "First delivery of this event_id." });

  // 4. Resolve employee
  let employeeId: string | null = null;
  if (parsed.employment_id) {
    employeeId = ctx.employmentToEmployee[parsed.employment_id] ?? null;
    if (!employeeId) {
      steps.push({ name: ALL[3], status: "failed", detail: `No AcmeHR worker linked to ${parsed.employment_id}.` });
      skipRest(ALL.slice(4));
      return {
        result: "failed",
        steps,
        signatureStatus: "valid",
        normalized: parsed,
        errorReason: "Unknown employee: the employment is not linked to any AcmeHR record.",
        attempt: { at, outcome: "failure", error: "unknown_employee", latencyMs },
      };
    }
    steps.push({ name: ALL[3], status: "ok", detail: `Linked to ${employeeId}.` });
  } else {
    steps.push({ name: ALL[3], status: "skipped", detail: "Company-level event." });
  }

  // 5. Process (transient failures fail the first attempt, succeed on replay)
  const transient = d.scenario && TRANSIENT_SCENARIOS.includes(d.scenario);
  if (transient && (attemptNo === 1 || ctx.forceFailure)) {
    const err =
      d.scenario === "rate_limit"
        ? "AcmeHR write-back returned 429; wait x-ratelimit-reset ms before retrying."
        : d.scenario === "destination_timeout"
          ? "AcmeHR write-back timed out after 10 s."
          : "Processor threw while applying the change.";
    steps.push({ name: ALL[4], status: "failed", detail: err });
    skipRest(ALL.slice(5));
    return {
      result: "failed",
      steps,
      signatureStatus: "valid",
      normalized: parsed,
      errorReason: err,
      attempt: { at, outcome: "failure", error: d.scenario, latencyMs: d.scenario === "destination_timeout" ? 10_000 : latencyMs },
    };
  }
  steps.push({ name: ALL[4], status: "ok", detail: `Applied ${parsed.event_type}.` });
  steps.push({ name: ALL[5], status: "ok", detail: "Source and destination match." });

  return {
    result: "processed",
    steps,
    signatureStatus: "valid",
    normalized: { ...parsed, acme_employee_id: employeeId },
    attempt: { at, outcome: "success", latencyMs },
    apply: { eventId: parsed.event_id, employeeId, type: parsed.event_type },
  };
}

export function applyOutcome(d: WebhookDelivery, o: ProcessOutcome): WebhookDelivery {
  return {
    ...d,
    result: o.result,
    steps: o.steps,
    signatureStatus: o.signatureStatus,
    errorReason: o.errorReason,
    normalized: o.normalized,
    attempts: [...d.attempts, o.attempt],
  };
}

export const isRetryable = (d: WebhookDelivery) =>
  d.result === "failed" && !!d.scenario && TRANSIENT_SCENARIOS.includes(d.scenario) && d.attempts.length < RETRY_POLICY.maxAttempts;
