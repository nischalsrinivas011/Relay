"use client";

import Link from "next/link";
import { useReliability } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { fmtDuration, fmtPct } from "@/lib/utils";
import { Card, CardHeader, DemoBadge, PageHeader } from "@/components/ui/primitives";
import { Metric } from "@/components/ui/status";
import { AreaTrend, Bars, ChartFrame, LineTrend } from "@/components/metrics/charts";
import { OpsTabs } from "@/components/webhooks/ops-tabs";

export default function ReliabilityPage() {
  const rel = useReliability();
  const run = useStore((s) => s.run);
  const setCountry = useStore((s) => s.setMappingCountry);
  if (!rel || !run) return null;
  const m = rel.metrics;
  const tone = (v: number, good: number) => (v >= good ? "ok" : "err") as "ok" | "err";

  return (
    <div className="enter">
      <PageHeader
        step="Stage 6 · Sync & Reliability"
        title="Reliability center"
        description="Integration quality as numbers. Metrics recompute from the last validation run, webhook deliveries, sync events and the API call log."
        actions={<DemoBadge>Simulated metrics</DemoBadge>}
      />
      <OpsTabs />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Sync success" value={fmtPct(m.syncSuccess)} sub="SLA target 99.5%" tone={tone(m.syncSuccess, 0.995)} />
        <Metric label="P95 sync latency" value={fmtDuration(m.p95Latency)} sub="Captured → reconciled" />
        <Metric label="Webhook success" value={fmtPct(m.webhookSuccess)} sub="Excludes duplicates" tone={tone(m.webhookSuccess, 0.95)} />
        <Metric label="Schema failure rate" value={fmtPct(m.schemaFailureRate, 2)} sub="Of all workers" />
        <Metric label="Retry success" value={m.retrySuccess === null ? "—" : fmtPct(m.retrySuccess)} sub="Retried events that recovered" />
        <Metric label="Mean recovery time" value={m.mttrMs === null ? "—" : fmtDuration(m.mttrMs)} sub="First failure → success" />
        <Metric label="Manual intervention" value={fmtPct(m.manualRate)} sub="Deliveries needing an operator" />
        <Metric label="Auth failures" value={m.authFailures} sub="401 and 403 responses" tone={m.authFailures ? "err" : undefined} />
        <Metric label="API error rate" value={fmtPct(m.apiErrorRate)} sub="Of logged API calls" />
        <Metric label="Duplicates ignored" value={m.duplicates} sub="Dedupe on event_id" />
      </div>

      {rel.causes.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Root-cause drilldown" sub="Countries below 100% sync success, with the dominant failing field" />
          <ul className="divide-y divide-line">
            {rel.causes.map((c) => (
              <li key={c.country} className="grid gap-2 px-4 py-3 md:grid-cols-[200px_1fr_auto] md:items-start">
                <div>
                  <p className="text-[13.5px] font-semibold text-ink-strong">{c.name}</p>
                  <p className="tabular text-[12.5px] text-err-fg">Success {fmtPct(c.success)}</p>
                </div>
                <div className="text-[13px]">
                  <p>
                    <span className="text-muted">Cause:</span> {c.topCount} of {c.failing} failing records fail on <code className="font-mono text-[12px]">{c.topField}</code> ({Math.round(c.share * 100)}% of {c.name} failures).
                  </p>
                  <p className="mt-0.5"><span className="text-muted">Recommendation:</span> {c.recommendation}</p>
                </div>
                <div className="flex gap-3 text-[12.5px] font-medium">
                  <Link className="text-info-fg hover:underline" href="/onboarding">Open blockers</Link>
                  <Link className="text-info-fg hover:underline" href="/mapping" onClick={() => setCountry(c.country)}>Open mapping</Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartFrame title="24-hour event volume" sub="Webhook and sync events per hour (seeded baseline + live events)">
          <AreaTrend data={m.hourly} x="hour" y="events" label="Events" />
        </ChartFrame>
        <ChartFrame title="Sync reliability by country" sub="Ready ÷ attempted records, last validation run. Red is below the 99.5% SLA.">
          <Bars data={m.byCountry.map((c) => ({ country: c.country, success: Number((c.success * 100).toFixed(1)) }))} x="country" y="success" label="Success %" highlightBelow={99.5} domain={[0, 100]} unit="%" />
        </ChartFrame>
        <ChartFrame title="Failures by category" sub="Open failures across validation, API and webhooks" height={230}>
          <Bars data={Object.entries(m.categories).map(([k, v]) => ({ category: k, count: v }))} x="category" y="count" label="Failures" horizontal />
        </ChartFrame>
        <ChartFrame title="P95 latency trend" sub="Milliseconds, last 24 hours; final point is live" height={230}>
          <LineTrend data={m.latencyTrend} x="hour" y="p95" label="P95 ms" unit="ms" />
        </ChartFrame>
        <ChartFrame title="Manual intervention trend" sub="Share of deliveries needing an operator, by day; today is live">
          <LineTrend data={m.manualTrend} x="day" y="pct" label="Manual %" unit="%" color="c3" />
        </ChartFrame>
      </div>
      <p className="mt-6 text-[12px] text-muted">Demo metrics only. Baselines are seeded synthetic history; they do not describe Remote’s real performance.</p>
    </div>
  );
}
