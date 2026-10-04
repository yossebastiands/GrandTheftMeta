// Weapon Generator — P2/P3 of the weapon pack generator: build ONE add-on weapon
// (clone → retarget → generate) or a whole PACK of weapons in one resource, with a dry-run
// plan first.
//
// Read-only until the user presses Write: `Preview` calls the backend dry run, which is
// the same code path the writer uses, so the plan is not an approximation.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  FileCheck2,
  FolderOpen,
  Layers,
  Loader2,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  analyzeWeaponTemplates,
  loadWeaponPreset,
  pickFolder,
  previewWeaponExport,
  previewWeaponPack,
  saveWeaponPreset,
  scanWeaponAssets,
  writeWeaponPack,
} from "../../../shared/api";
import type {
  ExportPlan,
  PackPlan,
  PackWriteReport,
  PlannedFile,
  WeaponAsset,
  WeaponComponentSpec,
  WeaponSpec,
  WeaponTemplate,
  WeaponTemplateCatalog,
} from "../../../shared/models";
import {
  demoGeneratorAssets,
  demoGeneratorBlockedPackPlan,
  demoGeneratorBlockedPlan,
  demoGeneratorCatalog,
  demoGeneratorPackPlan,
  demoGeneratorPackQueue,
  demoGeneratorPlan,
  demoGeneratorSlots,
} from "./demoWeaponGenerator";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const numOrNull = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};
const textOrNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/** `COMPONENT_COMBATPISTOL_CLIP_01` + `WEAPON_GLOCK17` → `COMPONENT_GLOCK17_CLIP_01`. */
function autoComponentTarget(sourceName: string, weaponId: string): string {
  const token = weaponId.replace(/^WEAPON_/, "");
  const m = /^COMPONENT_(.+)_CLIP_(\d+)$/.exec(sourceName);
  if (m && m[1] !== token) return `COMPONENT_${token}_CLIP_${m[2]}`;
  return sourceName;
}

/** Which `mag` drawable a `…_CLIP_nn` component should point at. */
function clipModelFor(targetName: string, assets: WeaponAsset[]): string | null {
  const m = /CLIP_(\d+)$/.exec(targetName);
  if (!m) return null;
  return assets.find((a) => a.role === `mag${m[1]}`)?.drawable ?? null;
}

export default function WeaponGeneratorView(): ReactNode {
  const [catalog, setCatalog] = useState<WeaponTemplateCatalog | null>(null);
  const [assets, setAssets] = useState<WeaponAsset[]>([]);
  const [assetsFolder, setAssetsFolder] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [model, setModel] = useState("");
  const [slotOrder, setSlotOrder] = useState("");
  const [stats, setStats] = useState<Record<string, string>>({});
  const [components, setComponents] = useState<WeaponComponentSpec[]>([]);
  const [componentFilter, setComponentFilter] = useState("");
  const [boneFilter, setBoneFilter] = useState("");
  const [presetPath, setPresetPath] = useState("");
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [outFolder, setOutFolder] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [mode, setMode] = useState<"single" | "pack">("single");
  const [queue, setQueue] = useState<WeaponSpec[]>([]);
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [packPlan, setPackPlan] = useState<PackPlan | null>(null);
  const [report, setReport] = useState<PackWriteReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const template: WeaponTemplate | null =
    catalog?.templates.find((t) => t.id === templateId) ?? catalog?.templates[0] ?? null;

  // ---- dev fixture ------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    if (!query.has("wggen")) return;
    const demo = demoGeneratorCatalog();
    const demoAssets = demoGeneratorAssets();
    setCatalog(demo);
    setAssets(demoAssets);
    // applyTemplate clears the plan, so it must run BEFORE the fixture plan is set
    applyTemplate(demo.templates[0], demoAssets);
    setOutFolder("C:/demo/weapons  (synthetic ?wggen fixture)");
    const demoMode = query.get("wggen");
    // `?wggen=blocked` renders the writer-refusing state (conflicts present)
    setPlan(demoMode === "blocked" ? demoGeneratorBlockedPlan() : demoGeneratorPlan());
    // `?wggen=pack` / `?wggen=packblocked` show the pack panel with a queued pair
    setQueue(demoGeneratorPackQueue());
    setPackPlan(
      demoMode === "packblocked" ? demoGeneratorBlockedPackPlan() : demoGeneratorPackPlan(),
    );
    if (demoMode === "pack" || demoMode === "packblocked") setMode("pack");
    // `?wggen=slots` shows the per-slot editor with several options on the same bone
    if (demoMode === "slots") {
      setQueue([]);
      setPackPlan(null);
      setPlan(null);
      setComponents(demoGeneratorSlots());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- template → prefill ----------------------------------------------
  // A plain function, not a useCallback: the fixture effect below runs before a
  // `const` would be initialised, and nothing here depends on render identity.
  function applyTemplate(t: WeaponTemplate | null, assetList: WeaponAsset[]) {
    if (!t) return;
    setTemplateId(t.id);
    setId(`${t.id}_ADDON`);
    setDisplayName(t.model || t.id);
    setModel(assetList.find((a) => a.role === "main")?.drawable ?? "");
    setSlotOrder(t.slot_order || "");
    setStats({
      audio: t.audio,
      ammo_ref: t.ammo_ref,
      damage_type: t.damage_type,
      fire_type: t.fire_type,
      damage: t.params["Damage"] ?? "",
      range: t.weapon_range,
      clip_size: t.clip_size,
      fire_rate_modifier: "",
      headshot_modifier: t.params["HeadShotDamageModifierPlayer"] ?? "",
      reload_rate: t.params["AnimReloadRate"] ?? "",
    });
    setComponents(
      t.suggested_components.map((name) => ({
        name,
        source_name: name,
        source_file: "",
        model: null,
        clip_size: null,
        default: false,
      })),
    );
    setPlan(null);
    setPackPlan(null);
    setReport(null);
  }

  const loadTemplates = useCallback(
    async (folder: string) => {
      setBusy("templates");
      setError(null);
      try {
        const result = await analyzeWeaponTemplates(folder);
        setCatalog(result);
        applyTemplate(result.templates[0] ?? null, assets);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [assets],
  );

  const loadAssets = useCallback(async () => {
    if (!inTauri()) {
      setError("Picking folders needs the desktop app (`npm run tauri dev`).");
      return;
    }
    const folder = await pickFolder();
    if (!folder) return;
    setBusy("assets");
    setError(null);
    try {
      const list = await scanWeaponAssets(folder);
      setAssets(list);
      setAssetsFolder(folder);
      setModel((m) => m || list.find((a) => a.role === "main")?.drawable || "");
      setPlan(null);
      setPackPlan(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  /** Catalogue component → a spec entry (source file resolved from the catalogue). */
  const specFor = useCallback(
    (name: string, chosen: WeaponComponentSpec[], assetList: WeaponAsset[], weaponId: string): WeaponComponentSpec => {
      const existing = chosen.find((c) => c.name === name || c.source_name === name);
      if (existing) return existing;
      const source = catalog?.components.find((c) => c.name === name);
      const target = autoComponentTarget(name, weaponId);
      return {
        name: target,
        source_name: name,
        source_file: source?.path ?? "",
        model: clipModelFor(target, assetList),
        clip_size: null,
        default: false,
      };
    },
    [catalog],
  );

  const spec: WeaponSpec = useMemo(
    () => ({
      id: id.trim(),
      display_name: displayName.trim(),
      template_meta_path: template?.meta_path ?? "",
      template_id: template?.id ?? "",
      assets_folder: assetsFolder || null,
      model: textOrNull(model),
      audio: textOrNull(stats.audio ?? ""),
      ammo_ref: textOrNull(stats.ammo_ref ?? ""),
      damage_type: textOrNull(stats.damage_type ?? ""),
      fire_type: textOrNull(stats.fire_type ?? ""),
      damage: textOrNull(stats.damage ?? ""),
      range: textOrNull(stats.range ?? ""),
      clip_size: textOrNull(stats.clip_size ?? ""),
      headshot_modifier: textOrNull(stats.headshot_modifier ?? ""),
      reload_rate: textOrNull(stats.reload_rate ?? ""),
      fire_rate_modifier: textOrNull(stats.fire_rate_modifier ?? ""),
      slot_order: numOrNull(slotOrder),
      components,
    }),
    [id, displayName, template, assetsFolder, model, stats, slotOrder, components],
  );

  /**
   * The weapons a write would send: the queue in pack mode (with any slot order the pack plan
   * allocated folded in, so the plan and the write agree), else just the form's weapon.
   */
  const specSnapshot = useMemo<WeaponSpec[]>(() => {
    if (queue.length === 0) return spec.id.trim() ? [spec] : [];
    return queue.map((w) => {
      const allocated = packPlan?.allocations.find((a) => a.startsWith(`${w.id} `));
      const n = allocated ? /\d+/.exec(allocated.split("→")[1] ?? "")?.[0] : undefined;
      return n ? { ...w, slot_order: Number(n) } : w;
    });
  }, [queue, packPlan, spec]);

  const preview = useCallback(async () => {
    setBusy("preview");
    setError(null);
    setReport(null);
    try {
      if (mode === "pack") {
        setPackPlan(await previewWeaponPack({ weapons: queue }, outFolder));
      } else {
        setPlan(await previewWeaponExport(spec, outFolder));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [mode, queue, spec, outFolder]);

  const write = useCallback(async () => {
    setBusy("write");
    setError(null);
    try {
      setReport(await writeWeaponPack({ weapons: specSnapshot }, outFolder, overwrite));
      setPackPlan(await previewWeaponPack({ weapons: specSnapshot }, outFolder));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [specSnapshot, outFolder, overwrite]);

  /** The current form as a pack entry — the weapon the user is editing right now. */
  const currentEntry = useMemo<WeaponSpec | null>(
    () => (spec.id.trim() === "" || spec.display_name.trim() === "" ? null : spec),
    [spec],
  );

  /** Why the current weapon cannot be queued yet (empty = it can). */
  const entryProblem = useMemo(() => {
    if (spec.id.trim() === "") return "give the weapon an id first";
    if (spec.display_name.trim() === "") return "give the weapon a display name first";
    if (!template) return "pick a base template first";
    if (queue.some((w) => w.id === spec.id)) return `${spec.id} is already in the pack`;
    return null;
  }, [spec.id, spec.display_name, template, queue]);

  const addToQueue = () => {
    if (entryProblem || !currentEntry) return;
    setQueue((prev) => [...prev, currentEntry]);
    setPackPlan(null);
    setReport(null);
    setMode("pack");
  };

  const removeFromQueue = (weaponId: string) => {
    setQueue((prev) => prev.filter((w) => w.id !== weaponId));
    setPackPlan(null);
    setReport(null);
  };

  /** The plan to show: the selected mode's, with the queue as the source of truth. */
  const activePlan: ExportPlan | PackPlan | null = mode === "pack" ? packPlan : plan;
  const conflicts = activePlan?.conflicts ?? [];

  const filteredComponents = useMemo(() => {
    const list = catalog?.components ?? [];
    const q = componentFilter.trim().toLowerCase();
    return list.filter(
      (c) =>
        (boneFilter === "" || c.weapon_attach_bone === boneFilter) &&
        (q === "" || c.name.toLowerCase().includes(q) || c.kind.toLowerCase().includes(q)),
    );
  }, [catalog, componentFilter, boneFilter]);

  /** Every attach bone the catalogue offers, so the list can be narrowed to one slot. */
  const bones = useMemo(() => {
    const set = new Set<string>();
    for (const c of catalog?.components ?? []) {
      if (c.weapon_attach_bone) set.add(c.weapon_attach_bone);
    }
    return [...set].sort();
  }, [catalog]);

  /**
   * The attachment slots as the backend will write them: components grouped by the bone a
   * component attaches to (`WeaponAttachBone`), in the order they were queued — that order is
   * the cycle order in game, and the plan reports it as "N slot(s) on M bone(s)".
   */
  const slotGroups = useMemo(() => {
    const groups: Array<{
      bone: string;
      options: WeaponComponentSpec[];
      defaults: number;
    }> = [];
    for (const component of components) {
      const bone =
        catalog?.components.find((c) => c.name === component.source_name)?.weapon_attach_bone ??
        "(unknown bone)";
      let group = groups.find((g) => g.bone === bone);
      if (!group) {
        group = { bone, options: [], defaults: 0 };
        groups.push(group);
      }
      group.options.push(component);
      if (component.default) group.defaults += 1;
    }
    return groups;
  }, [components, catalog]);

  /** Move an option one step earlier/later inside its own slot (the cycle order). */
  const moveOption = (option: WeaponComponentSpec, delta: number) => {
    const bone = catalog?.components.find((c) => c.name === option.source_name)?.weapon_attach_bone;
    const sameBone = (c: WeaponComponentSpec) =>
      catalog?.components.find((x) => x.name === c.source_name)?.weapon_attach_bone === bone;
    setComponents((prev) => {
      const from = prev.indexOf(option);
      if (from < 0) return prev;
      let neighbour = -1;
      for (let i = from + delta; i >= 0 && i < prev.length; i += delta) {
        if (sameBone(prev[i])) {
          neighbour = i;
          break;
        }
      }
      if (neighbour < 0) return prev;
      const next = [...prev];
      [next[from], next[neighbour]] = [next[neighbour], next[from]];
      return next;
    });
    setPlan(null);
    setPackPlan(null);
  };

  /** One default per slot: the game equips exactly one option of a bone. */
  const setDefaultOption = (sourceName: string) => {
    const bone = catalog?.components.find((c) => c.name === sourceName)?.weapon_attach_bone;
    setComponents((prev) =>
      prev.map((c) =>
        catalog?.components.find((x) => x.name === c.source_name)?.weapon_attach_bone === bone
          ? { ...c, default: c.source_name === sourceName }
          : c,
      ),
    );
    setPlan(null);
    setPackPlan(null);
  };

  const removeOption = (sourceName: string) => {
    setComponents((prev) => prev.filter((c) => c.source_name !== sourceName));
    setPlan(null);
    setPackPlan(null);
  };

  const savePreset = useCallback(async () => {
    setBusy("preset");
    setError(null);
    setPresetNote(null);
    try {
      setPresetNote(await saveWeaponPreset(specSnapshot, outFolder || null, presetPath.trim()));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [specSnapshot, outFolder, presetPath]);

  const loadPreset = useCallback(async () => {
    setBusy("preset");
    setError(null);
    setPresetNote(null);
    try {
      const preset = await loadWeaponPreset(presetPath.trim());
      setQueue(preset.weapons);
      if (preset.out_folder) setOutFolder(preset.out_folder);
      setPackPlan(null);
      setPlan(null);
      setReport(null);
      if (preset.weapons.length > 0) setMode("pack");
      setPresetNote(
        `loaded ${preset.weapons.length} weapon(s) — ${preset.weapons.reduce(
          (n, w) => n + w.components.length,
          0,
        )} component(s)`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, [presetPath]);

  const toggleComponent = (name: string) => {
    setComponents((prev) => {
      const has = prev.some((c) => c.source_name === name);
      if (has) return prev.filter((c) => c.source_name !== name);
      return [...prev, specFor(name, prev, assets, id)];
    });
    setPlan(null);
    setPackPlan(null);
  };

  const patchComponent = (sourceName: string, patch: Partial<WeaponComponentSpec>) => {
    setComponents((prev) => prev.map((c) => (c.source_name === sourceName ? { ...c, ...patch } : c)));
    setPlan(null);
    setPackPlan(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-800 bg-gray-900/60 px-3 py-2">
        <Wrench className="h-4 w-4 text-accent" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-200">Weapon Generator</h2>
        <span className="text-2xs text-gray-500">
          clone a base template → retarget → write one add-on weapon resource
        </span>
        {busy && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
        <span className="ml-auto flex items-center gap-2 text-2xs text-gray-400">
          {catalog ? `${catalog.templates.length} templates` : "no templates loaded"}
          <span className="text-gray-600">·</span>
          {assets.length} assets
        </span>
      </div>

      {error && (
        <p className="shrink-0 border-b border-amber-900/60 bg-amber-950/30 px-3 py-1.5 text-2xs text-amber-300">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid gap-3 xl:grid-cols-2">
          {/* 1 + 2: sources */}
          <Card title="1 · Base template" icon={<Crosshair className="h-3.5 w-3.5" />}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={async () => {
                if (!inTauri()) return setError("Picking folders needs the desktop app.");
                const folder = await pickFolder();
                if (folder) await loadTemplates(folder);
              }} className={btn}>
                <FolderOpen className="h-3 w-3" /> Template folder…
              </button>
              {catalog && <span className="truncate text-2xs text-gray-500">{catalog.folder_path}</span>}
            </div>
            {catalog && catalog.templates.length > 0 && (
              <>
                <select
                  value={template?.id ?? ""}
                  onChange={(e) => {
                    const next = catalog.templates.find((t) => t.id === e.target.value) ?? null;
                    applyTemplate(next, assets);
                  }}
                  className={sel}
                >
                  {catalog.templates.map((t) => (
                    <option key={`${t.file}\u0000${t.id}`} value={t.id}>
                      {t.id} · {t.model} · {t.group}
                    </option>
                  ))}
                </select>
                {template && template.warnings.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5 text-2xs text-amber-300/90">
                    {template.warnings.slice(0, 3).map((w) => (
                      <li key={w} className="flex gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <p className="mt-2 text-2xs text-gray-500">
              A shared vanilla folder is fine here: the plan blocks the animation/personality clone
              and tells you to point at a per-weapon folder.
            </p>
          </Card>

          <Card title="2 · Assets" icon={<FolderOpen className="h-3.5 w-3.5" />}>
            <button type="button" onClick={loadAssets} className={btn}>
              <FolderOpen className="h-3 w-3" /> Assets folder…
            </button>
            {assets.length > 0 && (
              <ul className="mt-2 flex max-h-32 flex-col gap-0.5 overflow-y-auto font-mono text-2xs">
                {assets.map((a) => (
                  <li key={a.file} className="flex items-center gap-2 text-gray-400">
                    <span className="w-20 shrink-0 rounded border border-gray-700 px-1 text-center text-gray-300">
                      {a.role}
                    </span>
                    <span className="truncate" title={a.file}>
                      {a.file}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums text-gray-600">{a.drawable}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 3: identity + stats */}
          <Card title="3 · Identity & stats" icon={<FileCheck2 className="h-3.5 w-3.5" />}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Weapon ID" value={id} onChange={setId} mono placeholder="WEAPON_GLOCK17" />
              <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Glock-17" />
              <Field label="Model" value={model} onChange={setModel} mono placeholder="w_pi_glock17_luxe" />
              <Field label="Slot order" value={slotOrder} onChange={setSlotOrder} mono placeholder="423" />
              <Field label="Audio" value={stats.audio ?? ""} onChange={(v) => setStats((s) => ({ ...s, audio: v }))} mono />
              <Field label="Ammo ref" value={stats.ammo_ref ?? ""} onChange={(v) => setStats((s) => ({ ...s, ammo_ref: v }))} mono />
              <Field label="Damage type" value={stats.damage_type ?? ""} onChange={(v) => setStats((s) => ({ ...s, damage_type: v }))} mono />
              <Field label="Fire type" value={stats.fire_type ?? ""} onChange={(v) => setStats((s) => ({ ...s, fire_type: v }))} mono />
              <Field label="Damage" value={stats.damage ?? ""} onChange={(v) => setStats((s) => ({ ...s, damage: v }))} mono />
              <Field label="Weapon range" value={stats.range ?? ""} onChange={(v) => setStats((s) => ({ ...s, range: v }))} mono />
              <Field label="Clip size" value={stats.clip_size ?? ""} onChange={(v) => setStats((s) => ({ ...s, clip_size: v }))} mono />
              <Field label="Fire rate modifier" value={stats.fire_rate_modifier ?? ""} onChange={(v) => setStats((s) => ({ ...s, fire_rate_modifier: v }))} mono />
              <Field label="Headshot modifier" value={stats.headshot_modifier ?? ""} onChange={(v) => setStats((s) => ({ ...s, headshot_modifier: v }))} mono />
              <Field label="Reload rate" value={stats.reload_rate ?? ""} onChange={(v) => setStats((s) => ({ ...s, reload_rate: v }))} mono />
            </div>
          </Card>

          {/* 4: components */}
          <Card title={`4 · Component catalogue (${components.length} attached)`}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500" />
              <input
                value={componentFilter}
                onChange={(e) => setComponentFilter(e.target.value)}
                placeholder="Filter components…"
                className="w-full rounded border border-gray-700 bg-gray-900 py-1 pl-7 pr-2 text-2xs text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
              />
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-2xs text-gray-500">
                Attach bone
                <select
                  value={boneFilter}
                  onChange={(e) => setBoneFilter(e.target.value)}
                  className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-2xs text-gray-200 focus:border-accent focus:outline-none"
                >
                  <option value="">all ({catalog?.components.length ?? 0})</option>
                  {bones.map((bone) => (
                    <option key={bone} value={bone}>
                      {bone} ({catalog?.components.filter((c) => c.weapon_attach_bone === bone).length ?? 0})
                    </option>
                  ))}
                </select>
              </label>
              <span className="ml-auto text-2xs text-gray-600">
                every option of one bone is a slot — add several and they cycle in this order
              </span>
            </div>
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {filteredComponents.map((c) => {
                const picked = components.find((p) => p.source_name === c.name);
                return (
                  <li key={c.name} className="rounded border border-gray-800 bg-gray-900/40 p-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-2xs text-gray-300">
                      <input type="checkbox" checked={!!picked} onChange={() => toggleComponent(c.name)} className="accent-orange-500" />
                      <span className="truncate font-mono" title={c.name}>
                        {c.name}
                      </span>
                      <span className="ml-auto shrink-0 text-gray-500">
                        {c.kind}
                        {c.clip_size ? ` · ${c.clip_size}` : ""} · {c.weapon_attach_bone}
                      </span>
                    </label>
                    {picked && (
                      <div className="mt-1 grid grid-cols-2 gap-1.5 pl-5">
                        <Field
                          label="Name in resource"
                          value={picked.name}
                          onChange={(v) => patchComponent(c.name, { name: v })}
                          mono
                        />
                        <Field
                          label="Model"
                          value={picked.model ?? ""}
                          onChange={(v) => patchComponent(c.name, { model: textOrNull(v) })}
                          mono
                          placeholder="inherit"
                        />
                        <label className="col-span-2 flex cursor-pointer items-center gap-1.5 text-2xs text-gray-400">
                          <input
                            type="checkbox"
                            checked={picked.default}
                            onChange={(e) => patchComponent(c.name, { default: e.target.checked })}
                            className="accent-orange-500"
                          />
                          equipped by default (`&lt;Default value="true" /&gt;`)
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* 5: attachment slots — the per-bone option lists a real pack is made of */}
          <Card
            title={`5 · Attachment slots (${slotGroups.length} bone${slotGroups.length === 1 ? "" : "s"}, ${components.length} option${components.length === 1 ? "" : "s"})`}
            icon={<Wrench className="h-3.5 w-3.5" />}
          >
            {slotGroups.length === 0 ? (
              <p className="text-2xs text-gray-500">
                No components attached yet. Pick a few from the catalogue (two clips on the same
                bone = one slot with two options, the way hand-made packs do it).
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {slotGroups.map((slot) => (
                  <li key={slot.bone} className="rounded border border-gray-800 bg-gray-900/40 p-1.5">
                    <div className="flex items-center gap-2 text-2xs">
                      <span className="font-mono text-gray-200">{slot.bone}</span>
                      <span className="text-gray-500">
                        {slot.options.length} option{slot.options.length === 1 ? "" : "s"}
                      </span>
                      {slot.defaults > 1 && (
                        <span className="text-amber-300">
                          {slot.defaults} marked default — only one can be equipped
                        </span>
                      )}
                      {slot.defaults === 0 && (
                        <span className="text-gray-500">no default (none equipped at spawn)</span>
                      )}
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {slot.options.map((option, index) => (
                        <li
                          key={option.source_name}
                          className="flex items-center gap-1.5 rounded bg-gray-900/60 px-1.5 py-0.5 text-2xs"
                        >
                          <span className="w-4 shrink-0 text-right tabular-nums text-gray-600">
                            {index + 1}
                          </span>
                          <label
                            className="flex shrink-0 cursor-pointer items-center gap-1 text-gray-400"
                            title="equipped when the player spawns with this weapon"
                          >
                            <input
                              type="radio"
                              name={`default-${slot.bone}`}
                              checked={option.default}
                              onChange={() => setDefaultOption(option.source_name)}
                              className="accent-orange-500"
                            />
                            default
                          </label>
                          <span className="truncate font-mono text-gray-200" title={option.name}>
                            {option.name}
                          </span>
                          {option.name !== option.source_name && (
                            <span className="shrink-0 text-gray-600">← {option.source_name}</span>
                          )}
                          <span className="ml-auto flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveOption(option, -1)}
                              title="earlier in the cycle"
                              className="rounded px-1 text-gray-500 hover:bg-gray-800 disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={index === slot.options.length - 1}
                              onClick={() => moveOption(option, 1)}
                              title="later in the cycle"
                              className="rounded px-1 text-gray-500 hover:bg-gray-800 disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOption(option.source_name)}
                              title="detach"
                              className="rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 6: pack queue */}
          <Card title={`6 · Pack queue (${queue.length} weapon${queue.length === 1 ? "" : "s"})`} icon={<Layers className="h-3.5 w-3.5" />}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addToQueue}
                disabled={!!entryProblem}
                title={entryProblem ?? "queue the weapon above as its own resource folder"}
                className={btn}
              >
                <Plus className="h-3 w-3" /> Add to pack
              </button>
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQueue([]);
                    setPackPlan(null);
                    setReport(null);
                  }}
                  className={btn}
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              )}
              {entryProblem && <span className="text-2xs text-gray-500">{entryProblem}</span>}
            </div>
            {queue.length > 0 ? (
              <>
                <ul className="mt-2 flex flex-col gap-1">
                  {queue.map((w) => {
                    const planForWeapon = packPlan?.weapons.find((p) => p.folder === weaponSlug(w.id));
                    return (
                      <li
                        key={w.id}
                        className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/40 px-1.5 py-1 text-2xs"
                      >
                        <span className="truncate font-mono text-gray-200" title={w.id}>
                          {w.id}
                        </span>
                        <span className="truncate text-gray-500">{w.display_name}</span>
                        <span className="ml-auto shrink-0 font-mono text-gray-500">
                          {w.slot_order ?? "auto"}
                        </span>
                        <span className="shrink-0 text-gray-600">{w.components.length} comp</span>
                        <span
                          className={`shrink-0 tabular-nums ${
                            planForWeapon && planForWeapon.conflicts.length > 0
                              ? "text-red-400"
                              : planForWeapon
                                ? "text-green-400"
                                : "text-gray-600"
                          }`}
                          title="files this weapon would write / blockers"
                        >
                          {planForWeapon ? `${planForWeapon.files.length} files` : "not planned"}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromQueue(w.id)}
                          title="remove from the pack"
                          className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-2xs text-gray-500">
                  Pack mode writes every weapon into one resource: a single{" "}
                  <span className="font-mono">fxmanifest.lua</span>, one{" "}
                  <span className="font-mono">cl_weaponNames.lua</span>, and one{" "}
                  <span className="font-mono">metas/&lt;weapon&gt;/</span> folder per weapon. Weapons
                  already in the target keep the slot order they were given last time.
                </p>
              </>
            ) : (
              <p className="mt-2 text-2xs text-gray-500">
                Empty — write a single weapon with <span className="text-gray-400">Single</span> mode,
                or queue several to generate a pack in one pass.
              </p>
            )}
          </Card>
        </div>

        {/* 7: review */}
        <div className="mt-3 rounded-md border border-gray-800 bg-gray-900/40 p-2">
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-gray-500">
            7 · Review &amp; write
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded border border-gray-700">
              {(["single", "pack"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={m === "pack" && queue.length === 0}
                  title={
                    m === "pack" && queue.length === 0 ? "add a weapon to the pack queue first" : undefined
                  }
                  className={`px-2 py-1 text-2xs disabled:opacity-40 ${
                    mode === m ? "bg-accent font-semibold text-white" : "text-gray-400 hover:bg-gray-800"
                  }`}
                >
                  {m === "pack" ? `Pack (${queue.length})` : "Single"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!inTauri()) return setError("Picking folders needs the desktop app.");
                const folder = await pickFolder();
                if (folder) {
                  setOutFolder(folder);
                  setPlan(null);
                  setPackPlan(null);
                  setReport(null);
                }
              }}
              className={btn}
            >
              <FolderOpen className="h-3 w-3" /> Output folder…
            </button>
            <span title={outFolder} className="max-w-[28rem] truncate text-2xs text-gray-500">
              {outFolder || "no output folder selected"}
            </span>
            <button
              type="button"
              onClick={preview}
              disabled={!!busy || !outFolder || (mode === "pack" && queue.length === 0)}
              className={`${btn} ml-auto`}
            >
              <Play className="h-3 w-3" /> {mode === "pack" ? "Preview pack" : "Preview"}
            </button>
            <button
              type="button"
              onClick={write}
              disabled={!!busy || !activePlan || conflicts.length > 0 || specSnapshot.length === 0}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-2xs font-semibold text-white hover:bg-orange-500 disabled:opacity-40"
            >
              {busy === "write" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              {mode === "pack"
                ? `Write pack (${specSnapshot.length} weapon${specSnapshot.length === 1 ? "" : "s"})`
                : "Write resource"}
            </button>
            <label className="flex cursor-pointer items-center gap-1 text-2xs text-gray-400">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-orange-500" />
              overwrite existing
            </label>
          </div>

          {mode === "single" && plan && (
            <div className="mt-2 flex flex-col gap-2">
              {plan.conflicts.length > 0 && (
                <List tone="conflict" title={`${plan.conflicts.length} conflict(s) — writing is blocked`} items={plan.conflicts} />
              )}
              {plan.warnings.length > 0 && <List tone="warn" title="Warnings" items={plan.warnings} />}
              {plan.retargeted.length > 0 && <List tone="info" title="Weapon ids retargeted" items={plan.retargeted} />}
              {plan.edits.length > 0 && <List tone="info" title="Value writes" items={plan.edits} />}
              <FileTable files={plan.files} root={plan.out_root} />
              <p className="text-2xs text-gray-500">
                {plan.files.length} file(s) · {(plan.total_bytes / 1024).toFixed(1)} KiB → {plan.out_root}
                {plan.folder ? ` (resource folder: ${plan.folder})` : ""}
              </p>
            </div>
          )}

          {mode === "pack" && packPlan && <PackReview plan={packPlan} />}

          {/* presets — the editor state as a diffable JSON file (the original tool had none) */}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-2">
            <span className="text-2xs text-gray-500">Preset</span>
            <input
              value={presetPath}
              onChange={(e) => setPresetPath(e.target.value)}
              placeholder="C:/packs/weapons/m6ic.json"
              className="min-w-[18rem] flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-2xs text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={savePreset}
              disabled={!!busy || presetPath.trim() === "" || specSnapshot.length === 0}
              className={btn}
              title="write the queued weapons + output folder as JSON"
            >
              <Save className="h-3 w-3" /> Save preset
            </button>
            <button
              type="button"
              onClick={loadPreset}
              disabled={!!busy || presetPath.trim() === ""}
              className={btn}
              title="load a preset and queue its weapons"
            >
              <FolderOpen className="h-3 w-3" /> Load preset
            </button>
            {presetNote && <span className="text-2xs text-gray-400">{presetNote}</span>}
          </div>

          {report && (
            <div className="mt-2 rounded border border-green-900/60 bg-green-950/30 p-2 text-2xs text-green-300">
              <p className="font-semibold">
                Wrote {report.written.length} file(s) and copied {report.copied.length} asset(s) —{" "}
                {(report.bytes / 1024).toFixed(1)} KiB
                {report.weapons.length > 1 ? ` · ${report.weapons.length} weapons in one resource` : ""}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-green-200/80">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {report.skipped.map((s) => (
                  <li key={s}>skipped: {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btn =
  "flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-2xs text-gray-300 hover:bg-gray-800 disabled:opacity-40";
const sel =
  "mt-2 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-2xs text-gray-200 focus:border-accent focus:outline-none";

/** Mirrors the backend's `weapon_slug`: `WEAPON_GLOCK17` → `glock17` (the resource folder). */
function weaponSlug(id: string): string {
  return id.replace(/^WEAPON_/i, "").toLowerCase();
}

/** Path as the plan shows it: relative to the resource root. */
function relative(path: string, root: string): string {
  return path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]/, "") : path;
}

/** Whole-pack review: blocking duplicates first, then the files per weapon. */
function PackReview({ plan }: { plan: PackPlan }): ReactNode {
  const files = plan.weapons.reduce((n, w) => n + w.files.length, 0);
  return (
    <div className="mt-2 flex flex-col gap-2">
      {plan.conflicts.length > 0 && (
        <List tone="conflict" title={`${plan.conflicts.length} conflict(s) — writing is blocked`} items={plan.conflicts} />
      )}
      {plan.warnings.length > 0 && <List tone="warn" title="Warnings" items={plan.warnings} />}
      {plan.allocations.length > 0 && <List tone="info" title="Slot orders allocated" items={plan.allocations} />}
      <div className="rounded border border-gray-800 p-2 text-2xs">
        <p className="font-semibold text-gray-400">Shared files — written once for the whole resource</p>
        <ul className="mt-1 flex flex-col gap-0.5 font-mono text-gray-500">
          {plan.shared_files.map((f) => (
            <li key={f.path} title={f.path} className="truncate">
              {f.action} · {relative(f.path, plan.out_root)} · {f.kind} · {f.bytes} B
            </li>
          ))}
        </ul>
      </div>
      <p className="text-2xs text-gray-500">
        {plan.weapons.length} weapon(s) · {files + plan.shared_files.length} file(s) ·{" "}
        {(plan.total_bytes / 1024).toFixed(1)} KiB → {plan.out_root}
      </p>
      {plan.weapons.map((w) => (
        <details
          key={w.folder || w.out_root}
          open={w.conflicts.length > 0}
          className="rounded border border-gray-800 bg-gray-900/40 p-2"
        >
          <summary className="cursor-pointer text-2xs text-gray-300">
            <span className="font-mono">{w.folder}</span> · {w.files.length} file(s) ·{" "}
            {(w.total_bytes / 1024).toFixed(1)} KiB
            {w.conflicts.length > 0 && <span className="text-red-400"> · {w.conflicts.length} blocked</span>}
          </summary>
          <div className="mt-1.5 flex flex-col gap-2">
            {w.conflicts.length > 0 && <List tone="conflict" title="Blockers" items={w.conflicts} />}
            {w.retargeted.length > 0 && <List tone="info" title="Weapon ids retargeted" items={w.retargeted} />}
            {w.edits.length > 0 && <List tone="info" title="Value writes" items={w.edits} />}
            <FileTable files={w.files} root={w.out_root} />
          </div>
        </details>
      ))}
    </div>
  );
}

function FileTable({ files, root }: { files: PlannedFile[]; root: string }): ReactNode {
  return (
    <div className="overflow-x-auto rounded border border-gray-800">
      <table className="w-full text-2xs">
        <thead className="bg-gray-900/70 text-gray-500">
          <tr>
            <th className="px-2 py-1 text-left font-medium">File</th>
            <th className="px-2 py-1 text-left font-medium">Action</th>
            <th className="px-2 py-1 text-left font-medium">Kind</th>
            <th className="px-2 py-1 text-right font-medium">Bytes</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.path} className="border-t border-gray-800/60 text-gray-300">
              <td className="truncate px-2 py-1 font-mono" title={f.path}>
                {relative(f.path, root)}
              </td>
              <td className="px-2 py-1">{f.action}</td>
              <td className="px-2 py-1 text-gray-500">{f.kind}</td>
              <td className="px-2 py-1 text-right tabular-nums">{f.bytes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-md border border-gray-800 bg-gray-900/40 p-2">
      <h4 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-gray-500">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}): ReactNode {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-2xs text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded border border-gray-700 bg-gray-900 px-1.5 py-1 text-2xs text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

function List({ tone, title, items }: { tone: "conflict" | "warn" | "info"; title: string; items: string[] }): ReactNode {
  const cls =
    tone === "conflict"
      ? "border-red-900/60 bg-red-950/30 text-red-300"
      : tone === "warn"
        ? "border-amber-900/60 bg-amber-950/30 text-amber-300"
        : "border-gray-800 bg-gray-900/40 text-gray-400";
  return (
    <div className={`rounded border p-2 text-2xs ${cls}`}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={i} className="truncate" title={i}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
