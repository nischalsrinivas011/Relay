// Build Assistant: contextual, rule-based answers computed from live app state.
// No model call is made in Demo mode; each answer cites the state it read.

import type { CountryCode } from "@/data/countries";
import type { EmployeeValidation, PopulationSummary, SourceRecord } from "@/domain/employment";
import type { MappingStatus, MappingSuggestion } from "@/domain/mapping";
import type { WebhookDelivery } from "@/domain/webhook";
import type { Insight } from "./feedback-engine";
import type { rootCauses } from "./reliability-engine";
import type { computeReadiness } from "./readiness";

export interface AssistantContext {
  run: { summary: PopulationSummary; nonReady: Record<string, EmployeeValidation>; stale: boolean } | null;
  mappingRows: { country: CountryCode; destKey: string; label: string; source: string | null; status: MappingStatus; required: boolean }[];
  suggestions: Record<CountryCode, MappingSuggestion[]>;
  deliveries: WebhookDelivery[];
  causes: ReturnType<typeof rootCauses>;
  readiness: ReturnType<typeof computeReadiness>;
  findWorker: (name: string) => SourceRecord | undefined;
  insights: Insight[];
}

export interface AssistantAnswer {
  text: string;
  sources: string[];
}

export interface AssistantQuestion {
  id: string;
  pages: string[];
  question: string;
  answer: (ctx: AssistantContext) => AssistantAnswer;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const QUESTIONS: AssistantQuestion[] = [
  {
    id: "province",
    pages: ["/mapping"],
    question: "What should province_code map to?",
    answer: (ctx) => {
      const row = ctx.mappingRows.find((r) => r.country === "CA" && r.destKey === "address_details.state_or_province");
      if (row?.source === "address.province_code") return { text: "address.province_code is already mapped to address_details.state_or_province for Canada. No action needed.", sources: ["Mappings: CA"] };
      const s = ctx.suggestions.CA.find((x) => x.destKey === "address_details.state_or_province");
      return {
        text: s
          ? `Map address.province_code to address_details.state_or_province for Canada (confidence ${s.confidence}%). ${s.reason.replace(/`/g, "")} The US mapping uses address.state, which is empty for Canadian workers, so this has to be a Canada-specific rule. Review it and apply it from the suggestion panel; I will not apply it for you.`
          : "No suggestion is available. Check that the Canada country view is loaded.",
        sources: ["Mappings: CA", "AcmeHR field coverage (CA)"],
      };
    },
  },
  {
    id: "unmapped",
    pages: ["/mapping", "/overview"],
    question: "Which required fields are still not mapped correctly?",
    answer: (ctx) => {
      const bad = ctx.mappingRows.filter((r) => r.required && r.status !== "mapped");
      if (!bad.length) return { text: "Every required destination field in all four countries has a healthy mapping.", sources: ["Mappings: all countries"] };
      return {
        text: `${bad.length} required mapping${bad.length === 1 ? "" : "s"} need attention: ${bad.map((b) => `${b.country} ${b.label} (${b.status.replace(/_/g, " ")})`).join("; ")}.`,
        sources: ["Mappings: all countries"],
      };
    },
  },
  {
    id: "canada",
    pages: ["/reliability", "/overview", "/sync"],
    question: "Why did Canadian sync success decline?",
    answer: (ctx) => {
      const ca = ctx.causes.find((c) => c.country === "CA");
      if (!ca) return { text: "Canadian sync success is at 100% of attempted records in the last validation run. Nothing is failing in Canada right now.", sources: ["Last validation run"] };
      return {
        text: `Canadian sync success is ${pct(ca.success)} because ${ca.topCount} of ${ca.failing} failing records fail on ${ca.topLabel} (${Math.round(ca.share * 100)}% of today's Canadian failures). Recommendation: ${ca.recommendation}`,
        sources: ["Last validation run", "Reliability root-cause analysis"],
      };
    },
  },
  {
    id: "ignored",
    pages: ["/sync/webhooks", "/sync"],
    question: "Explain why the latest ignored event was ignored.",
    answer: (ctx) => {
      const dup = [...ctx.deliveries].reverse().find((d) => d.result === "duplicate_ignored");
      if (!dup) return { text: "No delivery has been ignored as a duplicate yet.", sources: ["Webhook deliveries"] };
      const first = ctx.deliveries.find((d) => d.eventId === dup.eventId && d.result === "processed");
      return {
        text: `Delivery ${dup.deliveryId} carried event_id ${dup.eventId}, which was already processed${first ? ` by delivery ${first.deliveryId}` : ""}. The receiver deduplicates on event_id before applying changes, so the employee record was not changed a second time. This is expected: senders retry, and receivers must be idempotent.`,
        sources: ["Webhook deliveries", "Processed event ids"],
      };
    },
  },
  {
    id: "anna",
    pages: ["/onboarding", "/mapping"],
    question: "What information is blocking Anna Müller?",
    answer: (ctx) => {
      const w = ctx.findWorker("Anna Müller");
      if (!w || !ctx.run) return { text: "Anna Müller was not found in the workforce.", sources: [] };
      const v = ctx.run.nonReady[w.id];
      if (!v) return { text: `Anna Müller (${w.id}) is Ready in the last validation run.${ctx.run.stale ? " Inputs changed since that run; re-run validation to confirm." : ""}`, sources: ["Last validation run"] };
      return {
        text: `Anna Müller (${w.id}, Germany) has ${v.completeCount} of ${v.requiredCount} required fields complete. Blocking: ${v.issues.map((i) => i.message).join(" ")}${v.issues.some((i) => i.destKey === "contact_details.mobile_number") ? " Her work phone is empty in AcmeHR but her mobile phone is populated, so a fallback mapping on Germany's mobile number clears this without asking the customer." : ""}`,
        sources: ["Last validation run", "Mappings: DE"],
      };
    },
  },
  {
    id: "golive",
    pages: ["/overview", "/discovery"],
    question: "What is holding readiness down?",
    answer: (ctx) => {
      const weak = ctx.readiness.items.filter((i) => i.status !== "ready");
      return {
        text: `Readiness is ${Math.round(ctx.readiness.score * 100)}% (${ctx.readiness.label}). ${weak.length ? `Not ready: ${weak.map((w) => `${w.label} (${w.detail})`).join("; ")}.` : "Every item is ready."}`,
        sources: ["Readiness model", "Discovery", "Mappings", "Legal entities"],
      };
    },
  },
  {
    id: "roadmap",
    pages: ["/feedback", "/patterns"],
    question: "Which recurring issue should reach the roadmap first?",
    answer: (ctx) => {
      const top = ctx.insights[0];
      if (!top) return { text: "No recurring issue spans more than one customer yet.", sources: [] };
      return {
        text: `${top.title}: seen in ${top.seenIn} of 4 implementations, ${top.manualSteps} manual steps, ${top.blockers} customer blocker${top.blockers === 1 ? "" : "s"}. ${top.recommendation}`,
        sources: ["Implementation observations (Acme live, 3 synthetic customers)"],
      };
    },
  },
];

export function questionsFor(path: string) {
  const match = QUESTIONS.filter((q) => q.pages.some((p) => path === p || (p !== "/sync" && path.startsWith(p))));
  return match.length ? match : QUESTIONS.filter((q) => q.pages.includes("/overview"));
}
