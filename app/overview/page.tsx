"use client";

import { ArrowRight, Check } from "@phosphor-icons/react";
import Link from "next/link";
import { LIFECYCLE, useLifecycle, useReliability, useRisks } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn, fmtDuration, fmtNum, fmtPct, fmtTime } from "@/lib/utils";
import { Card, CardHeader, DemoBadge, PageHeader } from "@/components/ui/primitives";
import { Metric, SeverityChip } from "@/components/ui/status";

export default function OverviewPage() {
  const run = useStore((s) => s.run);
  const inputsVersion = useStore((s) => s.inputsVersion);
  const activity = useStore((s) => s.activity);
  const rel = useReliability();
  const risks = useRisks();
  const life = useLifecycle();
  const s = run?.summary;
  const critical = risks.filter((r) => r.level === "Critical").length;

  return (
    <div className="enter">
      <PageHeader
        step="Acme Global · Integration overview"
        title="AcmeHR → Remote Global Employment"
        description="2,400 workers across the US, Canada, the UK and Germany moving from AcmeHR to a Remote-compatible Global Payroll setup. Primarily HRIS to Remote, with status and payroll events flowing back."
        actions={<DemoBadge>Demo environment</DemoBadge>}
      />

      <Card className="mb-5 px-4 py-4">
        <p className="label-caps mb-3">Integration lifecycle</p>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {LIFECYCLE.map((p, i) => {
            const state = life.done[i] ? "done" : i === life.current ? "current" : "todo";
            return (
              <li
                key={p}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px]",
                  state === "current" && "border-ink-strong bg-surface font-medium text-ink-strong",
                  state === "done" && "border-line bg-surface-2 text-muted",
                  state === "todo" && "border-dashed border-line-strong text-muted",
                )}
              >
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular", state === "done" ? "bg-ok-bg text-ok-fg" : state === "current" ? "bg-action text-action-fg" : "bg-neutral-bg text-neutral-fg")}>
                  {state === "done" ? <Check size={12} weight="bold" aria-label="Done" /> : i + 1}
                </span>
                {p}
                {state === "current" && <span className="sr-only">(current phase)</span>}
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-caps">Workforce readiness · last validation run {run ? fmtTime(run.at) : "never"}</p>
        {run && run.inputsVersion !== inputsVersion && (
          <Link href="/onboarding" className="text-[12.5px] font-medium text-info-fg underline-offset-2 hover:underline">
            Inputs changed since this run. Re-run validation
          </Link>
        )}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Total workers" value={fmtNum(s?.total ?? 0)} sub="4 countries, 5 legal entities" />
        <Metric label="Integration-ready" value={fmtNum(s?.ready ?? 0)} sub={s ? fmtPct(s.ready / s.total) + " of workforce" : ""} tone="ok" />
        <Metric label="Customer action required" value={fmtNum(s?.customer_action ?? 0)} sub="Owned by Acme's HRIS team" tone={s?.customer_action ? "warn" : undefined} />
        <Metric label="Schema validation failures" value={fmtNum(s?.schema_error ?? 0)} sub="Mapping or format errors" tone={s?.schema_error ? "err" : undefined} />
        <Metric label="Configuration blockers" value={fmtNum(s?.legal_entity_blocked ?? 0)} sub="Legal entity not configured" tone={s?.legal_entity_blocked ? "err" : undefined} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Sync success rate" value={rel ? fmtPct(rel.metrics.syncSuccess) : "—"} sub="Attempted records, last run" />
        <Metric label="Webhook delivery rate" value={rel ? fmtPct(rel.metrics.webhookSuccess) : "—"} sub={rel ? `${rel.metrics.duplicates} duplicates ignored` : ""} />
        <Metric label="P95 sync latency" value={rel ? fmtDuration(rel.metrics.p95Latency) : "—"} sub="Change captured → reconciled" />
        <Metric label="Open critical issues" value={critical} sub="See integration risks" tone={critical ? "err" : "ok"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Integration risks" sub="Computed from mappings, validation, entities and webhook state" />
          {risks.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">No open risks. The integration is ready to operate.</p>
          ) : (
            <ul className="divide-y divide-line">
              {risks.map((r) => (
                <li key={r.id}>
                  <Link href={r.href} className="group flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                    <SeverityChip level={r.level} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink-strong">{r.title}</p>
                      <p className="truncate text-[12.5px] text-muted">{r.detail}</p>
                    </div>
                    <ArrowRight size={14} weight="bold" className="mt-1 text-muted group-hover:text-ink" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent activity" />
          <ol className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {activity.slice(0, 14).map((a) => (
              <li key={a.id} className="flex gap-3 px-4 py-2.5">
                <span className="tabular w-[92px] shrink-0 pt-px font-mono text-[11.5px] text-muted">{fmtTime(a.at)}</span>
                <div className="min-w-0">
                  <p className="label-caps !text-[10px]">{a.kind}</p>
                  <p className="text-[13px]">{a.message}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <p className="mt-6 text-[12px] text-muted">All figures are simulated demo values computed from the synthetic Acme Global workspace. They are not measured Remote performance.</p>
    </div>
  );
}
