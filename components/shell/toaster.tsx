"use client";

import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toast = useStore((s) => s.toast);
  const setUi = useStore((s) => s.setUi);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setUi({ toast: null }), 4200);
    return () => clearTimeout(t);
  }, [toast, setUi]);
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="enter fixed z-50 flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-[8px] border border-line-strong bg-surface px-3 py-2 text-[13px] shadow-[0_6px_24px_rgba(0,0,0,0.08)]"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", right: "max(16px, env(safe-area-inset-right, 0px))" }}
    >
      {toast.tone === "ok" ? <CheckCircle size={16} weight="fill" className="text-ok-fg" /> : <WarningCircle size={16} weight="fill" className={cn(toast.tone === "error" ? "text-err-fg" : "text-warn-fg")} />}
      <span>{toast.message}</span>
      <button aria-label="Dismiss" className="ml-1 text-muted hover:text-ink" onClick={() => setUi({ toast: null })}>
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
