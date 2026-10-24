// Webhook domain types. Event type names follow the families listed in Remote's
// public docs (employment, onboarding, incentive, payslip, company). The payload
// shape here is a SIMULATED flat envelope, not Remote's exact contract.

export const WEBHOOK_EVENT_TYPES = [
  "employment.created",
  "employment.updated",
  "employment.status.updated",
  "employment.onboarding.updated",
  "incentive.created",
  "payslip.released",
  "company.updated",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type WebhookScenario =
  | "invalid_signature"
  | "duplicate"
  | "processor_failure"
  | "destination_timeout"
  | "rate_limit"
  | "malformed_payload"
  | "unknown_employee";

export const SCENARIO_LABEL: Record<WebhookScenario, string> = {
  invalid_signature: "Invalid signature",
  duplicate: "Duplicate event",
  processor_failure: "Processor failure",
  destination_timeout: "Destination timeout",
  rate_limit: "Rate limit (429)",
  malformed_payload: "Malformed payload",
  unknown_employee: "Unknown employee",
};

export const TRANSIENT_SCENARIOS: WebhookScenario[] = ["processor_failure", "destination_timeout", "rate_limit"];

export type DeliveryResult = "processed" | "duplicate_ignored" | "failed" | "rejected" | "ignored" | "resolved";

export interface ProcessingStep {
  name: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
}

export interface DeliveryAttempt {
  at: string;
  outcome: "success" | "failure" | "duplicate" | "rejected";
  error?: string;
  latencyMs: number;
}

export interface WebhookDelivery {
  deliveryId: string;
  eventId: string;
  type: WebhookEventType;
  employmentId: string | null;
  employeeId: string | null;
  timestamp: string; // when the event was emitted
  timestampMs: number; // used in the signature base string
  rawBody: string;
  signature: string;
  scenario?: WebhookScenario;
  result: DeliveryResult;
  signatureStatus: "valid" | "invalid";
  attempts: DeliveryAttempt[];
  steps: ProcessingStep[];
  errorReason?: string;
  normalized?: Record<string, unknown>;
  source: "seed" | "sync" | "demo";
}

export interface WebhookSubscription {
  eventType: WebhookEventType;
  enabled: boolean;
}
