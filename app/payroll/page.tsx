"use client";

import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { COUNTRY_BY_CODE } from "@/data/countries";
import type { Incentive, IncentiveInput, IncentiveType } from "@/domain/payroll";
import { useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn, fmtMoney, fmtTime } from "@/lib/utils";
import { allPass, validateIncentive } from "@/services/payroll-engine";
import { Button, Card, CardHeader, Drawer, Empty, Input, KeyValue, Label, PageHeader, Select, td, th } from "@/components/ui/primitives";
import { Chip } from "@/components/ui/status";
import { BulkUpload } from "@/components/payroll/bulk-upload";

const PRIYA_DEFAULT: IncentiveInput = { employeeId: "AH-10001", type: "commission", amount: 3250, currency: "USD", effectivePeriod: "2026-11", source: "Sales Compensation System", note: "Q3 enterprise deals, paid in November payroll" };

const statusChip = (s: Incentive["status"]) =>
  s === "queued" ? <Chip tone="ok">In payroll queue</Chip> : s === "rejected" ? <Chip tone="err">Rejected</Chip> : s === "cancelled" ? <Chip tone="neutral">Cancelled</Chip> : <Chip tone="warn">Validated, not sent</Chip>;

export default function PayrollPage() {
  const { byId } = useRecords();
  const periods = useStore((s) => s.periods);
  const terminated = useStore((s) => s.terminated);
  const incentives = useStore((s) => s.incentives);
  const createIncentive = useStore((s) => s.createIncentive);
  const cancel = useStore((s) => s.cancelIncentive);
  const notify = useStore((s) => s.notify);
  const [form, setForm] = useState<IncentiveInput>(PRIYA_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ inc: Incentive; mode: "source" | "impact" } | null>(null);

  const checks = useMemo(() => validateIncentive(form, { recordsById: byId, periods, terminated: new Set(Object.keys(terminated)), existing: incentives }), [form, byId, periods, terminated, incentives]);
  const worker = byId.get(form.employeeId.trim());
  const queue = incentives.filter((i) => i.status === "queued");
  const set = <K extends keyof IncentiveInput>(k: K, v: IncentiveInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    const res = await createIncentive(form);
    setBusy(false);
    if (res.status === "queued") notify(`${res.employeeName}'s ${form.type} is in the ${form.effectivePeriod} payroll queue`);
    else if (res.status === "rejected") notify("Incentive failed validation and was not queued", "error");
  };

  return (
    <div className="enter">
      <PageHeader
        step="Stage 7 · Payroll & incentives"
        title="Commission to payroll queue"
        description="Commissions arrive from the sales compensation system, are validated against the worker's employment, currency and payroll period, and only then become incentives. No payroll or tax is calculated here."
      />
      <div className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader title="Create incentive" sub="Prefilled with a sales commission from the Sales Compensation System" />
          <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div>
              <Label htmlFor="inc-emp" hint={worker ? `${worker.values["employee.full_name"]} · ${COUNTRY_BY_CODE[worker.country].name}` : undefined}>Employee ID</Label>
              <Input id="inc-emp" className="font-mono" value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="inc-type">Type</Label>
              <Select id="inc-type" value={form.type} onChange={(e) => set("type", e.target.value as IncentiveType)}>
                <option value="commission">Sales commission</option>
                <option value="bonus">Bonus</option>
                <option value="spot_award">Spot award</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="inc-amt">Amount</Label>
              <Input id="inc-amt" type="number" min={0} step="0.01" value={Number.isFinite(form.amount) ? form.amount : ""} onChange={(e) => set("amount", e.target.valueAsNumber)} />
            </div>
            <div>
              <Label htmlFor="inc-cur">Currency</Label>
              <Select id="inc-cur" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                {["USD", "CAD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="inc-period">Effective payroll</Label>
              <Select id="inc-period" value={form.effectivePeriod} onChange={(e) => set("effectivePeriod", e.target.value)}>
                {periods.map((p) => <option key={p.period} value={p.period}>{p.label}{p.status === "closed" ? " (closed)" : ""}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="inc-src">Source</Label>
              <Input id="inc-src" value={form.source} onChange={(e) => set("source", e.target.value)} />
            </div>
            <ul className="sm:col-span-2 divide-y divide-line rounded-[8px] border border-line" aria-label="Validation checks">
              {checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2 px-3 py-1.5 text-[12.5px]">
                  {c.ok ? <CheckCircle size={15} weight="fill" className="mt-px text-ok-fg" aria-label="pass" /> : <XCircle size={15} weight="fill" className="mt-px text-err-fg" aria-label="fail" />}
                  <span className="w-40 shrink-0 font-medium">{c.name}</span>
                  <span className="text-muted">{c.detail}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" disabled={busy}>{busy ? "Creating…" : "Create incentive"}</Button>
              <Button type="button" onClick={() => setForm(PRIYA_DEFAULT)}>Reset to Priya’s commission</Button>
              <span className={cn("text-[12.5px]", allPass(checks) ? "text-ok-fg" : "text-err-fg")}>{allPass(checks) ? "All checks pass" : "Will be rejected: fix the failing checks"}</span>
            </div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Payroll periods" sub="Simulated payroll calendar" />
          <ul className="divide-y divide-line">
            {periods.map((p) => (
              <li key={p.period} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span>{p.label} <span className="text-muted">· cutoff {p.cutoff}</span></span>
                <Chip tone={p.status === "open" ? "ok" : "neutral"}>{p.status === "open" ? "Open" : "Closed"}</Chip>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3">
            <p className="label-caps">Payroll queue</p>
            <p className="tabular mt-1 text-[24px] font-semibold text-ink-strong">{queue.length} <span className="text-[13px] font-normal text-muted">incentives</span></p>
          </div>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader title="Incentives" sub="Every attempt is kept for audit; only validated incentives enter the payroll queue" />
        {incentives.length === 0 ? (
          <Empty title="No incentives yet">Create Priya’s commission above or load the bulk file below.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr>{["Employee", "Type", "Amount", "Payroll", "Source", "Status", ""].map((h, i) => <th key={i} className={th} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {incentives.slice(0, 40).map((i) => (
                  <tr key={i.id}>
                    <td className={td}><span className="font-medium">{i.employeeName}</span><span className="block font-mono text-[11.5px] text-muted">{i.employeeId || "no ID"}</span></td>
                    <td className={td}>{i.type.replace("_", " ")}</td>
                    <td className={cn(td, "tabular")}>{Number.isFinite(i.amount) ? fmtMoney(i.amount, /^[A-Z]{3}$/.test(i.currency) ? i.currency : "USD") : "—"}{!["USD", "CAD", "GBP", "EUR"].includes(i.currency) && <span className="ml-1 text-err-fg">{i.currency}</span>}</td>
                    <td className={td}>{periods.find((p) => p.period === i.effectivePeriod)?.label ?? i.effectivePeriod}</td>
                    <td className={cn(td, "text-muted")}>{i.source}</td>
                    <td className={td}>{statusChip(i.status)}</td>
                    <td className={cn(td, "text-right")}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setView({ inc: i, mode: "source" })}>View source data</Button>
                        {i.status === "queued" && <Button size="sm" variant="ghost" onClick={() => setView({ inc: i, mode: "impact" })}>View payroll impact</Button>}
                        {i.status === "rejected" && <Button size="sm" onClick={() => setForm({ employeeId: i.employeeId, type: i.type, amount: i.amount, currency: i.currency, effectivePeriod: i.effectivePeriod, source: i.source })}>Edit</Button>}
                        {i.status === "validated" && <Button size="sm" variant="primary" onClick={() => { cancel(i.id); void createIncentive({ employeeId: i.employeeId, type: i.type, amount: i.amount, currency: i.currency, effectivePeriod: i.effectivePeriod, source: i.source }); }}>Retry send</Button>}
                        {i.status === "queued" && <Button size="sm" variant="ghost" onClick={() => cancel(i.id)}>Cancel</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BulkUpload />

      <Drawer open={!!view} onOpenChange={(o) => !o && setView(null)} title={view ? (view.mode === "source" ? "Source data" : "Payroll impact") : ""} description={view ? `${view.inc.employeeName} · ${view.inc.id}` : undefined}>
        {view && view.mode === "source" && (
          <div className="flex flex-col gap-4 text-[13px]">
            <KeyValue items={[["Source system", view.inc.source], ["Received", fmtTime(view.inc.createdAt)], ["Employee ID", view.inc.employeeId || "(missing)"], ["Type", view.inc.type], ["Amount", `${view.inc.amount} ${view.inc.currency}`], ["Sent as", `${view.inc.amountMinor.toLocaleString()} minor units (x100)`], ["Period", view.inc.effectivePeriod]]} />
            <ul className="divide-y divide-line rounded-[8px] border border-line">
              {view.inc.checks.map((c) => (
                <li key={c.name} className="flex gap-2 px-3 py-1.5 text-[12.5px]">
                  {c.ok ? <CheckCircle size={15} weight="fill" className="text-ok-fg" aria-label="pass" /> : <XCircle size={15} weight="fill" className="text-err-fg" aria-label="fail" />}
                  <span className="font-medium">{c.name}</span> <span className="text-muted">{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {view && view.mode === "impact" && <Impact inc={view.inc} />}
      </Drawer>
    </div>
  );
}

function Impact({ inc }: { inc: Incentive }) {
  const { byId } = useRecords();
  const rec = byId.get(inc.employeeId);
  if (!rec) return null;
  const annual = Number(rec.values["comp.base_salary"]);
  const monthly = annual / 12;
  const cur = inc.currency;
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <KeyValue
        items={[
          ["Payroll", inc.effectivePeriod],
          ["Base monthly gross", fmtMoney(monthly, cur)],
          [`${inc.type.replace("_", " ")}`, `+ ${fmtMoney(inc.amount, cur)}`],
          ["Gross for the period", fmtMoney(monthly + inc.amount, cur)],
        ]}
      />
      <p className="rounded-[8px] bg-neutral-bg px-3 py-2 text-[12.5px] text-neutral-fg">Illustrative gross only. Relay does not calculate tax, deductions or net pay; the payroll provider does.</p>
    </div>
  );
}
