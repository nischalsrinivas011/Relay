# Assumptions

Where the PRD or public sources were silent, Relay chose a clearly labeled simulation over an invented contract.

## About Remote (taken from public docs; not verified against a live account)

- Production (`gateway.remote.com`) and sandbox (`gateway.remote-sandbox.com`) gateways are separate; `ra_live_` and `ra_test_` customer tokens are environment-bound and a mismatch returns 401.
- 403 means a missing scope; 422 means schema validation; 429 carries `x-ratelimit-reset` as a duration in milliseconds, with no `Retry-After`.
- Money is sent as integer minor units (×100), including for zero-decimal currencies.
- Country codes in the API are ISO 3166-1 alpha-3.
- Webhook signatures are HMAC-SHA256 hex over `raw_body + ":" + timestamp_ms` in `X-Remote-Signature`.
- Country-specific employment fields come from JSON-Schema forms per country.

## Simulated, and labeled as such in code and UI

- **Destination schemas.** Field keys such as `tax_job_category` or `personal_details.ni_number` are illustrative, not Remote's published contract.
- **Webhook payload.** A flat envelope (`event_id`, `event_type`, `employment_id`, `occurred_at`, `data`). Event type names follow Remote's documented families.
- **Signature digest.** Same base string as Remote's scheme, but an FNV-based digest so the demo needs no secret or Web Crypto.
- **API paths** in the call log mirror Remote naming for orientation only. Legal entities, reports and `/me` paths are marked "(simulated)".
- **Retry policy** (30 s base, ×2, 5 attempts) is a Relay design choice. In the demo, replays are triggered by the operator; nothing retries on a timer.
- **Readiness weights**, priority formula and the "5 → 1.5 implementation units" value are illustrative product targets, not measurements.
- **Reliability baselines** (24h volume, latency trend, manual-intervention history) are seeded synthetic series. Live points are computed from demo actions.
- **Payroll impact** shows illustrative gross only. No tax, deduction or net-pay calculation exists.

## Product assumptions

- Acme uses Global Payroll on its own entities in all four countries, so legal-entity eligibility matters (it would not for EOR).
- Mappings are per country. A single global mapping cannot express "US state field, Canadian province field."
- A worker's status takes the most severe issue: unsupported > legal-entity blocked > schema error > customer action > ready.
- Issues are routed to an owner: customer (missing or wrong data), integration (mapping), configuration (entities).
- "Mark resolved" simulates the customer correcting data in AcmeHR; it patches the source record, never the destination.
- Onboarding shows the **last validation run**; changes after it mark the run stale until it is re-run. The overview uses the same run.
- Dataset shape: 1,200 US, 450 CA, 400 UK, 350 DE. After the two demo mapping fixes: 2,361 ready, 27 customer action, 8 schema errors, 4 entity blockers.

## Security

- No credentials exist in Demo mode. `.env.example` documents where a real token would go: server-side only, never `NEXT_PUBLIC_`.
- National identifiers are masked in validation messages; no full personal data is logged.
- All synthetic people are fictional. Emails use the reserved `.example` domain; phone numbers use fictional ranges (`555`, Ofcom drama range); NI numbers use the `QQ` example prefix.
- Any write to the destination (for example, configuring a legal entity) requires an explicit confirm step, even in Demo mode.
