import { useMemo, useState } from "react";
import { ChevronDown, HelpCircle, RotateCcw, Search } from "lucide-react";
import { rowKey, type VehicleRow } from "../../shared/models";
import {
  elementName,
  groupColumns,
  paramHint,
  type ParamGroup,
} from "./hints";

interface Props {
  /** All scanned handling entries (each = one handlingName in some handling.meta). */
  vehicles: VehicleRow[];
  /** Ordered union of param column names across the scan. */
  columns: string[];
  /** Committed edits keyed by rowKey -> col -> value (shared with Bulk editor). */
  edits: Record<string, Record<string, string>>;
  onCommitEdit: (row: VehicleRow, col: string, value: string) => void;
  /** File name shown next to the folder (defaults to handling.meta). */
  metaLabel?: string;
  /** Label for the un-prefixed group in the form (defaults to Vehicle). */
  coreLabel?: string;
  /** Helper line under the header (defaults to the handling wording). */
  note?: string;
  /** Domain hint lookup for the '?' icons (defaults to the handling glossary). */
  hintFor?: (col: string) => string | undefined;
}

// ---------------------------------------------------------------------------
// One parameter field (input with hint + dirty/revert affordances)
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  col: string;
  value: string;
  original: string;
  edited: boolean;
  hintHtml?: string;
  hintOpen: boolean;
  onToggleHint: () => void;
  onCommit: (value: string) => void;
}

function ParamField({
  label,
  col,
  value,
  original,
  edited,
  hintHtml,
  hintOpen,
  onToggleHint,
  onCommit,
}: FieldProps) {
  const [local, setLocal] = useState<string | null>(null);
  const shown = local ?? value;

  const commitLocal = (v: string) => {
    if (local !== null) setLocal(null);
    if (v !== value) onCommit(v);
  };

  return (
    <div className="flex flex-col py-1">
      <div className="flex items-center gap-2">
        <label
          className="w-48 shrink-0 truncate text-right text-xs text-gray-400"
          title={col}
        >
          {label}
        </label>
        <input
          className={`h-7 min-w-0 flex-1 rounded-md border bg-gray-950 px-2 text-xs text-gray-200 outline-none transition-colors focus:border-accent ${
            edited ? "border-accent/70 font-semibold text-orange-200" : "border-gray-700"
          }`}
          value={shown}
          spellCheck={false}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => commitLocal(shown)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitLocal(shown);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setLocal(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {edited && (
          <button
            type="button"
            title="Revert to original"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-gray-500 transition-colors hover:text-white"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setLocal(null);
              onCommit(original);
            }}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
        {hintHtml && (
          <button
            type="button"
            title={`What does ${label} do?`}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded transition-colors ${
              hintOpen ? "text-accent" : "text-gray-600 hover:text-accent"
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleHint}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {hintOpen && hintHtml && (
        <div
          className="glossary-html ml-48 mt-1 rounded-md border border-gray-800 bg-gray-900/70 px-3 py-2 text-xs leading-relaxed text-gray-400"
          dangerouslySetInnerHTML={{ __html: hintHtml }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single Handling Editor — pick ONE handlingName, edit as a module form
// ---------------------------------------------------------------------------

export default function SingleHandlingEditor({
  vehicles,
  columns,
  edits,
  onCommitEdit,
  metaLabel = "handling.meta",
  coreLabel = "Vehicle",
  note = "One handlingName in one handling.meta — edits update only this entry.",
  hintFor,
}: Props) {
  const [q, setQ] = useState("");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(["core", "flying", "boat", "vweapon", "wheel", "meta"])
  );
  const [hintCol, setHintCol] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? vehicles.filter((v) =>
          `${v.folder_name} ${v.handling_name} ${v.vehicle_type} ${v.vehicle_class}`
            .toLowerCase()
            .includes(t)
        )
      : vehicles;
    return [...list].sort(
      (a, b) =>
        a.handling_name.localeCompare(b.handling_name) ||
        a.folder_name.localeCompare(b.folder_name)
    );
  }, [vehicles, q]);

  const selected = useMemo(() => {
    if (!selKey) return filtered[0] ?? null;
    return filtered.find((v) => rowKey(v) === selKey) ?? filtered[0] ?? null;
  }, [filtered, selKey]);

  const groups = useMemo<ParamGroup[]>(() => {
    if (!selected) return [];
    const present = columns.filter((c) =>
      Object.prototype.hasOwnProperty.call(selected.params, c)
    );
    const g = groupColumns(present);
    return coreLabel === "Vehicle"
      ? g
      : g.map((x) => (x.id === "core" ? { ...x, label: coreLabel } : x));
  }, [columns, selected, coreLabel]);

  const selRowKey = selected ? rowKey(selected) : null;
  const rowEdits = selRowKey ? edits[selRowKey] : undefined;

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* Left: searchable list of handling names */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-800 bg-gray-900/40">
        <div className="border-b border-gray-800 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute bottom-0 left-2 top-0 m-auto h-3.5 w-3.5 text-gray-500" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHintCol(null);
              }}
              placeholder="Search handling name…"
              className="w-full rounded-md border border-gray-700 bg-gray-950 py-1 pl-7 pr-2 text-xs text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none"
            />
          </div>
          <p className="mt-1.5 px-1 text-2xs text-gray-600">
            {filtered.length} handling {filtered.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-600">
              No handling names match “{q}”.
            </div>
          ) : (
            <ul className="flex flex-col gap-px py-1">
              {filtered.map((v) => {
                const key = rowKey(v);
                const isSel = selRowKey === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelKey(key);
                        setHintCol(null);
                      }}
                      className={`flex w-full flex-col gap-0.5 px-3 py-1.5 text-left transition-colors ${
                        isSel
                          ? "border-l-2 border-accent bg-accent/10"
                          : "border-l-2 border-transparent hover:bg-gray-800/60"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`truncate font-mono text-xs font-semibold ${
                            isSel ? "text-accent" : "text-gray-200"
                          }`}
                        >
                          {v.handling_name}
                        </span>
                        {v.vehicle_type && (
                          <span className="shrink-0 rounded bg-gray-800 px-1 py-px text-2xs text-gray-500">
                            {v.vehicle_type}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-2xs text-gray-600">
                        {v.folder_name}
                        {v.vehicle_class ? ` · ${v.vehicle_class}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right: module form for the selected entry */}
      {selected ? (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-gray-800 bg-gray-900/40 px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-mono text-sm font-semibold text-accent">
                {selected.handling_name}
              </h2>
              {selected.vehicle_type && (
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-2xs text-gray-300">
                  {selected.vehicle_type}
                </span>
              )}
              {selected.vehicle_class && (
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-2xs text-gray-300">
                  {selected.vehicle_class}
                </span>
              )}
              <span className="truncate text-2xs text-gray-500">
                {selected.folder_name}
                {metaLabel &&
                !selected.folder_name.toLowerCase().endsWith(".meta")
                  ? ` · ${metaLabel}`
                  : ""}
              </span>
            </div>
            <p className="mt-0.5 text-2xs text-gray-600">{note}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto min-w-[560px] max-w-4xl px-4 py-3">
              {groups.length === 0 ? (
                <p className="text-xs text-gray-600">No parameters in this entry.</p>
              ) : (
                groups.map((g) => {
                  const open = openGroups.has(g.id);
                  return (
                    <section
                      key={g.id}
                      className="mb-3 overflow-hidden rounded-lg border border-gray-800"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className="flex w-full items-center gap-2 bg-gray-900/70 px-3 py-1.5 text-left transition-colors hover:bg-gray-800"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-gray-500 transition-transform ${
                            open ? "" : "-rotate-90"
                          }`}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                          {g.label}
                        </span>
                        <span className="ml-auto text-2xs text-gray-600">
                          {g.cols.length}
                        </span>
                      </button>
                      {open && (
                        <div className="bg-gray-950/40 px-3 py-2">
                          {g.cols.map((col) => {
                            const value =
                              rowEdits?.[col] ?? selected.params[col] ?? "";
                            const original = selected.params[col] ?? "";
                            const edited =
                              rowEdits?.[col] !== undefined &&
                              rowEdits[col] !== original;
                            const hint = hintFor
                              ? hintFor(col)
                              : paramHint(col, selected.vehicle_type);
                            return (
                              <ParamField
                                key={col}
                                label={elementName(col)}
                                col={col}
                                value={value}
                                original={original}
                                edited={edited}
                                hintHtml={hint}
                                hintOpen={hintCol === col}
                                onToggleHint={() =>
                                  setHintCol((prev) => (prev === col ? null : col))
                                }
                                onCommit={(v) => onCommitEdit(selected, col, v)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </main>
      ) : (
        <main className="flex flex-1 items-center justify-center text-sm text-gray-500">
          Select a handling entry from the list.
        </main>
      )}
    </div>
  );
}
