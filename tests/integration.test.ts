// End-to-end flows through the store, the mock Remote client and the engines.
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { recordsFor } from "@/lib/derived";

const S = () => useStore.getState();
const anna = () => recordsFor(S().patches).records.find((r) => r.values["employee.full_name"] === "Anna Müller")!;

async function runSync(id: string) {
  for (let i = 0; i < 10; i++) {
    const e = S().syncEvents.find((x) => x.id === id)!;
    if (e.status === "completed" || e.status === "failed") return e;
    await S().advanceSync(id);
  }
  return S().syncEvents.find((x) => x.id === id)!;
}

beforeEach(() => S().reset());

describe("customer journey", () => {
  it("discovery edits change readiness inputs", () => {
    S().updateDiscovery((d) => ({ ...d, payrollCalendarConfirmed: true }));
    expect(S().discovery.payrollCalendarConfirmed).toBe(true);
  });

  it("mapping change -> validation run moves Anna from blocked to ready", () => {
    expect(S().run!.nonReady[anna().id].status).toBe("customer_action");
    const m = S().mappings.DE["contact_details.mobile_number"];
    S().setMapping("DE", { ...m, transform: { type: "coalesce", fallback: "employee.mobile_phone" } });
    expect(S().run!.inputsVersion).not.toBe(S().inputsVersion); // stale until re-run
    S().validateNow();
    expect(S().run!.nonReady[anna().id]).toBeUndefined();
  });

  it("employee change -> pipeline -> webhook -> destination version bumps once", async () => {
    const before = S().deliveries.length;
    S().createSyncEvent("employee.updated");
    const ev = S().syncEvents[0];
    const done = await runSync(ev.id);
    expect(done.status).toBe("completed");
    expect(S().deliveries.length).toBe(before + 1);
    expect(S().deliveries.at(-1)!.result).toBe("processed");
    // Remote PATCH (v2) + webhook apply (v3)
    expect(S().remoteVersions[ev.employeeId]).toBe(3);
    const patched = recordsFor(S().patches).byId.get(ev.employeeId)!;
    expect(patched.values["job.position"]).toBe(ev.patch["job.position"]);
  });

  it("duplicate webhook does not change state twice", () => {
    S().triggerDemo("webhook_duplicate");
    const last = S().deliveries.at(-1)!;
    expect(last.result).toBe("duplicate_ignored");
    expect(S().processedEventIds.filter((id) => id === last.eventId)).toHaveLength(1);
  });

  it("API failure -> sync fails -> replay -> resolved", async () => {
    S().triggerDemo("rate_limit");
    S().createSyncEvent("address.changed");
    const id = S().syncEvents[0].id;
    const failed = await runSync(id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({ status: 429, retryAfterMs: 30000 });
    S().replaySyncEvent(id);
    const ok = await runSync(id);
    expect(ok.status).toBe("completed");
    expect(ok.attempts).toBe(2);
  });

  it("failed webhook delivery -> replay -> processed; retry queue shrinks", () => {
    const failed = S().deliveries.find((d) => d.result === "failed" && d.scenario === "processor_failure")!;
    S().replayDelivery(failed.deliveryId);
    expect(S().deliveries.find((d) => d.deliveryId === failed.deliveryId)!.result).toBe("processed");
    expect(S().replayAllRetryable()).toBe(3);
    expect(S().deliveries.filter((d) => d.result === "failed" && d.scenario === "rate_limit")).toHaveLength(0);
  });

  it("valid commission enters the payroll queue; invalid never does", async () => {
    const ok = await S().createIncentive({ employeeId: "AH-10001", type: "commission", amount: 3250, currency: "USD", effectivePeriod: "2026-11", source: "Sales Compensation System" });
    expect(ok).toMatchObject({ status: "queued", employeeName: "Priya Sharma", amountMinor: 325000 });
    const bad = await S().createIncentive({ employeeId: "AH-10001", type: "commission", amount: 3250, currency: "EUR", effectivePeriod: "2026-11", source: "test" });
    expect(bad.status).toBe("rejected");
    const closed = await S().createIncentive({ employeeId: "AH-10001", type: "commission", amount: 100, currency: "USD", effectivePeriod: "2026-10", source: "test" });
    expect(closed.status).toBe("rejected");
    expect(S().incentives.filter((i) => i.status === "queued")).toHaveLength(1);
  });

  it("implementation -> reusable pattern reflects the fixes made", () => {
    const m = S().mappings.CA["address_details.state_or_province"];
    S().setMapping("CA", { ...m, source: "address.province_code" });
    S().promotePattern();
    const p = S().patterns[0];
    expect(p.version).toBe("1.0");
    expect(p.entries.find((e) => e.country === "CA" && e.destKey === "address_details.state_or_province")?.source).toBe("address.province_code");
    expect(p.edgeCases.some((e) => e.title.includes("Province"))).toBe(true);
    S().promotePattern();
    expect(S().patterns[0].version).toBe("1.1");
  });

  it("insight -> product feedback record with priority", () => {
    S().createFeedback({
      title: "Legal-entity configuration",
      problem: "p",
      affectedCustomers: ["Acme Global", "Globex", "Umbrella Corp"],
      frequency: "Seen in 3/4 implementations",
      customerImpact: "c",
      operationalImpact: "o",
      suggestedChange: "s",
      evidence: [],
      scores: { customerImpact: 5, feasibility: 4, operationalComplexity: 2, repeatability: 4, revenue: 4 },
    });
    expect(S().feedback[0].priority.tier).toBe("P0");
  });

  it("expired credential blocks API writes with 401", async () => {
    S().triggerDemo("expired_credential");
    S().createSyncEvent("custom_field.changed");
    const e = await runSync(S().syncEvents[0].id);
    expect(e.error?.status).toBe(401);
  });
});

describe("payroll idempotency", () => {
  beforeEach(() => S().reset());
  it("rejects an identical incentive already in the queue", async () => {
    const input = { employeeId: "AH-10001", type: "commission" as const, amount: 3250, currency: "USD", effectivePeriod: "2026-11", source: "Sales Compensation System" };
    expect((await S().createIncentive(input)).status).toBe("queued");
    const again = await S().createIncentive(input);
    expect(again.status).toBe("rejected");
    expect(again.checks.find((c) => c.name === "Not a duplicate")?.ok).toBe(false);
    expect(S().incentives.filter((i) => i.status === "queued")).toHaveLength(1);
  });
});
