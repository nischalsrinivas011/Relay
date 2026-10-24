"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

/** Drives the sync pipeline and snapshot load from the shell, so work continues across pages. */
export function Runners() {
  useEffect(() => {
    const t = setInterval(() => {
      const s = useStore.getState();
      if (s.syncPaused) return;
      if (s.snapshot.status === "running") s.tickSnapshot();
      const next = [...s.syncEvents].reverse().find((e) => e.status === "queued" || e.status === "processing");
      if (next) void s.advanceSync(next.id);
    }, 750);
    return () => clearInterval(t);
  }, []);
  return null;
}
