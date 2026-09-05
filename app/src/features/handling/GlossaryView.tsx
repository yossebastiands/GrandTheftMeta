import { memo, useMemo, useState } from "react";
import { BookOpenText, ChevronDown, FileText, Lock, Rocket, Search } from "lucide-react";
import { handlingGlossary } from "./hints";

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

const CATEGORIES = [
  {
    id: "handling",
    label: "Handling.meta Glossary",
    hint: "Every handling parameter and what it does",
    disabled: false,
  },
  {
    id: "other",
    label: "Other meta glossaries",
    hint: "Other FiveM vehicle .meta files — listed for reference, editing not available yet",
    disabled: false,
  },
] as const;

// Other vehicle .meta files used by FiveM addons, for future editors.
// Editing is not implemented yet — this is a reference list only.
const OTHER_META: Array<{ name: string; file: string; description: string }> = [
  {
    name: "Handling",
    file: "handling.meta",
    description:
      "Vehicle physics & handling (mass, engine, suspension, traction, brakes, sub-handling: flying, boat, weapons…). Already editable in Bulk Handling Editor.",
  },
  {
    name: "Vehicle model metadata",
    file: "vehicles.meta",
    description:
      "Defines each vehicle model: modelName/txd/handlingId, native vehicle <type> and <vehicleClass>, model flags, wheels, cameras, audio and layouts. This is where Type/Class come from.",
  },
  {
    name: "Seat layouts",
    file: "vehiclelayouts.meta",
    description:
      "Seat arrangement and seat-specific entry/exit/animations (which seats exist, positions, driving side).",
  },
  {
    name: "Car colors",
    file: "carcols.meta",
    description:
      "Paint colour lists, pearlescents and per-vehicle dashboard/interior colour options.",
  },
  {
    name: "Vehicle variations",
    file: "carvariations.meta",
    description:
      "Per-model build variations: mod kits, wheels, liveries, extras, plate types and colour combinations.",
  },
  {
    name: "Addon content unlocks",
    file: "caraddoncontentunlocks.meta",
    description:
      "Maps DLC content unlock names to mod/livery items so add-on vehicles can use them.",
  },
  {
    name: "Vehicle weapons",
    file: "vehicleweapons_*.meta",
    description:
      "Mounted vehicle weapon definitions (the guns/rockets/turrets attached to aircraft, tanks, IFVs…).",
  },
  {
    name: "Weapon archetypes",
    file: "weaponarchetypes.meta",
    description:
      "Base weapon archetype parameters that vehicle weapons reference (damage, range, projectile…).",
  },
];

function GlossaryView() {
  const entries = useMemo(() => handlingGlossary(), []);
  const [active, setActive] = useState<"handling" | "other">("handling");
  const [q, setQ] = useState("");
  // Which handling entries have their (structured) description expanded.
  // Everything starts collapsed so the list stays scannable.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const handlingFiltered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries;
    return entries.filter((e) =>
      `${e.name} ${e.moduleLabel} ${toPlain(e.description)}`.toLowerCase().includes(t)
    );
  }, [entries, q]);

  const otherFiltered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return OTHER_META;
    return OTHER_META.filter((e) =>
      `${e.name} ${e.file} ${e.description}`.toLowerCase().includes(t)
    );
  }, [q]);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Glossary side panel */}
      <nav className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-800 bg-gray-900 px-2 py-3">
        <div>
          <div className="flex items-baseline justify-between px-2 pb-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-gray-600">
              Vehicles
            </span>
            <span className="text-2xs text-gray-600">live</span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {CATEGORIES.map((c) => {
              const isActive = !c.disabled && active === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={c.disabled}
                    onClick={() => !c.disabled && setActive(c.id)}
                    title={c.hint}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      isActive
                        ? "bg-accent/15 font-semibold text-accent ring-1 ring-inset ring-accent/40"
                        : c.disabled
                          ? "cursor-not-allowed text-gray-600"
                          : "text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    {c.id === "handling" ? (
                      <FileText className="h-4 w-4 shrink-0" />
                    ) : (
                      <BookOpenText className="h-4 w-4 shrink-0 opacity-60" />
                    )}
                    <span className="truncate">{c.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <div className="flex items-baseline justify-between px-2 pb-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-gray-600">
              Weapons
            </span>
            <span className="text-2xs text-gray-600">coming soon</span>
          </div>
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                disabled
                title="Coming soon — firearm meta (weaponarchetypes.meta, etc.)"
                className="flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-600"
              >
                <Rocket className="h-4 w-4 shrink-0 opacity-60" />
                <span className="truncate">Weapon meta glossaries</span>
                <Lock className="ml-auto h-3 w-3 shrink-0 opacity-50" />
              </button>
            </li>
          </ul>
        </div>
        <div className="mt-auto px-2 text-2xs leading-relaxed text-gray-600">
          Handling definitions come from the Apollo Flight Program glossary. The other meta files
          are listed as a reference — editors for them are planned.
        </div>
      </nav>

      {/* Glossary content */}
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-3 py-2">
          <h1 className="text-sm font-semibold text-gray-200">
            {active === "handling" ? "Handling.meta Glossary" : "Other Meta Glossaries"}
          </h1>
          <span className="text-2xs text-gray-500">
            {active === "handling"
              ? `${entries.length} parameters · ${handlingFiltered.length} shown`
              : `${OTHER_META.length} meta files`}
          </span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute bottom-0 left-2 top-0 m-auto h-3.5 w-3.5 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={active === "handling" ? "Search parameter…" : "Search meta files…"}
              className="w-64 rounded-md border border-gray-700 bg-gray-950 py-1 pl-7 pr-2 text-xs text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {active === "other" ? (
            otherFiltered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No meta files match “{q}”.
              </div>
            ) : (
              <ul className="divide-y divide-gray-800/80">
                {otherFiltered.map((m) => (
                  <li key={m.file} className="flex items-start gap-4 px-4 py-2">
                    <div className="w-64 shrink-0 pt-0.5">
                      <span className="break-all font-mono text-xs font-semibold text-accent">
                        {m.file}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-200">{m.name}</span>
                        <span className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-2xs text-gray-500">
                          not editable yet
                        </span>
                      </span>
                    </div>
                    <p className="min-w-0 flex-1 text-xs leading-relaxed text-gray-300">
                      {m.description}
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : handlingFiltered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No parameters match “{q}”.
            </div>
          ) : (
            <ul className="divide-y divide-gray-800/80">
              {handlingFiltered.map((e) => {
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
      </main>
    </div>
  );
}

export default memo(GlossaryView);
