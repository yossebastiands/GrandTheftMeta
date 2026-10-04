// Asset Workshop — the workspace behind the `Asset Workshop` global tab.
//
// Left rail = the tools that actually exist (registered in `tools.tsx`; the
// planned ones are listed in the Asset Glossary instead of greyed out here),
// right = the active tool's own layout.
import { useState, type ReactNode } from "react";
import { Hammer } from "lucide-react";
import { CREATOR_TOOLS } from "./tools";

export default function CreatorToolsView() {
  // Dev deep links pick the tool: `?tool=weapon-templates`, or the fixtures
  // (`?wtdemo` → Weapon Templates, `?uvdemo`/`?uvfile` → UV Map Generator).
  const [activeId, setActiveId] = useState<string | null>(() => {
    const fallback = CREATOR_TOOLS[0]?.id ?? null;
    if (!import.meta.env.DEV || typeof window === "undefined") return fallback;
    const p = new URLSearchParams(window.location.search);
    const wanted =
      p.get("tool") ??
      (p.has("wggen")
        ? "weapon-generator"
        : p.has("wtdemo")
          ? "weapon-templates"
          : p.has("uvdemo") || p.has("uvfile")
            ? "uv-map"
            : null);
    return wanted && CREATOR_TOOLS.some((t) => t.id === wanted) ? wanted : fallback;
  });
  const active = CREATOR_TOOLS.find((t) => t.id === activeId) ?? CREATOR_TOOLS[0];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Tool rail */}
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-800 bg-gray-900/60">
        <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2.5">
          <Hammer className="h-4 w-4 text-accent" />
          <h1 className="text-xs font-semibold uppercase tracking-wider text-gray-200">
            Asset Workshop
          </h1>
        </div>

        <div className="flex flex-col gap-1 p-2">
          {CREATOR_TOOLS.map((tool) => {
            const isActive = tool.id === active?.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveId(tool.id)}
                className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition ${
                  isActive
                    ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/40"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className="mt-0.5 shrink-0">{tool.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{tool.label}</span>
                  <span className="mt-0.5 block text-2xs leading-snug text-gray-500">
                    {tool.tagline}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Workspace */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {active?.render ? (
          active.render()
        ) : (
          <Launcher onOpen={(id) => setActiveId(id)} />
        )}
      </main>
    </div>
  );
}

/** Fallback grid shown when a tool has no workspace of its own. */
function Launcher({ onOpen }: { onOpen: (id: string) => void }): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <Hammer className="h-10 w-10 text-gray-700" />
      <p className="text-sm text-gray-400">Pick a tool from the left to get started.</p>
      <button
        type="button"
        onClick={() => onOpen(CREATOR_TOOLS[0].id)}
        className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
      >
        Open {CREATOR_TOOLS[0].label}
      </button>
    </div>
  );
}
