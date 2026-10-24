"use client";

import { useMemo } from "react";
import { COUNTRIES, LEGAL_ENTITIES } from "@/data/countries";
import { recordsFor, entityHeadcount } from "./derived";
import { useStore } from "./store";
import { computeReadiness } from "@/services/readiness";
import { computeReliability, rootCauses } from "@/services/reliability-engine";
import { mappingStatus, computeCoverage, unmappedSourceFields } from "@/services/mapping-engine";
import { destFieldsFor } from "@/data/schemas";
import { isRetryable } from "@/services/webhook-engine";

export function useRecords() {
  const patches = useStore((s) => s.patches);
  return useMemo(() => recordsFor(patches), [patches]);
}

export function useReadiness() {
  const discovery = useStore((s) => s.discovery);
  const mappings = useStore((s) => s.mappings);
  const provisionedEntities = useStore((s) => s.provisionedEntities);
  const subscriptions = useStore((s) => s.subscriptions);
  const credentialExpired = useStore((s) => s.demo.credentialExpired);
  const { records } = useRecords();
  return useMemo(
    () => computeReadiness({ discovery, mappings, provisionedEntities, subscriptions, credentialExpired, entityHeadcount: entityHeadcount(records) }),
    [discovery, mappings, provisionedEntities, subscriptions, credentialExpired, records],
  );
}

export function useReliability() {
  const run = useStore((s) => s.run);
  const deliveries = useStore((s) => s.deliveries);
  const syncEvents = useStore((s) => s.syncEvents);
  const apiLog = useStore((s) => s.apiLog);
  const incentives = useStore((s) => s.incentives);
  return useMemo(() => {
    if (!run) return null;
    const input = { summary: run.summary, nonReady: run.nonReady, deliveries, syncEvents, apiLog, incentives, now: Date.now() };
    return { metrics: computeReliability(input), causes: rootCauses(input) };
  }, [run, deliveries, syncEvents, apiLog, incentives]);
}

/** Per-country mapping status with coverage, for Data Mapping and the overview. */
export function useMappingHealth() {
  const mappings = useStore((s) => s.mappings);
  const { records } = useRecords();
  return useMemo(() => {
    const out = COUNTRIES.map((c) => {
      const rs = records.filter((r) => r.country === c.code);
      const rows = destFieldsFor(c.code).map((d) => {
        const m = mappings[c.code][d.key] ?? { destKey: d.key, source: null, transform: { type: "direct" as const } };
        const coverage = m.source ? computeCoverage(m, rs) : undefined;
        return { dest: d, mapping: m, coverage, status: mappingStatus(m, c.code, coverage) };
      });
      return { country: c.code, rows };
    });
    return { byCountry: out, unmappedSources: unmappedSourceFields(mappings) };
  }, [mappings, records]);
}

export interface Risk {
  id: string;
  level: "Critical" | "High" | "Medium" | "Low";
  title: string;
  detail: string;
  href: string;
}

export function useRisks(): Risk[] {
  const run = useStore((s) => s.run);
  const provisioned = useStore((s) => s.provisionedEntities);
  const deliveries = useStore((s) => s.deliveries);
  const credentialExpired = useStore((s) => s.demo.credentialExpired);
  const health = useMappingHealth();
  const { records } = useRecords();
  return useMemo(() => {
    const risks: Risk[] = [];
    const heads = entityHeadcount(records);
    if (credentialExpired) risks.push({ id: "auth", level: "Critical", title: "Destination credential expired", detail: "All API calls return 401 until a new sandbox token is issued.", href: "/sync" });
    for (const e of LEGAL_ENTITIES) {
      if (!(provisioned[e.code] ?? e.provisioned) && heads[e.code] > 0)
        risks.push({ id: `le-${e.code}`, level: "Critical", title: `${e.name} not configured for payroll`, detail: `${heads[e.code]} workers cannot be onboarded until the entity is set up.`, href: "/onboarding" });
    }
    const missingReq = health.byCountry.flatMap((c) => c.rows.filter((r) => r.status === "missing_source").map((r) => ({ c: c.country, r })));
    for (const { c, r } of missingReq)
      risks.push({ id: `map-${c}-${r.dest.key}`, level: "Critical", title: `${c}: required field ${r.dest.label} has no source`, detail: `Every ${c} worker fails schema validation until this is mapped.`, href: "/mapping" });
    if (run) {
      const caTax = Object.values(run.nonReady).filter((v) => v.country === "CA" && v.issues.some((i) => i.destKey === "tax_job_category" && i.kind === "missing")).length;
      if (caTax) risks.push({ id: "ca-tax", level: "High", title: `${caTax} Canadian employees missing tax data`, detail: "tax_job_category is empty in AcmeHR. Customer input needed.", href: "/onboarding" });
      if (run.summary.schema_error > 0 && !missingReq.length)
        risks.push({ id: "schema", level: "High", title: `${run.summary.schema_error} schema validation failures`, detail: "Records fail country format rules.", href: "/onboarding" });
    }
    const transform = health.byCountry.flatMap((c) => c.rows.filter((r) => r.status === "needs_transformation" || r.status === "invalid"));
    if (transform.length) risks.push({ id: "transform", level: "Medium", title: `${transform.length} mapping${transform.length === 1 ? " needs" : "s need"} a transformation fix`, detail: transform.map((t) => t.dest.label).join(", "), href: "/mapping" });
    if (health.unmappedSources.length)
      risks.push({ id: "unmapped", level: "Medium", title: `${health.unmappedSources.length} HRIS fields do not have destination mappings`, detail: health.unmappedSources.slice(0, 4).join(", ") + (health.unmappedSources.length > 4 ? "…" : ""), href: "/mapping" });
    const retry = deliveries.filter(isRetryable).length;
    if (retry) risks.push({ id: "retry", level: "Medium", title: `Webhook retry queue contains ${retry} event${retry === 1 ? "" : "s"}`, detail: "Transient receiver failures waiting for replay.", href: "/sync/webhooks" });
    return risks;
  }, [run, provisioned, deliveries, credentialExpired, health, records]);
}

export const LIFECYCLE = ["Discovery", "Mapping", "Validation", "Testing", "Live simulation", "Operational"] as const;

export function useLifecycle() {
  const readiness = useReadiness();
  const health = useMappingHealth();
  const run = useStore((s) => s.run);
  const inputsVersion = useStore((s) => s.inputsVersion);
  const snapshot = useStore((s) => s.snapshot);
  const syncEvents = useStore((s) => s.syncEvents);
  const patterns = useStore((s) => s.patterns);
  const done = [
    readiness.score >= 0.6,
    health.byCountry.every((c) => c.rows.every((r) => r.status !== "missing_source" && r.status !== "invalid")),
    !!run && run.inputsVersion === inputsVersion && run.summary.schema_error <= 10 && run.summary.ready / run.summary.total >= 0.95,
    snapshot.status === "done",
    syncEvents.some((e) => e.status === "completed"),
    patterns.length > 0,
  ];
  const current = done.findIndex((d) => !d);
  return { done, current: current === -1 ? LIFECYCLE.length - 1 : current };
}
