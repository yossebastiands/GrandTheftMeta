// vehicles.meta (CVehicleModelInfo) field glossary — plain language.
import { buildGlossary, type GlossarySource } from "./core";

const all = [
  "AllowBodyColorMapping", "AllowJoyriding", "AllowPretendOccupants", "AllowSundayDriving",
  "HDTextureDist", "NmBraceOverrideSet", "PovCameraVerticalAdjustmentForRollCage", "aimCameraName",
  "animConvRoofDictName", "animConvRoofName", "audioNameHash", "bonnetCameraName",
  "bumpersNeedToCollideWithMap", "buoyancySphereSizeScale", "cameraName", "coverBoundOffsets",
  "damageMapScale", "damageOffsetScale", "dashboardType", "defaultBodyHealth", "diffuseTint",
  "dirtLevelMax", "dirtLevelMin", "doorStiffnessMultipliers", "envEffScaleMax", "envEffScaleMax2",
  "envEffScaleMin", "envEffScaleMin2", "explosionInfo", "expressionDictName", "expressionName",
  "flags", "frequency", "gameName", "handlingId", "identicalModelSpawnDistance", "layout",
  "lodDistances", "maxNum", "maxNumOfSameColor", "maxSteeringWheelAngle", "minSeatHeight",
  "needsRopeTexture", "plateType", "povCameraName", "povTurretCameraName", "pretendOccupantsScale",
  "ptfxAssetName", "requiredExtras", "shouldCameraIgnoreExiting",
  "shouldCameraTransitionOnClimbUpDown", "shouldUseCinematicViewMode", "steerWheelMult",
  "swankness", "trackerPathWidth", "txdName", "type", "vehicleClass", "vehicleMakeName",
  "vfxInfoName", "visibleSpawnDistScale", "weaponForceMult", "wheelScale", "wheelScaleRear",
  "wheelType",
];

const guide = `
type:<p>What <b>kind</b> of vehicle it is — CAR, PLANE, HELI, BOAT, TRAIN… The game uses this to pick the handling/physics module, audio, and how it behaves in traffic.</p>
<p><b>Change it to:</b> CAR → plane = flying physics and airports; wrong type usually breaks driving. Keep the category that matches the model.</p>
vehicleClass:<p>The script "class" (SUPER, SPORTS, OFF_ROAD, MILITARY…) that NPC traffic, parking and the police use to judge the vehicle.</p>
<p><b>Higher/prestige classes →</b> it spawns as a nicer traffic car. It is cosmetic for driving feel.</p>
modelName:<p>The unique model id — everything else (handlingId, txd, layouts, spawn commands) refers to this name.</p>
<p><b>Rename →</b> update handlingId, txdName and any spawn entries at the same time.</p>
txdName:<p>Which texture dictionary the vehicle's .ytd textures live in (usually the same as modelName).</p>
gameName:<p>Key of the display name shown on the HUD/garage/phone. It maps to a label table (e.g. a custom .gxt entry).</p>
audioNameHash:<p>Which <b>engine/exhaust audio set</b> the vehicle uses (e.g. INFERNUS, TURBOPROP…). Swap it to give a different engine sound.</p>
handlingId:<p>The handling.meta entry this vehicle uses — the physics link. Usually the same as modelName.</p>
<p><b>Point it at a different handling entry →</b> the car inherits that entry's mass/engine/grip.</p>
layout:<p>Which vehiclelayouts.meta layout name the vehicle uses for its seats/entry points.</p>
plateType:<p>License-plate style/position (front+rear, none, etc).</p>
wheelType:<p>The wheel category (SPORT, LOWRIDER, OFFROAD, TRUCK…) used when the vehicle spawns with default wheels.</p>
flags:<p>Space-separated model behaviour flags — spawn rules, doors, scripts, e.g. FLAG_DONT_SPAWN_IN_CARGEN.</p>
<p><b>Add/remove words here</b> to change where/how it can spawn; read each flag name.</p>
diffuseTint:<p>The base colour tint applied to the vehicle (0x00RRGGBB). 0x00FFFFFF = no tint (normal paint).</p>
wheelScale:<p>Scale factor for the front wheels (visual size). Bigger = chunkier wheels.</p>
wheelScaleRear:<p>Scale factor for the rear wheels (independent of front).</p>
defaultBodyHealth:<p>The vehicle's health at spawn (usually 1000). Lower it → it spawns closer to breaking.</p>
frequency:<p>How often this model is picked for ambient/traffic spawns (weight).</p>
maxNum:<p>Maximum number of this model the game will spawn at once (traffic).</p>
maxNumOfSameColor:<p>Cap on how many of the same colour can be spawned together (keeps traffic varied).</p>
lodDistances:<p>Five distances (m) where the model switches to lower LOD levels — closer numbers = detail drops sooner.</p>
HDTextureDist:<p>Distance (m) up to which high-definition (HD) textures are used.</p>
visibleSpawnDistScale:<p>Multiplier on how far away the vehicle becomes visible when spawning — bigger = pops in from further.</p>
identicalModelSpawnDistance:<p>Distance within which the game avoids spawning another identical model next to you.</p>
requiredExtras:<p>Extras that must be installed for the vehicle to spawn correctly (space-separated extra ids).</p>
swankness:<p>How "fancy" the game treats the vehicle (affects AI parking/traffic behaviour, not visuals).</p>
trackerPathWidth:<p>Width the game assumes when placing the vehicle on roads/paths.</p>
buoyancySphereSizeScale:<p>Scale of the buoyancy hull for boats — how high it sits in the water.</p>
cameraName:<p>Default chase/third-person camera profile used while driving.</p>
aimCameraName:<p>Camera used when the driver aims/attacks from the vehicle.</p>
povCameraName:<p>First-person (POV) camera profile.</p>
povTurretCameraName:<p>First-person camera profile used when operating a turret.</p>
bonnetCameraName:<p>Camera position/profile used for the bonnet cam (hood view).</p>
dashboardType:<p>Dashboard/interior camera style shown in first-person.</p>
shouldUseCinematicViewMode:<p>Whether the cinematic camera mode is allowed for this vehicle.</p>
weaponForceMult:<p>Multiplier on the recoil/impact force the vehicle's weapons push into it.</p>
steerWheelMult:<p>Multiplier on how far the visual steering wheel rotates.</p>
maxSteeringWheelAngle:<p>Maximum rotation angle of the steering wheel (visual).</p>
plateType:<p>Style/position of the license plate.</p>
audioNameHash:<p>The audio set (engine sounds).</p>
explosionInfo:<p>Which explosion profile the vehicle uses when destroyed (e.g. EXPLOSION_INFO_DEFAULT).</p>
dirtLevelMin:<p>Lowest dirt level the vehicle can have (visual grime).</p>
dirtLevelMax:<p>Highest dirt level the vehicle can accumulate before it stops getting dirtier.</p>
envEffScaleMin:<p>Environment effect (dust/rain spray) scale when the vehicle is at its cleanest.</p>
envEffScaleMax:<p>Environment effect scale when fully dirty.</p>
damageMapScale:<p>Scale of the damage-map texture (bullet/scratch visuals) on the body.</p>
damageOffsetScale:<p>Visual offset scale for damage decals.</p>
bumpersNeedToCollideWithMap:<p>Whether the bumpers register collisions with the map (affects bumper damage/ragdolls).</p>
ptfxAssetName:<p>Particle-effect (ptfx) dictionary the vehicle uses for exhaust/fire etc.</p>
vfxInfoName:<p>Named VFX/special-effect set used by this vehicle.</p>
expressionDictName:<p>Animation dictionary for character "expression" interactions with the vehicle.</p>
expressionName:<p>Which expression (anim) inside the dictionary to use.</p>
animConvRoofDictName:<p>Animation dictionary for the convertible roof cycle.</p>
animConvRoofName:<p>Which convertible-roof animation to play.</p>
NmBraceOverrideSet:<p>Named ragdoll "brace" tuning override for the vehicle.</p>
PovCameraVerticalAdjustmentForRollCage:<p>Vertical camera nudge in first-person when a roll cage is installed.</p>
vehicleMakeName:<p>Manufacturer label key shown in text (e.g. the make under the car name).</p>
steerWheelMult:<p>Multiplier for steering-wheel animation.</p>
doorStiffnessMultipliers:<p>Per-door stiffness multipliers (how easily doors deform).</p>
needsRopeTexture:<p>Whether the tow/rope texture must be loaded for this vehicle.</p>
allowBodyColorMapping:<p>Whether body paint colours apply to the whole body (vs only parts).</p>
allowJoyriding:<p>Whether NPCs can "joyride" (randomly steal/drive) this vehicle.</p>
allowPretendOccupants:<p>Whether parked versions can show fake "pretend" occupants sitting inside.</p>
allowSundayDriving:<p>Whether AI traffic can drive it slowly/leisurely in ambient traffic.</p>
maxNumOfSameColor:<p>Traffic colour-variety cap.</p>
shouldCameraIgnoreExiting:<p>Whether the camera ignores the vehicle when the driver exits.</p>
shouldCameraTransitionOnClimbUpDown:<p>Whether the camera transitions when climbing into/out of the vehicle.</p>
minSeatHeight:<p>Minimum height used when placing the driver/occupants in seats.</p>
coverBoundOffsets:<p>Collision offsets used to line the vehicle up with cover positions.</p>
pretendOccupantsScale:<p>Scale of the fake parked occupants (so they fit the cabin).</p>
wheelType:<p>Default wheel category.</p>
`;

export const vehiclesGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Vehicle",
  all,
  guide,
  what: "vehicles.meta vehicle-model field",
});
