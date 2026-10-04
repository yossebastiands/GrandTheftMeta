import { BookOpenText, Sparkles } from "lucide-react";
import { PLANNED_TOOLS } from "./tools";

/**
 * Asset Workshop → Glossary. Empty by design for now: it will explain the
 * shaders/materials a drawable references (and their texture slots) the way the
 * Meta Workshop glossaries explain meta parameters.
 */
export default function AssetGlossaryView() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-10">
        <div className="flex items-center gap-2">
          <BookOpenText className="h-5 w-5 text-gray-600" />
          <h1 className="text-sm font-semibold text-gray-200">Asset glossary</h1>
          <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-2xs text-gray-500">
            empty for now
          </span>
        </div>
        <p className="text-xs leading-relaxed text-gray-400">
          Nothing here yet. When it lands, this page will list the shaders and materials a drawable
          references — what each one is for, which texture slots it uses, and which are the
          paintable / livery layers — so you can read a model without guessing from shader hashes.
        </p>

        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-gray-500">
            <Sparkles className="h-3 w-3" />
            Planned asset tools
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {PLANNED_TOOLS.map((tool) => (
              <li key={tool.id} className="flex items-start gap-2 text-2xs text-gray-500">
                <span className="mt-0.5 shrink-0 opacity-70">{tool.icon}</span>
                <span className="min-w-0">
                  <span className="font-medium text-gray-400">{tool.label}</span>
                  <span className="text-gray-600"> — {tool.tagline}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
