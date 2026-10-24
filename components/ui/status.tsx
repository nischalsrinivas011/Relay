"use client";

import {
  ArrowsClockwise,
  Buildings,
  CheckCircle,
  Circle,
  CircleDashed,
  Copy,
  MinusCircle,
  Prohibit,
  Question,
  UserCircle,
  WarningCircle,
  WarningOctagon,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { EmployeeStatus } from "@/domain/employment";
import type { Readiness } from "@/domain/integration";
import type { MappingStatus } from "@/domain/mapping";
import type { Reusability } from "@/domain/pattern";
import type { DeliveryResult } from "@/domain/webhook";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "err" | "info" | "neutral";

const toneCls: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-fg",
  warn: "bg-warn-bg text-warn-fg",
  err: "bg-err-bg text-err-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
};

export function Chip({ tone, icon: I, children, className }: { tone: Tone; icon?: Icon; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium", toneCls[tone], className)}>
      {I && <I size={13} weight="bold" aria-hidden />}
      {children}
    </span>
  );
}

const EMPLOYEE: Record<EmployeeStatus, [Tone, Icon, string]> = {
  ready: ["ok", CheckCircle, "Ready"],
  customer_action: ["warn", UserCircle, "Customer action"],
  schema_error: ["err", WarningOctagon, "Schema error"],
  legal_entity_blocked: ["err", Buildings, "Legal entity blocked"],
  unsupported: ["neutral", Prohibit, "Unsupported"],
};
export const employeeStatusLabel = (s: EmployeeStatus) => EMPLOYEE[s][2];
export function EmployeeChip({ status }: { status: EmployeeStatus }) {
  const [t, I, l] = EMPLOYEE[status];
  return <Chip tone={t} icon={I}>{l}</Chip>;
}

const MAPPING: Record<MappingStatus, [Tone, Icon, string]> = {
  mapped: ["ok", CheckCircle, "Mapped"],
  needs_transformation: ["warn", ArrowsClockwise, "Needs transformation"],
  missing_source: ["err", XCircle, "Missing source"],
  missing_destination: ["info", Question, "Missing destination"],
  customer_decision: ["info", UserCircle, "Customer decision"],
  invalid: ["err", WarningOctagon, "Invalid"],
  optional: ["neutral", MinusCircle, "Optional"],
};
export const mappingStatusLabel = (s: MappingStatus) => MAPPING[s][2];
export function MappingChip({ status }: { status: MappingStatus }) {
  const [t, I, l] = MAPPING[status];
  return <Chip tone={t} icon={I}>{l}</Chip>;
}

const DELIVERY: Record<DeliveryResult, [Tone, Icon, string]> = {
  processed: ["ok", CheckCircle, "Processed"],
  duplicate_ignored: ["neutral", Copy, "Duplicate ignored"],
  failed: ["err", WarningCircle, "Failed"],
  rejected: ["err", Prohibit, "Rejected"],
  ignored: ["neutral", MinusCircle, "Ignored"],
  resolved: ["ok", CheckCircle, "Resolved"],
};
export function DeliveryChip({ result }: { result: DeliveryResult }) {
  const [t, I, l] = DELIVERY[result];
  return <Chip tone={t} icon={I}>{l}</Chip>;
}

const READINESS: Record<Readiness, [Tone, Icon, string]> = {
  ready: ["ok", CheckCircle, "Ready"],
  partial: ["warn", CircleDashed, "Partial"],
  not_started: ["neutral", Circle, "Not started"],
  blocked: ["err", Prohibit, "Blocked"],
};
export function ReadinessChip({ status }: { status: Readiness }) {
  const [t, I, l] = READINESS[status];
  return <Chip tone={t} icon={I}>{l}</Chip>;
}

const REUSE: Record<Reusability, [Tone, string]> = {
  reusable: ["ok", "Reusable as-is"],
  configurable: ["info", "Configurable"],
  customer_specific: ["warn", "Customer-specific"],
  unsupported: ["err", "Unsupported"],
};
export function ReuseChip({ r }: { r: Reusability }) {
  return <Chip tone={REUSE[r][0]}>{REUSE[r][1]}</Chip>;
}

export function SeverityChip({ level }: { level: "Critical" | "High" | "Medium" | "Low" }) {
  const tone: Tone = level === "Critical" ? "err" : level === "High" ? "warn" : level === "Medium" ? "info" : "neutral";
  return <Chip tone={tone} icon={level === "Critical" ? WarningOctagon : WarningCircle}>{level}</Chip>;
}

export function Metric({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-[10px] border border-line bg-surface px-4 py-3", className)}>
      <p className="label-caps truncate">{label}</p>
      <p className={cn("tabular mt-1 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink-strong", tone === "err" && "text-err-fg", tone === "warn" && "text-warn-fg", tone === "ok" && "text-ok-fg")}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export function ProgressBar({ value, tone = "neutral", label }: { value: number; tone?: Tone; label: string }) {
  const color = tone === "ok" ? "bg-ok-fg" : tone === "warn" ? "bg-warn-fg" : tone === "err" ? "bg-err-fg" : "bg-ink";
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-bg">
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
