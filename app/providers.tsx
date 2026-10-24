"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { AppShell } from "@/components/shell/app-shell";

/** Demo state lives in localStorage, so the app renders only after rehydration. */
export function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const r = useStore.persist.rehydrate();
      if (r && typeof (r as Promise<void>).then === "function") (r as Promise<void>).finally(() => setReady(true));
      else setReady(true);
    } catch {
      setReady(true);
    }
  }, []);
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-muted" role="status">
        Loading the Acme Global workspace…
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
