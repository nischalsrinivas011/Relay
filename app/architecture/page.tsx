"use client";

import { ArrowDown, ArrowRight } from "@phosphor-icons/react";
import { Fragment, useMemo, useState } from "react";
import { FORWARD, METADATA, MODES, REVERSE, type ArchMode, type ArchNode } from "@/components/architecture/nodes";
import { useStore } from "@/lib/store";
import { cn, fmtNum } from "@/lib/utils";
import { Card, CardHeader, Drawer, KeyValue, PageHeader, Segmented } from "@/components/ui/primitives";
import { isRetryable } from "@/services/webhook-engine";

function NodeButton({ node, lit, onClick }: { node: ArchNode; lit: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={lit}
      className={cn(
        "min-w-0 flex-1 rounded-[8px] border px-3 py-2.5 text-left transition-all hover:-translate-y-px",
        lit ? "border-ink-strong bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.05)]" : "border-dashed border-line-strong bg-surface-2 opacity-55",
        node.kind === "system" && "bg-neutral-bg",
      )}
    >
      <span className="label-caps block !text-[9.5px]">{node.kind === "system" ? "System" : node.kind === "control" ? "Control" : "Component"}</span>
      <span className="block text-[13px] font-medium leading-snug text-ink-strong">{node.label}</span>
    </button>
  );
}

function Lane({ title, nodes, lit, onSelect }: { title: string; nodes: ArchNode[]; lit: Set<string>; onSelect: (n: ArchNode) => void }) {
  return (
    <div>
      <p className="label-caps mb-2">{title}</p>
      <div className="flex flex-col items-stretch gap-1.5 md:flex-row md:items-center">
        {nodes.map((n, i) => (
          <Fragment key={n.id}>
            <NodeButton node={n} lit={lit.has(n.id)} onClick={() => onSelect(n)} />
            {i < nodes.length - 1 && (
              <span className={cn("flex shrink-0 justify-center text-muted", lit.has(n.id) && lit.has(nodes[i + 1].id) && "text-ink-strong")} aria-hidden>
                <ArrowRight size={14} weight="bold" className="hidden md:block" />
                <ArrowDown size={14} weight="bold" className="md:hidden" />
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function ArchitecturePage() {
  const [mode, setMode] = useState<ArchMode>("realtime");
  const [selected, setSelected] = useState<ArchNode | null>(null);
  const run = useStore((s) => s.run);
  const deliveries = useStore((s) => s.deliveries);
  const apiLog = useStore((s) => s.apiLog);
  const snapshot = useStore((s) => s.snapshot);
  const syncEvents = useStore((s) => s.syncEvents);
  const m = MODES.find((x) => x.key === mode)!;
  const lit = useMemo(() => new Set(m.nodes), [m]);

  const live: Record<string, string> = {
    source: snapshot.status === "idle" ? "Snapshot not run yet" : `Snapshot ${snapshot.pagesFetched}/${snapshot.totalPages} pages, ${fmtNum(snapshot.fetched)} records`,
    mapping: `${syncEvents.length} change event(s) transformed this session`,
    validation: run ? `Last run: ${fmtNum(run.summary.ready)} ready, ${run.summary.schema_error} schema errors` : "Not run",
    remote_adapter: `${apiLog.length} API calls logged, ${apiLog.filter((l) => l.status >= 400).length} errors`,
    signature: `${deliveries.filter((d) => d.signatureStatus === "invalid").length} delivery rejected for signature`,
    dedupe: `${deliveries.filter((d) => d.result === "duplicate_ignored").length} duplicates ignored`,
    queue: `${deliveries.filter(isRetryable).length} event(s) waiting for retry`,
    processor: `${deliveries.filter((d) => d.result === "processed").length} processed, ${deliveries.filter((d) => d.result === "failed").length} failed`,
  };

  return (
    <div className="enter">
      <PageHeader step="Stage 3 · Architecture" title="How data moves between AcmeHR and the destination" description="Pick a flow to light up its path. Select any node to see what it owns, how it fails, and its live state in this demo." />
      <Card className="mb-5 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented label="Architecture mode" value={mode} onChange={setMode} options={MODES.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
        <p className="mb-5 max-w-3xl text-[13px] text-muted">{m.description}</p>
        <div className="flex flex-col gap-6">
          <Lane title="Forward flow · HRIS to destination" nodes={FORWARD} lit={lit} onSelect={setSelected} />
          <Lane title="Reverse flow · events back to HRIS" nodes={REVERSE} lit={lit} onSelect={setSelected} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Architecture decisions" sub="Defaults that carry into the reusable pattern" />
        <div className="p-4">
          <KeyValue items={METADATA} />
        </div>
      </Card>

      <Drawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title={selected?.label ?? ""} description={selected ? `${selected.lane === "forward" ? "Forward" : "Reverse"} flow · ${selected.kind}` : undefined}>
        {selected && (
          <div className="flex flex-col gap-5 text-[13px]">
            <section>
              <p className="label-caps mb-1.5">Responsibilities</p>
              <ul className="list-disc space-y-1 pl-5">{selected.owns.map((o) => <li key={o}>{o}</li>)}</ul>
            </section>
            <section>
              <p className="label-caps mb-1.5">Failure modes</p>
              <ul className="list-disc space-y-1 pl-5">{selected.failureModes.map((o) => <li key={o}>{o}</li>)}</ul>
            </section>
            {live[selected.id] && (
              <section className="rounded-[8px] border border-line bg-surface-2 p-3">
                <p className="label-caps mb-1">Live in this demo</p>
                <p>{live[selected.id]}</p>
              </section>
            )}
            <p className="text-[12px] text-muted">Shown in modes: {MODES.filter((x) => x.nodes.includes(selected.id)).map((x) => x.label).join(", ") || "none"}</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
