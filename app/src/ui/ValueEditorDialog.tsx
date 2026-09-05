import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";

interface Props {
  /** Column / element name (mono) shown in the header. */
  title: string;
  /** Current effective value (includes any pending local edit). */
  value: string;
  /** Committed value as currently stored in the file. */
  original: string;
  /** Plain-language guide HTML rendered below the editor when present. */
  hintHtml?: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/**
 * Full-text value editor shown as a centered modal. Cells/fields open this
 * instead of editing inline, so long values are readable and easy to type.
 */
export default function ValueEditorDialog({
  title,
  value,
  original,
  hintHtml,
  onSave,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const dirty = draft !== original;

  // Focus + select all on open.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  // Keep the box sized to its content (capped by CSS max-height).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Escape anywhere in the dialog cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={onCancel}
      onContextMenu={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${title}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-2.5">
          <span className="min-w-0 break-all font-mono text-sm font-semibold text-accent">
            {title}
          </span>
          {dirty && (
            <span className="shrink-0 rounded bg-orange-500/15 px-1.5 py-px text-2xs font-semibold uppercase tracking-wide text-orange-300 ring-1 ring-inset ring-orange-500/40">
              edited
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close editor"
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-gray-500">
            Value
          </label>
          <textarea
            ref={taRef}
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSave(draft);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              }
            }}
            className="w-full resize-none overflow-y-auto rounded-md border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-sm leading-relaxed text-gray-100 outline-none transition-colors focus:border-accent"
            style={{ minHeight: 96, maxHeight: "45vh" }}
          />

          {original !== value && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-gray-800 bg-gray-950/50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-2xs font-semibold uppercase tracking-wider text-gray-500">
                  In file
                </div>
                <div className="max-h-28 overflow-y-auto break-all font-mono text-xs text-gray-400">
                  {original || <span className="text-gray-600">(empty)</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraft(original)}
                title="Revert to the value currently in the file"
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {hintHtml && (
            <div className="mt-2 rounded-md border border-gray-800 bg-gray-950/50 px-3 py-2">
              <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-gray-500">
                What it does
              </div>
              <div
                className="glossary-html max-h-44 overflow-y-auto text-xs leading-relaxed text-gray-400"
                dangerouslySetInnerHTML={{ __html: hintHtml }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-800 px-4 py-2.5">
          <span className="text-2xs text-gray-600">
            Esc cancels · Enter saves · Shift+Enter newline
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-500"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
