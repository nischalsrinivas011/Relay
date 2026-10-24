"use client";

import { UploadSimple } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { BulkRow } from "@/domain/payroll";
import { useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { allPass, generateBulkCsv, parseCsv, rowToInput, validateIncentive } from "@/services/payroll-engine";
import { Button, Card, CardHeader, Input, Textarea, td, th } from "@/components/ui/primitives";
import { Chip, Metric } from "@/components/ui/status";

export function BulkUpload() {
  const { records, byId } = useRecords();
  const periods = useStore((s) => s.periods);
  const terminated = useStore((s) => s.terminated);
  const createIncentive = useStore((s) => s.createIncentive);
  const log = useStore((s) => s.log);
  const notify = useStore((s) => s.notify);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(BulkRow & { submitted?: boolean })[]>([]);
  const [busy, setBusy] = useState(false);

  const incentives = useStore((s) => s.incentives);
  // Submitted rows are already in the queue; only re-check the rest.
  const checked = useMemo(
    () =>
      rows
        .filter((r) => !r.submitted)
        .map((r) => ({ row: r, checks: validateIncentive(rowToInput(r), { recordsById: byId, periods, terminated: new Set(Object.keys(terminated)), existing: incentives }) })),
    [rows, byId, periods, terminated, incentives],
  );
  const pending = checked.filter((c) => allPass(c.checks));
  const valid = { length: pending.length + rows.filter((r) => r.submitted).length };
  const invalid = checked.filter((c) => !allPass(c.checks));
  const missingId = invalid.filter((c) => !c.row.employeeId).length;
  const badCurrency = invalid.filter((c) => c.row.employeeId && c.checks.find((x) => x.name === "Currency matches" && !x.ok)).length;

  const edit = (row: number, patch: Partial<BulkRow>) => setRows((rs) => rs.map((r) => (r.row === row ? { ...r, ...patch } : r)));

  const submit = async () => {
    setBusy(true);
    let n = 0;
    for (const c of pending) {
      const res = await createIncentive(rowToInput(c.row), { bulk: true });
      if (res.status === "queued") {
        n++;
        setRows((rs) => rs.map((r) => (r.row === c.row.row ? { ...r, submitted: true } : r)));
      }
    }
    setBusy(false);
    log("payroll", `Bulk upload: ${n} incentive(s) sent to the payroll queue`);
    notify(`${n} incentive(s) queued for payroll`);
  };

  return (
    <Card>
      <CardHeader
        title="Bulk incentives"
        sub="CSV with employee_id, type, amount, currency, period. Invalid rows never reach the payroll queue; fix them inline and retry."
        actions={
          <>
            <Button size="sm" onClick={() => setText(generateBulkCsv(records))}>Load synthetic Q4 commission file</Button>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface px-2.5 text-[12.5px] font-medium hover:bg-surface-2">
              <UploadSimple size={13} weight="bold" aria-hidden /> Upload CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
            </label>
          </>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        <Textarea aria-label="CSV contents" rows={5} className="font-mono text-[12px]" placeholder="employee_id,type,amount,currency,period" value={text} onChange={(e) => setText(e.target.value)} />
        <div>
          <Button variant="primary" disabled={!text.trim()} onClick={() => setRows(parseCsv(text))}>Validate file</Button>
        </div>
        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric label="Records" value={rows.length} />
              <Metric label="Valid" value={valid.length} tone="ok" />
              <Metric label="Missing employee ID" value={missingId} tone={missingId ? "err" : undefined} />
              <Metric label="Invalid currency" value={badCurrency} tone={badCurrency ? "err" : undefined} />
              <Metric label="Queued" value={rows.filter((r) => r.submitted).length} />
            </div>
            {invalid.length > 0 && (
              <div className="overflow-x-auto rounded-[8px] border border-line">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <caption className="px-3 py-2 text-left text-[12.5px] font-medium">Rows needing correction</caption>
                  <thead>
                    <tr>{["Row", "Employee ID", "Amount", "Currency", "Problem"].map((h) => <th key={h} className={th} scope="col">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {invalid.map(({ row, checks }) => (
                      <tr key={row.row}>
                        <td className={cn(td, "tabular")}>{row.row}</td>
                        <td className={td}><Input aria-label={`Employee ID for row ${row.row}`} className="h-7 w-32 font-mono text-[12px]" value={row.employeeId} placeholder="AH-…" onChange={(e) => edit(row.row, { employeeId: e.target.value })} /></td>
                        <td className={cn(td, "tabular")}>{row.amount}</td>
                        <td className={td}><Input aria-label={`Currency for row ${row.row}`} className="h-7 w-20 font-mono text-[12px]" value={row.currency} onChange={(e) => edit(row.row, { currency: e.target.value.toUpperCase() })} /></td>
                        <td className={cn(td, "text-err-fg")}>{checks.filter((c) => !c.ok).map((c) => c.detail).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!pending.length || busy} onClick={submit}>
                {busy ? "Sending…" : rows.some((r) => r.submitted) ? `Retry: send ${pending.length} corrected row(s)` : `Send ${pending.length} valid row(s) to payroll`}
              </Button>
              {invalid.length > 0 && <Chip tone="warn">{invalid.length} row(s) held back</Chip>}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
