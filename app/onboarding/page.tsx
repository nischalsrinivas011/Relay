"use client";

import { Buildings, MagnifyingGlass, Play } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { COUNTRIES, COUNTRY_BY_CODE, LEGAL_ENTITIES, type CountryCode } from "@/data/countries";
import type { EmployeeStatus, SourceRecord } from "@/domain/employment";
import { entityHeadcount } from "@/lib/derived";
import { useRecords } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cn, fmtNum, fmtTime } from "@/lib/utils";
import { Button, Card, CardHeader, Input, PageHeader, Select, td, th } from "@/components/ui/primitives";
import { Chip, EmployeeChip, employeeStatusLabel } from "@/components/ui/status";
import { EmployeeDrawer } from "@/components/onboarding/employee-drawer";

const STATUSES: EmployeeStatus[] = ["ready", "customer_action", "schema_error", "legal_entity_blocked", "unsupported"];
const PAGE = 50;

export default function OnboardingPage() {
  const run = useStore((s) => s.run);
  const inputsVersion = useStore((s) => s.inputsVersion);
  const validateNow = useStore((s) => s.validateNow);
  const provisioned = useStore((s) => s.provisionedEntities);
  const provisionEntity = useStore((s) => s.provisionEntity);
  const requestInfo = useStore((s) => s.requestInfo);
  const resolve = useStore((s) => s.resolveCustomerIssues);
  const notify = useStore((s) => s.notify);
  const setCountry = useStore((s) => s.setMappingCountry);
  const { records, byId } = useRecords();

  const [status, setStatus] = useState<EmployeeStatus | "all">("all");
  const [country, setCountryFilter] = useState<CountryCode | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SourceRecord | null>(null);
  const [showBlockers, setShowBlockers] = useState(true);
  const [confirmEntity, setConfirmEntity] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const stale = run && run.inputsVersion !== inputsVersion;
  const statusOf = (id: string): EmployeeStatus => run?.nonReady[id]?.status ?? "ready";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return records.filter(
      (r) =>
        (status === "all" || (run?.nonReady[r.id]?.status ?? "ready") === status) &&
        (country === "all" || r.country === country) &&
        (!needle || r.id.toLowerCase().includes(needle) || (r.values["employee.full_name"] ?? "").toLowerCase().includes(needle)),
    );
  }, [records, status, country, q, run]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const blockers = useMemo(() => {
    const groups = new Map<string, { label: string; country: CountryCode; kind: string; owner: string; ids: string[]; message: string }>();
    for (const v of Object.values(run?.nonReady ?? {})) {
      for (const i of v.issues) {
        const k = `${v.country}|${i.destKey}|${i.kind}`;
        const g = groups.get(k) ?? { label: i.label, country: v.country, kind: i.kind, owner: i.owner, ids: [], message: i.message };
        g.ids.push(v.id);
        groups.set(k, g);
      }
    }
    return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
  }, [run]);

  const heads = entityHeadcount(records);
  const blockedEntities = LEGAL_ENTITIES.filter((e) => !(provisioned[e.code] ?? e.provisioned) && heads[e.code] > 0);

  const runValidation = () => {
    setRunning(true);
    setTimeout(() => {
      validateNow();
      setRunning(false);
    }, 450);
  };

  return (
    <div className="enter">
      <PageHeader
        step="Stage 5 · Onboarding dry run"
        title="Validate the population before onboarding"
        description="Every worker is checked against their country schema, mappings and legal entity. No create calls are made until the dry run is clean."
        actions={
          <Button variant="primary" onClick={runValidation} disabled={running}>
            <Play size={14} weight="fill" aria-hidden /> {running ? "Validating 2,400 workers…" : "Validate population"}
          </Button>
        }
      />

      {stale && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-info-fg/30 bg-info-bg px-4 py-2.5 text-[13px] text-info-fg">
          <span>Mappings or worker data changed since the last run ({run && fmtTime(run.at)}). Results below are out of date.</span>
          <Button size="sm" variant="primary" onClick={runValidation} disabled={running}>Re-run validation</Button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => {
          const n = s === "ready" ? run?.summary.ready ?? 0 : run?.summary[s] ?? 0;
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatus(active ? "all" : s);
                setPage(0);
              }}
              className={cn("rounded-[10px] border bg-surface px-4 py-3 text-left transition-colors", active ? "border-ink-strong" : "border-line hover:border-line-strong")}
            >
              <EmployeeChip status={s} />
              <p className="tabular mt-2 text-[24px] font-semibold leading-none text-ink-strong">{fmtNum(n)}</p>
            </button>
          );
        })}
      </div>

      {blockedEntities.length > 0 && (
        <Card className="mb-5 border-err-fg/30">
          <CardHeader title={<span className="inline-flex items-center gap-1.5"><Buildings size={15} weight="bold" aria-hidden /> Configuration blockers</span>} sub="Legal entities that have workers but are not configured for payroll in the destination" />
          <ul className="divide-y divide-line">
            {blockedEntities.map((e) => (
              <li key={e.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-[12.5px] text-muted">{heads[e.code]} workers · entity code {e.code} · needs provincial registration confirmed by the customer</p>
                </div>
                {confirmEntity === e.code ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-muted">This is a write to the destination (simulated). Continue?</span>
                    <Button size="sm" onClick={() => setConfirmEntity(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        void provisionEntity(e.code);
                        setConfirmEntity(null);
                      }}
                    >
                      Confirm configuration
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setConfirmEntity(e.code)}>Configure entity</Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader
          title="Blockers"
          sub={`${blockers.length} distinct issue${blockers.length === 1 ? "" : "s"} in the last run, grouped by field and owner`}
          actions={<Button size="sm" variant="ghost" onClick={() => setShowBlockers((v) => !v)}>{showBlockers ? "Hide blockers" : "Show blockers"}</Button>}
        />
        {showBlockers && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr>
                  <th className={th} scope="col">Issue</th>
                  <th className={th} scope="col">Country</th>
                  <th className={th} scope="col">Owner</th>
                  <th className={cn(th, "text-right")} scope="col">Workers</th>
                  <th className={cn(th, "text-right")} scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b) => (
                  <tr key={`${b.country}-${b.label}-${b.kind}`}>
                    <td className={td}>
                      <p className="font-medium">{b.label} <span className="font-normal text-muted">· {b.kind.replace(/_/g, " ")}</span></p>
                      <p className="max-w-[460px] truncate text-[12px] text-muted">{b.message}</p>
                    </td>
                    <td className={td}>{b.country}</td>
                    <td className={td}><Chip tone={b.owner === "customer" ? "warn" : b.owner === "configuration" ? "err" : "info"}>{b.owner}</Chip></td>
                    <td className={cn(td, "tabular text-right")}>{b.ids.length}</td>
                    <td className={cn(td, "text-right")}>
                      {b.owner === "customer" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { b.ids.forEach(requestInfo); notify(`Requested data from Acme for ${b.ids.length} worker(s)`); }}>Request info</Button>
                          <Button size="sm" onClick={() => { const n = resolve(b.ids); notify(`${n} worker(s) updated with customer data (simulated). Re-run validation.`); }}>Mark resolved</Button>
                        </div>
                      ) : b.owner === "integration" ? (
                        <Link href="/mapping" onClick={() => setCountry(b.country)} className="text-[12.5px] font-medium text-info-fg hover:underline">Resolve mapping</Link>
                      ) : (
                        <span className="text-[12.5px] text-muted">See configuration blockers</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Population"
          sub={`${fmtNum(filtered.length)} of ${fmtNum(records.length)} workers${status !== "all" ? ` · ${employeeStatusLabel(status)}` : ""}`}
          actions={
            <>
              <div className="relative">
                <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <Input aria-label="Search workers" placeholder="Name or ID" className="h-8 w-44 pl-7" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
              </div>
              <Select aria-label="Country filter" className="h-8 w-40" value={country} onChange={(e) => { setCountryFilter(e.target.value as CountryCode | "all"); setPage(0); }}>
                <option value="all">All countries</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <caption className="sr-only">Worker population and dry-run status</caption>
            <thead>
              <tr>
                {["Employee", "Country", "Employment type", "Mapping", "Schema", "Legal entity", "Payroll readiness", "Status"].map((h) => (
                  <th key={h} className={th} scope="col">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const v = run?.nonReady[r.id];
                const kinds = new Set(v?.issues.map((i) => i.kind));
                const st = statusOf(r.id);
                const mark = (ok: boolean, bad: string) => (ok ? <span className="text-ok-fg">OK</span> : <span className="text-err-fg">{bad}</span>);
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(byId.get(r.id) ?? r)}>
                    <td className={td}>
                      <button type="button" className="text-left font-medium text-ink-strong hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
                        {r.values["employee.full_name"]}
                      </button>
                      <span className="block font-mono text-[11.5px] text-muted">{r.id}</span>
                    </td>
                    <td className={td}>{COUNTRY_BY_CODE[r.country].name}</td>
                    <td className={td}>{r.values["job.employment_type"] === "PT" ? "Part-time" : "Full-time"}</td>
                    <td className={td}>{mark(!kinds.has("unmapped") && !kinds.has("transform_error"), "Gap")}</td>
                    <td className={td}>{mark(!kinds.has("invalid") && !kinds.has("missing"), kinds.has("missing") ? "Missing" : "Invalid")}</td>
                    <td className={td}>{mark(!kinds.has("entity_blocked") && !kinds.has("entity_mismatch"), "Blocked")}</td>
                    <td className={td}>{st === "ready" ? <span className="text-ok-fg">Ready</span> : <span className="text-muted">Not ready</span>}</td>
                    <td className={td}><EmployeeChip status={st} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[12.5px] text-muted">
          <span className="tabular">
            {filtered.length ? `${page * PAGE + 1}–${Math.min(filtered.length, (page + 1) * PAGE)} of ${fmtNum(filtered.length)}` : "No workers match these filters"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      {selected && <EmployeeDrawer record={byId.get(selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
