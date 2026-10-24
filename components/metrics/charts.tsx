"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Resolve theme tokens to concrete colors for SVG, and follow light/dark changes. */
export function useChartColors() {
  const read = () => {
    if (typeof window === "undefined") return { c1: "#2f3437", c2: "#1f6c9f", c3: "#b98a2f", c4: "#9f2f2d", grid: "#ecebe7", muted: "#74726d", surface: "#fff", ink: "#23272a", line: "#e9e8e4" };
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return { c1: v("--chart-1"), c2: v("--chart-2"), c3: v("--chart-3"), c4: v("--chart-4"), grid: v("--chart-grid"), muted: v("--muted"), surface: v("--surface"), ink: v("--ink"), line: v("--line-strong") };
  };
  const [c, setC] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setC(read());
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return c;
}

export function ChartFrame({ title, sub, children, height = 200 }: { title: string; sub?: string; children: ReactNode; height?: number }) {
  return (
    <figure className="min-w-0 rounded-[10px] border border-line bg-surface p-4">
      <figcaption className="mb-3">
        <p className="text-[13px] font-semibold text-ink-strong">{title}</p>
        {sub && <p className="text-[12px] text-muted">{sub}</p>}
      </figcaption>
      <div style={{ height }}>{children}</div>
    </figure>
  );
}

type Row = Record<string, string | number>;

const tooltipStyle = (c: ReturnType<typeof useChartColors>) => ({
  contentStyle: { background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, color: c.ink },
  labelStyle: { color: c.muted },
  cursor: { fill: c.grid, stroke: c.grid },
});

export function AreaTrend({ data, x, y, label, color = "c1" }: { data: Row[]; x: string; y: string; label: string; color?: "c1" | "c2" }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey={x} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} interval={3} />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip {...tooltipStyle(c)} />
        <Area type="monotone" dataKey={y} name={label} stroke={c[color]} fill={c[color]} fillOpacity={0.12} strokeWidth={1.75} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LineTrend({ data, x, y, label, unit, color = "c2" }: { data: Row[]; x: string; y: string; label: string; unit?: string; color?: "c1" | "c2" | "c3" }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey={x} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={58} unit={unit} />
        <Tooltip {...tooltipStyle(c)} />
        <Line type="monotone" dataKey={y} name={label} stroke={c[color]} strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, x, y, label, horizontal, highlightBelow, domain, unit }: { data: Row[]; x: string; y: string; label: string; horizontal?: boolean; highlightBelow?: number; domain?: [number, number]; unit?: string }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 12, bottom: 0, left: horizontal ? 8 : -12 }}>
        <CartesianGrid stroke={c.grid} horizontal={!horizontal} vertical={!!horizontal} />
        {/* Recharts only finds axes that are direct children, so no fragments here. */}
        {horizontal ? (
          <XAxis type="number" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        ) : (
          <XAxis dataKey={x} tick={{ fill: c.ink, fontSize: 11.5 }} tickLine={false} axisLine={{ stroke: c.grid }} />
        )}
        {horizontal ? (
          <YAxis type="category" dataKey={x} tick={{ fill: c.ink, fontSize: 11.5 }} tickLine={false} axisLine={false} width={150} />
        ) : (
          <YAxis tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={52} domain={domain} unit={unit} />
        )}
        <Tooltip {...tooltipStyle(c)} />
        <Bar dataKey={y} name={label} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => (
            <Cell key={i} fill={highlightBelow !== undefined && Number(d[y]) < highlightBelow ? c.c4 : c.c1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
