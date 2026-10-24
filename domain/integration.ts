// Discovery, sync and activity types for an integration engagement.

export const GOALS = [
  { key: "onboarding", label: "Employee onboarding" },
  { key: "updates", label: "Employee updates" },
  { key: "payroll", label: "Payroll" },
  { key: "variable_comp", label: "Variable compensation" },
  { key: "time_off", label: "Time off" },
  { key: "expenses", label: "Expenses" },
  { key: "reporting", label: "Reporting" },
  { key: "accounting", label: "Accounting reconciliation" },
  { key: "offboarding", label: "Offboarding" },
  { key: "custom_fields", label: "Custom fields" },
] as const;
export type GoalKey = (typeof GOALS)[number]["key"];

export const CONSTRAINTS = [
  { key: "auth_restrictions", label: "Authentication restrictions", hint: "AcmeHR allows API tokens only from allow-listed IPs." },
  { key: "api_availability", label: "API availability", hint: "AcmeHR bulk export is rate-limited to 10 requests per second." },
  { key: "data_residency", label: "Data residency concerns", hint: "German works council asks where payroll data is processed." },
  { key: "approvals", label: "Required approvals", hint: "Payroll director signs off each country go-live." },
  { key: "change_windows", label: "Customer change windows", hint: "No changes in the 5 days before payroll cutoff." },
  { key: "security_review", label: "Internal security review", hint: "Vendor security questionnaire in progress." },
  { key: "country_requirements", label: "Country-specific requirements", hint: "Québec entity needs separate provincial registration." },
] as const;
export type ConstraintKey = (typeof CONSTRAINTS)[number]["key"];

export type Readiness = "ready" | "partial" | "not_started" | "blocked";

export interface DiscoveryState {
  context: {
    company: string;
    employeeCount: string;
    countries: string;
    sourceHris: string;
    payrollSystem: string;
    accountingSystem: string;
    employmentModels: string;
    legalEntities: string;
    customFields: string;
    integrationOwner: string;
    technicalContact: string;
  };
  goals: Record<GoalKey, boolean>;
  characteristics: {
    direction: "one_way" | "bi_directional";
    syncMethod: "event" | "scheduled" | "hybrid";
    volume: string;
    latency: string;
    sla: string;
    pii: "high" | "moderate" | "low";
    historicalMigration: boolean;
  };
  constraints: Record<ConstraintKey, "open" | "resolved" | "n_a">;
  sourceAccess: Readiness;
  authentication: Readiness;
  payrollCalendarConfirmed: boolean;
}

export const SYNC_STAGES = [
  "Captured in AcmeHR",
  "Source adapter",
  "Mapping & transformation",
  "Validation engine",
  "Remote adapter",
  "Webhook confirmation",
  "Reconciliation",
] as const;

export const SYNC_CHANGE_TYPES = [
  { key: "employee.updated", label: "Employee updated (title change)" },
  { key: "address.changed", label: "Address changed" },
  { key: "compensation.changed", label: "Compensation changed" },
  { key: "employee.terminated", label: "Employee terminated" },
  { key: "custom_field.changed", label: "Custom field changed" },
] as const;
export type SyncChangeType = (typeof SYNC_CHANGE_TYPES)[number]["key"];

export interface SyncLogEntry {
  stage: string;
  at: string;
  ok: boolean;
  message: string;
}

export interface SyncEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  type: SyncChangeType;
  patch: Record<string, string | null>;
  description: string;
  /** Index of the next stage to run. SYNC_STAGES.length means done. */
  stage: number;
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  error?: { status: number; code: string; message: string; retryAfterMs?: number };
  log: SyncLogEntry[];
  createdAt: string;
  completedAt?: string;
}

export interface SnapshotState {
  status: "idle" | "running" | "done";
  pagesFetched: number;
  totalPages: number;
  fetched: number;
  normalized: number;
  rejected: number;
  finishedAt?: string;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: "mapping" | "validation" | "webhook" | "retry" | "payroll" | "pattern" | "sync" | "discovery" | "feedback" | "config" | "failure";
  message: string;
}
