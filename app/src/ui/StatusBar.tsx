import { Database } from "lucide-react";

interface StatusBarProps {
  /** What the rows are called in the counts (defaults to vehicles). */
  noun?: string;
  vehicleCount: number;
  paramCount: number;
  modifiedRows: number;
  modifiedCells: number;
  skippedCount: number;
  skipped: string[];
}

export default function StatusBar({
  noun = "vehicles",
  vehicleCount,
  paramCount,
  modifiedRows,
  modifiedCells,
  skippedCount,
  skipped,
}: StatusBarProps) {
  return (
    <div className="flex h-7 items-center gap-4 border-t border-gray-800 bg-gray-900 px-3 text-2xs text-gray-400">
      <span className="flex items-center gap-1.5">
        <Database className="h-3 w-3 text-accent" />
        <span className="font-semibold text-gray-200">{vehicleCount}</span> {noun}
      </span>
      <span>
        <span className="font-semibold text-gray-200">{paramCount}</span> params
      </span>
      {modifiedRows > 0 && (
        <span className="text-yellow-300">
          <span className="font-semibold">{modifiedRows}</span> modified rows
          {modifiedCells > 0 && (
            <>
              {" · "}
              <span className="font-semibold">{modifiedCells}</span> cells
            </>
          )}
        </span>
      )}
      {skippedCount > 0 && (
        <span
          className="ml-auto cursor-help text-orange-400 underline decoration-dotted"
          title={skipped.join("\n")}
        >
          {skippedCount} skipped (hover for details)
        </span>
      )}
    </div>
  );
}
