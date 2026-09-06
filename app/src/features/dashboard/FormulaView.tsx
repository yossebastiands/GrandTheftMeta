// Formula page for the Performance Dashboard.
//
// This documents, in math, EXACTLY how the current build turns scanned handling.meta
// values into bars, radar points, rankings and histogram bins. It is deliberately a
// simple best-effort model — mistakes and edge cases are expected. If you know a more
// accurate model, please reach out on Discord (https://discord.gg/BrXbYWKvrM).

import type { ReactNode } from "react";
import { TriangleAlert, MessageCircle } from "lucide-react";
import { PERF_METRICS, fmtNum, type PerfMetric, type PerfSummary } from "./perf";

const DISCORD = "https://discord.gg/BrXbYWKvrM";

// ---------------------------------------------------------------------------
// Small presentational math helpers (CSS fraction ≈ neat inline LaTeX look).
// ---------------------------------------------------------------------------

function Frac({ num, den }: { num: ReactNode; den: ReactNode }) {
  return (
    <span className="mx-1 inline-flex flex-col items-center align-middle leading-none">
      <span className="px-2 pb-0.5 text-[13px] text-gray-100">{num}</span>
      <span className="h-px w-full bg-gray-400" />
      <span className="px-2 pt-0.5 text-[13px] text-gray-100">{den}</span>
    </span>
  );
}

function Param({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-gray-800 px-1 py-0.5 font-mono text-[11px] text-sky-300">
      {children}
    </code>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
      <header className="border-b border-gray-800 bg-gray-900/90 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-200">{title}</h2>
      </header>
      <div className="space-y-3 p-3 text-xs leading-relaxed text-gray-400">{children}</div>
    </section>
  );
}

function MetricDoc({ metric, summary }: { metric: PerfMetric; summary: PerfSummary }) {
  const st = summary.stats[metric.id];
  const lower = !metric.higherBetter;
  const hasData = st.count > 0;
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: metric.color }} />
        <h3 className="text-sm font-semibold text-gray-100">{metric.label}</h3>
        <Param>{metric.key}</Param>
        <span className="rounded bg-gray-800 px-1.5 py-0.5 text-2xs text-gray-400">
          {metric.unit || "no unit"} · {lower ? "lower is better" : "higher is better"}
        </span>
        {hasData && (
          <span className="ml-auto text-2xs text-gray-500">
            folder min {fmtNum(st.min)}
            {metric.unit} · max {fmtNum(st.max)}
            {metric.unit} · {st.count} measured
          </span>
        )}
      </div>

      <p className="mt-2 text-2xs text-gray-500">{metric.blurb}</p>

      {/* value extraction */}
      <div className="mt-2 flex flex-wrap items-baseline gap-1 font-mono text-[13px] text-gray-200">
        <span>value</span>
        <span className="text-gray-400">(vehicle)</span>
        <span> = first number parsed from</span>
        <Param>{metric.key}</Param>
        <span className="text-gray-500">(missing → n/a, excluded)</span>
      </div>

      {/* score formula */}
      {lower ? (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-1 rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2 font-mono text-[13px] text-gray-200">
            <span className="text-violet-300">agility score</span>
            <span> = 1 −</span>
            <Frac num={<span>(mass − min)</span>} den={<span>(max − min)</span>} />
            <span className="text-gray-500">when max &gt; min</span>
          </div>
          <p className="mt-1 text-2xs text-gray-600">
            Mass is in kg and <b>lower is better</b>, so the normalised score is inverted: the
            lightest vehicle in the folder scores 1.0, the heaviest scores 0.0.
          </p>
        </>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-1 rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2 font-mono text-[13px] text-gray-200">
            <span className="text-gray-300">score</span>
            <span> =</span>
            <Frac num={<span>(v − min)</span>} den={<span>(max − min)</span>} />
            <span className="text-gray-500">when max &gt; min</span>
          </div>
          <p className="mt-1 text-2xs text-gray-600">
            The best vehicle in the folder for this metric scores 1.0, the worst scores 0.0 —
            purely relative to this scanned folder.
          </p>
        </>
      )}

      {/* flat-range guard */}
      <div className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-2xs text-amber-200/90">
        Guard when every measured value is identical (max = min): {lower ? (
          <>
            raw = 1 when mass &gt; 0, so the inverted score becomes <b>0 for every vehicle</b> —
            a known quirk of the invert.
          </>
        ) : (
          <>
            a vehicle with a value &gt; 0 scores <b>1.0</b> (full bar); a 0 value scores 0.0.
          </>
        )}
      </div>
    </div>
  );
}

export default function FormulaView({
  summary,
  folder,
}: {
  summary: PerfSummary;
  folder: string | null;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-gray-950 p-4">
      <div className="mx-auto max-w-4xl space-y-4 pb-10">
        {/* EXPERIMENTAL callout */}
        <div className="rounded-xl border-2 border-amber-400/70 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-4 shadow-[0_0_24px_rgba(251,191,36,0.15)]">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-300">
            <TriangleAlert className="h-4 w-4 animate-pulse" /> Experimental — current math
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-amber-100/80">
            Everything on this page documents <b>exactly what this build computes</b>: how a raw{" "}
            <Param>handling.meta</Param> number becomes a bar, a radar point, a ranking and a
            histogram bin. It is a simple, best-effort model — <b>mistakes and errors are
            expected</b>, and it is not an official physics simulation. If you know a better or
            more accurate model, please reach out on Discord.
          </p>
          {folder && (
            <p className="mt-2 text-2xs text-amber-100/60">
              Folder this applies to: <span className="font-mono text-amber-200">{folder}</span>
            </p>
          )}
        </div>

        {/* The five metrics */}
        <Section title="The five metrics">
          <p>
            Each metric is read from one handling value, normalised against the folder's own min /
            max, and drawn as a bar, a radar axis and a leaderboard. Color = metric, and the same
            colors are used on every chart:
          </p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {PERF_METRICS.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-950/60 p-2.5"
              >
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-200">{m.label}</span>
                    <Param>{m.key}</Param>
                  </div>
                  <p className="mt-0.5 text-2xs text-gray-500">
                    {m.unit ? `unit ${m.unit} · ` : ""}
                    {m.higherBetter ? "higher is better" : "lower is better (mass, inverted)"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* From value to score */}
        <Section title="From a value to a score (used by bars, radar, compare)">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <b className="text-gray-300">Extract.</b> For each vehicle, each metric value{" "}
              <span className="font-mono text-gray-200">v</span> is the first number parsed from its{" "}
              <Param>key</Param> string. Missing / unparseable → shown as{" "}
              <span className="font-mono text-gray-500">n/a</span> and skipped for that metric.
            </li>
            <li>
              <b className="text-gray-300">Bounds.</b> Once per scanned folder,{" "}
              <span className="font-mono text-gray-200">min</span> and{" "}
              <span className="font-mono text-gray-200">max</span> are the smallest / largest value
              of that metric across <b>all</b> vehicles that have one.
            </li>
            <li>
              <b className="text-gray-300">Normalise (min–max).</b> Each vehicle is placed between
              0 and 1 on that metric:
              <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/70 px-4 py-2 font-mono text-[13px] text-gray-200">
                <span className="text-gray-300">score(v)</span>
                <span> =</span>
                <Frac num={<span>v − min</span>} den={<span>max − min</span>} />
              </div>
              <p className="mt-1 text-2xs text-gray-500">
                The folder's fastest / strongest vehicle hits 1.0, the weakest 0.0. Mass (agility)
                is the exception — see below — because lower is better.
              </p>
            </li>
          </ol>
        </Section>

        {/* Per-metric detail */}
        <Section title="Each metric, exactly as computed">
          <div className="space-y-3">
            {PERF_METRICS.map((m) => (
              <MetricDoc key={m.id} metric={m} summary={summary} />
            ))}
          </div>
        </Section>

        {/* Panels */}
        <Section title="What each panel actually does with the scores">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b className="text-gray-300">Bars (Vehicle performance):</b> width% = score × 100, so
              the bar fills in proportion to the vehicle's position in this folder.
            </li>
            <li>
              <b className="text-gray-300">Radar:</b> the 5 axes are the 5 metrics; each vertex sits
              at radius = score (0 → center, 1 → rim). A bigger pentagon = more balanced/stronger.
            </li>
            <li>
              <b className="text-gray-300">Compare:</b> up to 5 vehicles drawn as overlapping
              pentagons on the same axes.
            </li>
            <li>
              <b className="text-gray-300">Rankings:</b> for each metric, vehicles are sorted by raw
              value descending and the top 6 shown. The agility board is titled "Heaviest" (raw kg,
              heaviest first).
            </li>
            <li>
              <b className="text-gray-300">Distribution:</b> equal-width histogram of the raw values
              (12 bins) plus the range and average of the current set.
            </li>
          </ul>
        </Section>

        {/* Scope */}
        <Section title="Filters vs. numbers (scope)">
          <p>
            The type / class filter only decides <b>which vehicles are listed, ranked and
            plotted</b>. The min / max used for the scores is always the{" "}
            <b>whole scanned folder</b>, computed once — so filtering never rescales a bar or radar
            point, and you can compare a filtered car against the entire pack.
          </p>
          <p className="text-2xs text-gray-600">
            Rankings and the Distribution histogram do run on the currently filtered set.
          </p>
        </Section>

        {/* Edge cases */}
        <Section title="Known edge cases & honest limits">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              A vehicle with no value for a metric shows <span className="font-mono">n/a</span>, is
              skipped in that metric's stats / ranking / histogram, and its radar axis draws at 0.
            </li>
            <li>
              All values identical: higher-better metrics score 1.0 (full bar); lower-better mass
              scores 0 for every vehicle with mass &gt; 0 (quirk of inverting a flat range).
            </li>
            <li>
              Histogram bins are equal-width; the last bin also includes the maximum value.
            </li>
            <li>
              Values are parsed as the first float found — they are not averaged, smoothed or
              physics-simulated. Top speed, for example, is read straight from{" "}
              <Param>fInitialDriveMaxFlatVel</Param>; a real top speed also depends on gearing,
              drag, torque and traction, none of which are modelled here.
            </li>
          </ul>
        </Section>

        {/* Discord */}
        <div className="flex flex-col items-start gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 sm:flex-row sm:items-center">
          <MessageCircle className="h-5 w-5 shrink-0 text-sky-300" />
          <p className="text-xs leading-relaxed text-sky-100/90">
            <b>Better math?</b> If this model is wrong, or you know a more accurate way to turn
            handling values into performance — we'd genuinely love to hear it. Reach out on the
            Apollo Flight Program Discord.
          </p>
          <a
            href={DISCORD}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md bg-sky-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400"
          >
            discord.gg/BrXbYWKvrM
          </a>
        </div>
      </div>
    </div>
  );
}
