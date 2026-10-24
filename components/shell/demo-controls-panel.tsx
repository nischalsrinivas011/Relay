"use client";

import { Flask } from "@phosphor-icons/react";
import { useState } from "react";
import { DEMO_CONTROLS } from "@/lib/demo-controls";
import { useStore } from "@/lib/store";
import { Button, Drawer } from "@/components/ui/primitives";
import { Chip } from "@/components/ui/status";

export function DemoControlsPanel() {
  const open = useStore((s) => s.controlsOpen);
  const setUi = useStore((s) => s.setUi);
  const trigger = useStore((s) => s.triggerDemo);
  const demo = useStore((s) => s.demo);
  const setDemo = useStore((s) => s.setDemo);
  const reset = useStore((s) => s.reset);
  const [confirmReset, setConfirmReset] = useState(false);
  const groups = ["Data", "API", "Webhooks", "Payroll"] as const;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => setUi({ controlsOpen: o })}
      title={
        <span className="inline-flex items-center gap-2">
          <Flask size={16} weight="bold" aria-hidden /> Demo controls
        </span>
      }
      description="Presenter tools. Each trigger changes demo state so the failure appears where it would in a real engagement."
      footer={
        confirmReset ? (
          <>
            <span className="mr-auto self-center text-[12.5px] text-muted">Discard all changes made in this demo?</span>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Keep changes
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              Reset demo
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Reset demo state
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {demo.credentialExpired && <Chip tone="err">Credential expired</Chip>}
        {demo.armedApiFailure && <Chip tone="warn">Armed: {demo.armedApiFailure.replace("_", " ")}</Chip>}
        {demo.forceWebhookFailure && <Chip tone="warn">Webhook replays forced to fail</Chip>}
      </div>
      {demo.credentialExpired && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[8px] border border-line bg-surface-2 p-3 text-[13px]">
          <span>Issue a new sandbox token to clear the 401s.</span>
          <Button size="sm" variant="primary" onClick={() => setDemo({ credentialExpired: false })}>
            Re-issue token
          </Button>
        </div>
      )}
      <label className="mb-5 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={demo.forceWebhookFailure} onChange={(e) => setDemo({ forceWebhookFailure: e.target.checked })} />
        Make webhook replays keep failing (shows exhausted retries)
      </label>
      {groups.map((g) => (
        <section key={g} className="mb-5">
          <p className="label-caps mb-2">{g}</p>
          <ul className="divide-y divide-line rounded-[8px] border border-line">
            {DEMO_CONTROLS.filter((c) => c.group === g).map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{c.label}</p>
                  <p className="text-[12px] text-muted">{c.effect}</p>
                </div>
                <Button size="sm" onClick={() => trigger(c.key)}>
                  Trigger
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Drawer>
  );
}
