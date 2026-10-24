import type { CountryCode } from "@/data/countries";

/** One worker as AcmeHR exports it: flat source-field values. Synthetic. */
export interface SourceRecord {
  id: string;
  country: CountryCode;
  values: Record<string, string | null>;
}

export type EmployeeStatus = "ready" | "customer_action" | "schema_error" | "legal_entity_blocked" | "unsupported";

export const STATUS_ORDER: EmployeeStatus[] = ["unsupported", "legal_entity_blocked", "schema_error", "customer_action", "ready"];

export type IssueKind = "unmapped" | "missing" | "invalid" | "transform_error" | "entity_blocked" | "entity_mismatch";

export interface ValidationIssue {
  destKey: string;
  label: string;
  kind: IssueKind;
  owner: "customer" | "integration" | "configuration";
  message: string;
}

export interface EmployeeValidation {
  id: string;
  country: CountryCode;
  status: EmployeeStatus;
  issues: ValidationIssue[];
  requiredCount: number;
  completeCount: number;
}

export interface PopulationSummary {
  total: number;
  ready: number;
  customer_action: number;
  schema_error: number;
  legal_entity_blocked: number;
  unsupported: number;
  byCountry: Record<CountryCode, Record<EmployeeStatus, number> & { total: number }>;
}

/** Destination-side record, as the Remote-compatible system holds it (simulated). */
export interface Employment {
  id: string;
  employeeId: string;
  country: CountryCode;
  status: "active" | "onboarding" | "terminated";
  version: number;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  role: string;
}
