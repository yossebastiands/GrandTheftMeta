import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
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
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { rowKey, type VehicleRow } from "../../shared/models";

export interface VehicleTableProps {
  /** Rows to display (already filtered by search / class). */
  vehicles: VehicleRow[];
  /** Ordered param column names. */
  columns: string[];
  /** Committed edits keyed by rowKey -> col -> value. */
  edits: Record<string, Record<string, string>>;
  onCommitEdit: (row: VehicleRow, col: string, value: string) => void;
}

const W_VEHICLE = 200;
const W_TYPE = 150;
const W_CLASS = 150;
const W_NAME = 180;
const W_PARAM = 150;
const ROW_H = 32;

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

function displayValue(row: VehicleRow, col: string, edits: Record<string, Record<string, string>>): string {
  const k = rowKey(row);
  return edits[k]?.[col] ?? row.params[col] ?? "";
}

function isDirty(row: VehicleRow, col: string, edits: Record<string, Record<string, string>>): boolean {
  const k = rowKey(row);
  const edit = edits[k]?.[col];
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
}

function CellEditor({ initialValue, onCommit, onCancel }: CellEditorProps) {
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
    <input
      autoFocus
      className="absolute inset-0 h-full w-full select-text bg-white px-2 text-xs text-gray-900 outline-none ring-2 ring-inset ring-accent"
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
  );
}

// ---------------------------------------------------------------------------
// One virtualised row (memoized so scrolling/typing doesn't re-render all rows).
// ---------------------------------------------------------------------------

interface RowContentProps {
  original: VehicleRow;
  visualIndex: number;
  layout: Layout[];
  edits: Record<string, Record<string, string>>;
  /** `${rowKey}\u0001${col}` for the cell currently being edited, else null. */
  editingKey: string | null;
  onCommitCell: (row: VehicleRow, col: string, value: string) => void;
  onStartCell: (row: VehicleRow, col: string) => void;
  onCancelCell: () => void;
}

const GridRowContent = memo(function GridRowContent({
  original,
  visualIndex,
  layout,
  edits,
  editingKey,
  onCommitCell,
  onStartCell,
  onCancelCell,
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
        const value = displayValue(original, l.id, edits);
        const dirty = isDirty(original, l.id, edits);
        const cellKey = `${k}\u0001${l.id}`;
        const isEditing = editingKey === cellKey;
        const bg = dirty ? DIRTY_BG : rowBg;

        return (
          <div
            key={l.id}
            className={`${cellBase} ${bg} relative`}
            style={{ width: l.width, zIndex: dirty ? 1 : undefined }}
          >
            {isEditing ? (
              <CellEditor
                key={cellKey}
                initialValue={value}
                onCommit={(v) => onCommitCell(original, l.id, v)}
                onCancel={onCancelCell}
              />
            ) : (
              <button
                type="button"
                className={`h-full w-full truncate text-left transition-colors ${
                  dirty ? "font-semibold" : "hover:bg-white/10"
                }`}
                title={`Edit ${l.id}`}
                onClick={() => onStartCell(original, l.id)}
              >
                {value || <span className="opacity-40">—</span>}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
});

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

interface EditingState {
  rowKey: string;
  col: string;
}

export default function VehicleTable({
  vehicles,
  columns,
  edits,
  onCommitEdit,
}: VehicleTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const layout = useMemo(() => buildLayout(columns), [columns]);
  const totalWidth = useMemo(() => layout.reduce((sum, l) => sum + l.width, 0), [layout]);

  const columnHelper = useMemo(() => createColumnHelper<VehicleRow>(), []);

  // Column defs are stable (sorting uses the raw file value) — never rebuilt on edits.
  const tableColumns = useMemo(() => {
    const base = [
      columnHelper.accessor("folder_name", { id: "__vehicle", header: "Vehicle", enableSorting: true }),
      columnHelper.accessor("vehicle_type", { id: "__type", header: "Type", enableSorting: true }),
      columnHelper.accessor("vehicle_class", { id: "__class", header: "Class", enableSorting: true }),
      columnHelper.accessor("handling_name", { id: "__name", header: "handlingName", enableSorting: true }),
    ];
    const params = columns.map((col) =>
      columnHelper.accessor((r) => r.params[col] ?? "", { id: col, header: col, enableSorting: true })
    );
    return [...base, ...params];
  }, [columnHelper, columns]);

  const table = useReactTable({
    data: vehicles,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;

  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
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

  function syncHeaderScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = el.scrollLeft;
    }
  }

  const isEmpty = sortedRows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Column header band (horizontally synced with the body) */}
      <div
        ref={headerScrollRef}
        className="no-scrollbar z-10 flex-none overflow-x-auto overflow-y-hidden border-b border-gray-700 bg-gray-800"
      >
        <div className="flex" style={{ width: totalWidth }}>
          {table.getHeaderGroups()[0]?.headers.map((header, idx) => {
            const l = layout[idx];
            if (!l) return null;
            const sortDir = header.column.getIsSorted();
            return (
              <div
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                title={l.param ? `Sort by ${l.id}` : undefined}
                className="flex shrink-0 cursor-pointer select-none items-center gap-1 border-r border-gray-700/60 px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-gray-300 transition hover:bg-gray-700"
                style={{
                  width: l.width,
                  ...(l.sticky ? { position: "sticky", left: l.left, zIndex: 20 } : {}),
                }}
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
      </div>

      {/* Body (scrolls both axes) */}
      <div ref={bodyScrollRef} onScroll={syncHeaderScroll} className="min-h-0 flex-1 overflow-auto">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No rows match the current filters.
          </div>
        ) : (
          <div
            className="relative"
            style={{ width: totalWidth, height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const row = sortedRows[vi.index];
              if (!row) return null;
              const original = row.original;
              const k = rowKey(original);
              const editingKey =
                editing && editing.rowKey === k
                  ? `${k}\u0001${editing.col}`
                  : null;
              return (
                <div
                  key={row.id}
                  className="absolute left-0 top-0"
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
                    edits={edits}
                    editingKey={editingKey}
                    onCommitCell={onCommitCell}
                    onStartCell={onStartCell}
                    onCancelCell={onCancelCell}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

