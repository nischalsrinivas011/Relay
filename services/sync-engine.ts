// Sync engine: snapshot + event stream. Builds synthetic AcmeHR changes and runs the
// local (pre-API) pipeline stages. The API call and webhook confirmation are driven
// by the store so they go through RemoteClient and the webhook engine.

import type { SourceRecord } from "@/domain/employment";
import type { CountryMappings } from "@/domain/mapping";
import type { SyncChangeType } from "@/domain/integration";
import { DEST_BY_KEY } from "@/data/schemas";
import { applyMapping } from "./mapping-engine";
import { validateEmployee, type ValidationContext } from "./validation-engine";

export const SNAPSHOT_PAGE_SIZE = 100;

const NEW_TITLES = ["Senior Account Executive", "Engineering Manager", "Principal Engineer", "Payroll Lead", "Director of Operations"];
const NEW_STREETS = ["14 Quayside Road", "220 Juniper Avenue", "9 Old Mill Lane", "71 Kastanienallee"];

export function buildChange(type: SyncChangeType, record: SourceRecord, seq: number): { patch: Record<string, string | null>; description: string } {
  const v = record.values;
  switch (type) {
    case "employee.updated": {
      const title = NEW_TITLES[seq % NEW_TITLES.length];
      return { patch: { "job.position": title }, description: `Title: ${v["job.position"]} -> ${title}` };
    }
    case "address.changed": {
      const line1 = NEW_STREETS[seq % NEW_STREETS.length];
      return { patch: { "address.line1": line1 }, description: `Address line 1 updated` };
    }
    case "compensation.changed": {
      const next = Math.round((Number(v["comp.base_salary"]) * 1.05) / 100) * 100;
      return { patch: { "comp.base_salary": String(next) }, description: `Base salary +5% (${v["comp.base_salary"]} -> ${next} ${v["comp.currency"]})` };
    }
    case "employee.terminated":
      return { patch: { __status: "terminated" }, description: "Termination recorded in AcmeHR, last day 2026-11-30" };
    case "custom_field.changed": {
      const cc = `CC-${2000 + (seq % 50)}`;
      return { patch: { "custom.cost_center": cc }, description: `Cost center ${v["custom.cost_center"]} -> ${cc}` };
    }
  }
}

export function applyPatch(record: SourceRecord, patch: Record<string, string | null>): SourceRecord {
  const values = { ...record.values };
  for (const [k, val] of Object.entries(patch)) if (!k.startsWith("__")) values[k] = val;
  return { ...record, values };
}

/** Destination-field diff produced by the mapping layer for this change. */
export function destinationDiff(record: SourceRecord, patch: Record<string, string | null>, mappings: CountryMappings) {
  const next = applyPatch(record, patch);
  const diff: { destKey: string; label: string; before: string | null; after: string | null }[] = [];
  for (const m of Object.values(mappings)) {
    if (!m.source) continue;
    const before = applyMapping(m, record);
    const after = applyMapping(m, next);
    const b = before.ok ? before.value : null;
    const a = after.ok ? after.value : null;
    if (b !== a) diff.push({ destKey: m.destKey, label: DEST_BY_KEY[m.destKey]?.label ?? m.destKey, before: b, after: a });
  }
  if (patch.__status) diff.push({ destKey: "status", label: "Employment status", before: "active", after: String(patch.__status) });
  return diff;
}

export function validateChange(record: SourceRecord, patch: Record<string, string | null>, ctx: ValidationContext) {
  const before = validateEmployee(record, ctx);
  const after = validateEmployee(applyPatch(record, patch), ctx);
  const newIssues = after.issues.filter((i) => !before.issues.some((b) => b.destKey === i.destKey && b.kind === i.kind));
  return { ok: after.status === "ready" || newIssues.length === 0, after, newIssues };
}
