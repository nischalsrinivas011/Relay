"use client";

import {
  ArrowsLeftRight,
  ChartBar,
  ChatCenteredText,
  ClipboardText,
  Flask,
  List,
  Money,
  Pulse,
  Sparkle,
  SquaresFour,
  Stack,
  TreeStructure,
  UserCheck,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button, Kbd } from "@/components/ui/primitives";
import { AssistantPanel } from "./assistant-panel";
import { DemoControlsPanel } from "./demo-controls-panel";
import { Runners } from "./runners";
import { Toaster } from "./toaster";

export const NAV: { href: string; label: string; icon: Icon; match: string[] }[] = [
  { href: "/overview", label: "Overview", icon: SquaresFour, match: ["/overview"] },
  { href: "/discovery", label: "Customer Discovery", icon: ClipboardText, match: ["/discovery"] },
  { href: "/architecture", label: "Architecture", icon: TreeStructure, match: ["/architecture"] },
  { href: "/mapping", label: "Data Mapping", icon: ArrowsLeftRight, match: ["/mapping"] },
  { href: "/onboarding", label: "Onboarding", icon: UserCheck, match: ["/onboarding"] },
  { href: "/sync", label: "Sync & Reliability", icon: Pulse, match: ["/sync", "/reliability"] },
  { href: "/payroll", label: "Payroll", icon: Money, match: ["/payroll"] },
  { href: "/reporting", label: "Reporting", icon: ChartBar, match: ["/reporting"] },
  { href: "/patterns", label: "Reusable Patterns", icon: Stack, match: ["/patterns"] },
  { href: "/feedback", label: "Product Feedback", icon: ChatCenteredText, match: ["/feedback"] },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Implementation stages" className="flex flex-col gap-0.5 px-2">
      {NAV.map((n, i) => {
        const active = n.match.some((m) => path === m || path.startsWith(`${m}/`));
        const I = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "bg-surface font-medium text-ink-strong ring-1 ring-line" : "text-muted hover:bg-neutral-bg hover:text-ink",
            )}
          >
            <span className="tabular w-4 text-right font-mono text-[10.5px] text-muted/80">{i + 1}</span>
            <I size={16} weight={active ? "fill" : "bold"} aria-hidden />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const setUi = useStore((s) => s.setUi);
  const credentialExpired = useStore((s) => s.demo.credentialExpired);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.shiftKey && e.key.toLowerCase() === "d") setUi({ controlsOpen: !useStore.getState().controlsOpen });
      if (e.shiftKey && e.key.toLowerCase() === "a") setUi({ assistantOpen: !useStore.getState().assistantOpen });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setUi]);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-canvas py-4 lg:flex">
        <Brand />
        <div className="mt-5 flex-1 overflow-y-auto">
          <Sidebar />
        </div>
        <p className="px-4 text-[11px] leading-snug text-muted">Portfolio concept. Not affiliated with or endorsed by Remote. All people and data are fictional.</p>
      </aside>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/25" aria-label="Close navigation" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-line bg-canvas py-4" style={{ paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}>
            <Brand />
            <div className="mt-5">
              <Sidebar onNavigate={() => setMenu(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-canvas/90 py-2.5 backdrop-blur"
          style={{ top: "env(safe-area-inset-top, 0px)", paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
        >
          <Button variant="ghost" size="sm" className="lg:hidden" aria-label="Open navigation" onClick={() => setMenu(true)}>
            <List size={18} weight="bold" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink-strong">
              Acme Global <span className="font-normal text-muted">· AcmeHR → Remote Global Employment</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[11.5px] font-medium text-ink">
            <span className={cn("h-1.5 w-1.5 rounded-full", credentialExpired ? "bg-err-fg" : "bg-warn-fg")} aria-hidden />
            Demo environment · simulated Remote API
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setUi({ controlsOpen: true })} title="Demo controls (Shift+D)">
              <Flask size={15} weight="bold" aria-hidden /> Demo controls <Kbd>⇧D</Kbd>
            </Button>
            <Button variant="primary" size="sm" onClick={() => setUi({ assistantOpen: true })} title="Build Assistant (Shift+A)">
              <Sparkle size={15} weight="fill" aria-hidden /> Assistant
            </Button>
          </div>
        </header>
        <main
          className="mx-auto w-full max-w-[1320px] flex-1 py-6"
          style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
        >
          {children}
        </main>
      </div>
      <AssistantPanel />
      <DemoControlsPanel />
      <Toaster />
      <Runners />
    </div>
  );
}

function Brand() {
  return (
    <Link href="/overview" className="flex items-center gap-2 px-4">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="5" fill="var(--ink-strong)" />
        <path d="M6 15V7h4.2a2.6 2.6 0 0 1 0 5.2H6m4.2 0L14 15" stroke="var(--canvas)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="7.5" r="1.6" fill="var(--canvas)" />
      </svg>
      <span className="font-serif text-[19px] tracking-[-0.02em] text-ink-strong">Relay</span>
      <span className="ml-auto rounded-full bg-neutral-bg px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] text-neutral-fg">Concept</span>
    </Link>
  );
}
