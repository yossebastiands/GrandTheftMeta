import { memo, useMemo, useState } from "react";
import {
  BookOpenText,
  ChevronDown,
  FileText,
  Info,
  Lock,
  Search,
} from "lucide-react";
import { handlingGlossary } from "./hints";
import { weaponGlossary } from "./weaponHints";

function toPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Meta files (same map as the Home editors). Each file has its own glossary
// page; only handling.meta has a real parameter glossary so far.
// ---------------------------------------------------------------------------

interface MetaFile {
  id: string;
  file: string;
  label: string;
  desc: string;
  hasGlossary: boolean;
}

interface MetaGroup {
  label: string;
  note: string;
  metas: MetaFile[];
}

const GROUPS: MetaGroup[] = [
  {
    label: "Vehicles",
    note: "vehicle .meta",
    metas: [
      {
        id: "handling",
        file: "handling.meta",
        label: "Handling",
        desc: "Vehicle physics & handling (mass, engine, suspension, traction, brakes, plus flying / boat / weapon sub-handling). Full parameter glossary available.",
        hasGlossary: true,
      },
      {
        id: "vehicles",
        file: "vehicles.meta",
        label: "Vehicles",
        desc: "Defines each vehicle model: modelName/txd/handlingId, native <type> & <vehicleClass>, model flags, wheels, cameras, audio and layouts. (This is where Type/Class come from.)",
        hasGlossary: false,
      },
      {
        id: "carcols",
        file: "carcols.meta",
        label: "Car Colours",
        desc: "Paint colour lists, pearlescents and per-vehicle dashboard/interior colour options.",
        hasGlossary: false,
      },
      {
        id: "carvariations",
        file: "carvariations.meta",
        label: "Car Variations",
        desc: "Per-model build variations: mod kits, wheels, liveries, extras, plate types and colour combinations.",
        hasGlossary: false,
      },
      {
        id: "vehiclelayouts",
        file: "vehiclelayouts.meta",
        label: "Vehicle Layouts",
        desc: "Seat arrangement and seat-specific entry/exit/animations (which seats exist, positions, driving side).",
        hasGlossary: false,
      },
      {
        id: "vehicleweapons",
        file: "vehicleweapons.meta",
        label: "Vehicle Weapons",
        desc: "Mounted vehicle weapon definitions (guns/rockets/turrets attached to aircraft, tanks, IFVs…).",
        hasGlossary: false,
      },
      {
        id: "veh_weaponarchetypes",
        file: "weaponarchetypes.meta",
        label: "Weapon Archetypes",
        desc: "Vehicle-mounted weapon archetype parameters referenced by vehicle weapons.",
        hasGlossary: false,
      },
    ],
  },
  {
    label: "Weapons",
    note: "firearm .meta",
    metas: [
      {
        id: "weapons",
        file: "weapons.meta",
        label: "Weapons",
        desc: "Firearm base stats (CWeaponInfo): damage, clip, accuracy, recoil, ammo, flags… Full parameter glossary with input guides.",
        hasGlossary: true,
      },
      {
        id: "weaponanimations",
        file: "weaponanimations.meta",
        label: "Weapon Animations",
        desc: "Per-weapon animation sets (aim, fire, reload, entry/exit poses and timings).",
        hasGlossary: false,
      },
      {
        id: "weaponarchetypes",
        file: "weaponarchetypes.meta",
        label: "Weapon Archetypes",
        desc: "Firearm archetype metadata that weapon stats reference.",
        hasGlossary: false,
      },
      {
        id: "pedpersonality",
        file: "pedpersonality.meta",
        label: "Ped Personality",
        desc: "Behavioural tuning for the ped holding the weapon (combat, movement, etc.).",
        hasGlossary: false,
      },
    ],
  },
];

function GlossaryView() {
  const [active, setActive] = useState<string>("handling");
  const [q, setQ] = useState("");
  // Params that are expanded (everything starts collapsed).
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const activeMeta = useMemo(() => {
    for (const g of GROUPS) {
      const m = g.metas.find((x) => x.id === active);
      if (m) return m;
    }
    return GROUPS[0].metas[0];
  }, [active]);

  const isWeapons = activeMeta?.id === "weapons";
  const entries = useMemo(
    () => (isWeapons ? weaponGlossary() : handlingGlossary()),
    [isWeapons]
  );
  const counts = useMemo(
    () => ({
      handling: handlingGlossary().length,
      weapons: weaponGlossary().length,
    }),
    []
  );

  const listFiltered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries;
    return entries.filter((e) =>
      `${e.name} ${e.moduleLabel} ${toPlain(e.description)}`.toLowerCase().includes(t)
    );
  }, [entries, q]);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Glossary side panel — one entry per meta file (Vehicles / Weapons) */}
      <nav className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-gray-800 bg-gray-900 px-2 py-3">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="flex items-baseline justify-between px-2 pb-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-gray-600">
                {g.label}
              </span>
              <span className="text-2xs text-gray-700">{g.note}</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {g.metas.map((m) => {
                const isActive = active === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActive(m.id);
                        setQ("");
                      }}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm ${
                        isActive
                          ? "bg-accent/15 font-semibold text-accent ring-1 ring-inset ring-accent/40"
                          : "text-gray-400 hover:bg-gray-800/60"
                      }`}
                      title={m.desc}
                    >
                      {m.hasGlossary ? (
                        <BookOpenText className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                      )}
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate font-mono text-xs">
                          {m.file}
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-gray-600">
                          {m.label}
                          {m.hasGlossary
                            ? ` · ${(counts as Record<string, number>)[m.id] ?? entries.length} params`
                            : " · about only"}
                        </span>
                      </span>
                      {!m.hasGlossary && (
                        <Lock className="ml-1 mt-0.5 h-3 w-3 shrink-0 opacity-40" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mt-auto px-2 text-2xs leading-relaxed text-gray-600">
          Handling definitions come from the Apollo Flight Program glossary. Parameter
          glossaries for the other meta files are added as each editor lands.
        </div>
      </nav>

      {/* Glossary content */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeMeta && activeMeta.hasGlossary ? (
          <>
            <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-3 py-2">
              <h1 className="text-sm font-semibold text-gray-200">
                {activeMeta.file} Glossary
              </h1>
              <span className="text-2xs text-gray-500">
                {entries.length} parameters · {listFiltered.length} shown
              </span>
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute bottom-0 left-2 top-0 m-auto h-3.5 w-3.5 text-gray-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search parameter…"
                  className="w-64 rounded-md border border-gray-700 bg-gray-950 py-1 pl-7 pr-2 text-xs text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {listFiltered.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No parameters match “{q}”.
                </div>
              ) : (
                <ul className="divide-y divide-gray-800/80">
                  {listFiltered.map((e) => {
                    const isOpen = open.has(e.name);
                    return (
                      <li key={e.name}>
                        <button
                          type="button"
                          onClick={() =>
                            setOpen((prev) => {
                              const next = new Set(prev);
                              if (next.has(e.name)) next.delete(e.name);
                              else next.add(e.name);
                              return next;
                            })
                          }
                          className="flex w-full items-center gap-2 px-4 py-1.5 text-left transition-colors hover:bg-gray-800/50"
                          title={isOpen ? "Collapse description" : "Expand description"}
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${
                              isOpen ? "" : "-rotate-90"
                            }`}
                          />
                          <span className="shrink-0 break-all font-mono text-xs font-semibold text-accent">
                            {e.name}
                          </span>
                          <span className="shrink-0 rounded bg-gray-800 px-1 py-0.5 text-2xs text-gray-500">
                            {e.moduleLabel}
                          </span>
                          {!isOpen && (
                            <span className="min-w-0 flex-1 truncate text-2xs italic leading-relaxed text-gray-600">
                              {toPlain(e.description)}
                            </span>
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-3 pl-9">
                            <div
                              className="glossary-html text-xs leading-relaxed text-gray-300"
                              dangerouslySetInnerHTML={{ __html: e.description }}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : activeMeta ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="border-b border-gray-800 bg-gray-900 px-4 py-2">
              <h1 className="font-mono text-sm font-semibold text-gray-200">
                {activeMeta.file}
              </h1>
              <p className="text-2xs text-gray-500">
                {activeMeta.label} · parameter glossary coming soon
              </p>
            </div>
            <div className="flex min-h-0 min-w-full justify-center">
              <div className="w-full min-w-[420px] max-w-3xl px-6 py-6">
                <div className="flex items-start gap-4 rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-200">
                      {activeMeta.label}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-300">
                      {activeMeta.desc}
                    </p>
                    <p className="mt-4 text-xs text-gray-600">
                      This file's field glossary will appear here once its editor is
                      wired up. The editor map on the Home screen shows which are live.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default memo(GlossaryView);
