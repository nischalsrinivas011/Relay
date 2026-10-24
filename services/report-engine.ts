// Report builder over current demo state. Payroll cost uses fixed demo FX and annual
// base salary; it is an illustration, not a payroll calculation.

import { COUNTRIES, COUNTRY_BY_CODE, DEMO_FX_TO_USD, type CountryCode } from "@/data/countries";
import { destFieldsFor } from "@/data/schemas";
import type { EmployeeStatus, SourceRecord } from "@/domain/employment";
import type { CountryMappings } from "@/domain/mapping";
import { mappingStatus } from "./mapping-engine";

export type ReportMetric = "headcount" | "payroll_cost" | "onboarding_status" | "mapping_exceptions" | "customer_actions" | "sync_success";
export type ReportDimension = "country" | "employment_type" | "status";
export type ReportPeriod = "Q3-2026" | "Q4-2026" | "FY-2026";

export interface ReportConfig {
  metric: ReportMetric;
  dimension: ReportDimension;
  country: CountryCode | "all";
  period: ReportPeriod;
  employmentType: "all" | "FT" | "PT";
  status: EmployeeStatus | "all";
}

export const METRIC_LABEL: Record<ReportMetric, string> = {
  headcount: "Headcount",
  payroll_cost: "Payroll cost (USD, demo FX)",
  onboarding_status: "Workers by onboarding status",
  mapping_exceptions: "Mapping exceptions",
  customer_actions: "Customer actions required",
  sync_success: "Sync success %",
};

export const PRESETS: { id: string; name: string; config: ReportConfig }[] = [
  { id: "integration_health", name: "Integration Health", config: { metric: "sync_success", dimension: "country", country: "all", period: "Q4-2026", employmentType: "all", status: "all" } },
  { id: "payroll_cost", name: "Payroll Cost by Country", config: { metric: "payroll_cost", dimension: "country", country: "all", period: "Q3-2026", employmentType: "all", status: "all" } },
  { id: "onboarding_status", name: "Employee Onboarding Status", config: { metric: "onboarding_status", dimension: "status", country: "all", period: "Q4-2026", employmentType: "all", status: "all" } },
  { id: "mapping_exceptions", name: "Mapping Exceptions", config: { metric: "mapping_exceptions", dimension: "country", country: "all", period: "Q4-2026", employmentType: "all", status: "all" } },
  { id: "customer_actions", name: "Customer Actions Required", config: { metric: "customer_actions", dimension: "country", country: "all", period: "Q4-2026", employmentType: "all", status: "all" } },
  { id: "reliability", name: "Reliability Summary", config: { metric: "sync_success", dimension: "employment_type", country: "all", period: "Q4-2026", employmentType: "all", status: "all" } },
];

export interface ReportInput {
  records: SourceRecord[];
  statusOf: (id: string) => EmployeeStatus;
  mappings: Record<CountryCode, CountryMappings>;
}

const periodFactor: Record<ReportPeriod, number> = { "Q3-2026": 0.25, "Q4-2026": 0.25, "FY-2026": 1 };
const STATUS_LABEL: Record<EmployeeStatus, string> = { ready: "Ready", customer_action: "Customer action", schema_error: "Schema error", legal_entity_blocked: "Legal entity blocked", unsupported: "Unsupported" };

export function buildReport(cfg: ReportConfig, input: ReportInput) {
  const rows = input.records.filter(
    (r) =>
      (cfg.country === "all" || r.country === cfg.country) &&
      (cfg.employmentType === "all" || r.values["job.employment_type"] === cfg.employmentType) &&
      (cfg.status === "all" || input.statusOf(r.id) === cfg.status),
  );

  if (cfg.metric === "mapping_exceptions") {
    const out = COUNTRIES.filter((c) => cfg.country === "all" || c.code === cfg.country).map((c) => {
      const n = destFieldsFor(c.code).filter((d) => {
        const m = input.mappings[c.code][d.key];
        const st = m ? mappingStatus(m, c.code) : "missing_source";
        return d.requiredIn.includes(c.code) && st !== "mapped";
      }).length;
      return { key: c.name, value: n };
    });
    return { rows: out, unit: "fields" };
  }

  const keyOf = (r: SourceRecord) =>
    cfg.dimension === "country" ? COUNTRY_BY_CODE[r.country].name : cfg.dimension === "employment_type" ? (r.values["job.employment_type"] === "PT" ? "Part-time" : "Full-time") : STATUS_LABEL[input.statusOf(r.id)];
  const groups = new Map<string, SourceRecord[]>();
  for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);

  const value = (list: SourceRecord[]): number => {
    switch (cfg.metric) {
      case "headcount":
      case "onboarding_status":
        return list.length;
      case "customer_actions":
        return list.filter((r) => input.statusOf(r.id) === "customer_action").length;
      case "payroll_cost":
        return Math.round(list.reduce((a, r) => a + Number(r.values["comp.base_salary"]) * (DEMO_FX_TO_USD[r.values["comp.currency"] ?? "USD"] ?? 1), 0) * periodFactor[cfg.period]);
      case "sync_success": {
        const attempted = list.filter((r) => input.statusOf(r.id) !== "legal_entity_blocked" && input.statusOf(r.id) !== "unsupported");
        return attempted.length ? Number(((attempted.filter((r) => input.statusOf(r.id) === "ready").length / attempted.length) * 100).toFixed(1)) : 0;
      }
      default:
        return 0;
    }
  };
  const out = [...groups.entries()].map(([key, list]) => ({ key, value: value(list) })).sort((a, b) => b.value - a.value);
  return { rows: out, unit: cfg.metric === "payroll_cost" ? "USD" : cfg.metric === "sync_success" ? "%" : "workers" };
}

/** Tiny intent parser for prompts such as "payroll cost by country for Q3". */
export function parsePrompt(text: string, base: ReportConfig): ReportConfig {
  const t = text.toLowerCase();
  const cfg = { ...base };
  if (/payroll|cost|salary/.test(t)) cfg.metric = "payroll_cost";
  else if (/headcount|how many|workers/.test(t)) cfg.metric = "headcount";
  else if (/onboarding|status/.test(t)) cfg.metric = "onboarding_status";
  else if (/mapping/.test(t)) cfg.metric = "mapping_exceptions";
  else if (/customer action|blocked by customer/.test(t)) cfg.metric = "customer_actions";
  else if (/success|reliab|health/.test(t)) cfg.metric = "sync_success";
  if (/by country|per country/.test(t)) cfg.dimension = "country";
  else if (/by (employment )?type|full.time|part.time/.test(t)) cfg.dimension = "employment_type";
  else if (/by status/.test(t)) cfg.dimension = "status";
  if (/\bq3\b/.test(t)) cfg.period = "Q3-2026";
  else if (/\bq4\b/.test(t)) cfg.period = "Q4-2026";
  else if (/year|annual|fy/.test(t)) cfg.period = "FY-2026";
  for (const c of COUNTRIES) if (t.includes(c.name.toLowerCase()) || new RegExp(`\\b${c.code.toLowerCase()}\\b`).test(t)) cfg.country = c.code;
  if (cfg.dimension === "country" && /by country/.test(t)) cfg.country = "all";
  return cfg;
}

export function toCsv(title: string, rows: { key: string; value: number }[], unit: string) {
  return [`# ${title} (synthetic demo data)`, `group,value_${unit}`, ...rows.map((r) => `"${r.key.replace(/"/g, '""')}",${r.value}`)].join("\n");
}
