"use client";

import { ArrowClockwise, CheckCircle, Circle, Pause, Play, Scales, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { SYNC_CHANGE_TYPES, SYNC_STAGES, type SyncChangeType, type SyncEvent } from "@/domain/integration";
import { useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn, fmtDuration, fmtNum, fmtTime } from "@/lib/utils";
import { Button, Card, CardHeader, Empty, Input, Label, PageHeader, Select, td, th } from "@/components/ui/primitives";
import { Chip, Metric, ProgressBar } from "@/components/ui/status";
import { OpsTabs } from "@/components/webhooks/ops-tabs";

function Pipeline({ e }: { e: SyncEvent }) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Pipeline stages">
      {SYNC_STAGES.map((s, i) => {
        const done = i < e.stage;
        const active = i === e.stage && e.status !== "completed";
        const failed = active && e.status === "failed";
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              title={s}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                done && "bg-ok-bg text-ok-fg",
                failed && "bg-err-bg text-err-fg",
                active && !failed && "bg-info-bg text-info-fg",
                !done && !active && "bg-neutral-bg text-neutral-fg",
              )}
            >
              {done ? <CheckCircle size={11} weight="fill" aria-hidden /> : failed ? <WarningCircle size={11} weight="fill" aria-hidden /> : <Circle size={11} weight={active ? "fill" : "regular"} className={cn(active && "pulse-dot")} aria-hidden />}
              <span className="hidden sm:inline">{s}</span>
              <span className="sr-only">{done ? "done" : failed ? "failed" : active ? "in progress" : "pending"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function SyncPage() {
  const snapshot = useStore((s) => s.snapshot);
  const startSnapshot = useStore((s) => s.startSnapshot);
  const syncEvents = useStore((s) => s.syncEvents);
  const createSyncEvent = useStore((s) => s.createSyncEvent);
  const replay = useStore((s) => s.replaySyncEvent);
  const advance = useStore((s) => s.advanceSync);
  const paused = useStore((s) => s.syncPaused);
  const setPaused = useStore((s) => s.setSyncPaused);
  const reconcile = useStore((s) => s.runReconciliation);
  const reconciledAt = useStore((s) => s.reconciledAt);
  const apiLog = useStore((s) => s.apiLog);
  const { records } = useRecords();
  const [type, setType] = useState<SyncChangeType>("employee.updated");
  const [who, setWho] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const queued = syncEvents.filter((e) => e.status === "queued" || e.status === "processing");
  const failed = syncEvents.filter((e) => e.status === "failed");
  const match = who.trim() ? records.find((r) => r.id.toLowerCase() === who.trim().toLowerCase() || (r.values["employee.full_name"] ?? "").toLowerCase() === who.trim().toLowerCase()) : undefined;

  return (
    <div className="enter">
      <PageHeader
        step="Stage 6 · Sync & Reliability"
        title="Keep AcmeHR and the destination in step"
        description="Snapshot plus event stream: one paged initial load, then each AcmeHR change flows through mapping, validation, the Remote adapter and a webhook confirmation."
        actions={
          <>
            <Button onClick={() => setPaused(!paused)}>{paused ? <><Play size={14} weight="fill" aria-hidden /> Resume sync</> : <><Pause size={14} weight="fill" aria-hidden /> Pause sync</>}</Button>
            <Button onClick={reconcile}><Scales size={14} weight="bold" aria-hidden /> Run full reconciliation</Button>
          </>
        }
      />
      <OpsTabs />

      {paused && <p className="mb-4 rounded-[8px] bg-warn-bg px-4 py-2 text-[13px] text-warn-fg">Sync is paused. Queued events wait until you resume or process one manually.</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
        <Card>
          <CardHeader
            title="Snapshot · initial workforce load"
            sub={snapshot.status === "done" && snapshot.finishedAt ? `Completed ${fmtTime(snapshot.finishedAt)}` : "Pages of 100 from AcmeHR, normalized and validated"}
            actions={<Button size="sm" variant={snapshot.status === "idle" ? "primary" : "secondary"} disabled={snapshot.status === "running"} onClick={startSnapshot}>{snapshot.status === "idle" ? "Run snapshot" : snapshot.status === "running" ? "Running…" : "Run again"}</Button>}
          />
          <div className="p-4">
            <ProgressBar value={snapshot.pagesFetched / snapshot.totalPages} label="Snapshot progress" tone={snapshot.status === "done" ? "ok" : "neutral"} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Records fetched" value={fmtNum(snapshot.fetched)} />
              <Metric label="Pages" value={`${snapshot.pagesFetched}/${snapshot.totalPages}`} />
              <Metric label="Normalized" value={fmtNum(snapshot.normalized)} tone={snapshot.normalized ? "ok" : undefined} />
              <Metric label="Rejected" value={fmtNum(snapshot.rejected)} tone={snapshot.rejected ? "warn" : undefined} />
            </div>
            <p className="mt-3 text-[12px] text-muted">Rejected records stay in AcmeHR and appear in the onboarding blockers. {reconciledAt && `Last full reconciliation ${fmtTime(reconciledAt)}.`}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Trigger a change in AcmeHR" sub="Synthetic change event; it is applied to the AcmeHR record immediately and then synced" />
          <form
            className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(ev) => {
              ev.preventDefault();
              createSyncEvent(type, match?.id);
              setWho("");
            }}
          >
            <div>
              <Label htmlFor="sync-type">Event type</Label>
              <Select id="sync-type" value={type} onChange={(e) => setType(e.target.value as SyncChangeType)}>
                {SYNC_CHANGE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="sync-who" hint="optional">Worker name or ID</Label>
              <Input id="sync-who" placeholder="e.g. Priya Sharma" value={who} onChange={(e) => setWho(e.target.value)} list="worker-names" />
              <datalist id="worker-names">
                {records.slice(0, 40).map((r) => <option key={r.id} value={r.values["employee.full_name"] ?? r.id} />)}
              </datalist>
              {who && !match && <p className="mt-1 text-[12px] text-warn-fg">No exact match; a ready worker will be picked.</p>}
            </div>
            <Button type="submit" variant="primary">Trigger change</Button>
          </form>
          <div className="grid grid-cols-3 gap-3 px-4 pb-4">
            <Metric label="In flight" value={queued.length} />
            <Metric label="Completed" value={syncEvents.filter((e) => e.status === "completed").length} tone="ok" />
            <Metric label="Failed" value={failed.length} tone={failed.length ? "err" : undefined} />
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Event stream" sub="Newest first. Select an event to see each stage's log." />
        {syncEvents.length === 0 ? (
          <Empty title="No change events yet">Trigger a change above to watch it move through the pipeline.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {syncEvents.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" className="min-w-0 text-left" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                    <p className="text-[13.5px] font-medium text-ink-strong">
                      {e.type} · {e.employeeName} <span className="font-mono text-[11.5px] font-normal text-muted">{e.employeeId}</span>
                    </p>
                    <p className="text-[12.5px] text-muted">{e.description} · {fmtTime(e.createdAt)}{e.completedAt && ` · ${fmtDuration(new Date(e.completedAt).getTime() - new Date(e.createdAt).getTime())} end to end`}</p>
                  </button>
                  <div className="flex items-center gap-2">
                    {e.status === "completed" && <Chip tone="ok" icon={CheckCircle}>Completed</Chip>}
                    {e.status === "failed" && (
                      <>
                        <Chip tone="err" icon={WarningCircle}>{e.error?.status} {e.error?.code}</Chip>
                        <Button size="sm" variant="primary" onClick={() => replay(e.id)}><ArrowClockwise size={13} weight="bold" aria-hidden /> Replay failed event</Button>
                      </>
                    )}
                    {(e.status === "queued" || e.status === "processing") && (
                      <>
                        <Chip tone="info">{paused ? "Queued (paused)" : "Processing"}</Chip>
                        {paused && <Button size="sm" onClick={() => void advance(e.id)}>Process queued event</Button>}
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <Pipeline e={e} />
                </div>
                {e.status === "failed" && e.error && (
                  <p className="mt-2 rounded-[6px] bg-err-bg px-3 py-1.5 text-[12.5px] text-err-fg">
                    {e.error.message}
                    {e.error.retryAfterMs ? ` Retry after ${fmtDuration(e.error.retryAfterMs)} (x-ratelimit-reset).` : ""} Attempt {e.attempts}.
                  </p>
                )}
                {open === e.id && (
                  <ol className="mt-3 space-y-1 border-l border-line pl-4 text-[12.5px]">
                    {e.log.map((l, i) => (
                      <li key={i}>
                        <span className="font-mono text-muted">{fmtTime(l.at)}</span> <span className={cn("font-medium", !l.ok && "text-err-fg")}>{l.stage}</span> · {l.message}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="API call log" sub="RemoteClient calls in Demo mode (simulated; no network requests). Most recent 12." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <thead>
              <tr>{["Time", "Method", "Path", "Status", "Latency"].map((h) => <th key={h} className={th} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {[...apiLog].reverse().slice(0, 12).map((l, i) => (
                <tr key={i}>
                  <td className={cn(td, "font-mono text-muted")}>{fmtTime(l.at)}</td>
                  <td className={cn(td, "font-mono")}>{l.method}</td>
                  <td className={cn(td, "font-mono")}>{l.path}</td>
                  <td className={td}><Chip tone={l.status >= 400 ? "err" : "ok"}>{l.status}</Chip></td>
                  <td className={cn(td, "tabular")}>{fmtDuration(l.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
