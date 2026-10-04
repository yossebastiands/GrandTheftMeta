// Weapon Templates — P1 of the weapon pack generator: a **read-only** look at the
// base-weapon catalogue derived from a folder of vanilla / pack metas.
//
// Nothing here writes. This is the first step of the generator: it proves we can
// find the base weapons, their animation/personality coverage, their streamed
// archetype models and their components — and it surfaces the template defects the
// original toolkit shipped (11 of its 27 weapon templates name a *sibling* weapon's
// id, which is why any clone has to retarget those ids).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  FileWarning,
  FolderOpen,
  Info,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { analyzeWeaponTemplates, pickFolder } from "../../../shared/api";
import type { WeaponComponent, WeaponTemplate, WeaponTemplateCatalog } from "../../../shared/models";
import { demoWeaponTemplates } from "./demoWeaponTemplates";

/** Tauri commands are unavailable in a plain browser (dev demos only). */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export default function WeaponTemplatesView(): ReactNode {
  const [catalog, setCatalog] = useState<WeaponTemplateCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showComponents, setShowComponents] = useState(false);

  const load = useCallback(async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await analyzeWeaponTemplates(path);
      setCatalog(result);
      setFolder(path);
      setSelected(result.templates[0]?.id ?? null);
    } catch (e) {
      setError(String(e));
      setCatalog(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const choose = useCallback(async () => {
    if (!inTauri()) {
      setError(
        "The folder picker needs the desktop app (`npm run tauri dev`) — a plain browser pane cannot run Tauri commands.",
      );
      return;
    }
    const picked = await pickFolder();
    if (picked) await load(picked);
  }, [load]);

  // Dev fixture: `?wtdemo` loads a synthetic catalogue in a plain browser pane
  // (the Tauri command does not exist there). Mirrors the `?uvdemo` convention.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("wtdemo")) return;
    const demo = demoWeaponTemplates();
    setCatalog(demo);
    setFolder(demo.folder_path);
    setSelected(demo.templates[0]?.id ?? null);
  }, []);

  const templates = useMemo(() => {
    const all = catalog?.templates ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((t) => {
      if (onlyIssues && t.warnings.length === 0) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        t.audio.toLowerCase().includes(q)
      );
    });
  }, [catalog, search, onlyIssues]);

  const active: WeaponTemplate | null =
    templates.find((t) => t.id === selected) ?? templates[0] ?? null;
  const issueCount = (catalog?.templates ?? []).filter((t) => t.warnings.length > 0).length;

  if (!catalog) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <Crosshair className="h-10 w-10 text-gray-700" />
        <h2 className="text-sm font-semibold text-gray-200">Weapon Templates</h2>
        <p className="max-w-xl text-2xs leading-relaxed text-gray-500">
          Point this at a folder that contains vanilla or pack weapon metas and it derives the
          <span className="text-gray-300"> base weapon catalogue</span>: every weapon with its model,
          slot, group, audio, ammo, clip size, range and tuning params, plus how many animation
          personality sets and pedpersonality bindings name it, its streamed archetype models and its
          components. <span className="text-gray-300">Read-only</span> — nothing is written. This is
          step 1 of the weapon pack generator.
        </p>
        <button
          type="button"
          onClick={choose}
          disabled={busy}
          className="mt-1 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          Select folder…
        </button>
        {error && (
          <p className="mt-2 max-w-xl rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-2xs text-amber-300">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-800 bg-gray-900/60 px-3 py-2">
        <Crosshair className="h-4 w-4 text-accent" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-200">
          Weapon Templates
        </h2>
        <span title={folder} className="max-w-[26rem] truncate text-2xs text-gray-500">
          {folder}
        </span>
        <span className="rounded-full border border-gray-700 bg-gray-800/70 px-2 py-0.5 text-2xs tabular-nums text-gray-300">
          {catalog.templates.length} templates
        </span>
        <span className="rounded-full border border-gray-700 bg-gray-800/70 px-2 py-0.5 text-2xs tabular-nums text-gray-300">
          {catalog.components.length} components
        </span>
        {issueCount > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 text-2xs tabular-nums text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {issueCount} with issues
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search id / model / group / audio…"
              className="w-64 rounded border border-gray-700 bg-gray-900 py-1 pl-7 pr-2 text-2xs text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-1 text-2xs text-gray-400">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
              className="accent-orange-500"
            />
            only with issues
          </label>
          <button
            type="button"
            onClick={choose}
            disabled={busy}
            className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-2xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Rescan
          </button>
        </span>
      </div>

      {error && (
        <p className="shrink-0 border-b border-amber-900/60 bg-amber-950/30 px-3 py-1.5 text-2xs text-amber-300">
          {error}
        </p>
      )}

      {catalog.skipped.length > 0 && (
        <details className="shrink-0 border-b border-gray-800 bg-gray-900/40">
          <summary className="cursor-pointer px-3 py-1.5 text-2xs text-gray-400">
            {catalog.skipped.length} file{catalog.skipped.length === 1 ? "" : "s"} skipped
          </summary>
          <ul className="flex flex-col gap-0.5 px-3 pb-2 font-mono text-2xs text-gray-500">
            {catalog.skipped.map((s) => (
              <li key={s} className="truncate" title={s}>
                {s}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Template list */}
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-800">
          {templates.length === 0 && (
            <p className="p-3 text-2xs text-gray-500">No template matches.</p>
          )}
          {templates.map((t) => {
            const isActive = active?.id === t.id && active?.file === t.file;
            return (
              <button
                key={`${t.file}\u0000${t.id}`}
                type="button"
                onClick={() => setSelected(t.id)}
                className={`flex flex-col gap-0.5 border-b border-gray-800/60 px-3 py-2 text-left transition ${
                  isActive ? "bg-accent/15 text-accent" : "text-gray-300 hover:bg-gray-800/60"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-2xs">{t.id}</span>
                  {t.warnings.length > 0 && (
                    <FileWarning className="h-3 w-3 shrink-0 text-amber-400" />
                  )}
                </span>
                <span className="flex items-center gap-2 text-2xs text-gray-500">
                  <span className="truncate">{t.model || "—"}</span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {t.anim_sets} anim · {t.ped_refs} ped
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        {/* Detail */}
        <main className="min-w-0 flex-1 overflow-y-auto p-3">
          {active ? (
            <TemplateDetail
              template={active}
              components={catalog.components}
              onToggleComponents={() => setShowComponents((v) => !v)}
              showComponents={showComponents}
            />
          ) : (
            <p className="text-2xs text-gray-500">Pick a weapon on the left.</p>
          )}
        </main>
      </div>
    </div>
  );
}

function TemplateDetail({
  template,
  components,
  showComponents,
  onToggleComponents,
}: {
  template: WeaponTemplate;
  components: WeaponComponent[];
  showComponents: boolean;
  onToggleComponents: () => void;
}): ReactNode {
  const params = useMemo(() => Object.entries(template.params), [template]);
  const suggested = useMemo(() => {
    const byName = new Map(components.map((c) => [c.name, c]));
    return template.suggested_components.map((n) => byName.get(n) ?? null);
  }, [components, template]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-sm text-gray-100">{template.id}</h3>
        {template.warnings.length === 0 ? (
          <span className="flex items-center gap-1 rounded-full border border-green-900/60 bg-green-950/30 px-2 py-0.5 text-2xs text-green-300">
            <CheckCircle2 className="h-3 w-3" /> no issues
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 text-2xs text-amber-300">
            <AlertTriangle className="h-3 w-3" /> {template.warnings.length} issue
            {template.warnings.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto truncate text-2xs text-gray-500" title={template.file}>
          {template.file}
        </span>
      </div>

      {template.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-amber-900/50 bg-amber-950/20 p-2 text-2xs text-amber-300/90">
          {template.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-gray-800 bg-gray-900/40 p-2 text-2xs md:grid-cols-3">
        <Field label="Model" value={template.model} mono />
        <Field label="Slot" value={template.slot} mono />
        <Field label="Group" value={template.group} mono />
        <Field label="Wheel slot" value={template.wheel_slot} mono />
        <Field label="Audio" value={template.audio} mono />
        <Field label="Ammo" value={template.ammo_ref} mono />
        <Field label="Damage type" value={template.damage_type} mono />
        <Field label="Fire type" value={template.fire_type} mono />
        <Field label="Clip size" value={template.clip_size} mono />
        <Field label="Range" value={template.weapon_range} mono />
        <Field label="HumanNameHash" value={template.human_name_hash} mono />
        <Field
          label="Slot order"
          value={template.slot_order ? `${template.slot_order} (${template.slot_entry})` : "—"}
          mono
        />
      </dl>

      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Animation coverage">
          <p className="text-2xs text-gray-400">
            <span className="tabular-nums text-gray-200">{template.anim_sets}</span> personality set
            {template.anim_sets === 1 ? "" : "s"} name this id
            {template.anim_sets === 0 && (
              <span className="text-amber-300"> — it would share another weapon's clips</span>
            )}
          </p>
          <Files list={template.anim_files} />
          <p className="mt-2 text-2xs text-gray-400">
            <span className="tabular-nums text-gray-200">{template.ped_refs}</span> pedpersonality
            binding{template.ped_refs === 1 ? "" : "s"}
          </p>
          <Files list={template.ped_files} />
        </Card>

        <Card title="Streamed models">
          {template.archetype_models.length === 0 ? (
            <p className="flex items-start gap-1.5 text-2xs text-gray-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Nothing declared — a stub. The generator creates one `CWeaponModelInfo` per streamed
              drawable (`_hi` LODs excluded, `lodDist` 500 for the main model).
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 font-mono text-2xs text-gray-300">
              {template.archetype_models.map((m) => (
                <li key={m} className="truncate">
                  {m}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Components">
          {template.suggested_components.length === 0 && template.local_components.length === 0 ? (
            <p className="text-2xs text-gray-500">None matched by name.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {template.local_components.map((c) => (
                <Chip key={c} text={c} tone="local" />
              ))}
              {suggested.map((c, i) =>
                c ? (
                  <Chip
                    key={c.name}
                    text={`${c.name} · ${c.kind}${c.clip_size ? ` · ${c.clip_size}` : ""}`}
                    tone="suggested"
                  />
                ) : (
                  <Chip key={`missing-${i}`} text={template.suggested_components[i]} tone="missing" />
                ),
              )}
            </ul>
          )}
          <button
            type="button"
            onClick={onToggleComponents}
            className="mt-2 rounded px-1 py-0.5 text-2xs text-accent hover:bg-gray-800"
          >
            {showComponents ? "Hide" : "Show"} all {components.length} components
          </button>
        </Card>
      </div>

      {showComponents && (
        <div className="overflow-x-auto rounded-md border border-gray-800">
          <table className="w-full text-2xs">
            <thead className="bg-gray-900/70 text-gray-500">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Component</th>
                <th className="px-2 py-1 text-left font-medium">Kind</th>
                <th className="px-2 py-1 text-left font-medium">Model</th>
                <th className="px-2 py-1 text-left font-medium">Attach bone → weapon bone</th>
                <th className="px-2 py-1 text-right font-medium">Clip</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.name} className="border-t border-gray-800/60 text-gray-300">
                  <td className="px-2 py-1 font-mono">{c.name}</td>
                  <td className="px-2 py-1">{c.kind}</td>
                  <td className="px-2 py-1 font-mono text-gray-500">{c.model || "—"}</td>
                  <td className="px-2 py-1 font-mono text-gray-500">
                    {c.attach_bone || "—"} → <span className="text-gray-300">{c.weapon_attach_bone}</span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{c.clip_size || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-md border border-gray-800 bg-gray-900/40">
        <summary className="cursor-pointer px-2 py-1.5 text-2xs text-gray-400">
          Tuning params ({params.length})
        </summary>
        <div className="max-h-72 overflow-auto border-t border-gray-800 px-2 py-1">
          <table className="w-full text-2xs">
            <tbody>
              {params.map(([k, v]) => (
                <tr key={k} className="border-b border-gray-800/40">
                  <td className="py-0.5 pr-3 font-mono text-gray-400">{k}</td>
                  <td className="py-0.5 font-mono text-gray-200">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }): ReactNode {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className={`truncate text-gray-200 ${mono ? "font-mono" : ""}`} title={value}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-900/40 p-2">
      <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Files({ list }: { list: string[] }): ReactNode {
  if (list.length === 0) return null;
  // The card is narrow and the paragraph above already names the file kind, so the
  // line only identifies *where* — with the full list in the tooltip.
  const text = list.length === 1 ? tailPath(list[0]) : `${list.length} files`;
  return (
    <p className="mt-1 truncate font-mono text-2xs text-gray-600" title={list.join("\n")}>
      in {text}
    </p>
  );
}

/** Last two segments of a relative path (`metas/wt_alpha/weapons.meta` → `wt_alpha/weapons.meta`). */
function tailPath(path: string): string {
  const parts = path.split("/");
  return parts.slice(-2).join("/");
}

function Chip({ text, tone }: { text: string; tone: "local" | "suggested" | "missing" }): ReactNode {
  const cls =
    tone === "local"
      ? "border-gray-600 bg-gray-800/70 text-gray-200"
      : tone === "suggested"
        ? "border-accent/40 bg-accent/10 text-accent"
        : "border-amber-900/60 bg-amber-950/30 text-amber-300";
  return (
    <li className={`truncate rounded border px-1.5 py-0.5 font-mono text-2xs ${cls}`} title={text}>
      {text}
    </li>
  );
}
