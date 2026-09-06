// Dashboard metric engine: turns scanned handling.meta values into comparable
// performance numbers (bars / radar / rankings / histograms). Pure + testable.

import type { ScanResult, VehicleRow } from "../../shared/models";

export type MetricId =
  | "topSpeed"
  | "accel"
  | "braking"
  | "grip"
  | "agility";

export interface PerfMetric {
  id: MetricId;
  label: string;
  /** handling.meta element the value comes from. */
  key: string;
  /** Raw display unit suffix (informational only — we normalise 0..1). */
  unit: string;
  /** True = bigger is better for the bar/radar; agility inverts mass. */
  higherBetter: boolean;
  blurb: string;
  color: string;
}

export const PERF_METRICS: PerfMetric[] = [
  {
    id: "topSpeed",
    label: "Top Speed",
    key: "fInitialDriveMaxFlatVel",
    unit: "",
    higherBetter: true,
    blurb: "From fInitialDriveMaxFlatVel — the top-speed ceiling.",
    color: "#f97316",
  },
  {
    id: "accel",
    label: "Acceleration",
    key: "fInitialDriveForce",
    unit: "",
    higherBetter: true,
    blurb: "From fInitialDriveForce — engine power off the line.",
    color: "#fbbf24",
  },
  {
    id: "braking",
    label: "Braking",
    key: "fBrakeForce",
    unit: "",
    higherBetter: true,
    blurb: "From fBrakeForce — stopping power.",
    color: "#38bdf8",
  },
  {
    id: "grip",
    label: "Grip",
    key: "fTractionCurveMax",
    unit: "",
    higherBetter: true,
    blurb: "From fTractionCurveMax — cornering / launch grip.",
    color: "#34d399",
  },
  {
    id: "agility",
    label: "Agility",
    key: "fMass",
    unit: "kg",
    higherBetter: false,
    blurb: "Mass in kg (lower = more agile, so the score inverts it).",
    color: "#a78bfa",
  },
];

export interface PerfEntry {
  /** Unique key = folder|handlingName (mirrors rowKey). */
  key: string;
  name: string;
  folder: string;
  vehicleType: string;
  vehicleClass: string;
  /** Raw parsed values per metric (null when the row has none). */
  values: Partial<Record<MetricId, number>>;
}

export interface MetricStats {
  min: number;
  max: number;
  count: number;
}

export interface PerfSummary {
  entries: PerfEntry[];
  stats: Record<MetricId, MetricStats>;
}

/** Parse the first float out of a meta value string (or null). */
export function parseValue(v: string | undefined): number | null {
  if (v == null) return null;
  const m = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function metricValue(row: VehicleRow, metric: PerfMetric): number | null {
  return parseValue(row.params[metric.key]);
}

export function computePerf(result: ScanResult | null | undefined): PerfSummary {
  const summary: PerfSummary = {
    entries: [],
    stats: {} as Record<MetricId, MetricStats>,
  };
  for (const m of PERF_METRICS) {
    summary.stats[m.id] = { min: Infinity, max: -Infinity, count: 0 };
  }
  for (const row of result?.vehicles ?? []) {
    const values: PerfEntry["values"] = {};
    for (const m of PERF_METRICS) {
      const v = metricValue(row, m);
      if (v != null) {
        values[m.id] = v;
        const st = summary.stats[m.id];
        if (v < st.min) st.min = v;
        if (v > st.max) st.max = v;
        st.count += 1;
      }
    }
    summary.entries.push({
      key: `${row.folder_name}|${row.handling_name}`,
      name: row.handling_name || row.folder_name,
      folder: row.folder_name,
      vehicleType: row.vehicle_type,
      vehicleClass: row.vehicle_class,
      values,
    });
  }
  for (const m of PERF_METRICS) {
    const st = summary.stats[m.id];
    if (st.count === 0) {
      st.min = 0;
      st.max = 0;
    }
  }
  return summary;
}

/** 0..1 normalised score (higher-is-better; agility inverts mass). */
export function score(summary: PerfSummary, entry: PerfEntry, metric: PerfMetric): number | null {
  const v = entry.values[metric.id];
  if (v == null) return null;
  const { min, max } = summary.stats[metric.id];
  const raw = max > min ? (v - min) / (max - min) : v > 0 ? 1 : 0;
  return metric.higherBetter ? raw : 1 - raw;
}

/** Raw value of an entry metric (for labels). */
export function rawOf(entry: PerfEntry, metric: PerfMetric): number | null {
  return entry.values[metric.id] ?? null;
}

export interface RankRow {
  entry: PerfEntry;
  value: number;
  score: number;
}

/** Entries sorted by a metric's raw value, best first (top speed fast → first). */
export function rankBy(summary: PerfSummary, metric: PerfMetric): RankRow[] {
  const ranked = summary.entries
    .filter((e) => e.values[metric.id] != null)
    .map((e) => ({
      entry: e,
      value: e.values[metric.id] as number,
      score: score(summary, e, metric) ?? 0,
    }));
  ranked.sort((a, b) => b.value - a.value);
  return ranked;
}

/** Rank a pre-filtered entry list best-first by raw value (rankings panel). */
export function rankOf(entries: PerfEntry[], metric: PerfMetric): RankRow[] {
  return entries
    .filter((e) => e.values[metric.id] != null)
    .map((e) => ({ entry: e, value: e.values[metric.id] as number, score: 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface HistBin {
  label: string;
  count: number;
  from: number;
  to: number;
}

/** Equal-width histogram over a metric's present values (whole summary). */
export function histogram(summary: PerfSummary, metric: PerfMetric, bins = 12): HistBin[] {
  return histogramEntries(summary.entries, metric, bins);
}

/** Equal-width histogram over a pre-filtered entry list. */
export function histogramEntries(entries: PerfEntry[], metric: PerfMetric, bins = 12): HistBin[] {
  const vals = entries
    .map((e) => e.values[metric.id])
    .filter((v): v is number => v != null);
  if (vals.length === 0) return [];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === min) return [{ label: fmtNum(min), count: vals.length, from: min, to: max }];
  const width = (max - min) / bins;
  const out: HistBin[] = [];
  for (let i = 0; i < bins; i++) {
    const from = min + i * width;
    const to = i === bins - 1 ? max + 1e-9 : min + (i + 1) * width;
    const count = vals.filter((v) => v >= from && v < to).length;
    out.push({
      label: `${fmtNum(from)}${i === bins - 1 ? "+" : ""}`,
      count,
      from,
      to,
    });
  }
  return out;
}

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 100) return n.toFixed(1);
  if (a >= 1) return n.toFixed(2);
  return n.toFixed(3);
}
