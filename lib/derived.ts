// Memoized derivations over store state. Kept outside components so pages stay thin.

import { LEGAL_ENTITIES } from "@/data/countries";
import { generateWorkforce } from "@/data/seed";
import type { SourceRecord } from "@/domain/employment";
import { applyPatch } from "@/services/sync-engine";
import { employmentIdFor } from "@/services/webhook-engine";

export type Patches = Record<string, Record<string, string | null>>;

let recCache: { patches: Patches; records: SourceRecord[]; byId: Map<string, SourceRecord> } | null = null;

export function recordsFor(patches: Patches) {
  if (recCache && recCache.patches === patches) return recCache;
  const records = generateWorkforce().map((r) => (patches[r.id] ? applyPatch(r, patches[r.id]) : r));
  recCache = { patches, records, byId: new Map(records.map((r) => [r.id, r])) };
  return recCache;
}

let empIndex: Record<string, string> | null = null;
/** employment id -> AcmeHR employee id, for every worker in the workforce. */
export function employmentIndex() {
  if (!empIndex) empIndex = Object.fromEntries(generateWorkforce().map((r) => [employmentIdFor(r.id), r.id]));
  return empIndex;
}

export function entityHeadcount(records: SourceRecord[]) {
  const out: Record<string, number> = Object.fromEntries(LEGAL_ENTITIES.map((e) => [e.code, 0]));
  for (const r of records) {
    const code = r.values["entity.code"];
    if (code) out[code] = (out[code] ?? 0) + 1;
  }
  return out;
}
