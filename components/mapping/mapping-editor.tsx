"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { CountryCode } from "@/data/countries";
import { SOURCE_FIELDS, type DestinationField } from "@/data/schemas";
import type { SourceRecord } from "@/domain/employment";
import { TRANSFORM_META, type FieldMapping, type Transform, type TransformType } from "@/domain/mapping";
import { applyMapping, computeCoverage, mappingStatus } from "@/services/mapping-engine";
import { Button, Input, Label, Mono, Select } from "@/components/ui/primitives";
import { MappingChip } from "@/components/ui/status";

function defaultTransform(type: TransformType, current: Transform): Transform {
  if (type === current.type) return current;
  switch (type) {
    case "lookup":
      return { type, table: {} };
    case "date_format":
      return { type, from: "MM/DD/YYYY" };
    case "coalesce":
      return { type, fallback: "" };
    default:
      return { type } as Transform;
  }
}

export function MappingEditor({ country, dest, mapping, records, onSave, onCancel }: { country: CountryCode; dest: DestinationField; mapping: FieldMapping; records: SourceRecord[]; onSave: (m: FieldMapping) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<FieldMapping>(mapping);
  const coverage = useMemo(() => (draft.source ? computeCoverage(draft, records) : undefined), [draft, records]);
  const status = mappingStatus(draft, country, coverage);
  const samples = useMemo(() => {
    const withGap = coverage?.fallbackCandidate ? records.filter((r) => !draft.source || !r.values[draft.source]).slice(0, 2) : [];
    return [...withGap, ...records.slice(0, 4 - withGap.length)];
  }, [records, draft.source, coverage?.fallbackCandidate]);
  const unknownLookupKeys = useMemo(() => {
    if (draft.transform.type !== "lookup" || !draft.source) return [];
    const t = draft.transform.table;
    return [...new Set(records.map((r) => r.values[draft.source!]).filter((v): v is string => !!v && t[v] === undefined))].slice(0, 6);
  }, [draft, records]);

  const setTransform = (t: Transform) => setDraft((d) => ({ ...d, transform: t }));

  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <MappingChip status={status} />
        {dest.requiredIn.includes(country) ? <span className="text-[12px] text-muted">Required in {country}</span> : <span className="text-[12px] text-muted">Optional in {country}</span>}
        {dest.hint && <span className="text-[12px] text-muted">· {dest.hint}</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ed-source">Source field (AcmeHR)</Label>
          <Select id="ed-source" value={draft.source ?? ""} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value || null, customerInputRequested: false }))}>
            <option value="">No source</option>
            {SOURCE_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.key} · {f.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="ed-transform">Transformation</Label>
          <Select id="ed-transform" value={draft.transform.type} onChange={(e) => setTransform(defaultTransform(e.target.value as TransformType, draft.transform))}>
            {(Object.keys(TRANSFORM_META) as TransformType[]).map((t) => (
              <option key={t} value={t}>
                {TRANSFORM_META[t].label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[12px] text-muted">{TRANSFORM_META[draft.transform.type].description}</p>
        </div>
      </div>

      {draft.transform.type === "date_format" && (
        <div className="max-w-xs">
          <Label htmlFor="ed-date">Source date format</Label>
          <Select id="ed-date" value={draft.transform.from} onChange={(e) => setTransform({ type: "date_format", from: e.target.value as "MM/DD/YYYY" | "DD.MM.YYYY" })}>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
          </Select>
        </div>
      )}

      {draft.transform.type === "coalesce" && (
        <div className="max-w-md">
          <Label htmlFor="ed-fallback" hint="used when the source is empty">Fallback field</Label>
          <Select id="ed-fallback" value={draft.transform.fallback} onChange={(e) => setTransform({ type: "coalesce", fallback: e.target.value })}>
            <option value="">Choose a field</option>
            {SOURCE_FIELDS.filter((f) => f.key !== draft.source).map((f) => (
              <option key={f.key} value={f.key}>
                {f.key}
              </option>
            ))}
          </Select>
        </div>
      )}

      {draft.transform.type === "lookup" && (
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium">Lookup table</p>
          <ul className="divide-y divide-line rounded-[8px] border border-line">
            {Object.entries(draft.transform.table).map(([k, v], i) => (
              <li key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Input aria-label="Source value" className="h-7 font-mono text-[12px]" value={k} readOnly />
                <span className="text-muted">→</span>
                <Input
                  aria-label={`Destination value for ${k}`}
                  className="h-7 font-mono text-[12px]"
                  value={v}
                  onChange={(e) => draft.transform.type === "lookup" && setTransform({ type: "lookup", table: { ...draft.transform.table, [k]: e.target.value } })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${k}`}
                  onClick={() => {
                    if (draft.transform.type !== "lookup") return;
                    const t = { ...draft.transform.table };
                    delete t[k];
                    setTransform({ type: "lookup", table: t });
                  }}
                >
                  <Trash size={14} />
                </Button>
              </li>
            ))}
          </ul>
          {unknownLookupKeys.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[8px] bg-warn-bg px-3 py-2 text-warn-fg">
              <span className="text-[12.5px]">Source values with no entry:</span>
              {unknownLookupKeys.map((k) => (
                <Button
                  key={k}
                  size="sm"
                  onClick={() => draft.transform.type === "lookup" && setTransform({ type: "lookup", table: { ...draft.transform.table, [k]: dest.enumValues?.[0] ?? k.toLowerCase() } })}
                >
                  <Plus size={12} weight="bold" /> {k}
                </Button>
              ))}
            </div>
          )}
          {dest.enumValues && <p className="mt-1.5 text-[12px] text-muted">Allowed destination values: {dest.enumValues.join(", ")}</p>}
        </div>
      )}

      {coverage && (
        <div className="rounded-[8px] border border-line bg-surface-2 p-3">
          <p className="tabular text-[12.5px]">
            Coverage: <strong>{coverage.filled.toLocaleString()}</strong> of {coverage.total.toLocaleString()} {country} records produce a value
            {coverage.errors > 0 && <span className="text-err-fg"> · {coverage.errors} transformation errors ({coverage.firstError})</span>}
          </p>
          {coverage.fallbackCandidate && draft.transform.type !== "coalesce" && (
            <p className="mt-1 text-[12.5px] text-warn-fg">
              {coverage.fallbackCandidate.gaps} records are empty here; <Mono>{coverage.fallbackCandidate.source}</Mono> has values for {coverage.fallbackCandidate.fills} of them. Consider the Fallback transformation.
            </p>
          )}
        </div>
      )}

      <div>
        <p className="label-caps mb-1.5">Preview on sample records</p>
        <div className="overflow-x-auto rounded-[8px] border border-line">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-surface-2 text-left text-muted">
                <th className="px-2.5 py-1.5 font-medium">Worker</th>
                <th className="px-2.5 py-1.5 font-medium">Source value</th>
                <th className="px-2.5 py-1.5 font-medium">{dest.key}</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((r) => {
                const res = applyMapping(draft, r);
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-2.5 py-1.5">{r.values["employee.full_name"]}</td>
                    <td className="px-2.5 py-1.5 font-mono">{draft.source ? (r.values[draft.source] ?? <span className="text-muted">empty</span>) : "—"}</td>
                    <td className="px-2.5 py-1.5 font-mono">{res.ok ? (res.value ?? <span className="text-warn-fg">empty</span>) : <span className="text-err-fg">{res.error}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onSave(draft)}>
          Save mapping
        </Button>
      </div>
    </div>
  );
}
