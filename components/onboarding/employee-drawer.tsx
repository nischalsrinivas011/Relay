"use client";

import Link from "next/link";
import { COUNTRY_BY_CODE } from "@/data/countries";
import type { EmployeeValidation, SourceRecord } from "@/domain/employment";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/utils";
import { entityByCode, validateEmployee } from "@/services/validation-engine";
import { Button, Drawer, KeyValue } from "@/components/ui/primitives";
import { Chip, EmployeeChip } from "@/components/ui/status";

export function EmployeeDrawer({ record, onClose }: { record: SourceRecord | null; onClose: () => void }) {
  const run = useStore((s) => s.run);
  const mappings = useStore((s) => s.mappings);
  const provisioned = useStore((s) => s.provisionedEntities);
  const requested = useStore((s) => s.requested);
  const requestInfo = useStore((s) => s.requestInfo);
  const resolve = useStore((s) => s.resolveCustomerIssues);
  const setCountry = useStore((s) => s.setMappingCountry);
  const notify = useStore((s) => s.notify);

  if (!record) return <Drawer open={false} onOpenChange={() => {}} title="">{null}</Drawer>;

  const last: EmployeeValidation | undefined = run?.nonReady[record.id];
  const live = validateEmployee(record, { mappings, provisionedEntities: provisioned });
  const lastStatus = last?.status ?? "ready";
  const changed = live.status !== lastStatus;
  const shown = last ?? live;
  const entity = entityByCode(record.values["entity.code"]);
  const entityOk = entity && entity.country === record.country && (provisioned[entity.code] ?? entity.provisioned);
  const customerIssues = live.issues.filter((i) => i.owner === "customer");
  const integrationIssues = live.issues.filter((i) => i.owner === "integration");

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={record.values["employee.full_name"] ?? record.id}
      description={`${record.id} · fictional worker`}
      footer={
        <>
          {integrationIssues.length > 0 && (
            <Link
              href="/mapping"
              onClick={() => setCountry(record.country)}
              className="inline-flex h-8.5 items-center rounded-[6px] border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-2"
            >
              Resolve mapping
            </Link>
          )}
          {customerIssues.length > 0 && !requested[record.id] && (
            <Button onClick={() => requestInfo(record.id)}>Request customer information</Button>
          )}
          {customerIssues.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                const n = resolve([record.id]);
                notify(n ? "Customer data recorded. Re-run validation to confirm." : "Nothing customer-fixable on this worker", n ? "ok" : "warn");
              }}
            >
              Mark resolved
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <EmployeeChip status={lastStatus} />
          <span className="text-[12px] text-muted">in last validation run{run ? ` (${fmtTime(run.at)})` : ""}</span>
          {changed && (
            <Chip tone="info">
              Now: {live.status === "ready" ? "would be Ready" : live.status.replace(/_/g, " ")}. Re-run validation
            </Chip>
          )}
        </div>
        <KeyValue
          items={[
            ["Country", COUNTRY_BY_CODE[record.country].name],
            ["Employment model", "Global Payroll"],
            ["Job", `${record.values["job.position"]} · ${record.values["job.department"]}`],
            ["Required fields", shown.requiredCount],
            ["Complete", shown.completeCount],
            ["Legal entity", entity ? `${entity.name}` : record.values["entity.code"] ?? "None"],
            ["Entity valid", entityOk ? "Yes" : "No"],
            ["Ready", lastStatus === "ready" ? "Yes" : "No"],
            ["Customer info requested", requested[record.id] ? fmtTime(requested[record.id]) : "No"],
          ]}
        />
        <section>
          <p className="label-caps mb-1.5">{shown.issues.length ? "Blocking issues (last run)" : "No blocking issues"}</p>
          <ul className="divide-y divide-line rounded-[8px] border border-line">
            {shown.issues.map((i) => (
              <li key={`${i.destKey}-${i.kind}`} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{i.label}</p>
                  <p className="text-[12.5px] text-muted">{i.message}</p>
                </div>
                <Chip tone={i.owner === "customer" ? "warn" : i.owner === "configuration" ? "err" : "info"}>{i.owner}</Chip>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
