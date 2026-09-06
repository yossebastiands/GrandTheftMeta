// Performance Dashboard: visualises scanned handling.meta values as bars,
// radar, rankings and histograms — turning raw numbers into a feel at a glance.
import { useMemo, useState, type ReactNode } from "react";
import { FolderOpen, Gauge, Radar as RadarIcon, Trophy, BarChart3, Search, Sigma, TriangleAlert } from "lucide-react";
import type { ScanResult } from "../../shared/models";
import FormulaView from "./FormulaView";
import {
  PERF_METRICS,
  computePerf,
  rankOf,
  histogramEntries,
  fmtNum,
  type PerfEntry,
  type PerfSummary,
  type MetricId,
} from "./perf";

const PALETTE = ["#f97316", "#34d399", "#38bdf8", "#a78bfa", "#f472b6"];

function card(title: string, icon: ReactNode, children: ReactNode, extra?: ReactNode) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
      <header className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/80 px-3 py-2">
        <span className="text-accent">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-200">{title}</h2>
        {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Radar (pure SVG)
// ---------------------------------------------------------------------------

function Radar({ entries, scores }: { entries: PerfEntry[]; scores: Map<string, (number | null)[]> }) {
  const W = 240;
  const H = 240;
  const cx = W / 2;
  const cy = H / 2;
  const R = 92;
  const n = PERF_METRICS.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const rings = [0.25, 0.5, 0.75, 1];
  const labels = PERF_METRICS.map((m, i) => {
    const [x, y] = pt(i, R + 18);
    return { x, y, label: m.label };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-56">
      {rings.map((f) => (
        <polygon
          key={f}
          points={PERF_METRICS.map((_, i) => pt(i, R * f).join(",")).join(" ")}
          fill="none"
          stroke="#374151"
          strokeWidth={0.8}
        />
      ))}
      {PERF_METRICS.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#374151" strokeWidth={0.8} />;
      })}
      {labels.map((l) => (
        <text key={l.label} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#9ca3af">
          {l.label}
        </text>
      ))}
      {entries.map((e, ei) => {
        const sc = scores.get(e.key) ?? [];
        const points = PERF_METRICS.map((_, i) => pt(i, Math.max(2, (sc[i] ?? 0) * R)).join(",")).join(" ");
        const fill = PALETTE[ei % PALETTE.length];
        return (
          <g key={e.key}>
            <polygon points={points} fill={fill} fillOpacity={0.14} stroke={fill} strokeWidth={1.6} />
            {PERF_METRICS.map((_, i) => {
              const [x, y] = pt(i, Math.max(2, (sc[i] ?? 0) * R));
              return <circle key={i} cx={x} cy={y} r={2} fill={fill} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

interface Props {
  result: ScanResult | null;
  folder: string | null;
  onPickFolder: () => void;
  onHome: () => void;
}

export default function DashboardView({ result, folder, onPickFolder, onHome }: Props) {
  const summary = useMemo(() => computePerf(result), [result]);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [compare, setCompare] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [histMetric, setHistMetric] = useState<MetricId>("topSpeed");
  const [fType, setFType] = useState("");
  const [fClass, setFClass] = useState("");
  const [mode, setMode] = useState<"perf" | "formula">("perf");

  // Distinct type / class values with counts (filter dropdowns + type chips).
  const dims = useMemo(() => {
    const ty = new Map<string, number>();
    const cl = new Map<string, number>();
    for (const e of summary.entries) {
      const t = e.vehicleType || "—";
      const c = e.vehicleClass || "—";
      ty.set(t, (ty.get(t) ?? 0) + 1);
      cl.set(c, (cl.get(c) ?? 0) + 1);
    }
    const byCount = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { types: byCount(ty), classes: byCount(cl) };
  }, [summary.entries]);

  // Active type+class filter applied to EVERY panel below.
  const filtered = useMemo(() => {
    if (!fType && !fClass) return summary.entries;
    return summary.entries.filter(
      (e) =>
        (!fType || e.vehicleType === fType || (!e.vehicleType && fType === "—")) &&
        (!fClass || e.vehicleClass === fClass || (!e.vehicleClass && fClass === "—"))
    );
  }, [summary.entries, fType, fClass]);

  const clearFilters = () => {
    setFType("");
    setFClass("");
  };

  const selected: PerfEntry | undefined =
    filtered.find((e) => e.key === selKey) ?? filtered[0];

  const compareList = useMemo(() => {
    const list = filtered.filter((e) => compare.has(e.key));
    // Always include the main selected vehicle so compare is never empty.
    if (selected && !list.some((e) => e.key === selected.key)) list.unshift(selected);
    return list.slice(0, 5);
  }, [compare, filtered, selected]);

  const pickList = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return filtered;
    return filtered.filter((e) =>
      `${e.name} ${e.folder} ${e.vehicleType} ${e.vehicleClass}`.toLowerCase().includes(t)
    );
  }, [filtered, q]);

  // Position of the current selection within the (filtered) pick list.
  const selIdx = selected ? pickList.findIndex((e) => e.key === selected.key) : -1;
  const stepSel = (dir: number) => {
    if (pickList.length === 0) return;
    if (selIdx === -1) setSelKey(pickList[dir > 0 ? 0 : pickList.length - 1].key);
    else setSelKey(pickList[(selIdx + dir + pickList.length) % pickList.length].key);
  };

  const scoreMap = (list: PerfEntry[]) => {
    const m = new Map<string, (number | null)[]>();
    for (const e of list) {
      m.set(e.key, PERF_METRICS.map((met) => scoreOf(summary, e, met)));
    }
    return m;
  };
  const radarScores = useMemo(() => scoreMap(compareList), [compareList, summary]);

  if (!result || summary.entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-gray-950 p-8 text-center">
        <Gauge className="h-14 w-14 text-gray-700" />
        <h1 className="text-lg font-semibold text-gray-200">Performance Dashboard</h1>
        <p className="max-w-md text-sm leading-relaxed text-gray-400">
          Charts, bars and rankings built from <b>handling.meta</b> values. Scan a vehicle
          folder in the Handling editor and its performance will show up here.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onPickFolder}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
          >
            <FolderOpen className="h-4 w-4" /> Select a vehicle folder…
          </button>
          <button
            onClick={onHome}
            className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
          >
            Back to editors
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-950">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-accent" />
          <h1 className="text-sm font-semibold text-gray-100">Performance Dashboard</h1>
          <span
            title="EXPERIMENTAL — bugs are expected. The Formula tab documents the exact math this build currently uses."
            className="flex items-center gap-1 rounded-full border border-amber-400/70 bg-amber-500/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.35)] animate-pulse"
          >
            <TriangleAlert className="h-3 w-3" /> Experimental
          </span>
        </div>
        <span className="max-w-md truncate text-2xs text-gray-500" title={folder ?? undefined}>
          {folder ?? "handling.meta data"}
        </span>
        <span
          className={`rounded px-2 py-0.5 text-2xs ${
            filtered.length !== summary.entries.length ? "bg-accent/15 text-accent" : "bg-gray-800 text-gray-300"
          }`}
        >
          {filtered.length}
          {filtered.length !== summary.entries.length ? ` / ${summary.entries.length}` : ""} vehicles
        </span>
        {mode === "perf" && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {dims.types.map(([t, c]) => {
            const on = fType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFType(on ? "" : t)}
                title={`Filter by type: ${t}`}
                className={`rounded-full border px-2 py-0.5 text-2xs ${
                  on
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                {t} · {c}
              </button>
            );
          })}
          <select
            value={fClass}
            onChange={(e) => setFClass(e.target.value)}
            title="Filter by class"
            className="max-w-44 cursor-pointer appearance-none rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-2xs text-gray-300 focus:border-accent focus:outline-none"
          >
            <option value="">All classes</option>
            {dims.classes.map(([c, n]) => (
              <option key={c} value={c}>
                {c} · {n}
              </option>
            ))}
          </select>
          {(fType || fClass) && (
            <button
              type="button"
              onClick={clearFilters}
              title="Clear type / class filter"
              className="rounded-full border border-accent/60 px-2 py-0.5 text-2xs text-accent hover:bg-accent/10"
            >
              reset ✕
            </button>
          )}
        </div>
        )}
      </header>

      {/* Dashboard sub-nav: charts vs formula */}
      <div className="flex items-center gap-1 border-b border-gray-800 bg-gray-900/80 px-3 py-1">
        <button
          type="button"
          onClick={() => setMode("perf")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
            mode === "perf" ? "bg-accent/15 text-accent" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <Gauge className="h-3.5 w-3.5" /> Performance
        </button>
        <button
          type="button"
          onClick={() => setMode("formula")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
            mode === "formula" ? "bg-accent/15 text-accent" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <Sigma className="h-3.5 w-3.5" /> Formula
        </button>
        <span className="ml-auto hidden text-2xs text-gray-600 md:inline">
          {mode === "formula"
            ? "The exact math this build currently uses — bugs expected."
            : "Every bar, radar, ranking and histogram comes from the same folder data."}
        </span>
      </div>

      {mode === "formula" ? (
        <FormulaView summary={summary} folder={folder} />
      ) : filtered.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Gauge className="h-10 w-10 text-gray-700" />
          <p className="max-w-sm text-sm leading-relaxed text-gray-400">
            No vehicles match
            {fType ? <> type <span className="text-accent">{fType}</span></> : null}
            {fClass ? <> class <span className="text-accent">{fClass}</span></> : null} in this
            folder.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
          >
            Clear type / class filter
          </button>
        </div>
      ) : (
        <>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-3">
        {/* Vehicle performance: picker + bars */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
          {card("Vehicle performance", <Gauge className="h-3.5 w-3.5" />,
            <>
              {/* Compact vehicle selector: search + dropdown + prev/next */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-40 flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filter vehicles by name / type / class…"
                    className="w-full rounded-md border border-gray-700 bg-gray-950 py-1.5 pl-7 pr-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                  />
                </div>
                <select
                  value={selected?.key ?? ""}
                  onChange={(e) => setSelKey(e.target.value)}
                  title="Select vehicle"
                  className="min-w-0 max-w-64 cursor-pointer appearance-none rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 focus:border-accent focus:outline-none"
                >
                  {pickList.map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.name} · {e.vehicleType || "—"}
                      {e.vehicleClass && e.vehicleClass !== e.vehicleType ? ` · ${e.vehicleClass}` : ""}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => stepSel(-1)}
                    disabled={pickList.length === 0}
                    title="Previous vehicle"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-sm leading-none text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-40"
                  >
                    ‹
                  </button>
                  <span className="w-10 shrink-0 text-center text-2xs tabular-nums text-gray-500">
                    {selIdx >= 0 ? selIdx + 1 : 0}/{pickList.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => stepSel(1)}
                    disabled={pickList.length === 0}
                    title="Next vehicle"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-sm leading-none text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>
              {pickList.length === 0 && q && (
                <p className="mb-3 text-xs text-gray-600">No vehicles match “{q.trim()}”.</p>
              )}

              {/* Selected vehicle performance — comprehensive */}
              {selected && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-baseline gap-2">
                      <h3 className="font-mono text-base font-semibold text-gray-100">
                        {selected.name}
                      </h3>
                      <span className="rounded bg-gray-800 px-1.5 py-0.5 text-2xs text-gray-400">
                        {selected.vehicleType || "—"}
                        {selected.vehicleClass && selected.vehicleClass !== selected.vehicleType
                          ? ` · ${selected.vehicleClass}`
                          : ""}
                      </span>
                      <span className="min-w-0 truncate text-2xs text-gray-600" title={selected.folder}>
                        {selected.folder}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                      {PERF_METRICS.map((m) => {
                        const v = selected.values[m.id];
                        const s = scoreOf(summary, selected, m);
                        return (
                          <div key={m.id} className="min-w-0">
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
                                <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                                {m.label}
                              </span>
                              <span className="font-mono text-sm font-semibold text-gray-100">
                                {v == null ? "n/a" : `${fmtNum(v)}${m.unit}`}
                              </span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                              {s != null && (
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${Math.round(s * 100)}%`, background: m.color }}
                                />
                              )}
                            </div>
                            <p className="mt-1 truncate text-2xs text-gray-600" title={m.blurb}>
                              {m.blurb}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 self-start">
                    <span className="text-2xs uppercase tracking-wider text-gray-600">Radar</span>
                    <Radar entries={[selected]} scores={scoreMap([selected])} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Compare */}
          {card("Compare", <RadarIcon className="h-3.5 w-3.5" />, (
            <>
              <p className="mb-2 text-2xs text-gray-500">
                Click vehicles below to add them to the radar (up to 5, the selected one is always kept).
              </p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {filtered.slice(0, 60).map((e) => {
                  const on = compareList.some((c) => c.key === e.key);
                  const idx = compareList.findIndex((c) => c.key === e.key);
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() =>
                        setCompare((prev) => {
                          const next = new Set(prev);
                          if (next.has(e.key)) next.delete(e.key);
                          else {
                            if (next.size >= 4) next.delete(next.values().next().value as string);
                            next.add(e.key);
                          }
                          return next;
                        })
                      }
                      className="rounded-full border px-2 py-0.5 text-2xs"
                      style={
                        on
                          ? { borderColor: PALETTE[idx % PALETTE.length], color: PALETTE[idx % PALETTE.length] }
                          : { borderColor: "#374151", color: "#9ca3af" }
                      }
                    >
                      {e.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Radar entries={compareList} scores={radarScores} />
                <div className="min-w-0 flex-1">
                  {compareList.map((e, i) => (
                    <div key={e.key} className="flex items-center gap-2 py-0.5 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="truncate font-mono text-gray-300">{e.name}</span>
                      <span className="ml-auto text-2xs text-gray-500">
                        {e.vehicleType} · {e.folder}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ))}
        </div>

        {/* Rankings */}
        <div className="flex min-w-0 flex-col gap-3">
          {card("Rankings", <Trophy className="h-3.5 w-3.5" />, (
            <div className="space-y-4">
              {PERF_METRICS.map((m) => {
                const ranked = rankOf(filtered, m).slice(0, 6);
                const best = ranked[0]?.value;
                return (
                  <div key={m.id}>
                    <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-gray-400">
                      {m.id === "agility" ? "Heaviest" : `Top ${m.label}`}
                    </h3>
                    <ol className="space-y-0.5">
                      {ranked.map((r, i) => (
                        <li key={r.entry.key} className="flex items-center gap-2 text-xs">
                          <span className="w-4 shrink-0 text-2xs text-gray-600">{i + 1}</span>
                          <span className="truncate font-mono text-gray-300">{r.entry.name}</span>
                          <span className="ml-auto shrink-0 font-mono text-2xs text-gray-400">
                            {fmtNum(r.value)}{m.unit}
                          </span>
                          {best != null && r.value === best && <Trophy className="h-3 w-3 shrink-0 text-yellow-400" />}
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Distribution */}
      <div className="border-t border-gray-800 bg-gray-900/40 p-3">
        {card("Distribution", <BarChart3 className="h-3.5 w-3.5" />, (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="text-2xs text-gray-500">Parameter:</label>
              <div className="flex gap-1">
                {PERF_METRICS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setHistMetric(m.id)}
                    className={`rounded-md border px-2 py-0.5 text-2xs ${
                      histMetric === m.id
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <Histogram entries={filtered} metricId={histMetric} />
          </>
        ))}
      </div>
        </>
      )}
    </div>
  );
}

function scoreOf(summary: PerfSummary, entry: PerfEntry, metric: (typeof PERF_METRICS)[number]): number | null {
  const v = entry.values[metric.id];
  if (v == null) return null;
  const { min, max } = summary.stats[metric.id];
  const raw = max > min ? (v - min) / (max - min) : v > 0 ? 1 : 0;
  return metric.higherBetter ? raw : 1 - raw;
}

function Histogram({ entries, metricId }: { entries: PerfEntry[]; metricId: MetricId }) {
  const metric = PERF_METRICS.find((m) => m.id === metricId)!;
  const bins = histogramEntries(entries, metric);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const vals = entries
    .map((e) => e.values[metricId])
    .filter((v): v is number => v != null);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return (
    <div>
      <div className="flex h-28 items-end gap-0.5">
        {bins.length === 0 ? (
          <p className="text-xs text-gray-600">No values for this parameter in the current set.</p>
        ) : (
          bins.map((b, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-accent/70 transition-all hover:bg-accent"
              style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}
              title={`${b.label} → ${b.count}`}
            />
          ))
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-2xs text-gray-500">
        <span>
          {vals.length ? `range ${fmtNum(Math.min(...vals))} – ${fmtNum(Math.max(...vals))}` : "—"}
        </span>
        <span>{vals.length ? `avg ${fmtNum(avg)}` : ""}</span>
        <span>{metric.blurb}</span>
      </div>
    </div>
  );
}
