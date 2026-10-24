# Relay

**An integration delivery workbench for global employment.** Relay takes one customer from "we need to connect our HR and payroll systems to Remote" to "the integration is mapped, validated, operational, observable, and reusable for the next customer."

> Portfolio concept. **Not affiliated with or endorsed by Remote.** No production Remote data is included. Every person, company and number in the app is synthetic and fictional.

## Why it exists

Enterprise HR and payroll integrations are rarely a simple API connection. Each customer brings a different HRIS, schema, set of legal entities, custom fields and definition of success. The hard question is not "how do we call an API?" It is "how do we turn a messy customer environment into a reliable, supportable integration without redesigning the solution every time?"

Relay explores the answer: treat each engagement as the raw material for a reusable product capability. The best integration team does not solve the same problem twice.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 37 unit + integration tests (Vitest)
npm run typecheck
npm run lint
```

Demo state is kept in the browser (localStorage). Use **Demo controls → Reset demo state** to start over.

## What is real and what is simulated

| Real (implemented logic) | Simulated |
| --- | --- |
| Product design and the full delivery workflow | Remote REST responses (`MockRemoteClient`; no network calls) |
| Integration architecture and the `RemoteClient` seam | Remote employee and customer data (2,400 generated fictional workers) |
| Mapping engine: 8 transformation types, coverage, suggestions | The destination country schemas (modelled on Remote's country form pattern) |
| Validation engine: country rules, entities, ownership routing | Payroll calculations (none are done; impact views show illustrative gross only) |
| Webhook pipeline: signature check, dedupe on `event_id`, retries | Employment compliance decisions |
| Reliability metrics, root-cause analysis | Webhook signature digest (FNV stand-in for HMAC-SHA256, same base string) |
| Readiness scoring, reusable-pattern generation, feedback prioritization | The three non-Acme customers and their implementation history |

The **Build Assistant** is rule-based. It reads live app state and cites what it read; it makes no model call in Demo mode and never changes anything.

**MCP mode** is a documented placeholder (`services/mcp-remote-client.ts`). The Remote MCP server authenticates through the editor host, so a browser app cannot call it. Relay never requires MCP to function.

## Demo script (about 10 minutes)

1. **Overview.** Acme Global wants to connect AcmeHR to a global employment and payroll platform across four countries. 1,932 of 2,400 workers are ready; Canada is fully blocked.
2. **Customer Discovery.** Readiness starts at 68% ("Integration design incomplete"). Tick "Payroll calendars confirmed" and watch it move.
3. **Data Mapping.** Switch US → Canada. Canada requires a province, SIN and tax job category. The suggestion panel proposes `address.province_code → state_or_province` at 94%. Review and confirm. Switch to Germany and accept the mobile-number fallback.
4. **Onboarding.** The page says inputs changed. Click **Validate population**: 2,361 ready, 27 customer action, 8 schema errors, 4 entity blockers. Open **Anna Müller**: she moved from Customer action to Ready.
5. **Sync.** Run the snapshot, then trigger an employee update and watch it pass each stage to reconciliation.
6. **Webhook Center.** Filter to *Duplicate ignored* and open one: same `event_id`, state changed once. Replay the retry queue.
7. **Reliability.** Canada sits at 95.5% because 18 workers lack `tax_job_category` (90% of Canadian failures). The recommendation names the fix.
8. **Payroll.** Create Priya Sharma's USD 3,250 November commission. It enters the payroll queue. Try EUR: rejected, never queued.
9. **Reusable Patterns.** Promote to a reusable pattern. Counts, edge cases (including the province lesson) and the 18-step checklist come from the work just done.
10. **Product Feedback.** Legal-entity configuration shows up in 3 of 4 implementations. Create a feedback record and see it scored P0 or P1.

Close: *Relay demonstrates how a one-off customer integration can become a repeatable platform capability.*

Use **Demo controls** (Shift+D) to trigger any of 13 failure scenarios live: expired credential, missing scope, 429, timeout, invalid signature, duplicate webhook, unknown employee, transformation failure, closed payroll period and more.

## Repository map

```
app/            one route per stage (overview … feedback), plus sync/webhooks and reliability
components/     ui primitives, shell (nav, assistant, demo controls), feature components
domain/         types: employment, mapping, integration, webhook, payroll, pattern
services/       engines (mapping, validation, sync, webhook, reliability, readiness, pattern,
                payroll, report, feedback, assistant) and the RemoteClient implementations
data/           countries, legal entities, source and destination schemas, seeded workforce
lib/            store (Zustand), initial state, derived selectors, hooks, demo controls
tests/          domain and integration tests
```

See [ARCHITECTURE.md](ARCHITECTURE.md) and [ASSUMPTIONS.md](ASSUMPTIONS.md).

## Source material

- Remote public developer documentation (developer.remote.com): environments, token types, error codes, money encoding, webhook signing, country forms.
- Remote's `remote-for-ai` repository and the Remote MCP / agent skills (Claude Code plugin).
- The supplied API research behind the PRD.

## Case study outline

- **Problem:** enterprise integrations become bespoke and hard to scale.
- **Hypothesis:** a structured workbench turns customer-specific delivery into reusable capability.
- **Key decisions:** country-aware schemas; snapshot plus event-driven sync; failure-first reliability UX; reusable implementation patterns; product-feedback aggregation.
- **Technical depth:** mappings and transformations, environment-bound auth, webhooks with signature checks and idempotency, retries with backoff, observability, payroll inputs.
- **AI usage:** Claude Code for architecture, implementation, debugging and tests; a contextual rule-based assistant in the product.
- **What I would validate with Remote:** the real implementation workflow; real payload complexity; the relative frequency of failure types; which patterns are truly reusable; where Remote Build ends and Professional Services and core Product begin.
