// Presenter-only failure triggers. Each one changes demo state through a store
// action so the failure shows up where it would in a real engagement.

export type DemoControlKey =
  | "missing_required_field"
  | "invalid_country"
  | "legal_entity_mismatch"
  | "expired_credential"
  | "missing_permission"
  | "rate_limit"
  | "webhook_invalid_signature"
  | "webhook_duplicate"
  | "downstream_timeout"
  | "mapping_transform_failure"
  | "unknown_employee"
  | "invalid_currency"
  | "payroll_period_closed";

export const DEMO_CONTROLS: { key: DemoControlKey; label: string; effect: string; group: "Data" | "API" | "Webhooks" | "Payroll" }[] = [
  { key: "missing_required_field", label: "Missing required field", effect: "Clears a UK worker's NI number in AcmeHR.", group: "Data" },
  { key: "invalid_country", label: "Invalid country value", effect: "Sets a US worker's country to 'UK' (not ISO-2).", group: "Data" },
  { key: "legal_entity_mismatch", label: "Legal entity mismatch", effect: "Assigns a German worker to the UK entity.", group: "Data" },
  { key: "mapping_transform_failure", label: "Mapping transformation failure", effect: "Removes 'PT' from the UK employment-type lookup.", group: "Data" },
  { key: "expired_credential", label: "Expired credential", effect: "Next API call returns 401; readiness shows auth blocked.", group: "API" },
  { key: "missing_permission", label: "Missing API permission", effect: "Next API call returns 403 for a missing scope.", group: "API" },
  { key: "rate_limit", label: "429 rate limit", effect: "Next API call returns 429 with x-ratelimit-reset.", group: "API" },
  { key: "downstream_timeout", label: "Downstream timeout", effect: "Next API call times out (504).", group: "API" },
  { key: "webhook_invalid_signature", label: "Webhook invalid signature", effect: "Delivers an event signed with the wrong secret.", group: "Webhooks" },
  { key: "webhook_duplicate", label: "Duplicate webhook", effect: "Redelivers the most recent processed event.", group: "Webhooks" },
  { key: "unknown_employee", label: "Unknown employee", effect: "Delivers an event for an unlinked employment.", group: "Webhooks" },
  { key: "invalid_currency", label: "Invalid compensation currency", effect: "Submits a EUR commission for a US worker.", group: "Payroll" },
  { key: "payroll_period_closed", label: "Payroll period closed", effect: "Closes the November 2026 payroll period.", group: "Payroll" },
];
