// Per-meta glossary registry.
//
// One GlossarySource per meta id (the same ids used by the Home editors and the
// Glossary view GROUPS). A source's entries() powers the Glossary pages and its
// hint() powers the in-table "?" popovers, so adding a meta = registering one
// source here (plus setting PANELS[meta].hintFor on the Home side).

import { handlingGlossary, paramHint } from "../hints";
import { weaponGlossary, paramHintWeapon } from "../weaponHints";
import { type GlossarySource } from "./core";
import { vehiclesGlossary } from "./vehiclesGlossary";
import { carcolsGlossary } from "./carcolsGlossary";
import { carvariationsGlossary } from "./carvariationsGlossary";
import { vehiclelayoutsGlossary } from "./vehiclelayoutsGlossary";
import { vehicleweaponsGlossary } from "./vehicleweaponsGlossary";
import { weaponarchetypesGlossary } from "./weaponarchetypesGlossary";
import { weaponanimationsGlossary } from "./weaponanimationsGlossary";
import { pedpersonalityGlossary } from "./pedpersonalityGlossary";

/** handling + weapons use the existing (older) sources. */
const handling: GlossarySource = {
  moduleLabel: "Vehicle",
  entries: handlingGlossary,
  hint: (col) => paramHint(col, undefined),
};

const weapons: GlossarySource = {
  moduleLabel: "Weapon",
  entries: weaponGlossary,
  hint: paramHintWeapon,
};

export const GLOSSARIES: Record<string, GlossarySource> = {
  handling,
  vehicles: vehiclesGlossary,
  carcols: carcolsGlossary,
  carvariations: carvariationsGlossary,
  vehiclelayouts: vehiclelayoutsGlossary,
  vehicleweapons: vehicleweaponsGlossary,
  veh_weaponarchetypes: weaponarchetypesGlossary,
  weaponanimations: weaponanimationsGlossary,
  weaponarchetypes: weaponarchetypesGlossary,
  pedpersonality: pedpersonalityGlossary,
  weapons,
};

/** Glossary entries for a meta id (empty when the meta has no glossary yet). */
export function glossaryEntries(id: string): ReturnType<GlossarySource["entries"]> {
  return GLOSSARIES[id]?.entries() ?? [];
}

/** Hint text for one column of one meta (undefined when not covered). */
export function glossaryHint(id: string, col: string): string | undefined {
  return GLOSSARIES[id]?.hint(col);
}

/** Number of glossary entries for a meta id. */
export function glossaryCount(id: string): number {
  return GLOSSARIES[id]?.entries().length ?? 0;
}
