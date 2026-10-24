export type ArchMode = "initial" | "realtime" | "payroll" | "reporting";

export interface ArchNode {
  id: string;
  label: string;
  kind: "system" | "component" | "control";
  lane: "forward" | "reverse";
  owns: string[];
  failureModes: string[];
}

export const FORWARD: ArchNode[] = [
  { id: "acmehr", label: "AcmeHR", kind: "system", lane: "forward", owns: ["Source of truth for worker identity, job and address data", "Emits change events and serves paginated exports"], failureModes: ["Export rate limit (10 req/s)", "IP allow-list rejects requests"] },
  { id: "source", label: "Source adapter", kind: "component", lane: "forward", owns: ["Snapshot paging (100 records per page)", "Delta fetch per change event", "Flattens AcmeHR payloads into source fields"], failureModes: ["Partial page", "Token scoped to the wrong AcmeHR tenant"] },
  { id: "mapping", label: "Mapping & transformation", kind: "component", lane: "forward", owns: ["Per-country field mappings", "Transformations: currency x100, lookups, date, ISO-3, E.164, fallback", "Produces destination-shaped records"], failureModes: ["Lookup miss", "Unmapped required field"] },
  { id: "validation", label: "Validation engine", kind: "control", lane: "forward", owns: ["Country schema checks before any API call", "Legal-entity eligibility", "Routes failures to the owner: customer, integration or configuration"], failureModes: ["Missing customer data", "Format errors"] },
  { id: "remote_adapter", label: "Remote adapter", kind: "component", lane: "forward", owns: ["Calls the RemoteClient interface", "Idempotency key per change", "Backoff on 429 using x-ratelimit-reset"], failureModes: ["401 expired token", "403 missing scope", "429 rate limit", "504 timeout"] },
  { id: "remote", label: "Remote-compatible employment system", kind: "system", lane: "forward", owns: ["Employment records and payroll inputs", "Emits webhooks on change"], failureModes: ["Schema validation (422)"] },
];

export const REVERSE: ArchNode[] = [
  { id: "event", label: "Remote event", kind: "system", lane: "reverse", owns: ["employment.*, incentive.created, payslip.released, company.updated"], failureModes: ["Redelivery of the same event_id"] },
  { id: "receiver", label: "Webhook receiver", kind: "component", lane: "reverse", owns: ["Accepts POST, stores the raw body before parsing", "Returns 2xx fast and processes asynchronously"], failureModes: ["Burst traffic"] },
  { id: "signature", label: "Signature verification", kind: "control", lane: "reverse", owns: ["Recomputes the digest over raw_body + ':' + timestamp", "Rejects on mismatch without detail"], failureModes: ["Wrong secret", "Body re-serialized before verification"] },
  { id: "dedupe", label: "Event deduplication", kind: "control", lane: "reverse", owns: ["Idempotency on event_id", "Duplicate deliveries never change state twice"], failureModes: ["Dedupe store lost"] },
  { id: "queue", label: "Queue", kind: "component", lane: "reverse", owns: ["Buffers events for the processor", "Holds failed events for replay"], failureModes: ["Retry queue growth"] },
  { id: "processor", label: "Processor", kind: "component", lane: "reverse", owns: ["Resolves employment_id to the AcmeHR worker", "Applies the change"], failureModes: ["Unknown employee", "Malformed payload", "AcmeHR write-back timeout"] },
  { id: "reconcile", label: "Reconciliation", kind: "control", lane: "reverse", owns: ["Compares source and destination after each change", "Nightly full reconciliation"], failureModes: ["Drift after a manual edit"] },
  { id: "acmehr_back", label: "AcmeHR", kind: "system", lane: "reverse", owns: ["Receives status and payroll results"], failureModes: ["Write-back permissions"] },
];

export const MODES: { key: ArchMode; label: string; description: string; nodes: string[] }[] = [
  {
    key: "initial",
    label: "Initial workforce load",
    description: "Snapshot: page through all 2,400 AcmeHR workers, map, validate and create employments. Reconciliation confirms the load.",
    nodes: ["acmehr", "source", "mapping", "validation", "remote_adapter", "remote", "reconcile"],
  },
  {
    key: "realtime",
    label: "Real-time updates",
    description: "A change in AcmeHR flows forward; the destination confirms with a webhook that flows back through verification and dedupe.",
    nodes: [...FORWARD.map((n) => n.id), ...REVERSE.map((n) => n.id)],
  },
  {
    key: "payroll",
    label: "Payroll inputs",
    description: "Commissions are validated against employment, currency and payroll period, sent as incentives, and confirmed by incentive.created.",
    nodes: ["mapping", "validation", "remote_adapter", "remote", "event", "receiver", "signature", "dedupe", "processor"],
  },
  {
    key: "reporting",
    label: "Reporting outputs",
    description: "Read-only: reports and payslip events come back from the destination and are reconciled into AcmeHR.",
    nodes: ["remote", "remote_adapter", "event", "receiver", "signature", "queue", "processor", "reconcile", "acmehr_back"],
  },
];

export const METADATA: [string, string][] = [
  ["Authentication method", "Customer API token, environment-bound (sandbox token for testing). Stored server-side; never sent to the browser."],
  ["Sync frequency", "Event-driven updates under 15 minutes; nightly full reconciliation"],
  ["Source of truth", "AcmeHR for identity, job and address; destination for employment status and payroll results"],
  ["Idempotency key strategy", "Forward: hash(employee_id, change_id). Reverse: event_id from the webhook payload"],
  ["Retry policy", "Exponential backoff from 30 s, factor 2, max 5 attempts; 429 waits x-ratelimit-reset ms"],
  ["Reconciliation frequency", "After every change, plus a nightly full comparison"],
  ["PII handling", "National IDs masked in UI and messages; no full personal data in logs; synthetic data only in Demo mode"],
  ["Observability", "Per-stage logs, API call log with status and latency, reliability metrics by country and category"],
];
