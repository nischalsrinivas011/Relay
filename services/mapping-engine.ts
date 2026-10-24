// Mapping engine: applies transformations, computes mapping status and coverage,
// and produces rule-based mapping suggestions. Pure functions; no UI or store access.

import { ISO2_TO_ISO3, type CountryCode } from "@/data/countries";
import { DEST_BY_KEY, SOURCE_BY_KEY, SOURCE_FIELDS, destFieldsFor, type DestinationField, type ValueFormat } from "@/data/schemas";
import type { SourceRecord } from "@/domain/employment";
import {
  TRANSFORM_META,
  type CountryMappings,
  type Coverage,
  type FieldMapping,
  type MappingStatus,
  type MappingSuggestion,
  type Transform,
} from "@/domain/mapping";

export type TransformResult = { ok: true; value: string | null } | { ok: false; error: string };

const isEmpty = (v: string | null | undefined) => v === null || v === undefined || String(v).trim() === "";

export function applyTransform(transform: Transform, value: string | null, record?: SourceRecord): TransformResult {
  if (transform.type === "coalesce") {
    if (!isEmpty(value)) return { ok: true, value };
    const fb = record?.values[transform.fallback] ?? null;
    return { ok: true, value: isEmpty(fb) ? null : fb };
  }
  if (isEmpty(value)) return { ok: true, value: null };
  const v = String(value).trim();
  switch (transform.type) {
    case "direct":
      return { ok: true, value: v };
    case "uppercase":
      return { ok: true, value: v.toUpperCase() };
    case "currency_minor_units": {
      const n = Number(v.replace(/[, ]/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: `"${v}" is not a number` };
      return { ok: true, value: String(Math.round(n * 100)) };
    }
    case "lookup": {
      const hit = transform.table[v];
      if (hit === undefined) return { ok: false, error: `No lookup entry for "${v}"` };
      return { ok: true, value: hit };
    }
    case "date_format": {
      const m = transform.from === "MM/DD/YYYY" ? v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) : v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!m) return { ok: false, error: `"${v}" does not match ${transform.from}` };
      const [mm, dd] = transform.from === "MM/DD/YYYY" ? [m[1], m[2]] : [m[2], m[1]];
      return { ok: true, value: `${m[3]}-${mm}-${dd}` };
    }
    case "country_iso3": {
      const hit = ISO2_TO_ISO3[v.toUpperCase()];
      if (!hit) return { ok: false, error: `Unknown country code "${v}"` };
      return { ok: true, value: hit };
    }
    case "phone_e164": {
      const digits = v.replace(/[^\d+]/g, "");
      if (digits.startsWith("+")) return { ok: true, value: digits };
      if (digits.startsWith("00")) return { ok: true, value: `+${digits.slice(2)}` };
      return { ok: false, error: `Cannot infer country prefix for "${v}"` };
    }
  }
}

export function applyMapping(mapping: FieldMapping, record: SourceRecord): TransformResult {
  if (!mapping.source) return { ok: true, value: null };
  return applyTransform(mapping.transform, record.values[mapping.source] ?? null, record);
}

/** Format produced by a mapping, given its source field. */
export function outputFormat(mapping: FieldMapping): ValueFormat | null {
  if (!mapping.source) return null;
  const src = SOURCE_BY_KEY[mapping.source];
  if (!src) return null;
  const out = TRANSFORM_META[mapping.transform.type].output;
  return out === "same" ? src.format : out;
}

export function transformConfigError(t: Transform): string | null {
  if (t.type === "lookup" && Object.keys(t.table).length === 0) return "Lookup table is empty";
  if (t.type === "coalesce" && !SOURCE_BY_KEY[t.fallback]) return "Fallback field is not set";
  return null;
}

export function isRequired(dest: DestinationField, country: CountryCode, mapping?: FieldMapping) {
  return dest.requiredIn.includes(country) && !mapping?.markedOptional;
}

export function computeCoverage(mapping: FieldMapping, records: SourceRecord[]): Coverage {
  let filled = 0;
  let errors = 0;
  let firstError: string | undefined;
  const gaps: SourceRecord[] = [];
  for (const r of records) {
    const res = applyMapping(mapping, r);
    if (res.ok && !isEmpty(res.value)) filled++;
    else if (res.ok) gaps.push(r);
    else {
      errors++;
      firstError ??= res.error;
    }
  }
  const cov: Coverage = { filled, total: records.length, errors, firstError };
  if (mapping.source && gaps.length > 0 && gaps.length < records.length) {
    const src = SOURCE_BY_KEY[mapping.source];
    let best: Coverage["fallbackCandidate"];
    for (const f of SOURCE_FIELDS) {
      if (f.key === mapping.source || f.format !== src?.format) continue;
      if (nameScore(mapping.destKey, f.key) < 0.5) continue;
      const fills = gaps.filter((g) => !isEmpty(g.values[f.key])).length;
      if (fills > 0 && (!best || fills > best.fills)) best = { source: f.key, fills, gaps: gaps.length };
    }
    cov.fallbackCandidate = best;
  }
  return cov;
}

export function mappingStatus(mapping: FieldMapping, country: CountryCode, coverage?: Coverage): MappingStatus {
  const dest = DEST_BY_KEY[mapping.destKey];
  if (!dest) return "missing_destination";
  if (mapping.markedOptional) return "optional";
  if (mapping.customerInputRequested) return "customer_decision";
  if (!mapping.source) return dest.requiredIn.includes(country) ? "missing_source" : "optional";
  if (transformConfigError(mapping.transform) || (coverage && coverage.errors > 0)) return "invalid";
  const fmt = outputFormat(mapping);
  if (!fmt || !dest.accepts.includes(fmt)) return "needs_transformation";
  if (coverage?.fallbackCandidate && dest.requiredIn.includes(country) && mapping.transform.type !== "coalesce") return "needs_transformation";
  return "mapped";
}

/** Source fields that no mapping in any country consumes. */
export function unmappedSourceFields(all: Record<CountryCode, CountryMappings>): string[] {
  const used = new Set<string>(["employee.id"]); // used as the idempotency/external id, not a form field
  for (const cm of Object.values(all)) {
    for (const m of Object.values(cm)) {
      if (m.source) used.add(m.source);
      if (m.transform.type === "coalesce") used.add(m.transform.fallback);
    }
  }
  return SOURCE_FIELDS.filter((f) => !used.has(f.key)).map((f) => f.key);
}

// ---------- Suggestions (rule-based; no model call) ----------

const STOP = new Set(["address", "details", "basic", "information", "personal", "contact", "contract", "code", "or", "employee", "custom", "fields", "comp", "job", "tax", "benefits", "entity"]);
const SYNONYMS: Record<string, string[]> = {
  province: ["state", "province"],
  state: ["province", "state"],
  number: ["phone", "number"],
  phone: ["number", "mobile"],
  name: ["name", "full"],
  title: ["position", "title"],
  postal: ["postcode", "postal", "zip"],
  salary: ["salary", "base"],
};

function tokens(key: string) {
  return key
    .toLowerCase()
    .split(/[._\s]+/)
    .filter((t) => t && !STOP.has(t));
}

function nameScore(destKey: string, sourceKey: string) {
  const d = tokens(destKey);
  const s = new Set(tokens(sourceKey));
  if (d.length === 0) return 0;
  let hit = 0;
  for (const t of d) if (s.has(t) || (SYNONYMS[t] ?? []).some((x) => s.has(x))) hit++;
  return hit / d.length;
}

function transformFor(src: ValueFormat, dest: DestinationField): Transform | null {
  if (dest.accepts.includes(src)) return { type: "direct" };
  if (src === "iso2" && dest.accepts.includes("iso3")) return { type: "country_iso3" };
  if (src === "us_date" && dest.accepts.includes("iso_date")) return { type: "date_format", from: "MM/DD/YYYY" };
  if (src === "major_units" && dest.accepts.includes("minor_units")) return { type: "currency_minor_units" };
  if (src === "text" && dest.accepts.includes("code")) return { type: "uppercase" };
  return null;
}

export function suggestMappings(country: CountryCode, mappings: CountryMappings, records: SourceRecord[]): MappingSuggestion[] {
  const out: MappingSuggestion[] = [];
  const countryName = { US: "US", CA: "Canadian", GB: "UK", DE: "German" }[country];
  for (const dest of destFieldsFor(country)) {
    const mapping = mappings[dest.key];
    if (mapping?.markedOptional) continue;

    if (!mapping?.source) {
      let best: MappingSuggestion | null = null;
      for (const src of SOURCE_FIELDS) {
        const t = transformFor(src.format, dest);
        if (!t) continue;
        const name = nameScore(dest.key, src.key);
        if (name === 0) continue;
        const filled = records.filter((r) => !isEmpty(r.values[src.key])).length;
        const cov = records.length ? filled / records.length : 0;
        const confidence = Math.round(100 * (0.42 * name + 0.38 * cov + 0.14 * 1));
        if (!best || confidence > best.confidence) {
          best = {
            destKey: dest.key,
            source: src.key,
            transform: t,
            confidence,
            reason: `\`${src.key.split(".").pop()}\` matches \`${dest.key.split(".").pop()}\` by name; populated for ${filled.toLocaleString()} of ${records.length.toLocaleString()} ${countryName} records; ${t.type === "direct" ? "format compatible" : `needs ${TRANSFORM_META[t.type].label.toLowerCase()}`}.`,
          };
        }
      }
      if (best && best.confidence >= 60) out.push(best);
      continue;
    }

    const cov = computeCoverage(mapping, records);
    if (dest.requiredIn.includes(country) && cov.fallbackCandidate && mapping.transform.type !== "coalesce") {
      const fb = cov.fallbackCandidate;
      const confidence = Math.round(100 * (0.42 * nameScore(dest.key, fb.source) + 0.38 * (fb.fills / fb.gaps) + 0.14));
      out.push({
        destKey: dest.key,
        source: mapping.source,
        transform: { type: "coalesce", fallback: fb.source },
        confidence,
        reason: `\`${mapping.source}\` is empty for ${fb.gaps} of ${cov.total} ${countryName} records; \`${fb.source}\` is populated for ${fb.fills} of those ${fb.gaps}. Use it as a fallback.`,
      });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Obvious maps only: exact name match, direct format, full coverage. */
export function autoMap(country: CountryCode, mappings: CountryMappings, records: SourceRecord[]): FieldMapping[] {
  return suggestMappings(country, mappings, records)
    .filter((s) => !mappings[s.destKey]?.source && s.confidence >= 90 && s.transform.type === "direct")
    .map((s) => ({ destKey: s.destKey, source: s.source, transform: s.transform }));
}
