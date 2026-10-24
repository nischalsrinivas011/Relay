// Validation engine: checks each worker against the country's destination schema
// using the current mappings. Mirrors the shape of a pre-onboarding dry run.
// SIMULATED: rules are synthetic, not Remote's compliance logic.

import { COUNTRIES, COUNTRY_BY_CODE, LEGAL_ENTITIES, type CountryCode, type LegalEntity } from "@/data/countries";
import { destFieldsFor } from "@/data/schemas";
import type {
  EmployeeStatus,
  EmployeeValidation,
  PopulationSummary,
  SourceRecord,
  ValidationIssue,
} from "@/domain/employment";
import type { CountryMappings } from "@/domain/mapping";
import { applyMapping, isRequired } from "./mapping-engine";

export interface ValidationContext {
  mappings: Record<CountryCode, CountryMappings>;
  provisionedEntities: Record<string, boolean>;
}

export function entityByCode(code: string | null | undefined): LegalEntity | undefined {
  return LEGAL_ENTITIES.find((e) => e.code === code);
}

export function statusFromIssues(issues: ValidationIssue[], record: SourceRecord): EmployeeStatus {
  if (record.values["job.employment_type"] === "CT") return "unsupported";
  if (issues.some((i) => i.kind === "entity_blocked")) return "legal_entity_blocked";
  if (issues.some((i) => i.kind === "unmapped" || i.kind === "invalid" || i.kind === "transform_error" || i.kind === "entity_mismatch"))
    return "schema_error";
  if (issues.some((i) => i.kind === "missing")) return "customer_action";
  return "ready";
}

export function validateEmployee(record: SourceRecord, ctx: ValidationContext): EmployeeValidation {
  const country = COUNTRY_BY_CODE[record.country];
  const mappings = ctx.mappings[record.country] ?? {};
  const issues: ValidationIssue[] = [];
  let requiredCount = 0;
  let completeCount = 0;

  for (const dest of destFieldsFor(record.country)) {
    const mapping = mappings[dest.key];
    if (!isRequired(dest, record.country, mapping)) continue;
    requiredCount++;
    const base = { destKey: dest.key, label: dest.label };

    if (!mapping?.source) {
      issues.push({ ...base, kind: "unmapped", owner: "integration", message: `${dest.label} is required in ${country.name} but has no source mapping.` });
      continue;
    }
    const res = applyMapping(mapping, record);
    if (!res.ok) {
      issues.push({ ...base, kind: "transform_error", owner: "integration", message: res.error });
      continue;
    }
    if (res.value === null) {
      issues.push({ ...base, kind: "missing", owner: "customer", message: `${dest.label} is empty in AcmeHR.` });
      continue;
    }
    const v = res.value;

    if (dest.key === "legal_entity_id") {
      const entity = entityByCode(record.values["entity.code"]);
      if (!entity) {
        issues.push({ ...base, kind: "invalid", owner: "customer", message: `Unknown legal entity "${record.values["entity.code"]}".` });
        continue;
      }
      if (entity.country !== record.country) {
        issues.push({ ...base, kind: "entity_mismatch", owner: "configuration", message: `${entity.name} is not a ${country.name} entity.` });
        continue;
      }
      if (!(ctx.provisionedEntities[entity.code] ?? entity.provisioned)) {
        issues.push({ ...base, kind: "entity_blocked", owner: "configuration", message: `${entity.name} is not configured for payroll in the destination.` });
        continue;
      }
    }
    if (dest.key === "salary_currency" && v !== country.currency) {
      issues.push({ ...base, kind: "invalid", owner: "customer", message: `Salary currency ${v} does not match ${country.name} payroll currency ${country.currency}.` });
      continue;
    }
    if (dest.key === "address_details.postal_code" && !country.postalPattern.test(v)) {
      issues.push({ ...base, kind: "invalid", owner: "customer", message: `Postal code "${v}" is not a valid ${country.name} format.` });
      continue;
    }
    if (dest.pattern && !dest.pattern.test(v)) {
      issues.push({ ...base, kind: "invalid", owner: "customer", message: `${dest.label} "${mask(v)}" fails the format check.` });
      continue;
    }
    if (dest.enumValues && !dest.enumValues.includes(v)) {
      issues.push({ ...base, kind: "invalid", owner: "integration", message: `${dest.label} "${v}" is not an allowed value.` });
      continue;
    }
    completeCount++;
  }

  return { id: record.id, country: record.country, status: statusFromIssues(issues, record), issues, requiredCount, completeCount };
}

/**
 * SIMULATED customer response: the patch AcmeHR's admin would make to clear a
 * customer-owned issue. Returns null when the issue is not customer-fixable.
 */
export function simulatedCustomerFix(record: SourceRecord, issue: ValidationIssue, mappings: CountryMappings): Record<string, string> | null {
  const mapping = mappings[issue.destKey];
  const src = mapping?.source;
  if (!src || issue.owner !== "customer") return null;
  const country = COUNTRY_BY_CODE[record.country];
  const digits = (n: number) => record.id.replace(/\D/g, "").padEnd(n, "7").slice(0, n);
  switch (issue.destKey) {
    case "tax_job_category":
      return { [src]: "PROF" };
    case "personal_details.ni_number":
      return { [src]: `QQ${digits(6)}C` };
    case "contact_details.mobile_number":
      return { [src]: `+49151${digits(8)}` };
    case "salary_currency":
      return { [src]: country.currency };
    case "address_details.postal_code": {
      const v = (record.values[src] ?? "").replace(/\s+/g, "");
      return { [src]: v.length > 3 ? `${v.slice(0, -3)} ${v.slice(-3)}` : v };
    }
    case "personal_details.ssn": {
      const v = (record.values[src] ?? "").replace(/\D/g, "").padEnd(9, "0");
      return { [src]: `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5, 9)}` };
    }
    case "personal_details.tax_id":
      return { [src]: (record.values[src] ?? "").replace(/\D/g, "").padEnd(11, "3").slice(0, 11) };
    default:
      return issue.kind === "missing" ? { [src]: `${issue.label} (customer supplied)` } : null;
  }
}

/** Mask identifiers in messages so validation output never shows full national IDs. */
function mask(v: string) {
  return v.length > 4 ? `${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : v;
}

export function validatePopulation(records: SourceRecord[], ctx: ValidationContext): EmployeeValidation[] {
  return records.map((r) => validateEmployee(r, ctx));
}

const emptyCounts = () => ({ total: 0, ready: 0, customer_action: 0, schema_error: 0, legal_entity_blocked: 0, unsupported: 0 });

export function summarize(statuses: { country: CountryCode; status: EmployeeStatus }[]): PopulationSummary {
  const byCountry = Object.fromEntries(COUNTRIES.map((c) => [c.code, emptyCounts()])) as PopulationSummary["byCountry"];
  const s = { ...emptyCounts(), byCountry } as PopulationSummary;
  for (const r of statuses) {
    s.total++;
    s[r.status]++;
    byCountry[r.country].total++;
    byCountry[r.country][r.status]++;
  }
  return s;
}
