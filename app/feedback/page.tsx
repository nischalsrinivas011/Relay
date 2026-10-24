"use client";

import { ArrowRight, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/utils";
import {
  OTHER_CUSTOMERS,
  SYNTHETIC_OBSERVATIONS,
  SYNTHETIC_TALLIES,
  acmeObservations,
  aggregate,
  priorityScore,
  type FeedbackRecord,
  type Insight,
  type PriorityScores,
} from "@/services/feedback-engine";
import { Button, Card, CardHeader, DemoBadge, Drawer, Input, Label, PageHeader, Textarea } from "@/components/ui/primitives";
import { Chip } from "@/components/ui/status";

const SCORE_FIELDS: [keyof PriorityScores, string, string][] = [
  ["customerImpact", "Customer impact", "How much it hurts customers"],
  ["feasibility", "Technical feasibility", "How easy it is to build"],
  ["operationalComplexity", "Operational complexity", "Higher lowers priority"],
  ["repeatability", "Repeatability", "How often it recurs"],
  ["revenue", "Revenue / retention impact", ""],
];

type Draft = Omit<FeedbackRecord, "id" | "createdAt" | "priority">;

function draftFrom(i: Insight): Draft {
  return {
    title: i.title,
    problem: i.problem,
    affectedCustomers: i.customers,
    frequency: `Seen in ${i.seenIn}/4 implementations`,
    customerImpact: i.blockers ? `${i.blockers} customer blocker(s) during implementation` : "Delays go-live; no hard blockers",
    operationalImpact: `${i.manualSteps} manual steps across implementations`,
    suggestedChange: i.recommendation,
    evidence: [`${i.seenIn} of 4 implementations`, `${i.manualSteps} manual steps`, `${i.blockers} customer blockers`, `Customers: ${i.customers.join(", ")}`],
    scores: { customerImpact: Math.min(5, 2 + i.blockers), feasibility: 3, operationalComplexity: 3, repeatability: Math.min(5, i.seenIn + 1), revenue: 3 },
  };
}

export default function FeedbackPage() {
  const run = useStore((s) => s.run);
  const provisioned = useStore((s) => s.provisionedEntities);
  const deliveries = useStore((s) => s.deliveries);
  const apiLog = useStore((s) => s.apiLog);
  const mappings = useStore((s) => s.mappings);
  const records = useStore((s) => s.feedback);
  const create = useStore((s) => s.createFeedback);
  const notify = useStore((s) => s.notify);
  const [draft, setDraft] = useState<Draft | null>(null);

  const insights = useMemo(
    () =>
      aggregate([
        ...SYNTHETIC_OBSERVATIONS,
        ...acmeObservations({
          legalEntityBlocked: !provisioned["ACME-CA-QC"],
          legalEntityManualSteps: 4,
          taxFieldIssues: run ? Object.values(run.nonReady).filter((v) => v.issues.some((i) => i.destKey === "tax_job_category")).length : 0,
          replays: deliveries.filter((d) => d.attempts.length > 1).length,
          authFailures: apiLog.filter((l) => l.status === 401 || l.status === 403).length,
          provinceMapped: mappings.CA["address_details.state_or_province"]?.source === "address.province_code",
        }),
      ]),
    [run, provisioned, deliveries, apiLog, mappings],
  );
  const t = SYNTHETIC_TALLIES;
  const bulk = insights.find((i) => i.issue === "bulk_prevalidation");
  const replay = insights.find((i) => i.issue === "webhook_replay");
  const pri = draft ? priorityScore(draft.scores) : null;

  return (
    <div className="enter">
      <PageHeader
        step="Stage 10 · Product feedback"
        title="Turn recurring pain into roadmap evidence"
        description={`Acme's live engagement plus three synthetic implementations (${OTHER_CUSTOMERS.join(", ")}). Issues seen in two or more customers surface here automatically.`}
        actions={<DemoBadge>Synthetic customers</DemoBadge>}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4 text-[13px]"><p className="tabular text-[24px] font-semibold text-ink-strong">{Math.round((t.mappingFailures.countryTax / t.mappingFailures.total) * 100)}%</p>of mapping failures involve country-specific tax fields</Card>
        <Card className="p-4 text-[13px]"><p className="tabular text-[24px] font-semibold text-ink-strong">{Math.max(0, (bulk?.seenIn ?? 1) - 1)} customers</p>besides Acme built their own bulk pre-validation</Card>
        <Card className="p-4 text-[13px]"><p className="tabular text-[24px] font-semibold text-ink-strong">{replay?.manualSteps ?? 0} steps</p>of manual webhook replay across implementations</Card>
        <Card className="p-4 text-[13px]"><p className="tabular text-[24px] font-semibold text-ink-strong">{Math.round((t.supportEvents.authScope / t.supportEvents.total) * 100)}%</p>of support events come from authentication scope errors</Card>
      </div>

      <Card className="mb-5">
        <CardHeader title="Recurring implementation problems" sub="Ranked by customer blockers, then reach across implementations, then manual effort" />
        <ul className="divide-y divide-line">
          {insights.map((i) => (
            <li key={i.issue} className="grid gap-3 px-4 py-3.5 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink-strong">{i.title}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
                  <span>Seen in <strong className="text-ink">{i.seenIn}/4</strong> implementations</span>
                  <span>Manual steps <strong className="text-ink">{i.manualSteps}</strong></span>
                  <span>Customer blockers <strong className="text-ink">{i.blockers}</strong></span>
                  <span>{i.customers.join(", ")}</span>
                </div>
                <p className="mt-1.5 flex items-start gap-1.5 text-[13px]"><ArrowRight size={13} weight="bold" className="mt-1 shrink-0 text-muted" aria-hidden /> {i.recommendation}</p>
              </div>
              <Button onClick={() => setDraft(draftFrom(i))}><Plus size={13} weight="bold" aria-hidden /> Create feedback record</Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Feedback records" sub="Ready to share with Product and Platform" />
        {records.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-muted">No records yet. Convert an insight above into a product-feedback record.</p>
        ) : (
          <ul className="divide-y divide-line">
            {records.map((r) => (
              <li key={r.id} className="px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={r.priority.tier === "P0" ? "err" : r.priority.tier === "P1" ? "warn" : "neutral"}>{r.priority.tier} · {r.priority.value}</Chip>
                  <p className="font-semibold text-ink-strong">{r.title}</p>
                  <span className="ml-auto text-[12px] text-muted">{fmtTime(r.createdAt)}</span>
                </div>
                <p className="mt-1">{r.suggestedChange}</p>
                <p className="mt-1 text-[12.5px] text-muted">{r.frequency} · {r.affectedCustomers.join(", ")} · {r.operationalImpact}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Drawer
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title="New product-feedback record"
        description="Prefilled from the insight. Edit before saving."
        width="max-w-2xl"
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!draft) return;
                create(draft);
                notify(`Feedback record saved as ${pri?.tier}`);
                setDraft(null);
              }}
            >
              Save record
            </Button>
          </>
        }
      >
        {draft && pri && (
          <div className="flex flex-col gap-3 text-[13px]">
            <div><Label htmlFor="fb-title">Title</Label><Input id="fb-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div><Label htmlFor="fb-problem">Problem</Label><Textarea id="fb-problem" rows={3} value={draft.problem} onChange={(e) => setDraft({ ...draft, problem: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="fb-aff">Affected customers</Label><Input id="fb-aff" value={draft.affectedCustomers.join(", ")} onChange={(e) => setDraft({ ...draft, affectedCustomers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div><Label htmlFor="fb-freq">Frequency</Label><Input id="fb-freq" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })} /></div>
              <div><Label htmlFor="fb-ci">Customer impact</Label><Input id="fb-ci" value={draft.customerImpact} onChange={(e) => setDraft({ ...draft, customerImpact: e.target.value })} /></div>
              <div><Label htmlFor="fb-oi">Operational impact</Label><Input id="fb-oi" value={draft.operationalImpact} onChange={(e) => setDraft({ ...draft, operationalImpact: e.target.value })} /></div>
            </div>
            <div><Label htmlFor="fb-change">Suggested product change</Label><Textarea id="fb-change" rows={2} value={draft.suggestedChange} onChange={(e) => setDraft({ ...draft, suggestedChange: e.target.value })} /></div>
            <div>
              <p className="mb-1 text-[12.5px] font-medium">Evidence</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted">{draft.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
            <fieldset className="rounded-[8px] border border-line p-3">
              <legend className="px-1 text-[12.5px] font-medium">Prioritization (1–5)</legend>
              <div className="flex flex-col gap-2">
                {SCORE_FIELDS.map(([k, label, hint]) => (
                  <label key={k} htmlFor={`fb-${k}`} className="grid grid-cols-[1fr_140px_24px] items-center gap-3">
                    <span>{label}{hint && <span className="block text-[11.5px] text-muted">{hint}</span>}</span>
                    <input id={`fb-${k}`} type="range" min={1} max={5} value={draft.scores[k]} onChange={(e) => setDraft({ ...draft, scores: { ...draft.scores, [k]: Number(e.target.value) } })} />
                    <span className="tabular text-right">{draft.scores[k]}</span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-[13px]">Priority: <Chip tone={pri.tier === "P0" ? "err" : pri.tier === "P1" ? "warn" : "neutral"}>{pri.tier} · {pri.value}</Chip></p>
            </fieldset>
          </div>
        )}
      </Drawer>
    </div>
  );
}
