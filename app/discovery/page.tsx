"use client";

import type { ReactNode } from "react";
import { CONSTRAINTS, GOALS, type DiscoveryState, type Readiness } from "@/domain/integration";
import { useStore } from "@/lib/store";
import { Card, CardHeader, Input, Label, PageHeader, Segmented, Select } from "@/components/ui/primitives";
import { ReadinessPanel } from "@/components/discovery/readiness-panel";
import { cn } from "@/lib/utils";

const CONTEXT_FIELDS: [keyof DiscoveryState["context"], string][] = [
  ["company", "Company"],
  ["employeeCount", "Employee count"],
  ["countries", "Countries"],
  ["sourceHris", "Source HRIS"],
  ["payrollSystem", "Payroll system"],
  ["accountingSystem", "Accounting system"],
  ["employmentModels", "Employment models"],
  ["legalEntities", "Legal entities"],
  ["customFields", "Custom fields"],
  ["integrationOwner", "Integration owner"],
  ["technicalContact", "Customer technical contact"],
];

function Section({ letter, title, sub, children }: { letter: string; title: string; sub: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={<span><span className="mr-2 font-mono text-[11.5px] text-muted">{letter}</span>{title}</span>} sub={sub} />
      <div className="p-4">{children}</div>
    </Card>
  );
}

export default function DiscoveryPage() {
  const d = useStore((s) => s.discovery);
  const update = useStore((s) => s.updateDiscovery);
  const log = useStore((s) => s.log);
  const setCtx = (k: keyof DiscoveryState["context"], v: string) => update((x) => ({ ...x, context: { ...x.context, [k]: v } }));
  const setChar = <K extends keyof DiscoveryState["characteristics"]>(k: K, v: DiscoveryState["characteristics"][K]) =>
    update((x) => ({ ...x, characteristics: { ...x.characteristics, [k]: v } }));

  return (
    <div className="enter">
      <PageHeader
        step="Stage 2 · Customer Discovery"
        title="Turn the discovery call into requirements"
        description="Every answer here feeds the readiness score and, later, the reusable pattern. Edit anything; the score updates as you go."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section letter="A" title="Customer context" sub="Who the customer is and what they run today">
            <div className="grid gap-3 sm:grid-cols-2">
              {CONTEXT_FIELDS.map(([k, label]) => (
                <div key={k} className="min-w-0">
                  <Label htmlFor={`ctx-${k}`}>{label}</Label>
                  <Input id={`ctx-${k}`} value={d.context[k]} onChange={(e) => setCtx(k, e.target.value)} />
                </div>
              ))}
            </div>
          </Section>

          <Section letter="B" title="Integration goals" sub="Workflows in scope for this engagement">
            <fieldset>
              <legend className="sr-only">Workflows in scope</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {GOALS.map((g) => (
                  <label key={g.key} className={cn("flex cursor-pointer items-center gap-2 rounded-[7px] border px-3 py-2 text-[13px]", d.goals[g.key] ? "border-ink-strong bg-surface" : "border-line bg-surface-2 text-muted")}>
                    <input
                      id={`goal-${g.key}`}
                      type="checkbox"
                      checked={d.goals[g.key]}
                      onChange={(e) => {
                        update((x) => ({ ...x, goals: { ...x.goals, [g.key]: e.target.checked } }));
                        log("discovery", `Goal ${e.target.checked ? "added" : "removed"}: ${g.label}`);
                      }}
                    />
                    {g.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section letter="C" title="Integration characteristics" sub="Shape of the data flow">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[12.5px] font-medium">Direction</p>
                <Segmented label="Direction" value={d.characteristics.direction} onChange={(v) => setChar("direction", v)} options={[{ value: "one_way", label: "One-way" }, { value: "bi_directional", label: "Bi-directional" }]} />
              </div>
              <div>
                <p className="mb-1 text-[12.5px] font-medium">Sync method</p>
                <Segmented label="Sync method" value={d.characteristics.syncMethod} onChange={(v) => setChar("syncMethod", v)} options={[{ value: "event", label: "Event-driven" }, { value: "scheduled", label: "Scheduled" }, { value: "hybrid", label: "Hybrid" }]} />
              </div>
              <div>
                <Label htmlFor="ch-volume">Expected volume</Label>
                <Input id="ch-volume" value={d.characteristics.volume} onChange={(e) => setChar("volume", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ch-latency">Required latency</Label>
                <Input id="ch-latency" value={d.characteristics.latency} onChange={(e) => setChar("latency", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ch-sla">Customer SLA</Label>
                <Input id="ch-sla" value={d.characteristics.sla} onChange={(e) => setChar("sla", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ch-pii">PII classification</Label>
                <Select id="ch-pii" value={d.characteristics.pii} onChange={(e) => setChar("pii", e.target.value as DiscoveryState["characteristics"]["pii"])}>
                  <option value="high">High: national IDs, salary, bank data</option>
                  <option value="moderate">Moderate: contact and job data</option>
                  <option value="low">Low: directory data only</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-[13px] md:col-span-2">
                <input id="ch-migration" type="checkbox" checked={d.characteristics.historicalMigration} onChange={(e) => setChar("historicalMigration", e.target.checked)} />
                Historical migration required (payroll history before go-live)
              </label>
            </div>
          </Section>

          <Section letter="D" title="Constraints and access" sub="What could block or slow the build">
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              {(["sourceAccess", "authentication"] as const).map((k) => (
                <div key={k}>
                  <Label htmlFor={`acc-${k}`}>{k === "sourceAccess" ? "Source access" : "Authentication"}</Label>
                  <Select id={`acc-${k}`} value={d[k]} onChange={(e) => update((x) => ({ ...x, [k]: e.target.value as Readiness }))}>
                    <option value="ready">Ready</option>
                    <option value="partial">Partial</option>
                    <option value="not_started">Not started</option>
                    <option value="blocked">Blocked</option>
                  </Select>
                </div>
              ))}
              <label className="flex items-end gap-2 pb-2 text-[13px]">
                <input
                  id="payroll-cal"
                  type="checkbox"
                  checked={d.payrollCalendarConfirmed}
                  onChange={(e) => {
                    update((x) => ({ ...x, payrollCalendarConfirmed: e.target.checked }));
                    log("discovery", e.target.checked ? "Payroll calendars confirmed for all four countries" : "Payroll calendar confirmation withdrawn");
                  }}
                />
                Payroll calendars confirmed
              </label>
            </div>
            <ul className="divide-y divide-line rounded-[8px] border border-line">
              {CONSTRAINTS.map((c) => (
                <li key={c.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{c.label}</p>
                    <p className="text-[12px] text-muted">{c.hint}</p>
                  </div>
                  <Segmented
                    label={c.label}
                    value={d.constraints[c.key]}
                    onChange={(v) => {
                      update((x) => ({ ...x, constraints: { ...x.constraints, [c.key]: v } }));
                      log("discovery", `Constraint "${c.label}" marked ${v.replace("_", "/")}`);
                    }}
                    options={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "n_a", label: "N/A" }]}
                  />
                </li>
              ))}
            </ul>
          </Section>
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <ReadinessPanel />
        </div>
      </div>
    </div>
  );
}
