"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/sync", label: "HRIS sync" },
  { href: "/sync/webhooks", label: "Webhook event center" },
  { href: "/reliability", label: "Reliability center" },
];

export function OpsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Sync and reliability sections" className="mb-5 flex gap-1 border-b border-line">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] font-medium", active ? "border-ink-strong text-ink-strong" : "border-transparent text-muted hover:text-ink")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
