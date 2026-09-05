import type { ReactNode } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

export interface ToastData {
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
}

const STYLES: Record<ToastData["kind"], { border: string; icon: ReactNode; title: string }> = {
  success: {
    border: "border-green-600/60",
    icon: <CheckCircle2 className="h-5 w-5 text-green-400" />,
    title: "text-green-300",
  },
  error: {
    border: "border-red-600/60",
    icon: <XCircle className="h-5 w-5 text-red-400" />,
    title: "text-red-300",
  },
  info: {
    border: "border-blue-600/60",
    icon: <Info className="h-5 w-5 text-blue-400" />,
    title: "text-blue-300",
  },
};

export default function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  const s = STYLES[toast.kind];
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 max-w-md rounded-lg border ${s.border} bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{s.icon}</div>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${s.title}`}>{toast.title}</p>
          {toast.message && (
            <p className="mt-0.5 whitespace-pre-line text-xs text-gray-400">{toast.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
