// The only seam between Relay and a Remote-compatible system. UI and engines call
// this interface; they never fake API behavior inline.

import type { Country, LegalEntity } from "@/data/countries";
import type { Employment, User } from "@/domain/employment";
import type { Incentive, IncentiveInput } from "@/domain/payroll";

export interface EmploymentInput {
  employeeId: string;
  country: Country["code"];
  fields: Record<string, string | null>;
}

export interface Report {
  id: string;
  name: string;
  description: string;
}

export interface RemoteClient {
  readonly mode: "demo" | "mcp" | "rest";
  getCurrentUser(): Promise<User>;
  listEmployments(): Promise<Employment[]>;
  getEmployment(id: string): Promise<Employment>;
  createEmployment(input: EmploymentInput): Promise<Employment>;
  /** Not in the PRD's minimum interface; needed for the update path of the sync pipeline. */
  updateEmployment(id: string, fields: Record<string, string | null>): Promise<Employment>;
  listLegalEntities(): Promise<LegalEntity[]>;
  listCountries(): Promise<Country[]>;
  createIncentive(input: IncentiveInput): Promise<Incentive>;
  listReports(): Promise<Report[]>;
}

/** Error shape modelled on Remote's documented status codes (401/403/422/429). */
export class RemoteApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "RemoteApiError";
  }
}

export interface ApiCallLog {
  at: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  status: number;
  ms: number;
}
