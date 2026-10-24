// SIMULATED Remote-compatible API. Every response is generated locally from demo
// state. Paths in the call log mirror Remote's public REST naming for orientation
// only; no network request is made.

import { COUNTRIES, LEGAL_ENTITIES } from "@/data/countries";
import type { Employment, User } from "@/domain/employment";
import type { Incentive, IncentiveInput } from "@/domain/payroll";
import { fnv1a } from "@/lib/utils";
import { RemoteApiError, type ApiCallLog, type EmploymentInput, type RemoteClient, type Report } from "./remote-client";
import { employmentIdFor } from "./webhook-engine";

export type ApiFailure = "rate_limit" | "timeout" | "expired_credential" | "missing_permission";

export interface MockBackend {
  employments(): Record<string, Employment>; // keyed by employment id
  provisionedEntities(): Record<string, boolean>;
  saveEmployment(e: Employment): void;
  /** Returns and clears an armed failure from Demo Controls, if any. */
  takeFailure(): ApiFailure | null;
  log(entry: ApiCallLog): void;
  incentiveDetails(input: IncentiveInput): Pick<Incentive, "employeeName" | "country" | "checks">;
}

export const REPORTS: Report[] = [
  { id: "integration_health", name: "Integration Health", description: "Sync, webhook and validation health for the integration." },
  { id: "payroll_cost", name: "Payroll Cost by Country", description: "Annualized gross payroll by country, in USD at demo FX." },
  { id: "onboarding_status", name: "Employee Onboarding Status", description: "Dry-run status of the workforce by country." },
  { id: "mapping_exceptions", name: "Mapping Exceptions", description: "Destination fields that are unmapped, invalid or need a decision." },
  { id: "customer_actions", name: "Customer Actions Required", description: "Open items owned by Acme's HRIS team." },
  { id: "reliability", name: "Reliability Summary", description: "Success rates, latency and recovery." },
];

export class MockRemoteClient implements RemoteClient {
  readonly mode = "demo" as const;
  constructor(
    private backend: MockBackend,
    private latencyMs = 120,
  ) {}

  private async call<T>(method: ApiCallLog["method"], path: string, fn: () => T): Promise<T> {
    const started = Date.now();
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    const failure = this.backend.takeFailure();
    const at = new Date().toISOString();
    if (failure) {
      const map = {
        rate_limit: new RemoteApiError(429, "rate_limited", "Too many requests", { "x-ratelimit-reset": "30000" }),
        timeout: new RemoteApiError(504, "gateway_timeout", "Upstream timed out after 10 s"),
        expired_credential: new RemoteApiError(401, "unauthorized", "Token expired or not valid for this environment"),
        missing_permission: new RemoteApiError(403, "forbidden", "Token is missing the scope required for this endpoint"),
      } as const;
      const err = map[failure];
      this.backend.log({ at, method, path, status: err.status, ms: failure === "timeout" ? 10_000 : Date.now() - started });
      throw err;
    }
    const out = fn();
    this.backend.log({ at, method, path, status: method === "POST" ? 201 : 200, ms: Date.now() - started });
    return out;
  }

  getCurrentUser(): Promise<User> {
    return this.call("GET", "/v1/me (simulated)", () => ({ id: "usr_demo_pm", name: "Demo Integration PM", role: "Integration product manager" }));
  }

  listEmployments(): Promise<Employment[]> {
    return this.call("GET", "/v1/employments", () => Object.values(this.backend.employments()));
  }

  getEmployment(id: string): Promise<Employment> {
    return this.call("GET", `/v1/employments/${id}`, () => {
      const e = this.backend.employments()[id];
      if (!e) throw new RemoteApiError(404, "not_found", `Employment ${id} not found`);
      return e;
    });
  }

  createEmployment(input: EmploymentInput): Promise<Employment> {
    return this.call("POST", "/v1/employments", () => {
      const e: Employment = {
        id: employmentIdFor(input.employeeId),
        employeeId: input.employeeId,
        country: input.country,
        status: "onboarding",
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      this.backend.saveEmployment(e);
      return e;
    });
  }

  updateEmployment(id: string, fields: Record<string, string | null>): Promise<Employment> {
    return this.call("PATCH", `/v1/employments/${id}`, () => {
      const current = this.backend.employments()[id];
      if (!current) throw new RemoteApiError(404, "not_found", `Employment ${id} not found`);
      const terminated = fields["__status"] === "terminated";
      const next: Employment = { ...current, status: terminated ? "terminated" : current.status, version: current.version + 1, updatedAt: new Date().toISOString() };
      this.backend.saveEmployment(next);
      return next;
    });
  }

  listLegalEntities() {
    return this.call("GET", "/v1/companies/{id}/legal-entities (simulated)", () =>
      LEGAL_ENTITIES.map((e) => ({ ...e, provisioned: this.backend.provisionedEntities()[e.code] ?? e.provisioned })),
    );
  }

  listCountries() {
    return this.call("GET", "/v1/countries", () => COUNTRIES);
  }

  createIncentive(input: IncentiveInput): Promise<Incentive> {
    return this.call("POST", "/v1/incentives", () => {
      const details = this.backend.incentiveDetails(input);
      return {
        ...input,
        ...details,
        id: `inc_${fnv1a(`${input.employeeId}:${input.amount}:${Date.now()}`)}`,
        status: "queued",
        createdAt: new Date().toISOString(),
        amountMinor: Math.round(input.amount * 100),
      };
    });
  }

  listReports() {
    return this.call("GET", "/v1/reports (simulated)", () => REPORTS);
  }
}
