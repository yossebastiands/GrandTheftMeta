// carcols.meta (mod-kit parts/colours) field glossary — plain language.
import { buildGlossary, type GlossarySource } from "./core";

const all = [
  "Item.text", "allowBonnetSlide", "audioApply", "bone", "cameraPos", "collisionBone",
  "disableBonnetCamera", "disableDriveby", "disableProjectileDriveby", "id", "identifier",
  "kitName", "kitType", "modShopLabel", "modelName", "modifier", "name", "slot",
  "turnOffExtra", "type", "weaponSlot", "weaponSlotSecondary", "weight",
];

const guide = `
kitName:<p>The name of the mod kit. carvariations.meta references this so the kit can be selected on a vehicle.</p>
<p><b>Rename →</b> update the kit reference in carvariations.meta too.</p>
id:<p>The kit's numeric id (e.g. 917). Scripts and the carvariations kit index use it to switch the kit on.</p>
kitType:<p>How the kit is treated — MKT_SPECIAL means it is a special "extra-style" kit, MKT_STANDARD a normal mod shop kit.</p>
modelName:<p>The .ydr part model fitted when this mod is installed (must exist in the .ytd/.yft).</p>
type:<p>The mod-slot type (VMT_*) this part belongs to — SPOILER, ENGINE, ARMOUR, WHEELS… It decides where in the mod shop the part appears and which slot it replaces.</p>
slot:<p>The slot entry — which VMT_* slot a slot-name/linked part maps to.</p>
modShopLabel:<p>Label key (WT_*) shown in the mod shop for this part. The actual text lives in a label table.</p>
bone:<p>Which chassis bone the part attaches to (e.g. mod_c, chassis).</p>
collisionBone:<p>Which collision bone to enable while this part is fitted (so the part can be shot/damaged).</p>
audioApply:<p>Audio "apply" value this part sends to the audio system (how it changes engine sound, usually 1.0).</p>
weight:<p>Extra mass (kg) this part adds — heavier parts change acceleration/braking.</p>
modifier:<p>The stat change this part applies (e.g. engine/armour upgrade value, or brake strength %).</p>
turnOffExtra:<p>Whether fitting this part turns OFF one of the vehicle's extras (true/false). Used to hide stock parts.</p>
allowBonnetSlide:<p>Whether the driver's view can use the bonnet-cam slide while this part is fitted.</p>
disableBonnetCamera:<p>Whether fitting this part disables the bonnet camera (for enclosed/canopied parts).</p>
disableDriveby:<p>Whether fitting this part stops drive-by shooting (fully enclosed cabins/turrets).</p>
disableProjectileDriveby:<p>Whether fitting this part stops projectile (grenade/rocket) drive-bys.</p>
weaponSlot:<p>Weapon slot id this part provides (for weaponised kits/parts).</p>
weaponSlotSecondary:<p>Secondary weapon slot provided by the part.</p>
cameraPos:<p>Camera position preset (VMCP_*) used when the driver operates this part.</p>
identifier:<p>Unique internal string identifying the part (often unused by the game, but kept unique).</p>
name:<p>Display/internal name for slot-name and light entries.</p>
Item.text:<p>A list value — for linked models, the extra/mod model names this entry links together.</p>
Item.value:<p>A list value (e.g. a colour/light index list).</p>
`;

export const carcolsGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Mod part",
  all,
  guide,
  what: "carcols.meta mod-part field",
});
