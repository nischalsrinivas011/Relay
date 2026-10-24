"use client";

import { ArrowRight, BookmarkSimple, MagicWand, Sparkle, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { COUNTRIES, COUNTRY_BY_CODE, type CountryCode } from "@/data/countries";
import { SOURCE_BY_KEY, type DestinationField } from "@/data/schemas";
import { TRANSFORM_META, type FieldMapping, type MappingStatus, type MappingSuggestion } from "@/domain/mapping";
import { useMappingHealth, useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { autoMap, suggestMappings } from "@/services/mapping-engine";
import { Button, Card, CardHeader, Drawer, Mono, PageHeader, Segmented, td, th } from "@/components/ui/primitives";
import { Chip, MappingChip, mappingStatusLabel } from "@/components/ui/status";
import { MappingEditor } from "@/components/mapping/mapping-editor";

const ORDER: MappingStatus[] = ["missing_source", "invalid", "needs_transformation", "customer_decision", "mapped", "optional", "missing_destination"];

export default function MappingPage() {
  const country = useStore((s) => s.mappingCountry);
  const setCountry = useStore((s) => s.setMappingCountry);
  const mappings = useStore((s) => s.mappings);
  const setMapping = useStore((s) => s.setMapping);
  const applyMappings = useStore((s) => s.applyMappings);
  const notify = useStore((s) => s.notify);
  const health = useMappingHealth();
  const { records } = useRecords();
  const [editing, setEditing] = useState<DestinationField | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [confirming, setConfirming] = useState<MappingSuggestion | null>(null);

  const countryRecords = useMemo(() => records.filter((r) => r.country === country), [records, country]);
  const rows = useMemo(
    () => [...(health.byCountry.find((c) => c.country === country)?.rows ?? [])].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)),
    [health, country],
  );
  const suggestions = useMemo(() => suggestMappings(country, mappings[country], countryRecords), [country, mappings, countryRecords]);
  const counts = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  const required = rows.filter((r) => r.dest.requiredIn.includes(country));
  const countrySpecific = rows.filter((r) => r.dest.countries.length < 4);

  const runAutoMap = () => {
    const list = autoMap(country, mappings[country], countryRecords);
    if (!list.length) {
      notify("No obvious matches left. Remaining gaps need review or a transformation.", "warn");
      return;
    }
    applyMappings(country, list, `Auto-mapped ${list.length} obvious field(s) in ${country}`);
    notify(`Auto-mapped ${list.length} field(s)`);
  };

  const saveMapping = (m: FieldMapping, note?: string) => {
    setMapping(country, m, note);
    setEditing(null);
  };

  return (
    <div className="enter">
      <PageHeader
        step="Stage 4 · Data Mapping Studio"
        title="Map AcmeHR fields to the destination schema"
        description="Mappings are per country because required fields differ. Every change is validated against real (synthetic) records before it reaches onboarding."
        actions={
          <>
            <Button onClick={runAutoMap}>
              <MagicWand size={15} weight="bold" aria-hidden /> Auto-map obvious fields
            </Button>
            <Button variant="primary" onClick={() => setShowSuggestions(true)}>
              <Sparkle size={15} weight="fill" aria-hidden /> Suggest mappings
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<CountryCode> label="Country" value={country} onChange={setCountry} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
        <span className="text-[12.5px] text-muted">
          {required.length} required fields · {countrySpecific.length} {COUNTRY_BY_CODE[country].name}-specific · currency {COUNTRY_BY_CODE[country].currency}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {ORDER.filter((s) => counts[s]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[12.5px]">
            <MappingChip status={s} /> <span className="tabular text-muted">{counts[s]}</span>
          </span>
        ))}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <Card className="mb-5">
          <CardHeader
            title={<span className="inline-flex items-center gap-1.5"><Sparkle size={14} weight="fill" aria-hidden /> Suggested mappings for {COUNTRY_BY_CODE[country].name}</span>}
            sub="Rule-based: name similarity, field coverage in AcmeHR and format compatibility. Nothing is applied until you confirm."
            actions={<Button size="sm" variant="ghost" onClick={() => setShowSuggestions(false)}>Hide</Button>}
          />
          <ul className="divide-y divide-line">
            {suggestions.map((s) => (
              <li key={`${s.destKey}-${s.source}-${s.transform.type}`} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <Mono>{s.transform.type === "coalesce" ? `${s.source} ?? ${s.transform.fallback}` : s.source}</Mono>
                    <ArrowRight size={12} weight="bold" className="text-muted" aria-hidden />
                    <Mono className="font-semibold">{s.destKey}</Mono>
                    <Chip tone="neutral">{TRANSFORM_META[s.transform.type].label}</Chip>
                  </p>
                  <p className="mt-1 text-[12.5px] text-muted">{s.reason.replace(/`/g, "")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("tabular rounded-full px-2 py-0.5 text-[12px] font-semibold", s.confidence >= 90 ? "bg-ok-bg text-ok-fg" : s.confidence >= 75 ? "bg-warn-bg text-warn-fg" : "bg-neutral-bg text-neutral-fg")}>
                    Confidence {s.confidence}%
                  </span>
                  {confirming === s ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          saveMapping({ ...mappings[country][s.destKey], destKey: s.destKey, source: s.source, transform: s.transform, customerInputRequested: false }, `Suggestion applied: ${country} ${s.destKey} <- ${s.source} (${TRANSFORM_META[s.transform.type].label})`);
                          setConfirming(null);
                          notify("Mapping applied. Re-run onboarding validation to see the effect.");
                        }}
                      >
                        Confirm apply
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setConfirming(s)}>Review and apply</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader title={`Mapping grid · ${COUNTRY_BY_CODE[country].name}`} sub={`${countryRecords.length.toLocaleString()} AcmeHR records in scope`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-[13px]">
            <caption className="sr-only">Source to destination field mappings for {COUNTRY_BY_CODE[country].name}</caption>
            <thead>
              <tr>
                <th className={th} scope="col">Source field</th>
                <th className={th} scope="col">Transformation</th>
                <th className={th} scope="col">Destination field</th>
                <th className={cn(th, "text-right")} scope="col">Coverage</th>
                <th className={th} scope="col">Status</th>
                <th className={cn(th, "text-right")} scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ dest, mapping, coverage, status }) => {
                const req = dest.requiredIn.includes(country);
                return (
                  <tr key={dest.key} className="hover:bg-surface-2">
                    <td className={td}>
                      {mapping.source ? (
                        <>
                          <Mono>{mapping.source}</Mono>
                          {mapping.transform.type === "coalesce" && <span className="block text-[11.5px] text-muted">fallback {mapping.transform.fallback}</span>}
                        </>
                      ) : (
                        <span className="text-muted">No source</span>
                      )}
                    </td>
                    <td className={td}>{mapping.source ? TRANSFORM_META[mapping.transform.type].label : "—"}</td>
                    <td className={td}>
                      <Mono className="text-ink-strong">{dest.key}</Mono>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                        {dest.label}
                        {req && <span className="font-medium text-ink">· Required</span>}
                        {dest.countries.length < 4 && <span>· {country} rule</span>}
                      </span>
                    </td>
                    <td className={cn(td, "tabular text-right text-[12.5px]")}>
                      {coverage ? (
                        <span className={cn(coverage.filled < coverage.total && req && "text-warn-fg", coverage.errors > 0 && "text-err-fg")}>
                          {coverage.filled.toLocaleString()}/{coverage.total.toLocaleString()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={td}>
                      <MappingChip status={status} />
                      {mapping.savedReusable && <BookmarkSimple size={14} weight="fill" className="ml-1.5 inline text-muted" aria-label="Saved as reusable" />}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => setEditing(dest)}>Edit</Button>
                        {!req && !mapping.markedOptional && !mapping.source && (
                          <Button size="sm" variant="ghost" onClick={() => saveMapping({ ...mapping, markedOptional: true }, `Marked optional: ${country} ${dest.key}`)}>Mark optional</Button>
                        )}
                        {mapping.markedOptional && (
                          <Button size="sm" variant="ghost" onClick={() => saveMapping({ ...mapping, markedOptional: false }, `Optional flag removed: ${country} ${dest.key}`)}>Unmark</Button>
                        )}
                        {status !== "mapped" && status !== "optional" && !mapping.customerInputRequested && (
                          <Button size="sm" variant="ghost" title="Request customer input" onClick={() => saveMapping({ ...mapping, customerInputRequested: true }, `Customer input requested: ${country} ${dest.key}`)}>
                            <UserCircle size={14} weight="bold" aria-hidden /> Ask customer
                          </Button>
                        )}
                        {status === "mapped" && !mapping.savedReusable && (
                          <Button size="sm" variant="ghost" onClick={() => saveMapping({ ...mapping, savedReusable: true }, `Saved reusable mapping: ${dest.key} <- ${mapping.source}`)}>
                            <BookmarkSimple size={14} weight="bold" aria-hidden /> Save reusable
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="AcmeHR fields with no destination" sub="Missing destination: these source fields are not consumed by any country mapping" />
        <ul className="flex flex-wrap gap-2 p-4">
          {health.unmappedSources.map((k) => (
            <li key={k} className="inline-flex items-center gap-2 rounded-[7px] border border-line bg-surface-2 px-2.5 py-1.5">
              <Mono>{k}</Mono>
              <span className="text-[12px] text-muted">{SOURCE_BY_KEY[k]?.custom ? "custom" : SOURCE_BY_KEY[k]?.group}</span>
              <Chip tone="info">{mappingStatusLabel("missing_destination")}</Chip>
            </li>
          ))}
        </ul>
        <p className="px-4 pb-4 text-[12.5px] text-muted">
          Custom fields without a destination go to the Reusable Patterns review as customer-specific. Validate the effect in{" "}
          <Link href="/onboarding" className="font-medium text-info-fg hover:underline">Onboarding</Link>.
        </p>
      </Card>

      <Drawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing ? `${editing.label}` : ""} description={editing ? `${COUNTRY_BY_CODE[country].name} · ${editing.key}` : undefined} width="max-w-2xl">
        {editing && (
          <MappingEditor
            key={`${country}-${editing.key}`}
            country={country}
            dest={editing}
            mapping={mappings[country][editing.key] ?? { destKey: editing.key, source: null, transform: { type: "direct" } }}
            records={countryRecords}
            onCancel={() => setEditing(null)}
            onSave={(m) => saveMapping(m)}
          />
        )}
      </Drawer>
    </div>
  );
}
