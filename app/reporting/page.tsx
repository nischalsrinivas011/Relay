"use client";

import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { COUNTRIES, type CountryCode } from "@/data/countries";
import type { EmployeeStatus } from "@/domain/employment";
import { useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn, fmtNum, fmtTime } from "@/lib/utils";
import { METRIC_LABEL, PRESETS, buildReport, parsePrompt, toCsv, type ReportConfig, type ReportDimension, type ReportMetric, type ReportPeriod } from "@/services/report-engine";
import { Button, Card, CardHeader, DemoBadge, Input, Label, PageHeader, Select, td, th } from "@/components/ui/primitives";
import { Bars, ChartFrame } from "@/components/metrics/charts";

export default function ReportingPage() {
  const { records } = useRecords();
  const run = useStore((s) => s.run);
  const mappings = useStore((s) => s.mappings);
  const log = useStore((s) => s.log);
  const [cfg, setCfg] = useState<ReportConfig>(PRESETS[1].config);
  const [title, setTitle] = useState(PRESETS[1].name);
  const [prompt, setPrompt] = useState("Payroll cost by country for Q3");
  const [exports, setExports] = useState<{ at: string; format: string; title: string; simulated: boolean }[]>([]);

  const statusOf = (id: string): EmployeeStatus => run?.nonReady[id]?.status ?? "ready";
  const report = useMemo(() => buildReport(cfg, { records, statusOf, mappings }), [cfg, records, run, mappings]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = report.rows.reduce((a, r) => a + r.value, 0);
  const set = <K extends keyof ReportConfig>(k: K, v: ReportConfig[K]) => {
    setCfg((c) => ({ ...c, [k]: v }));
    setTitle("Custom report");
  };
  const fmtVal = (v: number) => (report.unit === "USD" ? `$${fmtNum(v)}` : report.unit === "%" ? `${v.toFixed(1)}%` : fmtNum(v));

  const exportAs = (format: "CSV" | "XLSX" | "PDF") => {
    const entry = { at: new Date().toISOString(), format, title, simulated: format !== "CSV" };
    if (format === "CSV") {
      const blob = new Blob([toCsv(title, report.rows, report.unit)], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `relay-${title.toLowerCase().replace(/\s+/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setExports((e) => [entry, ...e].slice(0, 8));
    log("config", `${format} export of "${title}"${entry.simulated ? " (simulated; no file generated in Demo mode)" : ""}`);
  };

  return (
    <div className="enter">
      <PageHeader
        step="Stage 8 · Reporting"
        title="Outcomes the customer and the business can see"
        description="Every report reads the current demo state: the last validation run, mappings and the synthetic workforce."
        actions={<DemoBadge>Synthetic data</DemoBadge>}
      />

      <Card className="mb-5 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setCfg(parsePrompt(prompt, cfg));
            setTitle(prompt);
          }}
        >
          <div className="min-w-[260px] flex-1">
            <Label htmlFor="report-prompt" hint="parsed by simple rules; no model call">Ask for a report</Label>
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <Input id="report-prompt" className="pl-7" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
          </div>
          <Button type="submit" variant="primary">Build report</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button key={p.id} size="sm" variant={title === p.name ? "primary" : "secondary"} onClick={() => { setCfg(p.config); setTitle(p.name); }}>
              {p.name}
            </Button>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="p-4">
          <p className="label-caps mb-3">Report builder</p>
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="rb-metric">Metric</Label>
              <Select id="rb-metric" value={cfg.metric} onChange={(e) => set("metric", e.target.value as ReportMetric)}>
                {(Object.keys(METRIC_LABEL) as ReportMetric[]).map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-dim">Dimension</Label>
              <Select id="rb-dim" value={cfg.dimension} onChange={(e) => set("dimension", e.target.value as ReportDimension)} disabled={cfg.metric === "mapping_exceptions"}>
                <option value="country">Country</option>
                <option value="employment_type">Employment type</option>
                <option value="status">Status</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-country">Country</Label>
              <Select id="rb-country" value={cfg.country} onChange={(e) => set("country", e.target.value as CountryCode | "all")}>
                <option value="all">All countries</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-period">Period</Label>
              <Select id="rb-period" value={cfg.period} onChange={(e) => set("period", e.target.value as ReportPeriod)}>
                <option value="Q3-2026">Q3 2026</option>
                <option value="Q4-2026">Q4 2026</option>
                <option value="FY-2026">FY 2026</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-type">Employment type</Label>
              <Select id="rb-type" value={cfg.employmentType} onChange={(e) => set("employmentType", e.target.value as ReportConfig["employmentType"])}>
                <option value="all">All</option>
                <option value="FT">Full-time</option>
                <option value="PT">Part-time</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rb-status">Status</Label>
              <Select id="rb-status" value={cfg.status} onChange={(e) => set("status", e.target.value as ReportConfig["status"])}>
                <option value="all">All</option>
                <option value="ready">Ready</option>
                <option value="customer_action">Customer action</option>
                <option value="schema_error">Schema error</option>
                <option value="legal_entity_blocked">Legal entity blocked</option>
              </Select>
            </div>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <ChartFrame title={title} sub={`${METRIC_LABEL[cfg.metric]} · ${cfg.period.replace("-", " ")}${cfg.country !== "all" ? ` · ${cfg.country}` : ""}`} height={240}>
            <Bars data={report.rows.map((r) => ({ group: r.key, value: r.value }))} x="group" y="value" label={METRIC_LABEL[cfg.metric]} />
          </ChartFrame>
          <Card>
            <CardHeader
              title="Data"
              sub={report.unit === "%" ? "Percent of attempted records" : `Total ${fmtVal(total)}`}
              actions={
                <>
                  <Button size="sm" onClick={() => exportAs("CSV")}><DownloadSimple size={13} weight="bold" aria-hidden /> CSV</Button>
                  <Button size="sm" onClick={() => exportAs("XLSX")}>XLSX (simulated)</Button>
                  <Button size="sm" onClick={() => exportAs("PDF")}>PDF (simulated)</Button>
                </>
              }
            />
            <table className="w-full text-[13px]">
              <thead><tr><th className={th} scope="col">Group</th><th className={cn(th, "text-right")} scope="col">Value</th></tr></thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.key}><td className={td}>{r.key}</td><td className={cn(td, "tabular text-right")}>{fmtVal(r.value)}</td></tr>
                ))}
              </tbody>
            </table>
            {cfg.metric === "payroll_cost" && <p className="px-4 py-3 text-[12px] text-muted">Annual base salary × period share, converted at fixed demo FX (CAD 0.73, GBP 1.27, EUR 1.08). Not a payroll calculation.</p>}
          </Card>
          {exports.length > 0 && (
            <Card>
              <CardHeader title="Export history" />
              <ul className="divide-y divide-line text-[13px]">
                {exports.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3 px-4 py-2">
                    <span>{e.format} · {e.title}</span>
                    <span className="text-muted">{e.simulated ? "Simulated, no file generated" : "Downloaded"} · {fmtTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
