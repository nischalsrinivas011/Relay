"use client";

import { Sparkle } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { COUNTRIES, type CountryCode } from "@/data/countries";
import { useMappingHealth, useReadiness, useRecords, useReliability } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { aggregate, acmeObservations, SYNTHETIC_OBSERVATIONS } from "@/services/feedback-engine";
import { suggestMappings } from "@/services/mapping-engine";
import { questionsFor, type AssistantAnswer, type AssistantContext } from "@/services/assistant";
import { Button, Drawer } from "@/components/ui/primitives";

export function useAssistantContext(): AssistantContext {
  const run = useStore((s) => s.run);
  const inputsVersion = useStore((s) => s.inputsVersion);
  const mappings = useStore((s) => s.mappings);
  const deliveries = useStore((s) => s.deliveries);
  const provisioned = useStore((s) => s.provisionedEntities);
  const apiLog = useStore((s) => s.apiLog);
  const health = useMappingHealth();
  const readiness = useReadiness();
  const rel = useReliability();
  const { records } = useRecords();
  return useMemo(() => {
    const suggestions = Object.fromEntries(
      COUNTRIES.map((c) => [c.code, suggestMappings(c.code, mappings[c.code], records.filter((r) => r.country === c.code))]),
    ) as Record<CountryCode, ReturnType<typeof suggestMappings>>;
    const insights = aggregate([
      ...SYNTHETIC_OBSERVATIONS,
      ...acmeObservations({
        legalEntityBlocked: !provisioned["ACME-CA-QC"],
        legalEntityManualSteps: 4,
        taxFieldIssues: run ? Object.values(run.nonReady).filter((v) => v.issues.some((i) => i.destKey === "tax_job_category")).length : 0,
        replays: deliveries.filter((d) => d.attempts.length > 1).length,
        authFailures: apiLog.filter((l) => l.status === 401 || l.status === 403).length,
        provinceMapped: mappings.CA["address_details.state_or_province"]?.source === "address.province_code",
      }),
    ]);
    return {
      run: run ? { summary: run.summary, nonReady: run.nonReady, stale: run.inputsVersion !== inputsVersion } : null,
      mappingRows: health.byCountry.flatMap((c) =>
        c.rows.map((r) => ({ country: c.country, destKey: r.dest.key, label: r.dest.label, source: r.mapping.source, status: r.status, required: r.dest.requiredIn.includes(c.country) })),
      ),
      suggestions,
      deliveries,
      causes: rel?.causes ?? [],
      readiness,
      findWorker: (name) => records.find((r) => r.values["employee.full_name"] === name),
      insights,
    };
  }, [run, inputsVersion, mappings, deliveries, provisioned, apiLog, health, readiness, rel, records]);
}

export function AssistantPanel() {
  const open = useStore((s) => s.assistantOpen);
  const setUi = useStore((s) => s.setUi);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => setUi({ assistantOpen: o })}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkle size={16} weight="fill" aria-hidden /> Build Assistant
        </span>
      }
      description="Answers are computed from the current demo state. Rule-based in Demo mode; no model call is made and nothing is changed."
      width="max-w-lg"
    >
      {open && <AssistantBody />}
    </Drawer>
  );
}

function AssistantBody() {
  const path = usePathname();
  const ctx = useAssistantContext();
  const [answers, setAnswers] = useState<{ q: string; a: AssistantAnswer }[]>([]);
  const questions = questionsFor(path);
  return (
    <>
      <p className="label-caps mb-2">Questions for this page</p>
      <div className="flex flex-col gap-2">
        {questions.map((q) => (
          <Button key={q.id} variant="secondary" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => setAnswers((a) => [{ q: q.question, a: q.answer(ctx) }, ...a].slice(0, 6))}>
            {q.question}
          </Button>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3" aria-live="polite">
        {answers.map((x, i) => (
          <article key={i} className="enter rounded-[8px] border border-line bg-surface-2 p-3">
            <p className="text-[12.5px] font-medium text-ink-strong">{x.q}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed">{x.a.text}</p>
            {x.a.sources.length > 0 && <p className="mt-2 text-[11.5px] text-muted">Read from: {x.a.sources.join(" · ")}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
