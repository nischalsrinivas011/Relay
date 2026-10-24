"use client";

import { useReadiness } from "@/lib/hooks";
import { Card } from "@/components/ui/primitives";
import { ProgressBar, ReadinessChip } from "@/components/ui/status";

export function ReadinessPanel() {
  const r = useReadiness();
  const pct = Math.round(r.score * 100);
  return (
    <Card className="p-4">
      <p className="label-caps">Integration readiness</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="tabular font-serif text-[44px] leading-none tracking-[-0.03em] text-ink-strong">{pct}%</span>
        <span className="text-[13px] text-muted">{r.label}</span>
      </p>
      <div className="mt-3">
        <ProgressBar value={r.score} tone={r.score >= 0.95 ? "ok" : r.score >= 0.6 ? "warn" : "err"} label="Readiness score" />
      </div>
      <ul className="mt-4 divide-y divide-line">
        {r.items.map((i) => (
          <li key={i.key} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{i.label}</p>
              <p className="text-[12px] text-muted">{i.detail}</p>
            </div>
            <ReadinessChip status={i.status} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-muted">Simulated scoring model. Weights: source 15, auth 15, mapping 20, entities 15, webhooks 10, payroll 10, constraints 15.</p>
    </Card>
  );
}
