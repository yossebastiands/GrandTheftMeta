import { ArrowRight, BookOpenText, Gauge, Hammer, ShieldCheck, Table2, Wand2 } from "lucide-react";
import type { AppSection } from "../../ui/Navbar";

/**
 * Home — information only, no tools.
 *
 * The two workshops are opened from here (or from the global navbar); this view
 * exists so someone who launches the app learns what it is before importing
 * anything.
 */
export default function HomeView({
  version,
  onOpen,
}: {
  version: string;
  onOpen: (section: AppSection) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <header className="flex items-start gap-4">
          <img
            src="/gtm.png"
            alt="GrandTheftMeta"
            className="h-14 w-14 shrink-0 rounded-lg border border-gray-800 bg-gray-900 object-contain p-1"
          />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-100">
              GrandTheftMeta
              <span className="ml-2 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 align-middle text-2xs font-normal text-gray-400">
                v{version}
              </span>
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              A desktop workshop for GTA V / FiveM server packs. One window, two jobs:{" "}
              <span className="text-gray-200">edit the meta files</span> that define vehicles and
              weapons, and <span className="text-gray-200">work on the assets</span> that carry
              their paint.
            </p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <WorkshopCard
            icon={<Table2 className="h-5 w-5 text-accent" />}
            title="Meta Workshop"
            tagline="Import a pack, edit every .meta in it."
            points={[
              "Bulk grid over every entry × parameter, plus a single-entry editor",
              "Edits are overlays until you press Update Files; only changed cells are written",
              "Comments and formatting survive: values are patched in place, never re-serialised",
              "Plain-language glossaries and per-cell hints for handling and weapon parameters",
            ]}
            action="Open Meta Workshop"
            onOpen={() => onOpen("meta")}
          />

          <WorkshopCard
            icon={<Hammer className="h-5 w-5 text-accent" />}
            title="Asset Workshop"
            tagline="Read a drawable and make something with it."
            points={[
              "UV Map Generator: the UV sheet, with the asset's real texture tiles detected",
              "3D guide: the model projected front / side / top / rear, islands in sheet colours",
              "Weapon Templates: the base weapons you can clone from, derived from your own metas",
              "Weapon Generator: one add-on weapon, or a whole pack in one resource — dry run first",
            ]}
            action="Open Asset Workshop"
            onOpen={() => onOpen("asset")}
          />
        </div>

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            How it works
          </h2>
          <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-gray-400 sm:grid-cols-2">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-500/80" />
              Everything runs locally — no upload, no account, no cloud step.
            </li>
            <li className="flex gap-2">
              <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Built for whole packs: folder-level scanning, thousands of rows without stutter.
            </li>
            <li className="flex gap-2">
              <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              The Glossary in each workshop explains the parameters you are editing.
            </li>
            <li className="flex gap-2">
              <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Asset tools are read-only: a drawable is inspected, never rewritten.
            </li>
          </ul>
        </section>

        <p className="text-2xs leading-relaxed text-gray-500">
          GrandTheftMeta is an unofficial tool for Grand Theft Auto V / FiveM content creators and
          is not affiliated with Rockstar Games or Cfx.re. By Apollo Flight Program · GPL-3.0.
        </p>
      </div>
    </div>
  );
}

function WorkshopCard({
  icon,
  title,
  tagline,
  points,
  action,
  onOpen,
}: {
  icon: JSX.Element;
  title: string;
  tagline: string;
  points: string[];
  action: string;
  onOpen: () => void;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-gray-400">{tagline}</p>
      <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-2xs leading-relaxed text-gray-400">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/70" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500"
      >
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </section>
  );
}
