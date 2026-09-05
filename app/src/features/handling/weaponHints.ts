// Weapon.meta (CWeaponInfo) field glossary — written to be understandable.
//
// Every entry answers three things:
//   1. What is it?          (plain English)
//   2. Turn it UP → …       (what changes in-game when you raise it)
//   3. Turn it DOWN → …     (what changes when you lower it)
//   4. Where to start.      (a sensible first value or advice)
// Only fields that really change gameplay get detailed guides; internal/hash
// fields tell you honestly to leave them alone.
//
// The param list is the REAL union found in the GGC pack (149 fields).

export interface WeaponHintEntry {
  n: string;
  d: string;
}

const ALL_PARAMS: string[] = [
  "AccuracyOffsetShakeHash", "AccuracySpread", "AccurateModeAccuracyModifier", "AiPotentialBlastEventRange",
  "AiSoundRange", "AimProbeLengthMax", "AimProbeLengthMin", "AimProbeRadiusOverrideFPSIdle",
  "AimProbeRadiusOverrideFPSIdleStealth", "AimProbeRadiusOverrideFPSLT", "AimProbeRadiusOverrideFPSRNG",
  "AimProbeRadiusOverrideFPSScope", "AimingBreathingAdditiveWeight", "AimingLeanAdditiveWeight",
  "AirborneAircraftLockOnMultiplier", "AlternateWaitTime", "AmmoDiminishingRate", "AnimReloadRate",
  "ArmouredVehicleGlassDamageOverride", "Audio", "BatchSpread", "BulletBendingFarRadius",
  "BulletBendingNearRadius", "BulletBendingZoomedRadius", "BulletDirectionOffsetInDegrees",
  "BulletsInBatch", "BulletsPerAnimLoop", "CameraFov", "CinematicShootingCameraHash", "ClipSize",
  "CoverCameraHash", "Damage", "DamageFallOffModifier", "DamageFallOffRangeMax", "DamageFallOffRangeMin",
  "DamageTime", "DamageTimeInVehicle", "DamageTimeInVehicleHeadShot", "DamageType", "DefaultCameraHash",
  "DropForwardVelocity", "ExpandPedCapsuleRadius", "ExplosionShakeAmplitude", "FireType",
  "FiringBreathingAdditiveWeight", "FiringLeanAdditiveWeight", "FirstPersonAimFovMax",
  "FirstPersonAimFovMin", "FirstPersonBulletBendingFarRadius", "FirstPersonBulletBendingNearRadius",
  "FirstPersonBulletBendingZoomedRadius", "FirstPersonDofMaxNearInFocusDistance",
  "FirstPersonDofMaxNearInFocusDistanceBlendLevel", "FirstPersonDofSubjectMagnificationPowerFactorNear",
  "FirstPersonScopeAttachmentFov", "FirstPersonScopeFov", "Force", "ForceFalloffMin", "ForceFalloffRangeEnd",
  "ForceFalloffRangeStart", "ForceHitFlyingHeli", "ForceHitPed", "ForceHitVehicle", "ForceMaxStrengthMult",
  "FragImpulse", "HeadShotDamageModifierAI", "HeadShotDamageModifierPlayer", "HitLimbsDamageModifier",
  "HudAccuracy", "HudCapacity", "HudDamage", "HudRange", "HudSpeed", "HumanNameHash", "IkRecoilDisplacement",
  "IkRecoilDisplacementScaleBackward", "IkRecoilDisplacementScaleVertical", "IkRecoilDisplacementScope",
  "InitialRumbleDuration", "InitialRumbleDurationFps", "InitialRumbleIntensity", "InitialRumbleIntensityFps",
  "InitialRumbleIntensityTrigger", "KillshotImpulseScale", "KnockdownCount", "LightlyArmouredDamageModifier",
  "LockOnRange", "MPPickupHash", "MaxHeadShotDistanceAI", "MaxHeadShotDistancePlayer",
  "MeleeRightFistTargetHealthDamageScaler", "MinHeadShotDistanceAI", "MinHeadShotDistancePlayer",
  "MinTimeBetweenRecoilShakes", "Model", "MovementModeConditionalIdle", "NetworkHeadShotPlayerDamageModifier",
  "NetworkHitLimbsDamageModifier", "NetworkPedDamageModifier", "NetworkPlayerDamageModifier", "NmShotTuningSet",
  "Penetration", "PickupHash", "ProjectileForce", "RecoilAccuracyMax", "RecoilAccuracyToAllowHeadShotAI",
  "RecoilAccuracyToAllowHeadShotPlayer", "RecoilErrorTime", "RecoilRecoveryRate", "RecoilShakeAmplitude",
  "RecoilShakeHash", "RecoilShakeHashFirstPerson", "ReloadTimeMP", "ReloadTimeSP",
  "ReticuleMinSizeCrouched", "ReticuleMinSizeStanding", "ReticuleScale", "ReticuleStyleHash",
  "RumbleDamageIntensity", "RumbleDuration", "RumbleDurationFps", "RumbleIntensity", "RumbleIntensityFps",
  "RumbleIntensityTrigger", "RunAndGunAccuracyMaxModifier", "RunAndGunAccuracyMinOverride",
  "RunAndGunAccuracyModifier", "RunAndGunCameraHash", "Speed", "SpinDownTime", "SpinTime", "SpinUpTime",
  "StatName", "StealthAimingBreathingAdditiveWeight", "StealthAimingLeanAdditiveWeight",
  "StealthFiringBreathingAdditiveWeight", "StealthFiringLeanAdditiveWeight", "TargetSequenceGroup",
  "TimeBetweenShots", "TimeLeftBetweenShotsWhereShouldFireIsCached", "TorsoIKAngleLimit",
  "VehicleAttackAngle", "VehicleDamageModifier", "VehicleReloadTime", "VerticalLaunchAdjustment",
  "WeaponFlags", "WeaponRange", "WheelSlot", "ZoomFactorForAccurateMode",
];

// Plain-language guides (single source string; parsed by the "Name:" markers).
const GUIDE = `
Damage:<p>How much health one bullet takes away.</p>
<p><b>Turn it up →</b> the weapon kills faster (fewer shots needed).</p>
<p><b>Turn it down →</b> enemies survive more hits (weaker gun).</p>
<p><b>Start with:</b> pistols ~20–34 · SMG ~18–25 · assault rifles ~28–35 · snipers ~70–150. Pair it with TimeBetweenShots — together they decide "shots to kill".</p>
TimeBetweenShots:<p>The gap in seconds between two shots. This is your fire rate.</p>
<p><b>Turn it up →</b> slower firing (more recoil control, feels like a semi-auto).</p>
<p><b>Turn it down →</b> faster firing (higher DPS, but burns ammo and climbs).</p>
<p><b>Start with:</b> semi-auto ~0.20–0.25 · SMG ~0.09–0.11 · AR ~0.10–0.13. Example: 0.1 = 10 bullets per second.</p>
ClipSize:<p>How many bullets fit in the magazine before you must reload.</p>
<p><b>Turn it up →</b> more rounds per mag (fewer reloads, longer sustained fire).</p>
<p><b>Turn it down →</b> reloads happen constantly (punishes spray).</p>
<p><b>Start with:</b> pistol 12–17 · SMG 25–50 · AR 30 · LMG 60–100. Show it honestly in HudCapacity.</p>
AccuracySpread:<p>How far the bullets scatter sideways when you fire (bloom).</p>
<p><b>Turn it up →</b> bigger spread = less accurate at range, more "spray and pray".</p>
<p><b>Turn it down →</b> tight grouping = lasers, maybe too strong at long range.</p>
<p><b>Start with:</b> pistol ~1.0–2.0 · SMG ~2.5–3.5 · AR ~3.0–4.0 · sniper ~0.1–0.5. Lower = tighter.</p>
AccurateModeAccuracyModifier:<p>Multiplier on AccuracySpread <b>while you are aiming down sights (ADS)</b>.</p>
<p><b>Turn it up (above 1) →</b> shots while aiming become MORE spread than hipfire.</p>
<p><b>Turn it down (below 1) →</b> aiming makes bullets tighter (usual for rifles). 0.5 = half the spread.</p>
RunAndGunAccuracyModifier:<p>Multiplier on spread while you move and shoot without aiming.</p>
<p><b>Up →</b> moving hipfire sprays badly. <b>Down →</b> you stay accurate on the move. Keep ~1–2.</p>
RunAndGunAccuracyMaxModifier:<p>The ceiling spread added during long run-and-gun bursts.</p>
<p><b>Up →</b> sustained hipfire gets very wild. <b>Down →</b> stays controllable. Usually 1.0.</p>
RunAndGunAccuracyMinOverride:<p>Forces a minimum (floor) spread while run-and-gunning.</p>
<p>Raise it to stop hipfire from ever being perfectly accurate.</p>
BatchSpread:<p>Extra spread between pellets in one shotgun blast.</p>
<p><b>Up →</b> pellets spread wider. <b>Down →</b> tighter, more damage concentrated at range.</p>
BulletsInBatch:<p>How many projectiles come out per trigger pull (shotgun pellets / salvo).</p>
<p><b>Up →</b> more pellets = more potential damage per shot. <b>Down →</b> fewer pellets. 1 = single shot; shotguns ~8–12.</p>
BulletsPerAnimLoop:<p>Rounds the weapon consumes per firing animation cycle.</p>
<p>Leave at 1 unless you know the animation expects more.</p>
AlternateWaitTime:<p>Delay between burst groups when a burst fire pattern is used.</p>
<p><b>Up →</b> longer pause between bursts. <b>Down →</b> bursts feel continuous.</p>
BulletDirectionOffsetInDegrees:<p>Adds a fixed angle error to every shot (degrees).</p>
<p><b>Up →</b> shots always veer slightly. <b>Down →</b> straight shots. Keep 0 unless you want a quirky gun.</p>
RecoilErrorTime:<p>How quickly recoil "bloom" builds while you hold the trigger.</p>
<p><b>Up →</b> the gun stays accurate longer before climbing. <b>Down →</b> recoil kicks in sooner.</p>
<p><b>Start with:</b> ~2.5–3.5 for rifles.</p>
RecoilRecoveryRate:<p>How fast the crosshair settles back down after recoil.</p>
<p><b>Up →</b> recovers fast = easier to control tap-fire. <b>Down →</b> stays kicked up longer.</p>
RecoilAccuracyMax:<p>The worst accuracy penalty full recoil can cause (a cap).</p>
<p><b>Up →</b> sustained fire can become very inaccurate. <b>Down →</b> spray stays manageable. Usually 0.5-ish.</p>
RecoilAccuracyToAllowHeadShotPlayer:<p>The accuracy level the gun must be better than for your headshots to register as headshots.</p>
<p>Make it easier/harder to get consistent headshots while spraying. Start ~0.17–0.3.</p>
RecoilAccuracyToAllowHeadShotAI:<p>Same as above, but for NPCs. Higher = AI headshots more often.</p>
MinHeadShotDistancePlayer:<p>Nearest range (m) where a headshot counts. Inside this range hits may count as body shots.</p>
MaxHeadShotDistancePlayer:<p>Farthest range (m) where a headshot still counts.</p>
HeadShotDamageModifierPlayer:<p>Headshot damage multiplier. 2.0 = a headshot does double damage.</p>
<p><b>Up →</b> one-tap headshots are more likely. <b>Down →</b> headshots barely matter.</p>
HeadShotDamageModifierAI:<p>Same multiplier but when shooting NPCs.</p>
MinHeadShotDistanceAI:<p>Nearest range where AI headshots count.</p>
MaxHeadShotDistanceAI:<p>Farthest range where AI headshots count.</p>
HitLimbsDamageModifier:<p>Damage you deal when hitting arms/legs.</p>
<p><b>Up →</b> limb shots hurt more. <b>Down →</b> limb shots are weak (usual: ~0.5).</p>
LightlyArmouredDamageModifier:<p>Damage multiplier against lightly armoured targets.</p>
NetworkPedDamageModifier:<p>Global damage tweak applied in online play.</p>
NetworkPlayerDamageModifier:<p>Damage vs other players online — your PvP balance dial.</p>
<p><b>Up →</b> online players die faster. <b>Down →</b> they tank more.</p>
NetworkHeadShotPlayerDamageModifier:<p>Headshot damage vs players online.</p>
NetworkHitLimbsDamageModifier:<p>Limb damage vs players online.</p>
ArmouredVehicleGlassDamageOverride:<p>Overrides how much damage armoured-vehicle glass takes.</p>
Force:<p>How hard a hit shoves the target (knockback / ragdoll push).</p>
<p><b>Up →</b> enemies fly/ragdoll more. <b>Down →</b> they stay standing.</p>
<p><b>Start with:</b> pistols 40–80 · rifles 75–150 · snipers 200–400.</p>
ForceHitPed:<p>Knockback force applied specifically to people.</p>
ForceHitVehicle:<p>Force applied when the bullet hits a vehicle.</p>
ForceHitFlyingHeli:<p>Force applied when hitting helicopters.</p>
ForceMaxStrengthMult:<p>Multiplier capping how strong knockback can ever get.</p>
ForceFalloffMin:<p>Minimum knockback that remains at the very end of range.</p>
ForceFalloffRangeStart:<p>Distance at which knockback starts to weaken.</p>
ForceFalloffRangeEnd:<p>Distance at which knockback stops weakening.</p>
KnockdownCount:<p>Shots before a target is guaranteed to be knocked over. -1 = never.</p>
KillshotImpulseScale:<p>Extra shove applied specifically on the killing shot (fun ragdolls).</p>
FragImpulse:<p>How hard explosion fragments push things.</p>
ProjectileForce:<p>Launch power for projectile weapons (rockets/grenades).</p>
DropForwardVelocity:<p>Forward speed when the weapon/item is dropped.</p>
VerticalLaunchAdjustment:<p>Angles projectiles upward on launch.</p>
<p><b>Up →</b> rockets/grenades arc higher. <b>Down →</b> flatter.</p>
Speed:<p>Bullet/projectile travel speed (hitscan weapons ignore this).</p>
<p><b>Up →</b> hits land faster at range. <b>Down →</b> you must lead targets.</p>
Penetration:<p>How many walls/objects a bullet can pass through.</p>
<p><b>Up →</b> wall-bang kills. <b>Down →</b> bullets stop on thin cover.</p>
WeaponRange:<p>Effective range in metres; beyond it the gun stops being useful.</p>
<p><b>Up →</b> long-range weapon. <b>Down →</b> close-quarters only.</p>
DamageFallOffRangeMin:<p>Distance where damage falloff begins.</p>
DamageFallOffRangeMax:<p>Distance where falloff reaches its lowest point.</p>
DamageFallOffModifier:<p>Damage multiplier at maximum range (0.5 = half damage far away).</p>
LockOnRange:<p>Max range auto-aim / lock-on works (controller users).</p>
VehicleAttackAngle:<p>How wide an angle vehicle gunners can engage.</p>
VehicleDamageModifier:<p>Damage multiplier vs vehicles.</p>
VehicleReloadTime:<p>Reload time while seated in a vehicle.</p>
SpinTime:<p>How long before a spinning weapon (gatling) fires at full speed.</p>
SpinUpTime:<p>Delay from pressing the trigger to reaching full fire rate.</p>
SpinDownTime:<p>How long the barrel keeps spinning after you stop firing.</p>
AnimReloadRate:<p>Speed of the reload animation.</p>
<p><b>Up →</b> reloads feel faster. <b>Down →</b> slower. Keep ≈1.</p>
ReloadTimeSP:<p>Reload pacing used in single-player.</p>
ReloadTimeMP:<p>Reload pacing used online.</p>
AmmoDiminishingRate:<p>How fast the ammo reserve drains while firing.</p>
ExplosionShakeAmplitude:<p>How hard the screen shakes from explosions.</p>
AiSoundRange:<p>How far away NPCs can hear this weapon.</p>
AiPotentialBlastEventRange:<p>How far NPCs react to an explosion from this weapon.</p>
WeaponFlags:<p>Space-separated behaviour switches. Common ones: Automatic, Explosive, CanFreeAim, TwoHanded, UsableOnFoot, UsableInCover, CanLockOnOnFoot…</p>
<p>Add/remove words here to change how the weapon behaves — read each flag name.</p>
HumanNameHash:<p>The name shown on the HUD when you equip it (leave as-is).</p>
StatName:<p>Which weapon-stat group it belongs to (e.g. ASLTRIFLE). Used by skills/stats.</p>
NmShotTuningSet:<p>Which ragdoll "shot reaction" tuning set to use (usually Automatic).</p>
TargetSequenceGroup:<p>Animation group reference (leave as-is).</p>
MovementModeConditionalIdle:<p>Movement mode for the idle pose (e.g. MMI_2Handed).</p>
PickupHash:<p>What you pick up from the ground (weapon pickup hash).</p>
MPPickupHash:<p>Online pickup hash (leave as-is).</p>
ReticuleStyleHash:<p>Which crosshair style to draw while aiming.</p>
ReticuleScale:<p>Crosshair size.</p>
ReticuleMinSizeStanding:<p>Smallest the crosshair gets while standing.</p>
ReticuleMinSizeCrouched:<p>Smallest the crosshair gets while crouched.</p>
CameraFov:<p>Field of view while aiming this weapon.</p>
FirstPersonAimFovMin:<p>FOV floor while aiming in first person.</p>
FirstPersonAimFovMax:<p>FOV ceiling while aiming in first person.</p>
FirstPersonScopeFov:<p>Zoom strength of the scope in first person (lower = more zoom).</p>
FirstPersonScopeAttachmentFov:<p>Same, but when a scope attachment is fitted.</p>
DefaultCameraHash:<p>Camera set used while aiming (leave as-is).</p>
CinematicShootingCameraHash:<p>Camera set for cinematic cover shooting.</p>
CoverCameraHash:<p>Camera set while shooting from cover.</p>
RunAndGunCameraHash:<p>Camera set while moving and shooting.</p>
RecoilShakeHash:<p>Camera-shake animation used per shot (third person).</p>
RecoilShakeHashFirstPerson:<p>Same, in first person.</p>
RecoilShakeAmplitude:<p>How violently the camera shakes per shot.</p>
MinTimeBetweenRecoilShakes:<p>Minimum delay between camera shakes (prevents blur on fast fire).</p>
AccuracyOffsetShakeHash:<p>Shake applied as accuracy bloom grows (leave as-is).</p>
InitialRumbleDuration:<p>Controller rumble length on the first shot.</p>
InitialRumbleIntensity:<p>Controller rumble strength on the first shot.</p>
InitialRumbleIntensityTrigger:<p>Trigger rumble strength on the first shot.</p>
InitialRumbleDurationFps:<p>Same, first-person camera.</p>
InitialRumbleIntensityFps:<p>Same, first-person camera.</p>
RumbleIntensity:<p>Controller vibration strength while firing.</p>
RumbleIntensityTrigger:<p>Trigger vibration strength while firing.</p>
RumbleDuration:<p>How long each shot vibrates the controller.</p>
RumbleIntensityFps:<p>First-person vibration strength while firing.</p>
RumbleDurationFps:<p>First-person vibration length per shot.</p>
RumbleDamageIntensity:<p>Controller vibration when you deal damage.</p>
HudDamage:<p>The "Damage" bar shown in the pause menu (0–100). Cosmetic — match how the gun actually feels.</p>
HudSpeed:<p>The pause-menu "Fire rate" bar (0–100). Cosmetic.</p>
HudCapacity:<p>The pause-menu "Magazine" bar (0–100). Cosmetic.</p>
HudAccuracy:<p>The pause-menu "Accuracy" bar (0–100). Cosmetic.</p>
HudRange:<p>The pause-menu "Range" bar (0–100). Cosmetic.</p>
AimingBreathingAdditiveWeight:<p>How much the weapon sways from breathing while aiming.</p>
FiringBreathingAdditiveWeight:<p>Breathing sway added while you fire.</p>
StealthAimingBreathingAdditiveWeight:<p>Breathing sway while aiming in stealth.</p>
StealthFiringBreathingAdditiveWeight:<p>Breathing sway while firing in stealth.</p>
AimingLeanAdditiveWeight:<p>How much your character leans while aiming.</p>
FiringLeanAdditiveWeight:<p>Lean amount added while firing.</p>
StealthAimingLeanAdditiveWeight:<p>Lean while aiming in stealth.</p>
StealthFiringLeanAdditiveWeight:<p>Lean while firing in stealth.</p>
ExpandPedCapsuleRadius:<p>Makes the target's hitbox bigger (easier to hit). Use sparingly.</p>
IkRecoilDisplacement:<p>How far the on-screen hands/weapon kick back per shot.</p>
IkRecoilDisplacementScaleBackward:<p>Scales the backward part of that hand recoil.</p>
IkRecoilDisplacementScaleVertical:<p>Scales the upward part of that hand recoil.</p>
IkRecoilDisplacementScope:<p>Hand recoil amount while looking through a scope.</p>
TorsoIKAngleLimit:<p>Maximum torso angle used for animation follow (leave as-is).</p>
MeleeRightFistTargetHealthDamageScaler:<p>Damage scale for right-fist melee attacks.</p>
BulletBendingNearRadius:<p>Range where bullets curve toward a target to help you hit (aim assist).</p>
BulletBendingFarRadius:<p>Range where bullets bend at distance.</p>
BulletBendingZoomedRadius:<p>Bullet bending while zoomed.</p>
FirstPersonBulletBendingNearRadius:<p>Same aim-assist bend in first person (near).</p>
FirstPersonBulletBendingFarRadius:<p>Same in first person (far).</p>
FirstPersonBulletBendingZoomedRadius:<p>Same in first person while scoped.</p>
AimProbeLengthMin:<p>Aim-assist probe minimum length.</p>
AimProbeLengthMax:<p>Aim-assist probe maximum length (how far the assist reaches).</p>
AimProbeRadiusOverrideFPSIdle:<p>Aim-assist size in first person (idle).</p>
AimProbeRadiusOverrideFPSIdleStealth:<p>Aim-assist size in first-person stealth.</p>
AimProbeRadiusOverrideFPSLT:<p>Aim-assist size in first person when already locked/tracking.</p>
AimProbeRadiusOverrideFPSRNG:<p>Aim-assist size in first-person run-and-gun.</p>
AimProbeRadiusOverrideFPSScope:<p>Aim-assist size in first person while scoped.</p>
AirborneAircraftLockOnMultiplier:<p>Extra lock-on range against flying aircraft.</p>
TimeLeftBetweenShotsWhereShouldFireIsCached:<p>Internal fire-input cache window — leave alone.</p>
WheelSlot:<p>Which weapon-wheel slot the gun sits in (e.g. WHEEL_RIFLE).</p>
FirstPersonDofMaxNearInFocusDistance:<p>First-person camera focus-blur (DOF) distance — cosmetic.</p>
FirstPersonDofMaxNearInFocusDistanceBlendLevel:<p>DOF blend — cosmetic.</p>
FirstPersonDofSubjectMagnificationPowerFactorNear:<p>DOF magnification — cosmetic.</p>
Model:<p>Which weapon model the game loads. Only change if you swap the model.</p>
Audio:<p>Which sound set the weapon uses (fire/reload).</p>
DamageType:<p>What damage kind it deals (BULLET, MELEE, EXPLOSIVE, FIRE…). Changing it changes how the hit behaves.</p>
FireType:<p>How the weapon fires: INSTANT_HIT (hitscan bullets), PROJECTILE (rockets/grenades), MELEE…</p>
`.trim();

// Split the guide text into {paramName: html} using the "Name:" markers.
function parseGuide(): Map<string, string> {
  const map = new Map<string, string>();
  const re = /^([A-Za-z0-9]+):/gm;
  const matches: Array<{ key: string; idx: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(GUIDE)) !== null) {
    matches.push({ key: m[1], idx: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : GUIDE.length;
    let seg = GUIDE.slice(start, end).trim();
    const ci = seg.indexOf(":");
    seg = seg.slice(ci + 1).trim();
    if (seg) map.set(matches[i].key, seg);
  }
  return map;
}

export function paramHintWeapon(col: string): string | undefined {
  return parseGuide().get(col);
}

export interface WeaponGlossaryEntry {
  name: string;
  moduleLabel: string;
  description: string;
}

export function weaponGlossary(): WeaponGlossaryEntry[] {
  const map = parseGuide();
  return ALL_PARAMS.map((name) => ({
    name,
    moduleLabel: "Weapon",
    description: map.get(name) ?? fallback(name),
  }));
}

function fallback(name: string): string {
  return `<p><b>What is it?</b> An advanced ${name} setting.</p><p><b>Advice:</b> keep the value from your pack or a matching vanilla weapon — it rarely needs changing.</p>`;
}
