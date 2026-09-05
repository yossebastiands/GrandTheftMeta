import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
} from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown, HelpCircle, X } from "lucide-react";
import { rowKey, type VehicleRow } from "../../shared/models";
import { paramHint } from "./hints";

export interface VehicleTableProps {
  /** Rows to display (already filtered by search / class). */
  vehicles: VehicleRow[];
  /** Ordered param column names. */
  columns: string[];
  /** Committed edits keyed by rowKey -> col -> value. */
  edits: Record<string, Record<string, string>>;
  onCommitEdit: (row: VehicleRow, col: string, value: string) => void;
  /** Column headers for the four fixed meta columns (defaults = vehicles). */
  labels?: { folder: string; type: string; klass: string; name: string };
  /** Domain hint lookup (defaults to the handling glossary). */
  hintFor?: (col: string, kind?: string) => string | undefined;
}

const W_VEHICLE = 200;
const W_TYPE = 150;
const W_CLASS = 150;
const W_NAME = 180;
const W_PARAM = 150;
const ROW_H = 32;
const HEADER_H = 34;

// Small lists stay fully mounted (no unloading while scrolling); larger lists
// virtualize so the DOM stays small (fast tab switching + edits). Overscan is
// generous so fast scrolling rarely shows blank rows.
const NON_VIRTUAL_MAX = 60;
const OVERSCAN = 30;

interface Layout {
  id: string;
  width: number;
  left: number | undefined;
  sticky: boolean;
  param: boolean;
}

const STICKY_BG = "bg-[#1b1f27]";
const STICKY_BG_ALT = "bg-[#181c23]";
const BODY_BG = "bg-[#101319]";
const BODY_BG_ALT = "bg-[#0c0f14]";
const DIRTY_BG = "bg-cellmodified text-gray-900";

function displayValue(
  row: VehicleRow,
  col: string,
  rowEdits?: Record<string, string>
): string {
  return rowEdits?.[col] ?? row.params[col] ?? "";
}

function isDirty(
  row: VehicleRow,
  col: string,
  rowEdits?: Record<string, string>
): boolean {
  const edit = rowEdits?.[col];
  return edit !== undefined && edit !== (row.params[col] ?? "");
}

function buildLayout(columns: string[]): Layout[] {
  const out: Layout[] = [
    { id: "__vehicle", width: W_VEHICLE, left: 0, sticky: true, param: false },
    { id: "__type", width: W_TYPE, left: W_VEHICLE, sticky: true, param: false },
    { id: "__class", width: W_CLASS, left: W_VEHICLE + W_TYPE, sticky: true, param: false },
    {
      id: "__name",
      width: W_NAME,
      left: W_VEHICLE + W_TYPE + W_CLASS,
      sticky: true,
      param: false,
    },
  ];
  for (const c of columns) {
    out.push({ id: c, width: W_PARAM, left: undefined, sticky: false, param: true });
  }
  return out;
}

function metaValue(original: VehicleRow, id: string): string {
  switch (id) {
    case "__vehicle":
      return original.folder_name;
    case "__type":
      return original.vehicle_type;
    case "__class":
      return original.vehicle_class;
    default:
      return original.handling_name;
  }
}

// ---------------------------------------------------------------------------
// Isolated inline editor — typing only re-renders this one input, never the grid.
// ---------------------------------------------------------------------------

interface CellEditorProps {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  hintHtml?: string;
  onHint?: (e: MouseEvent<HTMLButtonElement>) => void;
}

function CellEditor({
  initialValue,
  onCommit,
  onCancel,
  hintHtml,
  onHint,
}: CellEditorProps) {
  const [draft, setDraft] = useState(initialValue);
  const finished = useRef(false);

  const commit = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onCommit(draft);
  }, [draft, onCommit]);

  const cancel = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onCancel();
  }, [onCancel]);

  return (
    <div className="flex h-full w-full items-center bg-white ring-2 ring-inset ring-accent">
      <input
        autoFocus
        className="h-full min-w-0 flex-1 select-text bg-transparent px-2 text-xs text-gray-900 outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
      />
      {hintHtml && onHint && (
        <button
          type="button"
          title="What does this parameter do?"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => onHint(e)}
          className="grid h-full shrink-0 cursor-help place-items-center px-1 text-gray-500 transition-colors hover:text-accent"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hint popover (floating card anchored to the clicked hint icon)
// ---------------------------------------------------------------------------

interface HintPop {
  x: number;
  y: number;
  title: string;
  html: string;
}

function HintOverlay({ pop, onClose }: { pop: HintPop; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute max-h-[60vh] overflow-auto rounded-lg border border-gray-600 bg-gray-900 p-3 shadow-2xl"
        style={{ left: pop.x, top: pop.y, width: 340 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1.5 flex items-start justify-between gap-2 border-b border-gray-700/70 pb-1.5">
          <span className="break-all font-mono text-xs font-semibold text-accent">{pop.title}</span>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 transition-colors hover:text-white"
            aria-label="Close hint"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div
          className="hint-html text-xs leading-relaxed text-gray-300 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ul_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_b]:font-semibold [&_b]:text-gray-100"
          dangerouslySetInnerHTML={{ __html: pop.html }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One virtualised row (memoized so scrolling/typing doesn't re-render all rows).
// ---------------------------------------------------------------------------

interface RowContentProps {
  original: VehicleRow;
  visualIndex: number;
  layout: Layout[];
  /** Edits for THIS row only, so editing one cell never re-renders other rows. */
  rowEdits?: Record<string, string>;
  /** `${rowKey}\u0001${col}` for the cell currently being edited, else null. */
  editingKey: string | null;
  onCommitCell: (row: VehicleRow, col: string, value: string) => void;
  onStartCell: (row: VehicleRow, col: string) => void;
  onCancelCell: () => void;
  onHintOpen: (e: MouseEvent<HTMLElement>, row: VehicleRow, col: string) => void;
  hintFor: (col: string, kind?: string) => string | undefined;
}

const GridRowContent = memo(function GridRowContent({
  original,
  visualIndex,
  layout,
  rowEdits,
  editingKey,
  onCommitCell,
  onStartCell,
  onCancelCell,
  onHintOpen,
  hintFor,
}: RowContentProps) {
  const k = rowKey(original);
  const zebra = visualIndex % 2 === 1;
  const rowBg = zebra ? BODY_BG_ALT : BODY_BG;

  return (
    <div className="flex h-full w-full border-b border-gray-800/80">
      {layout.map((l) => {
        const cellBase =
          "flex h-full shrink-0 select-none items-center overflow-hidden whitespace-nowrap px-2 text-xs";

        if (!l.param) {
          const value = metaValue(original, l.id);
          return (
            <div
              key={l.id}
              className={`${cellBase} ${zebra ? STICKY_BG_ALT : STICKY_BG} border-r border-gray-700/40`}
              style={{ width: l.width, position: "sticky", left: l.left, zIndex: 5 }}
              title={value}
            >
              <span className="truncate">{value}</span>
            </div>
          );
        }

        // Editable parameter cell
        const value = displayValue(original, l.id, rowEdits);
        const dirty = isDirty(original, l.id, rowEdits);
        const cellKey = `${k}\u0001${l.id}`;
        const isEditing = editingKey === cellKey;
        const bg = dirty ? DIRTY_BG : rowBg;
        const hintHtml = hintFor(l.id, original.vehicle_type);

        const hintButton = hintHtml ? (
          <button
            type="button"
            title={`What does ${l.id} do?`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onHintOpen(e, original, l.id);
            }}
            className="grid h-full shrink-0 cursor-help place-items-center px-1 opacity-40 transition-opacity hover:opacity-100"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        ) : null;

        return (
          <div
            key={l.id}
            className={`${cellBase} ${bg} relative ${
              isEditing || dirty ? "" : "cursor-text hover:bg-white/5"
            }`}
            style={{ width: l.width, zIndex: dirty ? 1 : undefined }}
            title={isEditing ? undefined : `Edit ${l.id}`}
            onClick={() => {
              if (!isEditing) onStartCell(original, l.id);
            }}
          >
            {isEditing ? (
              <CellEditor
                key={cellKey}
                initialValue={value}
                onCommit={(v) => onCommitCell(original, l.id, v)}
                onCancel={onCancelCell}
                hintHtml={hintHtml}
                onHint={(e) => onHintOpen(e, original, l.id)}
              />
            ) : (
              <>
                <span className={`min-w-0 flex-1 truncate ${dirty ? "font-semibold" : ""}`}>
                  {value || <span className="opacity-40">—</span>}
                </span>
                {hintButton}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
});

// ---------------------------------------------------------------------------
// The grid — ONE scroll container (both axes): sticky header + virtual rows.
// ---------------------------------------------------------------------------

interface EditingState {
  rowKey: string;
  col: string;
}

function VehicleTableImpl({
  vehicles,
  columns,
  edits,
  onCommitEdit,
  labels,
  hintFor,
}: VehicleTableProps) {
  const metaLabels = labels ?? {
    folder: "Folder",
    type: "Type",
    klass: "Class",
    name: "handlingName",
  };
  const resolver = hintFor ?? paramHint;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [hintPop, setHintPop] = useState<HintPop | null>(null);

  const layout = useMemo(() => buildLayout(columns), [columns]);
  const totalWidth = useMemo(() => layout.reduce((sum, l) => sum + l.width, 0), [layout]);

  const columnHelper = useMemo(() => createColumnHelper<VehicleRow>(), []);

  // Column defs are stable (sorting uses the raw file value).
  const tableColumns = useMemo(() => {
    const base = [
      columnHelper.accessor("folder_name", { id: "__vehicle", header: metaLabels.folder, enableSorting: true }),
      columnHelper.accessor("vehicle_type", { id: "__type", header: metaLabels.type, enableSorting: true }),
      columnHelper.accessor("vehicle_class", { id: "__class", header: metaLabels.klass, enableSorting: true }),
      columnHelper.accessor("handling_name", { id: "__name", header: metaLabels.name, enableSorting: true }),
    ];
    const params = columns.map((col) =>
      columnHelper.accessor((r) => r.params[col] ?? "", { id: col, header: col, enableSorting: true })
    );
    return [...base, ...params];
  }, [columnHelper, columns, metaLabels]);

  const table = useReactTable({
    data: vehicles,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Two-phase overscan: the very first frame only mounts the VISIBLE rows (so
  // opening a big table feels instant), then we enable the overscan buffers a
  // frame later so fast scrolling still never shows blank rows.
  const [overscanReady, setOverscanReady] = useState(false);
  useEffect(() => {
    // setTimeout (not rAF) so it also fires when the window is unfocused;
    // ~50ms lands after the first painted frame.
    const t = window.setTimeout(() => setOverscanReady(true), 50);
    return () => window.clearTimeout(t);
  }, []);
  const effectiveOverscan =
    sortedRows.length <= NON_VIRTUAL_MAX
      ? sortedRows.length
      : overscanReady
        ? OVERSCAN
        : 0;

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: effectiveOverscan,
  });

  // Close the cell editor if its row disappears (filter/scan change).
  useEffect(() => {
    if (editing && !vehicles.some((v) => rowKey(v) === editing.rowKey)) {
      setEditing(null);
    }
  }, [vehicles, editing]);

  const onStartCell = useCallback((row: VehicleRow, col: string) => {
    setEditing({ rowKey: rowKey(row), col });
  }, []);

  const onCancelCell = useCallback(() => setEditing(null), []);

  const onCommitCell = useCallback(
    (row: VehicleRow, col: string, value: string) => {
      setEditing(null);
      onCommitEdit(row, col, value);
    },
    [onCommitEdit]
  );

  const onHintOpen = useCallback(
    (e: MouseEvent<HTMLElement>, row: VehicleRow, col: string) => {
      const html = resolver(col, row.vehicle_type);
      if (!html) return;
      const r = e.currentTarget.getBoundingClientRect();
      const width = 340;
      const x = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const est = 280;
      const y =
        r.bottom + 12 + est <= window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - est - 8);
      setHintPop({ x, y, title: col, html });
    },
    [resolver]
  );

  // Close the hint popover with Escape.
  useEffect(() => {
    if (!hintPop) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setHintPop(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hintPop]);

  // Holding Shift + wheel scrolls horizontally (fallback for WebView2).
  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    if (!e.shiftKey) return;
    const el = e.currentTarget;
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!horizontal && e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
      setHintPop(null);
      el.scrollLeft += e.deltaY;
    }
  }

  const isEmpty = sortedRows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        onScroll={() => setHintPop(null)}
        className="min-h-0 flex-1 overflow-auto"
      >
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No rows match the current filters.
          </div>
        ) : (
          <div className="relative" style={{ width: totalWidth }}>
            {/* Sticky header row (pinned to top while scrolling) */}
            <div
              className="sticky top-0 z-30 flex border-b border-gray-700 bg-gray-800"
              style={{ height: HEADER_H }}
            >
              {table.getHeaderGroups()[0]?.headers.map((header, idx) => {
                const l = layout[idx];
                if (!l) return null;
                const sortDir = header.column.getIsSorted();
                const stickyLeft = l.sticky
                  ? {
                      position: "sticky" as const,
                      left: l.left,
                      zIndex: 31,
                      // Solid backdrop + shadow so the scrolling param headers
                      // never show through / overlap the pinned columns.
                      boxShadow: "3px 0 8px -3px rgba(0,0,0,0.55)",
                    }
                  : {};
                return (
                  <div
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    title={l.param ? `Sort by ${l.id}` : undefined}
                    className={`flex shrink-0 cursor-pointer select-none items-center gap-1 border-r border-gray-700/60 px-2 text-2xs font-semibold uppercase tracking-wide text-gray-300 transition hover:bg-gray-700 ${
                      l.sticky ? "bg-gray-800" : ""
                    }`}
                    style={{ width: l.width, ...stickyLeft }}
                  >
                    <span className="truncate">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </span>
                    <span className="ml-auto shrink-0">
                      {sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3 text-accent" />
                      ) : sortDir === "desc" ? (
                        <ArrowDown className="h-3 w-3 text-accent" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 text-gray-600" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Virtual rows */}
            <div
              className="relative"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const row = sortedRows[vi.index];
                if (!row) return null;
                const original = row.original;
                const k = rowKey(original);
                const editingKey =
                  editing && editing.rowKey === k ? `${k}\u0001${editing.col}` : null;
                return (
                  <div
                    key={row.id}
                    className="gtm-vrow absolute left-0 top-0"
                    style={{
                      width: totalWidth,
                      height: ROW_H,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <GridRowContent
                      original={original}
                      visualIndex={vi.index}
                      layout={layout}
                      rowEdits={edits[k]}
                      editingKey={editingKey}
                      hintFor={resolver}
                      onCommitCell={onCommitCell}
                      onStartCell={onStartCell}
                      onCancelCell={onCancelCell}
                      onHintOpen={onHintOpen}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {hintPop && <HintOverlay pop={hintPop} onClose={() => setHintPop(null)} />}
    </div>
  );
}

export default memo(VehicleTableImpl);
