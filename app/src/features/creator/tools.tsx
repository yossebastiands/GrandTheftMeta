// Creator Tools registry.
//
// The top-navbar "Creator Tools" tab is a small hub: each entry here becomes a
// card in the tool rail. Adding a tool = adding one entry (no other wiring).
import type { ReactNode } from "react";
import { Map as MapIcon, Boxes, Crosshair, FileCode2, Image as ImageIcon, Wrench } from "lucide-react";
import UvMapGenerator from "./uv/UvMapGenerator";
import WeaponTemplatesView from "./weapons/WeaponTemplatesView";
import WeaponGeneratorView from "./weapons/WeaponGeneratorView";

export interface CreatorTool {
  id: string;
  label: string;
  /** One-line description shown in the launcher and the workspace header. */
  tagline: string;
  icon: ReactNode;
  /** Longer "what it does / what it does not do" text for the launcher card. */
  detail: string;
  /** Renders the tool workspace. Only `live` tools have one. */
  render?: () => ReactNode;
  status: "live" | "planned";
  /** Accepts drag & drop / picker of these extensions (live tools only). */
  accepts?: string[];
}

export const CREATOR_TOOLS: CreatorTool[] = [
  {
    id: "uv-map",
    label: "UV Map Generator",
    tagline: "Import a drawable and export its UV layout as PNG sheets.",
    icon: <MapIcon className="h-4 w-4" />,
    detail:
      "Reads the vertex buffers of a .ydr / .yft and draws every geometry's texture coordinates " +
      "into UV space — one colour per mesh, 0–1 frame included. Export at any resolution, " +
      "optionally one file per mesh. Read-only: your asset file is never modified.",
    render: () => <UvMapGenerator />,
    status: "live",
    accepts: ["ydr", "yft", "ydd"],
  },
  {
    id: "weapon-templates",
    label: "Weapon Templates",
    tagline: "List the base weapons a pack can be built from (read-only).",
    icon: <Crosshair className="h-4 w-4" />,
    detail:
      "Point it at a folder of vanilla or pack metas and it derives the base weapon catalogue: every " +
      "CWeaponInfo with its model, slot, group, audio, ammo, clip size, range and tuning params, how " +
      "many animation personality sets and pedpersonality bindings name it, its streamed archetype " +
      "models and its components. It also flags hand-made templates that reference a sibling weapon's " +
      "id (11 of the 27 the original toolkit shipped do). Step 1 of the weapon pack generator — " +
      "read-only, nothing is written.",
    render: () => <WeaponTemplatesView />,
    status: "live",
  },
  {
    id: "weapon-generator",
    label: "Weapon Generator",
    tagline: "Build add-on weapon resources from a base template — one weapon, or a whole pack.",
    icon: <Wrench className="h-4 w-4" />,
    detail:
      "Clone a base weapon definition out of your own vanilla/pack metas, retarget every weapon " +
      "reference to your new id, generate weaponarchetypes.meta from the streamed drawables, wire the " +
      "components and write a ready-to-run resource (fxmanifest.lua, cl_weaponNames.lua, metas/, " +
      "stream/). Queue several weapons and pack mode writes them into ONE resource — one manifest, one " +
      "label list, duplicate slot orders and components detected, slot orders allocated for you. " +
      "Everything is surgical and previewed first: nothing is written until you press Write, and the " +
      "writer refuses while the plan reports a conflict.",
    render: () => <WeaponGeneratorView />,
    status: "live",
  },
];

/** Announced but not built yet — listed so the hub shows where this is going. */
export const PLANNED_TOOLS: Pick<CreatorTool, "id" | "label" | "tagline" | "icon">[] = [
  {
    id: "texture-inspect",
    label: "Texture Inspector",
    tagline: "Browse the .ytd textures referenced by a drawable.",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    id: "mesh-export",
    label: "Mesh Export",
    tagline: "Drawable geometry to OBJ / glTF for DCC round-trips.",
    icon: <Boxes className="h-4 w-4" />,
  },
  {
    id: "meta-generate",
    label: "Meta Generator",
    tagline: "Scaffold vehicles.meta / handling.meta from a model list.",
    icon: <FileCode2 className="h-4 w-4" />,
  },
];

export function findTool(id: string): CreatorTool | undefined {
  return CREATOR_TOOLS.find((t) => t.id === id);
}
