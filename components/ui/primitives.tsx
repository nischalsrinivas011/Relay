"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }>(
  function Button({ variant = "secondary", size = "md", className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium transition-[background,transform,color] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
          size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8.5 px-3 text-[13px]",
          variant === "primary" && "bg-action text-action-fg hover:bg-action-hover",
          variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
          variant === "ghost" && "text-ink hover:bg-neutral-bg",
          variant === "danger" && "border border-err-fg/30 bg-err-bg text-err-fg hover:border-err-fg/60",
          className,
        )}
        {...props}
      />
    );
  },
);

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-[10px] border border-line bg-surface", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, sub, actions, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageHeader({ step, title, description, actions }: { step?: string; title: string; description: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
      <div className="min-w-0 max-w-3xl">
        {step && <p className="label-caps mb-1.5">{step}</p>}
        <h1 className="font-serif text-[30px] leading-[1.1] tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[13.5px] text-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12.5px] font-medium text-ink">
      {children}
      {hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}
    </label>
  );
}

const fieldCls = "w-full rounded-[6px] border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-muted/70 focus:border-focus focus:outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldCls, "h-8.5", className)} {...p} />;
});

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldCls, "h-8.5 pr-7", className)} {...p}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldCls, "py-2 leading-relaxed", className)} {...p} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-[7px] border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-[5px] px-2.5 text-[12.5px] font-medium transition-colors",
            value === o.value ? "bg-surface text-ink-strong shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-line-strong" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ open, onOpenChange, title, description, children, footer, width = "max-w-xl" }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content
          className={cn("fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-[0_0_40px_rgba(0,0,0,0.08)] focus:outline-none", width)}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-[15px] font-semibold text-ink-strong">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-[12.5px] text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">Details</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close panel">
                <X size={16} weight="bold" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[4px] border border-line-strong bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn("font-mono text-[12px]", className)}>{children}</code>;
}

export function DemoBadge({ children = "Demo data" }: { children?: ReactNode }) {
  return <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-neutral-fg">{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {children && <div className="max-w-sm text-[12.5px] text-muted">{children}</div>}
    </div>
  );
}

export const th = "border-b border-line px-3 py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted whitespace-nowrap";
export const td = "border-b border-line px-3 py-2 align-middle";

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,40%)_1fr] gap-x-4 gap-y-2 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
