# Architecture

```
UI (app/, components/)          reads state, calls store actions; no business logic
      │
Store (lib/store.ts)            one Zustand store, persisted to localStorage
      │                         orchestrates engines and the client; logs activity
      ├── Domain services (services/*-engine.ts, readiness.ts)   pure functions
      └── RemoteClient (services/remote-client.ts)
              ├── MockRemoteClient   Demo mode (default, always works)
              ├── McpRemoteClient    placeholder; fails clearly if used
              └── RestRemoteClient   future, server-side only
```

## Principles in code

- **Engines are pure.** Mapping, validation, webhook processing, reliability, readiness and pattern generation take inputs and return results. That keeps them unit-testable and reusable outside the UI.
- **One seam to the destination.** Every destination call goes through `RemoteClient`. The mock records each call (method, path, status, latency) and can be armed with failures from Demo controls. No component fakes API behavior inline.
- **The workforce is generated, not stored.** `data/seed.ts` builds 2,400 records from a fixed seed. State keeps only **patches** (changes made during the demo), so persistence stays small and the data stays deterministic.
- **Derived data is memoized.** `lib/derived.ts` caches patched records by reference; `lib/hooks.ts` derives readiness, mapping health, reliability, risks and lifecycle.

## Key flows

**Mapping → validation.** `setMapping` bumps `inputsVersion`. The onboarding page compares it with the last run's version and marks results stale. `validateNow` runs `validatePopulation` over patched records and stores the summary plus only the non-ready results.

**Change event (snapshot + event stream).** `createSyncEvent` patches the AcmeHR record and queues an event. The shell's runner advances one stage per tick:
`Captured → Source adapter → Mapping (destination diff) → Validation (only changed fields block) → Remote adapter (PATCH via client; 401/403/429/504 fail the event) → Webhook confirmation (a real delivery through the webhook engine) → Reconciliation`.
A failed event keeps its stage; **Replay** resumes from there.

**Webhook receiver.** `processDelivery`: verify signature → parse (Zod) → dedupe on `event_id` → resolve employment to the AcmeHR worker → process → reconcile. Transient scenarios fail the first attempt and succeed on replay; signature, payload and unknown-employee failures do not. Only an `apply` outcome changes state, and only once per `event_id`.

**Reliability.** Sync success = ready ÷ attempted (blocked entities are not attempted), per country and overall, from the last run. Webhook success excludes duplicates. Root cause = the most frequent failing field among a country's failing records, mapped to a recommendation.

**Pattern.** `generatePattern` classifies every country mapping as reusable, configurable (country rules, fallbacks), customer-specific (custom fields, entity codes) or unsupported (required with no source). It collects edge cases from the last run, from fixes made (province, mobile fallback) and from observed webhook scenarios. The 18-step checklist is evaluated against live state. Versions increment on each promotion.

**Feedback.** Acme's observations are derived from live state (blocked entity, tax-field issues, replays, auth failures); the other three customers are fixed. Issues seen in two or more customers become insights, which convert into scored feedback records.

## Integration architecture decisions (also shown in-app)

| Decision | Choice |
| --- | --- |
| Authentication | Customer API token, environment-bound, server-side only |
| Sync model | Snapshot + event stream; nightly full reconciliation |
| Source of truth | AcmeHR for identity, job, address; destination for employment status and payroll results |
| Idempotency | Forward: hash(employee_id, change_id). Reverse: `event_id` |
| Retries | Exponential from 30 s, ×2, max 5; 429 waits `x-ratelimit-reset` ms |
| PII | IDs masked in UI and messages; synthetic data only in Demo mode |
| Observability | Per-stage logs, API call log, metrics by country and failure category |

## Testing

`tests/domain.test.ts` covers transformations, country validation, suggestions, dedupe, signatures, retry policy, readiness, root cause, pattern generation and prioritization. `tests/integration.test.ts` drives the store end to end: mapping → validation, change → webhook → version, failure → replay, commission → payroll queue, implementation → pattern, insight → feedback, expired credential → 401.
