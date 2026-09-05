// weaponarchetypes.meta (CWeaponModelInfo archetype) glossary — plain language.
// The same file format serves both mounted (vehicle) and firearm archetypes.
import { buildGlossary, type GlossarySource } from "./core";

const all = ["lodDist", "ptfxAssetName", "txdName"];

const guide = `
txdName:<p>Which texture dictionary the weapon model's textures live in (usually the weapon model name, e.g. W_LR_SIDEWINDER).</p>
ptfxAssetName:<p>Particle-effect dictionary used when the weapon fires/hits (muzzle flash, explosion debris, tracers).</p>
lodDist:<p>LOD distance (m) — how far the weapon model is shown at full quality before it swaps to a simpler version.</p>
<p><b>Up →</b> the detailed model stays visible further away (heavier to render). <b>Down →</b> it culls sooner.</p>
`;

export const weaponarchetypesGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Archetype",
  all,
  guide,
  what: "weaponarchetypes.meta archetype field",
});
