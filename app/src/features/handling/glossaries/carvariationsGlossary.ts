// carvariations.meta (per-model build variations) field glossary — plain language.
import { buildGlossary, type GlossarySource } from "./core";

const all = [
  "Item.text", "Item.value", "Name", "Value", "indices", "lightSettings", "modelName",
  "sirenSettings",
];

const guide = `
modelName:<p>Which vehicle model this variation entry belongs to (matches a vehicles.meta modelName).</p>
lightSettings:<p>The light rig profile id this model uses (sets headlight/taillight behaviour). 18 is the common default.</p>
sirenSettings:<p>The siren/lightbar profile used by emergency versions (0 = none).</p>
indices:<p>Numbered colour/kit index list — which paint colours and mod kits this variation may use.</p>
<p>Each number points into the carcols colour tables / kit slots; leave the count matching what the model supports.</p>
Item.text:<p>A list text value (e.g. livery names a variation is allowed to use).</p>
Item.value:<p>A list value (e.g. a colour index in a colour-combination row).</p>
Name:<p>The name of a probability row — e.g. a named plate-probability option or a livery name.</p>
Value:<p>The chance/weight of the matching named row (e.g. plate text "police" at 100, others lower).</p>
`;

export const carvariationsGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Variation",
  all,
  guide,
  what: "carvariations.meta variation field",
});
