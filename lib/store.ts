// Single client store for the demo engagement. Actions call domain services and the
// RemoteClient; components only read state and call actions.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { COUNTRY_BY_CODE, LEGAL_ENTITIES, type CountryCode } from "@/data/countries";
import { DEST_BY_KEY } from "@/data/schemas";
import type { Employment } from "@/domain/employment";
import { SYNC_STAGES, type ActivityItem, type DiscoveryState, type SyncChangeType, type SyncEvent } from "@/domain/integration";
import type { FieldMapping } from "@/domain/mapping";
import type { Incentive, IncentiveInput } from "@/domain/payroll";
import type { WebhookDelivery, WebhookEventType, WebhookScenario } from "@/domain/webhook";
import type { DemoControlKey } from "@/lib/demo-controls";
import { recordsFor, employmentIndex, entityHeadcount } from "@/lib/derived";
import { buildInitialState, runValidation, type PersistedState } from "@/lib/initial-state";
import { uid } from "@/lib/utils";
import { priorityScore, type FeedbackRecord, type PriorityScores } from "@/services/feedback-engine";
import { MockRemoteClient, type ApiFailure, type MockBackend } from "@/services/mock-remote-client";
import { generatePattern } from "@/services/pattern-engine";
import { allPass, validateIncentive } from "@/services/payroll-engine";
import { RemoteApiError, type RemoteClient } from "@/services/remote-client";
import { applyPatch, buildChange, destinationDiff } from "@/services/sync-engine";
import { simulatedCustomerFix, validateEmployee } from "@/services/validation-engine";
import { applyOutcome, buildDelivery, employmentIdFor, isRetryable, processDelivery } from "@/services/webhook-engine";

interface UiState {
  assistantOpen: boolean;
  controlsOpen: boolean;
  toast: { id: string; message: string; tone: "ok" | "warn" | "error" } | null;
}

export interface RelayStore extends PersistedState, UiState {
  setUi(p: Partial<UiState>): void;
  notify(message: string, tone?: "ok" | "warn" | "error"): void;
  log(kind: ActivityItem["kind"], message: string): void;

  updateDiscovery(fn: (d: DiscoveryState) => DiscoveryState): void;

  setMappingCountry(c: CountryCode): void;
  setMapping(country: CountryCode, mapping: FieldMapping, note?: string): void;
  applyMappings(country: CountryCode, mappings: FieldMapping[], note: string): void;

  validateNow(): void;
  requestInfo(employeeId: string): void;
  resolveCustomerIssues(employeeIds: string[]): number;
  provisionEntity(code: string): Promise<void>;

  startSnapshot(): void;
  tickSnapshot(): void;
  createSyncEvent(type: SyncChangeType, employeeId?: string): void;
  advanceSync(id: string): Promise<void>;
  replaySyncEvent(id: string): void;
  setSyncPaused(p: boolean): void;
  runReconciliation(): void;

  deliverWebhook(input: { type: WebhookEventType; employeeId: string | null; scenario?: WebhookScenario; eventId?: string; employmentId?: string; source?: WebhookDelivery["source"] }): WebhookDelivery;
  replayDelivery(deliveryId: string): void;
  replayAllRetryable(): number;
  closeDelivery(deliveryId: string, result: "ignored" | "resolved"): void;
  toggleSubscription(type: WebhookEventType): void;

  createIncentive(input: IncentiveInput, opts?: { bulk?: boolean }): Promise<Incentive>;
  cancelIncentive(id: string): void;

  promotePattern(): void;
  createFeedback(input: Omit<FeedbackRecord, "id" | "createdAt" | "priority"> & { scores: PriorityScores }): void;

  triggerDemo(key: DemoControlKey): void;
  setDemo(p: Partial<PersistedState["demo"]>): void;
  reset(): void;
}

const inflight = new Set<string>();
const remainingFieldsLabel = (keys: string[]) => keys.map((k) => DEST_BY_KEY[k]?.label ?? k).join(", ");

export const useStore = create<RelayStore>()(
  persist(
    (set, get) => {
      const backend: MockBackend = {
        employments() {
          const s = get();
          const out: Record<string, Employment> = {};
          for (const [employmentId, employeeId] of Object.entries(employmentIndex())) {
            const rec = recordsFor(s.patches).byId.get(employeeId)!;
            out[employmentId] = {
              id: employmentId,
              employeeId,
              country: rec.country,
              status: s.remoteStatus[employeeId] ?? "active",
              version: s.remoteVersions[employeeId] ?? 1,
              updatedAt: s.run?.at ?? new Date().toISOString(),
            };
          }
          return out;
        },
        provisionedEntities: () => get().provisionedEntities,
        saveEmployment(e) {
          set((s) => ({ remoteVersions: { ...s.remoteVersions, [e.employeeId]: e.version }, remoteStatus: { ...s.remoteStatus, [e.employeeId]: e.status } }));
        },
        takeFailure() {
          const s = get();
          if (s.demo.credentialExpired) return "expired_credential";
          const f = s.demo.armedApiFailure;
          if (f) set({ demo: { ...s.demo, armedApiFailure: null } });
          return f;
        },
        log(entry) {
          set((s) => ({ apiLog: [...s.apiLog, entry].slice(-300) }));
        },
        incentiveDetails(input) {
          const s = get();
          const rec = recordsFor(s.patches).byId.get(input.employeeId);
          return {
            employeeName: rec?.values["employee.full_name"] ?? "Unknown",
            country: rec?.country ?? null,
            checks: validateIncentive(input, { recordsById: recordsFor(s.patches).byId, periods: s.periods, terminated: new Set(Object.keys(s.terminated)), existing: s.incentives }),
          };
        },
      };
      const client: RemoteClient = new MockRemoteClient(backend, 120);
      const bulkClient: RemoteClient = new MockRemoteClient(backend, 0);

      const bump = () => set((s) => ({ inputsVersion: s.inputsVersion + 1 }));
      const vctx = () => ({ mappings: get().mappings, provisionedEntities: get().provisionedEntities });

      const updateEvent = (id: string, fn: (e: SyncEvent) => SyncEvent) =>
        set((s) => ({ syncEvents: s.syncEvents.map((e) => (e.id === id ? fn(e) : e)) }));
      const stageLog = (e: SyncEvent, ok: boolean, message: string): SyncEvent => ({
        ...e,
        log: [...e.log, { stage: SYNC_STAGES[e.stage], at: new Date().toISOString(), ok, message }],
      });

      const processAndStore = (d: WebhookDelivery, force = false) => {
        const s = get();
        const outcome = processDelivery(d, {
          processedEventIds: new Set(s.processedEventIds),
          employmentToEmployee: employmentIndex(),
          now: Date.now(),
          forceFailure: force,
        });
        const next = applyOutcome(d, outcome);
        set((st) => {
          const patch: Partial<RelayStore> = {};
          if (outcome.apply) {
            patch.processedEventIds = [...st.processedEventIds, outcome.apply.eventId];
            const emp = outcome.apply.employeeId;
            if (emp && outcome.apply.type.startsWith("employment.")) {
              patch.remoteVersions = { ...st.remoteVersions, [emp]: (st.remoteVersions[emp] ?? 1) + 1 };
            }
          }
          const exists = st.deliveries.some((x) => x.deliveryId === d.deliveryId);
          patch.deliveries = exists ? st.deliveries.map((x) => (x.deliveryId === d.deliveryId ? next : x)) : [...st.deliveries, next];
          return patch;
        });
        return next;
      };

      return {
        ...buildInitialState(),
        assistantOpen: false,
        controlsOpen: false,
        toast: null,

        setUi: (p) => set(p),
        notify: (message, tone = "ok") => set({ toast: { id: uid("t"), message, tone } }),
        log: (kind, message) => set((s) => ({ activity: [{ id: uid("a"), at: new Date().toISOString(), kind, message }, ...s.activity].slice(0, 80) })),

        updateDiscovery: (fn) => {
          set((s) => ({ discovery: fn(s.discovery) }));
        },

        setMappingCountry: (c) => set({ mappingCountry: c }),

        setMapping: (country, mapping, note) => {
          set((s) => ({ mappings: { ...s.mappings, [country]: { ...s.mappings[country], [mapping.destKey]: { ...mapping, updatedAt: new Date().toISOString() } } } }));
          bump();
          get().log("mapping", note ?? `Mapping changed: ${country} ${mapping.destKey} <- ${mapping.source ?? "(none)"}`);
        },

        applyMappings: (country, list, note) => {
          if (list.length === 0) return;
          set((s) => {
            const cm = { ...s.mappings[country] };
            for (const m of list) cm[m.destKey] = { ...cm[m.destKey], ...m, updatedAt: new Date().toISOString() };
            return { mappings: { ...s.mappings, [country]: cm } };
          });
          bump();
          get().log("mapping", note);
        },

        validateNow: () => {
          const s = get();
          const run = runValidation(vctx(), recordsFor(s.patches).records, s.inputsVersion);
          set({ run });
          get().log("validation", `Onboarding validation run: ${run.summary.ready.toLocaleString()} of ${run.summary.total.toLocaleString()} ready`);
        },

        requestInfo: (employeeId) => {
          set((s) => ({ requested: { ...s.requested, [employeeId]: new Date().toISOString() } }));
          get().log("validation", `Customer information requested for ${employeeId}`);
        },

        resolveCustomerIssues: (ids) => {
          const s = get();
          const { byId } = recordsFor(s.patches);
          const patches = { ...s.patches };
          let fixed = 0;
          for (const id of ids) {
            const rec = byId.get(id);
            if (!rec) continue;
            const v = validateEmployee(rec, vctx());
            const merged: Record<string, string> = {};
            for (const issue of v.issues) Object.assign(merged, simulatedCustomerFix(rec, issue, s.mappings[rec.country]) ?? {});
            if (Object.keys(merged).length) {
              patches[id] = { ...(patches[id] ?? {}), ...merged };
              fixed++;
            }
          }
          if (fixed) {
            const requested = { ...s.requested };
            ids.forEach((id) => delete requested[id]);
            set({ patches, requested });
            bump();
            get().log("validation", `Customer supplied corrected data for ${fixed} worker${fixed === 1 ? "" : "s"} (simulated)`);
          }
          return fixed;
        },

        provisionEntity: async (code) => {
          const entity = LEGAL_ENTITIES.find((e) => e.code === code);
          try {
            await client.listLegalEntities();
            set((s) => ({ provisionedEntities: { ...s.provisionedEntities, [code]: true } }));
            bump();
            get().log("config", `Legal entity configured for payroll: ${entity?.name} (simulated write)`);
            get().notify(`${entity?.name} configured. Re-run validation to update worker status.`);
          } catch (e) {
            get().notify(e instanceof Error ? `${e.message}` : "Request failed", "error");
          }
        },

        startSnapshot: () => {
          set({ snapshot: { status: "running", pagesFetched: 0, totalPages: 24, fetched: 0, normalized: 0, rejected: 0 } });
          get().log("sync", "Snapshot load started: GET /v1/employments-equivalent pages from AcmeHR, 100 per page");
        },

        tickSnapshot: () => {
          const s = get();
          if (s.snapshot.status !== "running" || s.syncPaused) return;
          const { records } = recordsFor(s.patches);
          const page = s.snapshot.pagesFetched;
          const slice = records.slice(page * 100, page * 100 + 100);
          let ok = 0;
          for (const r of slice) if (validateEmployee(r, vctx()).status === "ready") ok++;
          const pagesFetched = page + 1;
          const done = pagesFetched >= s.snapshot.totalPages;
          set({
            snapshot: {
              ...s.snapshot,
              pagesFetched,
              fetched: s.snapshot.fetched + slice.length,
              normalized: s.snapshot.normalized + ok,
              rejected: s.snapshot.rejected + (slice.length - ok),
              status: done ? "done" : "running",
              finishedAt: done ? new Date().toISOString() : undefined,
            },
          });
          if (done) {
            const snap = get().snapshot;
            get().log("sync", `Snapshot complete: ${snap.normalized.toLocaleString()} normalized, ${snap.rejected} rejected`);
          }
        },

        createSyncEvent: (type, employeeId) => {
          const s = get();
          const { records, byId } = recordsFor(s.patches);
          const start = (s.seq * 211 + 7) % records.length;
          const rotated = [...records.slice(start), ...records.slice(0, start)];
          const rec = (employeeId && byId.get(employeeId)) || rotated.find((r) => !s.run?.nonReady[r.id] && !s.terminated[r.id]) || records[0];
          const { patch, description } = buildChange(type, rec, s.seq);
          const previous = Object.fromEntries(Object.keys(patch).filter((k) => !k.startsWith("__")).map((k) => [k, rec.values[k] ?? null]));
          const sourcePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => !k.startsWith("__")));
          const now = new Date().toISOString();
          const event: SyncEvent = {
            id: uid("sync"),
            employeeId: rec.id,
            employeeName: rec.values["employee.full_name"] ?? rec.id,
            type,
            patch: { ...patch, __previous: JSON.stringify(previous) },
            description,
            stage: 1,
            status: "queued",
            attempts: 0,
            log: [{ stage: SYNC_STAGES[0], at: now, ok: true, message: description }],
            createdAt: now,
          };
          set({
            seq: s.seq + 1,
            syncEvents: [event, ...s.syncEvents].slice(0, 60),
            patches: Object.keys(sourcePatch).length ? { ...s.patches, [rec.id]: { ...(s.patches[rec.id] ?? {}), ...sourcePatch } } : s.patches,
            terminated: type === "employee.terminated" ? { ...s.terminated, [rec.id]: true } : s.terminated,
          });
          if (Object.keys(sourcePatch).length) bump();
          get().log("sync", `AcmeHR change captured: ${type} for ${event.employeeName}`);
        },

        advanceSync: async (id) => {
          if (inflight.has(id)) return;
          const e0 = get().syncEvents.find((e) => e.id === id);
          if (!e0 || e0.status === "completed" || e0.status === "failed") return;
          inflight.add(id);
          try {
            const s = get();
            const current = recordsFor(s.patches).byId.get(e0.employeeId)!;
            const previous = JSON.parse(e0.patch.__previous ?? "{}") as Record<string, string | null>;
            const before = applyPatch(current, previous);
            const change = Object.fromEntries(Object.entries(e0.patch).filter(([k]) => k !== "__previous"));
            let e: SyncEvent = { ...e0, status: "processing" };

            switch (e.stage) {
              case 1:
                e = stageLog(e, true, `Fetched delta for ${e.employeeId}: ${Object.keys(change).filter((k) => !k.startsWith("__")).length || 1} changed field(s)`);
                break;
              case 2: {
                const diff = destinationDiff(before, change, s.mappings[current.country]);
                e = stageLog(e, true, diff.length ? `${diff.length} destination field(s) changed: ${diff.map((d) => d.label).join(", ")}` : "No mapped destination fields changed (unmapped source field)");
                break;
              }
              case 3: {
                const diffKeys = destinationDiff(before, change, s.mappings[current.country]).map((d) => d.destKey);
                const v = validateEmployee(current, vctx());
                const relevant = v.issues.filter((i) => diffKeys.includes(i.destKey));
                if (relevant.length) {
                  e = stageLog(e, false, relevant.map((i) => i.message).join(" "));
                  e = { ...e, status: "failed", error: { status: 422, code: "validation_failed", message: `Validation failed: ${remainingFieldsLabel(relevant.map((i) => i.destKey))}` } };
                  updateEvent(id, () => e);
                  get().log("failure", `Sync blocked by validation for ${e.employeeName}`);
                  return;
                }
                e = stageLog(e, true, v.status === "ready" ? "Record passes country schema" : `Changed fields valid; record has ${v.issues.length} pre-existing issue(s)`);
                break;
              }
              case 4: {
                e = { ...e, attempts: e.attempts + 1 };
                try {
                  const fields = Object.fromEntries(Object.entries(change).filter(([k]) => !k.startsWith("__")));
                  if (change.__status) fields.__status = change.__status;
                  const res = await client.updateEmployment(employmentIdFor(e.employeeId), fields);
                  e = stageLog(e, true, `PATCH accepted (simulated). Destination version ${res.version}`);
                } catch (err) {
                  const apiErr = err instanceof RemoteApiError ? err : new RemoteApiError(500, "unknown", String(err));
                  const retryAfterMs = apiErr.headers["x-ratelimit-reset"] ? Number(apiErr.headers["x-ratelimit-reset"]) : undefined;
                  e = stageLog(e, false, `${apiErr.status} ${apiErr.code}: ${apiErr.message}`);
                  e = { ...e, status: "failed", error: { status: apiErr.status, code: apiErr.code, message: apiErr.message, retryAfterMs } };
                  updateEvent(id, () => e);
                  get().log("failure", `Remote adapter error ${apiErr.status} for ${e.employeeName}`);
                  return;
                }
                break;
              }
              case 5: {
                const type: WebhookEventType = change.__status ? "employment.status.updated" : "employment.updated";
                const d = get().deliverWebhook({ type, employeeId: e.employeeId, source: "sync" });
                e = stageLog(e, d.result === "processed", `Webhook ${type} ${d.eventId} ${d.result.replace("_", " ")}`);
                break;
              }
              case 6:
                e = stageLog(e, true, "Source and destination match after reconciliation");
                break;
            }
            const nextStage = e.stage + 1;
            const done = nextStage >= SYNC_STAGES.length;
            e = { ...e, stage: nextStage, status: done ? "completed" : "processing", completedAt: done ? new Date().toISOString() : undefined, error: undefined };
            updateEvent(id, () => e);
            if (done) get().log("sync", `Sync completed: ${e.type} for ${e.employeeName}`);
          } finally {
            inflight.delete(id);
          }
        },

        replaySyncEvent: (id) => {
          const e = get().syncEvents.find((x) => x.id === id);
          if (!e) return;
          updateEvent(id, (x) => ({ ...x, status: "queued", error: undefined, log: [...x.log, { stage: SYNC_STAGES[x.stage], at: new Date().toISOString(), ok: true, message: "Replay requested" }] }));
          get().log("retry", `Replaying sync event for ${e.employeeName}`);
        },

        setSyncPaused: (p) => {
          set({ syncPaused: p });
          get().log("sync", p ? "Sync paused" : "Sync resumed");
        },

        runReconciliation: () => {
          const s = get();
          const run = runValidation(vctx(), recordsFor(s.patches).records, s.inputsVersion);
          set({ reconciledAt: new Date().toISOString(), run });
          get().log("sync", `Full reconciliation: ${run.summary.total.toLocaleString()} records compared, ${(run.summary.total - run.summary.ready).toLocaleString()} drifted or blocked`);
        },

        deliverWebhook: (input) => {
          const d = buildDelivery({
            eventId: input.eventId ?? uid("evt"),
            type: input.type,
            employeeId: input.employeeId,
            employmentId: input.employmentId,
            timestampMs: Date.now(),
            scenario: input.scenario,
            source: input.source ?? "demo",
          });
          const out = processAndStore(d);
          get().log("webhook", `Webhook ${input.type} ${out.result.replace("_", " ")}`);
          return out;
        },

        replayDelivery: (deliveryId) => {
          const d = get().deliveries.find((x) => x.deliveryId === deliveryId);
          if (!d) return;
          const out = processAndStore(d, get().demo.forceWebhookFailure);
          get().log("retry", `Replayed ${d.type} (${d.eventId}): ${out.result.replace("_", " ")}`);
          get().notify(out.result === "processed" ? "Event reprocessed successfully" : `Replay result: ${out.result.replace("_", " ")}`, out.result === "processed" ? "ok" : "warn");
        },

        replayAllRetryable: () => {
          const list = get().deliveries.filter(isRetryable);
          list.forEach((d) => processAndStore(d, get().demo.forceWebhookFailure));
          if (list.length) get().log("retry", `Replayed ${list.length} retryable webhook deliveries`);
          return list.length;
        },

        closeDelivery: (deliveryId, result) => {
          set((s) => ({
            deliveries: s.deliveries.map((d) =>
              d.deliveryId === deliveryId
                ? { ...d, result, steps: [...d.steps, { name: "Manual action", status: "ok", detail: result === "ignored" ? "Ignored by operator" : "Resolved by operator" }] }
                : d,
            ),
          }));
          get().log("webhook", `Delivery ${deliveryId} marked ${result}`);
        },

        toggleSubscription: (type) => {
          set((s) => ({ subscriptions: s.subscriptions.map((x) => (x.eventType === type ? { ...x, enabled: !x.enabled } : x)) }));
          const sub = get().subscriptions.find((x) => x.eventType === type);
          get().log("config", `Webhook subscription ${type} ${sub?.enabled ? "enabled" : "disabled"}`);
        },

        createIncentive: async (input, opts) => {
          const s = get();
          const { byId } = recordsFor(s.patches);
          const checks = validateIncentive(input, { recordsById: byId, periods: s.periods, terminated: new Set(Object.keys(s.terminated)), existing: s.incentives });
          const rec = byId.get(input.employeeId.trim());
          const base: Incentive = {
            ...input,
            id: uid("inc"),
            employeeName: rec?.values["employee.full_name"] ?? (input.employeeId || "Missing ID"),
            country: rec?.country ?? null,
            status: "rejected",
            checks,
            createdAt: new Date().toISOString(),
            amountMinor: Math.round(input.amount * 100),
          };
          if (!allPass(checks)) {
            // Invalid incentives are recorded for audit but never enter the payroll queue.
            set((st) => ({ incentives: [base, ...st.incentives] }));
            if (!opts?.bulk) get().log("payroll", `Incentive rejected for ${base.employeeName}: ${checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`);
            return base;
          }
          try {
            const created = await (opts?.bulk ? bulkClient : client).createIncentive(input);
            const queued: Incentive = { ...created, checks, status: "queued" };
            set((st) => ({ incentives: [queued, ...st.incentives] }));
            if (!opts?.bulk) get().log("payroll", `Payroll incentive created: ${input.type} ${input.amount.toLocaleString()} ${input.currency} for ${queued.employeeName}`);
            return queued;
          } catch (err) {
            const msg = err instanceof RemoteApiError ? `${err.status} ${err.message}` : String(err);
            const failed: Incentive = { ...base, status: "validated" };
            if (!opts?.bulk) get().notify(`Validated but not sent: ${msg}. Retry from the incentive list.`, "error");
            set((st) => ({ incentives: [failed, ...st.incentives] }));
            return failed;
          }
        },

        cancelIncentive: (id) => {
          set((s) => ({ incentives: s.incentives.map((i) => (i.id === id ? { ...i, status: "cancelled" } : i)) }));
          get().log("payroll", "Incentive cancelled and removed from the payroll queue");
        },

        promotePattern: () => {
          const s = get();
          const records = recordsFor(s.patches).records;
          const heads = entityHeadcount(records);
          const blocked = LEGAL_ENTITIES.filter((e) => !(s.provisionedEntities[e.code] ?? e.provisioned) && heads[e.code] > 0).length;
          const pattern = generatePattern({
            mappings: s.mappings,
            subscriptions: s.subscriptions,
            summary: s.run?.summary ?? null,
            nonReady: s.run?.nonReady ?? {},
            deliveries: s.deliveries,
            discovery: s.discovery,
            snapshot: s.snapshot,
            incentives: s.incentives,
            blockedEntityCount: blocked,
            credentialExpired: s.demo.credentialExpired,
            reconciled: !!s.reconciledAt,
            previousVersion: s.patterns[0]?.version,
          });
          set({ patterns: [pattern, ...s.patterns] });
          get().log("pattern", `Promoted to reusable pattern: ${pattern.name} v${pattern.version}`);
        },

        createFeedback: (input) => {
          const rec: FeedbackRecord = { ...input, id: uid("fb"), createdAt: new Date().toISOString(), priority: priorityScore(input.scores) };
          set((s) => ({ feedback: [rec, ...s.feedback] }));
          get().log("feedback", `Product feedback record created: ${rec.title} (${rec.priority.tier})`);
        },

        setDemo: (p) => set((s) => ({ demo: { ...s.demo, ...p } })),

        triggerDemo: (key) => {
          const s = get();
          const { records } = recordsFor(s.patches);
          const pick = (country: CountryCode, offset: number) => records.filter((r) => r.country === country && !s.run?.nonReady[r.id])[offset];
          const patchRecord = (id: string, p: Record<string, string | null>) => {
            set((st) => ({ patches: { ...st.patches, [id]: { ...(st.patches[id] ?? {}), ...p } } }));
            bump();
          };
          const arm = (f: ApiFailure, label: string) => {
            set({ demo: { ...get().demo, armedApiFailure: f } });
            get().log("failure", `Demo control armed: ${label} on next API call`);
          };
          switch (key) {
            case "missing_required_field": {
              const r = pick("GB", 40);
              patchRecord(r.id, { "tax.ni_number": null });
              get().log("failure", `Demo: NI number cleared for ${r.values["employee.full_name"]} in AcmeHR`);
              break;
            }
            case "invalid_country": {
              const r = pick("US", 300);
              patchRecord(r.id, { "address.country_code": "UK" });
              get().log("failure", `Demo: invalid country 'UK' on ${r.values["employee.full_name"]}`);
              break;
            }
            case "legal_entity_mismatch": {
              const r = pick("DE", 120);
              patchRecord(r.id, { "entity.code": "ACME-UK" });
              get().log("failure", `Demo: ${r.values["employee.full_name"]} assigned to the UK entity`);
              break;
            }
            case "mapping_transform_failure": {
              const m = s.mappings.GB.employment_type;
              if (m.transform.type === "lookup") {
                const table = { ...m.transform.table };
                delete table.PT;
                get().setMapping("GB", { ...m, transform: { type: "lookup", table } }, "Demo: 'PT' removed from UK employment-type lookup");
              }
              break;
            }
            case "expired_credential":
              set({ demo: { ...get().demo, credentialExpired: true } });
              get().log("failure", "Demo: destination credential expired. API calls return 401.");
              break;
            case "missing_permission":
              arm("missing_permission", "403 missing scope");
              break;
            case "rate_limit":
              arm("rate_limit", "429 rate limit");
              break;
            case "downstream_timeout":
              arm("timeout", "504 timeout");
              break;
            case "webhook_invalid_signature":
              get().deliverWebhook({ type: "employment.updated", employeeId: pick("US", 5).id, scenario: "invalid_signature" });
              break;
            case "webhook_duplicate": {
              const last = [...get().deliveries].reverse().find((d) => d.result === "processed");
              if (last) get().deliverWebhook({ type: last.type, employeeId: last.employeeId, employmentId: last.employmentId ?? undefined, eventId: last.eventId, scenario: "duplicate" });
              break;
            }
            case "unknown_employee":
              get().deliverWebhook({ type: "employment.status.updated", employeeId: null, employmentId: "emp_unlinked_9917", scenario: "unknown_employee" });
              break;
            case "invalid_currency": {
              const r = pick("US", 2);
              void get().createIncentive({ employeeId: r.id, type: "commission", amount: 1800, currency: "EUR", effectivePeriod: "2026-11", source: "Sales Compensation System" });
              break;
            }
            case "payroll_period_closed":
              set((st) => ({ periods: st.periods.map((p) => (p.period === "2026-11" ? { ...p, status: "closed" } : p)) }));
              get().log("failure", "Demo: November 2026 payroll period closed");
              break;
          }
          get().notify("Demo failure triggered", "warn");
        },

        reset: () => {
          set({ ...buildInitialState(), toast: { id: uid("t"), message: "Demo state reset", tone: "ok" } });
        },
      };
    },
    {
      name: "relay-demo-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { assistantOpen, controlsOpen, toast, ...rest } = s;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== "function")) as unknown as RelayStore;
      },
    },
  ),
);

export const countryName = (c: CountryCode) => COUNTRY_BY_CODE[c].name;
