import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  FileText,
  Lock,
  Settings2,
  Table2,
} from "lucide-react";

/** The two ways a meta file can be edited. */
export type EditorMode = "bulk" | "single";

interface ModeDef {
  id: EditorMode;
  label: string;
  icon: ReactNode;
  available: boolean;
  hint: string;
}

interface MetaPanel {
  /** Stable id (also the "smart" family key used by the scanner). */
  id: string;
  /** Canonical file name shown in the tree. */
  file: string;
  /** Short friendly name. */
  label: string;
  /** Human note about the smart file-name matching. */
  aliasHint: string;
  /** Status shown next to the panel when nothing is available yet. */
  status?: string;
  modes: ModeDef[];
}

interface Category {
  id: string;
  label: string;
  note: string;
  panels: MetaPanel[];
}

const soon = (mode: EditorMode, hint: string): ModeDef => ({
  id: mode,
  label: mode === "bulk" ? "Bulk Editor" : "Single Editor",
  icon: mode === "bulk" ? <Table2 className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />,
  available: false,
  hint,
});

const BOTH_SOON = "Coming soon";
const BOTH = (): ModeDef[] => [
  {
    id: "single",
    label: "Single Editor",
    icon: <Settings2 className="h-3.5 w-3.5" />,
    available: true,
    hint: "Edit one entry at a time",
  },
  {
    id: "bulk",
    label: "Bulk Editor",
    icon: <Table2 className="h-3.5 w-3.5" />,
    available: true,
    hint: "Edit all entries in one table",
  },
];

// Category → meta panels → Single/Bulk.
// File names vary wildly in the wild (Handling_Polmav.meta, …), so scanning is
// content-driven ("smart"): each panel id below is a *kind*, matched by a set of
// file-name patterns AND by the XML shapes found inside (future work per kind).
const CATEGORIES: Category[] = [
  {
    id: "vehicles",
    label: "Vehicles",
    note: "vehicle .meta files",
    panels: [
      {
        id: "handling",
        file: "handling.meta",
        label: "Handling",
        aliasHint: "matches handling.meta / handling_*.meta",
        modes: BOTH(),
      },
      {
        id: "vehicles",
        file: "vehicles.meta",
        label: "Vehicles",
        aliasHint: "matches vehicles.meta / vehicles_*.meta",
        modes: BOTH(),
      },
      {
        id: "carcols",
        file: "carcols.meta",
        label: "Car Colours",
        aliasHint: "matches carcols*.meta",
        modes: BOTH(),
      },
      {
        id: "carvariations",
        file: "carvariations.meta",
        label: "Car Variations",
        aliasHint: "matches carvariations*.meta",
        modes: BOTH(),
      },
      {
        id: "vehiclelayouts",
        file: "vehiclelayouts.meta",
        label: "Vehicle Layouts",
        aliasHint: "matches vehiclelayouts*.meta",
        modes: BOTH(),
      },
      {
        id: "vehicleweapons",
        file: "vehicleweapons.meta",
        label: "Vehicle Weapons",
        aliasHint: "matches vehicleweapons*.meta",
        modes: BOTH(),
      },
      {
        id: "veh_weaponarchetypes",
        file: "weaponarchetypes.meta",
        label: "Weapon Archetypes",
        aliasHint: "vehicle-mounted weapon archetypes",
        status: BOTH_SOON,
        modes: [soon("single", BOTH_SOON), soon("bulk", BOTH_SOON)],
      },
    ],
  },
  {
    id: "weapons",
    label: "Weapons",
    note: "firearm .meta files",
    panels: [
      {
        id: "weapons",
        file: "weapons.meta",
        label: "Weapons",
        aliasHint: "matches weapons.meta / weapons_*.meta",
        modes: BOTH(),
      },
      {
        id: "weaponanimations",
        file: "weaponanimations.meta",
        label: "Weapon Animations",
        aliasHint: "matches weaponanimations*.meta",
        status: BOTH_SOON,
        modes: [soon("single", BOTH_SOON), soon("bulk", BOTH_SOON)],
      },
      {
        id: "weaponarchetypes",
        file: "weaponarchetypes.meta",
        label: "Weapon Archetypes",
        aliasHint: "firearm archetypes",
        status: BOTH_SOON,
        modes: [soon("single", BOTH_SOON), soon("bulk", BOTH_SOON)],
      },
      {
        id: "pedpersonality",
        file: "pedpersonality.meta",
        label: "Ped Personality",
        aliasHint: "matches pedpersonality*.meta",
        status: BOTH_SOON,
        modes: [soon("single", BOTH_SOON), soon("bulk", BOTH_SOON)],
      },
    ],
  },
];

// Meta panels currently wired to live editors: handling.meta, vehicles.meta,
// carcols.meta, carvariations.meta, vehiclelayouts.meta, vehicleweapons.meta
// + weapons.meta.
const LIVE_PANELS: string[] = [
  "handling",
  "vehicles",
  "carcols",
  "carvariations",
  "vehiclelayouts",
  "vehicleweapons",
  "weapons",
];

interface SidebarProps {
  activePanel: string;
  activeMode: EditorMode;
  onSelect: (panelId: string, mode: EditorMode) => void;
}

export default function Sidebar({ activePanel, activeMode, onSelect }: SidebarProps) {
  // Which panels are expanded (dropdowns). Live panels start open.
  const [open, setOpen] = useState<Set<string>>(() => new Set(LIVE_PANELS));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <nav className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-gray-800 bg-gray-900 px-2 py-3">
      {CATEGORIES.map((cat) => (
        <div key={cat.id}>
          <div className="flex items-baseline justify-between px-2 pb-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-gray-600">
              {cat.label}
            </span>
            <span className="text-2xs text-gray-700">{cat.note}</span>
          </div>

          <ul className="flex flex-col gap-0.5">
            {cat.panels.map((panel) => {
              const expanded = open.has(panel.id);
              const isActivePanel = panel.id === activePanel;
              return (
                <li key={panel.id} className="rounded-md">
                  {/* Panel header (collapsible dropdown) */}
                  <button
                    type="button"
                    onClick={() => toggle(panel.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isActivePanel
                        ? "text-gray-200 hover:bg-gray-800"
                        : "text-gray-400 hover:bg-gray-800/60"
                    }`}
                    title={panel.aliasHint}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-gray-600 transition-transform ${
                        expanded ? "" : "-rotate-90"
                      }`}
                    />
                    <FileText className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="truncate">{panel.file}</span>
                    {panel.status && (
                      <span className="ml-auto shrink-0 text-2xs text-gray-700">
                        {panel.status}
                      </span>
                    )}
                  </button>

                  {expanded && (
                    <ul className="mt-0.5 flex flex-col gap-0.5 pl-5">
                      {panel.modes.map((mode) => {
                        const isActive =
                          mode.available &&
                          panel.id === activePanel &&
                          activeMode === mode.id;
                        return (
                          <li key={mode.id}>
                            <button
                              type="button"
                              disabled={!mode.available}
                              title={mode.hint}
                              onClick={() =>
                                mode.available && onSelect(panel.id, mode.id)
                              }
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
                                isActive
                                  ? "bg-accent/15 font-semibold text-accent ring-1 ring-inset ring-accent/40"
                                  : mode.available
                                    ? "text-gray-400 hover:bg-gray-800"
                                    : "cursor-not-allowed text-gray-700"
                              }`}
                            >
                              <span className={mode.available ? "" : "opacity-60"}>
                                {mode.icon}
                              </span>
                              <span className="truncate">{mode.label}</span>
                              {!mode.available && (
                                <Lock className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto px-2 text-2xs leading-relaxed text-gray-600">
        <span className="text-gray-500">Smart scanning:</span> meta files don't always have the
        exact name (e.g. <span className="font-mono">Handling_Polmav.meta</span>), so the app
        detects the kind from the file's XML content, not just its name.
      </div>
    </nav>
  );
}
