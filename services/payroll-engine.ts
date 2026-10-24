// Incentive validation for the commission -> payroll queue flow.
// SIMULATED: no tax or gross-to-net is calculated; this only gates what enters the queue.

import { COUNTRY_BY_CODE } from "@/data/countries";
import type { SourceRecord } from "@/domain/employment";
import type { BulkRow, Incentive, IncentiveCheck, IncentiveInput, IncentiveType, PayrollPeriod } from "@/domain/payroll";

export const INITIAL_PERIODS: PayrollPeriod[] = [
  { period: "2026-10", label: "October 2026", status: "closed", cutoff: "2026-10-15" },
  { period: "2026-11", label: "November 2026", status: "open", cutoff: "2026-11-14" },
  { period: "2026-12", label: "December 2026", status: "open", cutoff: "2026-12-11" },
];

export interface IncentiveContext {
  recordsById: Map<string, SourceRecord>;
  periods: PayrollPeriod[];
  terminated: Set<string>;
  /** Incentives already sent; used as the idempotency check. */
  existing?: Pick<Incentive, "employeeId" | "type" | "amount" | "currency" | "effectivePeriod" | "status">[];
}

export function validateIncentive(input: IncentiveInput, ctx: IncentiveContext): IncentiveCheck[] {
  const rec = input.employeeId ? ctx.recordsById.get(input.employeeId.trim()) : undefined;
  const country = rec ? COUNTRY_BY_CODE[rec.country] : undefined;
  const period = ctx.periods.find((p) => p.period === input.effectivePeriod);
  const checks: IncentiveCheck[] = [
    { name: "Employee exists", ok: !!rec, detail: rec ? `${rec.values["employee.full_name"]} (${rec.id})` : input.employeeId ? `No worker with ID ${input.employeeId}` : "Employee ID is missing" },
    {
      name: "Employment active",
      ok: !!rec && !ctx.terminated.has(rec.id),
      detail: !rec ? "Cannot check without an employee" : ctx.terminated.has(rec.id) ? "Employment is terminated" : "Active",
    },
    {
      name: "Currency matches",
      ok: !!country && input.currency === country.currency,
      detail: country ? (input.currency === country.currency ? `${input.currency} matches ${country.name} payroll` : `${input.currency || "(blank)"} does not match ${country.name} payroll currency ${country.currency}`) : "Cannot check without an employee",
    },
    {
      name: "Effective period valid",
      ok: !!period && period.status === "open",
      detail: !period ? `No payroll period ${input.effectivePeriod}` : period.status === "closed" ? `${period.label} payroll is closed` : `${period.label}, cutoff ${period.cutoff}`,
    },
    {
      name: "Amount valid",
      ok: Number.isFinite(input.amount) && input.amount > 0 && input.amount <= 250_000,
      detail: Number.isFinite(input.amount) && input.amount > 0 ? (input.amount <= 250_000 ? `${input.amount.toLocaleString()} ${input.currency}; sent as ${Math.round(input.amount * 100).toLocaleString()} minor units` : "Above the 250,000 single-payment guardrail") : "Amount must be greater than zero",
    },
  ];
  const dup = (ctx.existing ?? []).some(
    (x) =>
      x.status === "queued" &&
      x.employeeId === input.employeeId.trim() &&
      x.type === input.type &&
      x.amount === input.amount &&
      x.currency === input.currency &&
      x.effectivePeriod === input.effectivePeriod,
  );
  checks.push({ name: "Not a duplicate", ok: !dup, detail: dup ? "An identical incentive is already in this payroll queue" : "No identical incentive queued" });
  return checks;
}

export const allPass = (checks: IncentiveCheck[]) => checks.every((c) => c.ok);

const TYPES: IncentiveType[] = ["commission", "bonus", "spot_award"];

/** Synthetic Q4 commission file: 100 rows, 94 valid, 4 missing IDs, 2 invalid currencies. */
export function generateBulkCsv(records: SourceRecord[]): string {
  const sales = records.filter((r) => r.values["job.department"] === "Sales" && r.country !== "CA").slice(0, 100);
  const lines = ["employee_id,type,amount,currency,period"];
  sales.forEach((r, i) => {
    const country = COUNTRY_BY_CODE[r.country];
    let id = r.id;
    let currency: string = country.currency;
    if ([12, 37, 58, 81].includes(i)) id = "";
    if ([23, 66].includes(i)) currency = country.currency === "USD" ? "USX" : "USD";
    const amount = 500 + ((i * 377) % 4500);
    lines.push(`${id},${TYPES[i % 7 === 0 ? 1 : 0]},${amount},${currency},2026-11`);
  });
  return lines.join("\n");
}

export function parseCsv(text: string): BulkRow[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",");
    const get = (k: string) => (idx(k) >= 0 ? (cells[idx(k)] ?? "").trim() : "");
    return { row: i + 1, employeeId: get("employee_id"), type: get("type") || "commission", amount: get("amount"), currency: get("currency"), period: get("period") };
  });
}

export function rowToInput(row: BulkRow): IncentiveInput {
  return {
    employeeId: row.employeeId,
    type: (TYPES.includes(row.type as IncentiveType) ? row.type : "commission") as IncentiveType,
    amount: Number(row.amount),
    currency: row.currency.toUpperCase(),
    effectivePeriod: row.period,
    source: "Bulk CSV upload",
  };
}
