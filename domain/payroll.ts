import type { CountryCode } from "@/data/countries";

export type IncentiveType = "commission" | "bonus" | "spot_award";

export interface IncentiveInput {
  employeeId: string;
  type: IncentiveType;
  amount: number; // major units as entered; sent as minor units (x100)
  currency: string;
  effectivePeriod: string; // YYYY-MM
  source: string;
  note?: string;
}

export interface IncentiveCheck {
  name: "Employee exists" | "Employment active" | "Currency matches" | "Effective period valid" | "Amount valid" | "Not a duplicate";
  ok: boolean;
  detail: string;
}

export interface Incentive extends IncentiveInput {
  id: string;
  employeeName: string;
  country: CountryCode | null;
  status: "validated" | "queued" | "rejected" | "cancelled";
  checks: IncentiveCheck[];
  createdAt: string;
  amountMinor: number;
}

export interface PayrollPeriod {
  period: string; // YYYY-MM
  label: string;
  status: "open" | "closed";
  cutoff: string;
}

export interface BulkRow {
  row: number;
  employeeId: string;
  type: string;
  amount: string;
  currency: string;
  period: string;
}
