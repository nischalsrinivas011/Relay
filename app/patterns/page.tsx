"use client";

import { CheckCircle, Circle, Stack } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { LEGAL_ENTITIES } from "@/data/countries";
import { DEST_BY_KEY } from "@/data/schemas";
import { TRANSFORM_META } from "@/domain/mapping";
import { REUSABILITY_LABEL, type IntegrationPattern, type Reusability } from "@/domain/pattern";
import { entityHeadcount } from "@/lib/derived";
import { useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn, fmtTime } from "@/lib/utils";
import { generatePattern } from "@/services/pattern-engine";
import { Button, Card, CardHeader, Mono, PageHeader, Segmented, td, th } from "@/components/ui/primitives";
import { Metric, ReuseChip } from "@/components/ui/status";

function useDraftPattern(): IntegrationPattern {
  const s = useStore();
  const { records } = useRecords();
  return useMemo(() => {
    const heads = entityHeadcount(records);
    return generatePattern({
      mappings: s.mappings,
      subscriptions: s.subscriptions,
      summary: s.run?.summary ?? null,
      nonReady: s.run?.nonReady ?? {},
      deliveries: s.deliveries,
      discovery: s.discovery,
      snapshot: s.snapshot,
      incentives: s.incentives,
      blockedEntityCount: LEGAL_ENTITIES.filter((e) => !(s.provisionedEntities[e.code] ?? e.provisioned) && heads[e.code] > 0).length,
      credentialExpired: s.demo.credentialExpired,
      reconciled: !!s.reconciledAt,
      previousVersion: s.patterns[0]?.version,
    });
  }, [s.mappings, s.subscriptions, s.run, s.deliveries, s.discovery, s.snapshot, s.incentives, s.provisionedEntities, s.demo.credentialExpired, s.reconciledAt, s.patterns, records]);
}

export default function PatternsPage() {
  const patterns = useStore((s) => s.patterns);
  const promote = useStore((s) => s.promotePattern);
  const draft = useDraftPattern();
  const [view, setView] = useState<"published" | "draft">("published");
  const [filter, setFilter] = useState<Reusability | "all">("all");
  const p = view === "published" && patterns[0] ? patterns[0] : draft;
  const isDraft = p === draft;
  const doneSteps = p.checklist.filter((c) => c.done).length;
  const groups = [...new Set(p.checklist.map((c) => c.group))];
  const entries = p.entries.filter((e) => filter === "all" || e.reusability === filter);
  const total = p.entries.length;

  return (
    <div className="enter">
      <PageHeader
        step="Stage 9 · Reusable patterns"
        title="Don't solve the same integration twice"
        description="Promote the Acme implementation into a versioned pattern. Everything below is generated from the mappings, rules, edge cases and checklist created earlier in this engagement."
        actions={
          <Button variant="primary" onClick={() => { promote(); setView("published"); }}>
            <Stack size={15} weight="bold" aria-hidden /> {patterns.length ? `Promote as v${draft.version}` : "Promote to reusable pattern"}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {patterns.length > 0 && (
          <Segmented label="Pattern view" value={view} onChange={setView} options={[{ value: "published", label: `Published v${patterns[0].version}` }, { value: "draft", label: "Live draft" }]} />
        )}
        <p className="text-[13px] text-muted">
          {isDraft ? "Live draft from the current engagement. Not yet promoted." : `Promoted ${fmtTime(p.createdAt)}. Later changes appear in the live draft.`}
        </p>
      </div>

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="label-caps">Pattern</p>
            <h2 className="font-serif text-[26px] leading-tight tracking-[-0.02em]">{p.name}</h2>
            <p className="mt-1 font-mono text-[12px] text-muted">{p.id} · version {p.version} · {p.countries.join(", ")}</p>
          </div>
          <div className="text-right">
            <p className="label-caps">Implementation checklist</p>
            <p className="tabular text-[22px] font-semibold text-ink-strong">{doneSteps}/{p.counts.checklistSteps} steps</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Standard mappings" value={p.counts.standardMappings} sub="Deduplicated across countries" />
          <Metric label="Custom mappings" value={p.counts.customMappings} sub="Customer-specific" />
          <Metric label="Country rules" value={p.counts.countryRules} sub="Country-only fields" />
          <Metric label="Webhook subscriptions" value={p.counts.webhookSubscriptions} />
          <Metric label="Known edge cases" value={p.counts.edgeCases} />
          <Metric label="Checklist steps" value={p.counts.checklistSteps} />
        </div>
        <div className="mt-5">
          <p className="label-caps mb-2">Reusability of {total} country mappings</p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-bg" role="img" aria-label={(Object.keys(p.reusability) as Reusability[]).map((r) => `${REUSABILITY_LABEL[r]} ${p.reusability[r]}`).join(", ")}>
            {(["reusable", "configurable", "customer_specific", "unsupported"] as Reusability[]).map((r) => (
              <div key={r} className={cn(r === "reusable" && "bg-ok-fg", r === "configurable" && "bg-info-fg", r === "customer_specific" && "bg-warn-fg", r === "unsupported" && "bg-err-fg")} style={{ width: `${(p.reusability[r] / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {(["reusable", "configurable", "customer_specific", "unsupported"] as Reusability[]).map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 text-[12.5px]"><ReuseChip r={r} /> <span className="tabular text-muted">{p.reusability[r]}</span></span>
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Implementation checklist" sub="Status derived from the engagement" />
          <div className="divide-y divide-line">
            {groups.map((g) => (
              <div key={g} className="px-4 py-2.5">
                <p className="label-caps mb-1">{g}</p>
                <ul className="space-y-1">
                  {p.checklist.filter((c) => c.group === g).map((c) => (
                    <li key={c.label} className="flex items-center gap-2 text-[13px]">
                      {c.done ? <CheckCircle size={15} weight="fill" className="text-ok-fg" aria-label="done" /> : <Circle size={15} className="text-muted" aria-label="not done" />}
                      <span className={cn(!c.done && "text-muted")}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Known edge cases" sub="Carried to the next customer" />
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
              {p.edgeCases.map((e) => (
                <li key={e.title} className="px-4 py-2.5">
                  <p className="text-[13px] font-medium">{e.title}</p>
                  <p className="text-[12.5px] text-muted">{e.detail}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label-caps">Value</p>
              <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn-fg">Illustrative product target</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="tabular text-[28px] font-semibold text-ink-strong">5.0</p>
                <p className="text-[12.5px] text-muted">simulated implementation units, first customer</p>
              </div>
              <div>
                <p className="tabular text-[28px] font-semibold text-ok-fg">1.5</p>
                <p className="text-[12.5px] text-muted">target units for the next customer on this pattern</p>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-muted">A hypothesis to test, not measured Remote performance.</p>
          </Card>
        </div>
      </div>

      <Card className="mb-5">
        <CardHeader
          title="Mapping classification"
          sub="Why each mapping is or is not reusable"
          actions={<Segmented<Reusability | "all"> label="Filter by reusability" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "reusable", label: "Reusable" }, { value: "configurable", label: "Configurable" }, { value: "customer_specific", label: "Customer" }, { value: "unsupported", label: "Unsupported" }]} />}
        />
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead className="sticky top-0 bg-surface"><tr>{["Country", "Destination", "Source", "Transformation", "Classification", "Why"].map((h) => <th key={h} className={th} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.country}-${e.destKey}`}>
                  <td className={td}>{e.country}</td>
                  <td className={td}><Mono>{e.destKey}</Mono><span className="block text-[11px] text-muted">{DEST_BY_KEY[e.destKey]?.label}</span></td>
                  <td className={td}>{e.source ? <Mono>{e.source}</Mono> : <span className="text-muted">none</span>}</td>
                  <td className={td}>{TRANSFORM_META[e.transform].label}</td>
                  <td className={td}><ReuseChip r={e.reusability} /></td>
                  <td className={cn(td, "text-muted")}>{e.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {patterns.length > 0 && (
        <Card>
          <CardHeader title="Version history" />
          <ul className="divide-y divide-line text-[13px]">
            {patterns.map((x) => (
              <li key={x.id + x.createdAt} className="flex flex-wrap justify-between gap-3 px-4 py-2">
                <span>v{x.version} · {x.counts.standardMappings} standard, {x.counts.customMappings} custom, {x.counts.edgeCases} edge cases</span>
                <span className="text-muted">{fmtTime(x.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
