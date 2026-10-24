"use client";

import { ArrowClockwise, CheckCircle, MinusCircle, XCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { SCENARIO_LABEL, WEBHOOK_EVENT_TYPES, type DeliveryResult, type WebhookDelivery, type WebhookEventType } from "@/domain/webhook";
import { useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn, fmtDuration, fmtPct, fmtTime } from "@/lib/utils";
import { RETRY_POLICY, isRetryable, retryDelayMs } from "@/services/webhook-engine";
import { Button, Card, CardHeader, Drawer, KeyValue, Mono, PageHeader, Select, td, th } from "@/components/ui/primitives";
import { Chip, DeliveryChip, Metric } from "@/components/ui/status";
import { OpsTabs } from "@/components/webhooks/ops-tabs";
import { EmployeeDrawer } from "@/components/onboarding/employee-drawer";

const pretty = (raw: string) => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export default function WebhooksPage() {
  const deliveries = useStore((s) => s.deliveries);
  const subscriptions = useStore((s) => s.subscriptions);
  const toggle = useStore((s) => s.toggleSubscription);
  const replay = useStore((s) => s.replayDelivery);
  const replayAll = useStore((s) => s.replayAllRetryable);
  const close = useStore((s) => s.closeDelivery);
  const deliver = useStore((s) => s.deliverWebhook);
  const remoteVersions = useStore((s) => s.remoteVersions);
  const notify = useStore((s) => s.notify);
  const { records, byId } = useRecords();
  const [filter, setFilter] = useState<DeliveryResult | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [simType, setSimType] = useState<WebhookEventType>("employment.onboarding.updated");

  const list = useMemo(() => [...deliveries].reverse().filter((d) => filter === "all" || d.result === filter), [deliveries, filter]);
  const selected = deliveries.find((d) => d.deliveryId === selectedId) ?? null;
  const nonDup = deliveries.filter((d) => d.result !== "duplicate_ignored");
  const processed = deliveries.filter((d) => d.result === "processed").length;
  const avg = deliveries.length ? deliveries.reduce((a, d) => a + (d.attempts.at(-1)?.latencyMs ?? 0), 0) / deliveries.length : 0;
  const retryable = deliveries.filter(isRetryable).length;

  return (
    <div className="enter">
      <PageHeader
        step="Stage 6 · Sync & Reliability"
        title="Webhook event center"
        description="Every delivery is verified, deduplicated on event_id and processed once. Failures stay visible until they are replayed, ignored or resolved."
        actions={
          <Button variant="primary" disabled={!retryable} onClick={() => { const n = replayAll(); notify(`Replayed ${n} event(s)`); }}>
            <ArrowClockwise size={14} weight="bold" aria-hidden /> Replay retry queue ({retryable})
          </Button>
        }
      />
      <OpsTabs />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Success rate" value={fmtPct(nonDup.length ? processed / nonDup.length : 1)} sub="Excludes duplicates" />
        <Metric label="Received" value={deliveries.length} />
        <Metric label="Processed" value={processed} tone="ok" />
        <Metric label="Duplicates ignored" value={deliveries.filter((d) => d.result === "duplicate_ignored").length} />
        <Metric label="Retried" value={deliveries.filter((d) => d.attempts.length > 1).length} />
        <Metric label="Failed" value={deliveries.filter((d) => d.result === "failed" || d.result === "rejected").length} tone="err" />
        <Metric label="Avg processing" value={fmtDuration(avg)} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Subscriptions" sub="Event types this integration receives. Feeds readiness." />
          <ul className="divide-y divide-line">
            {subscriptions.map((s) => (
              <li key={s.eventType} className="flex items-center justify-between gap-3 px-4 py-2">
                <Mono>{s.eventType}</Mono>
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={s.enabled} onChange={() => toggle(s.eventType)} aria-label={`Subscribe to ${s.eventType}`} />
                  {s.enabled ? "Enabled" : "Off"}
                </label>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Simulate a delivery" sub="Sends a correctly signed event for a linked worker" />
          <div className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="sim-type" className="mb-1 block text-[12.5px] font-medium">Event type</label>
              <Select id="sim-type" value={simType} onChange={(e) => setSimType(e.target.value as WebhookEventType)}>
                {WEBHOOK_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <Button variant="primary" onClick={() => { const d = deliver({ type: simType, employeeId: simType === "company.updated" ? null : records[(deliveries.length * 53) % records.length].id }); setSelectedId(d.deliveryId); }}>
              Deliver event
            </Button>
          </div>
          <p className="px-4 pb-4 text-[12.5px] text-muted">
            Retry policy: exponential from {RETRY_POLICY.baseDelayMs / 1000} s, factor {RETRY_POLICY.factor}, max {RETRY_POLICY.maxAttempts} attempts. Failure scenarios (invalid signature, duplicate, unknown employee and more) are in Demo controls.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Deliveries"
          sub={`${list.length} shown, newest first`}
          actions={
            <Select aria-label="Filter by result" className="h-8 w-48" value={filter} onChange={(e) => setFilter(e.target.value as DeliveryResult | "all")}>
              <option value="all">All results</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
              <option value="rejected">Rejected</option>
              <option value="duplicate_ignored">Duplicate ignored</option>
              <option value="ignored">Ignored</option>
              <option value="resolved">Resolved</option>
            </Select>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <caption className="sr-only">Webhook deliveries</caption>
            <thead>
              <tr>{["Event ID", "Type", "Employment", "Timestamp", "Signature", "Attempt", "Result", "Latency"].map((h) => <th key={h} className={th} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.deliveryId} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelectedId(d.deliveryId)}>
                  <td className={td}>
                    <button type="button" className="font-mono hover:underline" onClick={(e) => { e.stopPropagation(); setSelectedId(d.deliveryId); }}>{d.eventId}</button>
                    {d.scenario && d.scenario !== "duplicate" && <span className="block text-[11px] text-muted">{SCENARIO_LABEL[d.scenario]}</span>}
                  </td>
                  <td className={cn(td, "font-mono")}>{d.type}</td>
                  <td className={cn(td, "font-mono text-muted")}>{d.employmentId ?? "company"}</td>
                  <td className={cn(td, "font-mono text-muted")}>{fmtTime(d.timestamp)}</td>
                  <td className={td}>{d.signatureStatus === "valid" ? <Chip tone="ok" icon={CheckCircle}>Valid</Chip> : <Chip tone="err" icon={XCircle}>Invalid</Chip>}</td>
                  <td className={cn(td, "tabular")}>{d.attempts.length}</td>
                  <td className={td}><DeliveryChip result={d.result} /></td>
                  <td className={cn(td, "tabular")}>{fmtDuration(d.attempts.at(-1)?.latencyMs ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer
        open={!!selected}
        onOpenChange={(o) => !o && setSelectedId(null)}
        title={selected ? `${selected.type}` : ""}
        description={selected ? `${selected.eventId} · delivery ${selected.deliveryId}` : undefined}
        width="max-w-2xl"
        footer={
          selected && (
            <>
              {selected.employeeId && byId.get(selected.employeeId) && <Button onClick={() => setEmployeeId(selected.employeeId)}>Open related employee</Button>}
              {(selected.result === "failed" || selected.result === "rejected") && (
                <>
                  <Button onClick={() => close(selected.deliveryId, "ignored")}><MinusCircle size={14} weight="bold" aria-hidden /> Ignore</Button>
                  <Button onClick={() => close(selected.deliveryId, "resolved")}>Resolve</Button>
                </>
              )}
              <Button variant="primary" onClick={() => replay(selected.deliveryId)}><ArrowClockwise size={14} weight="bold" aria-hidden /> Replay</Button>
            </>
          )
        }
      >
        {selected && <DeliveryDetail d={selected} version={selected.employeeId ? remoteVersions[selected.employeeId] ?? 1 : null} />}
      </Drawer>
      {employeeId && byId.get(employeeId) && <EmployeeDrawer record={byId.get(employeeId)!} onClose={() => setEmployeeId(null)} />}
    </div>
  );
}

function DeliveryDetail({ d, version }: { d: WebhookDelivery; version: number | null }) {
  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryChip result={d.result} />
        {d.scenario && <Chip tone="neutral">Scenario: {SCENARIO_LABEL[d.scenario]}</Chip>}
        {isRetryable(d) && <Chip tone="warn">In retry queue · policy backoff {fmtDuration(retryDelayMs(d.attempts.length))} (replay manually in the demo)</Chip>}
      </div>
      {d.errorReason && <p className="rounded-[8px] bg-err-bg px-3 py-2 text-err-fg">{d.errorReason}</p>}
      <KeyValue
        items={[
          ["Employment", d.employmentId ?? "Company-level"],
          ["AcmeHR worker", d.employeeId ?? "Not linked"],
          ["Destination version", version ?? "—"],
          ["Signature", d.signatureStatus === "valid" ? "Valid" : "Invalid (rejected)"],
          ["Received via", d.source === "sync" ? "Sync pipeline confirmation" : d.source === "seed" ? "Seeded history" : "Simulated delivery"],
        ]}
      />
      <section>
        <p className="label-caps mb-1.5">Processing steps</p>
        <ol className="divide-y divide-line rounded-[8px] border border-line">
          {d.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 px-3 py-2">
              <span className={cn("mt-0.5", s.status === "ok" ? "text-ok-fg" : s.status === "failed" ? "text-err-fg" : "text-muted")}>
                {s.status === "ok" ? <CheckCircle size={14} weight="fill" aria-label="ok" /> : s.status === "failed" ? <XCircle size={14} weight="fill" aria-label="failed" /> : <MinusCircle size={14} aria-label="skipped" />}
              </span>
              <div className="min-w-0">
                <p className="font-medium">{s.name}</p>
                <p className="text-[12.5px] text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <p className="label-caps mb-1.5">Retry history</p>
        <ol className="space-y-1 text-[12.5px]">
          {d.attempts.map((a, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="tabular w-16 text-muted">Attempt {i + 1}</span>
              <span className="font-mono text-muted">{fmtTime(a.at)}</span>
              <span className={cn(a.outcome === "success" ? "text-ok-fg" : a.outcome === "duplicate" ? "text-muted" : "text-err-fg")}>{a.outcome}{a.error ? ` · ${a.error}` : ""}</span>
              <span className="tabular text-muted">{fmtDuration(a.latencyMs)}</span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <p className="label-caps mb-1.5">Raw payload</p>
        <pre className="max-h-56 overflow-auto rounded-[8px] border border-line bg-surface-2 p-3 font-mono text-[11.5px]">{pretty(d.rawBody)}</pre>
        <p className="mt-1 font-mono text-[11px] text-muted break-all">X-Remote-Signature (simulated): {d.signature.slice(0, 24)}…</p>
      </section>
      {d.normalized && (
        <section>
          <p className="label-caps mb-1.5">Normalized payload</p>
          <pre className="max-h-48 overflow-auto rounded-[8px] border border-line bg-surface-2 p-3 font-mono text-[11.5px]">{JSON.stringify(d.normalized, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
