import { FolderOpen, Loader2, RefreshCw, Upload } from "lucide-react";

interface ToolbarProps {
  folder: string | null;
  scanning: boolean;
  updating: boolean;
  canUpdate: boolean;
  onPickFolder: () => void;
  onRescan: () => void;
  onUpdate: () => void;
}

export default function Toolbar({
  folder,
  scanning,
  updating,
  canUpdate,
  onPickFolder,
  onRescan,
  onUpdate,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-3 py-2">
      <button
        onClick={onPickFolder}
        disabled={scanning || updating}
        className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FolderOpen className="h-4 w-4" />
        {folder ? "Change Folder" : "Select Folder"}
      </button>

      <div
        className="min-w-0 flex-1 truncate rounded border border-gray-800 bg-gray-950 px-2 py-1.5 text-xs text-gray-400"
        title={folder ?? undefined}
      >
        {folder ?? "No folder selected — pick the folder that contains the vehicle resources."}
      </div>

      <button
        onClick={onRescan}
        disabled={!folder || scanning || updating}
        className="flex items-center gap-2 rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
        Rescan
      </button>

      <button
        onClick={onUpdate}
        disabled={!canUpdate || updating || scanning}
        className="flex items-center gap-2 rounded-md bg-green-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Update Files
      </button>
    </div>
  );
}
