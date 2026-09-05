// vehicleweapons.meta (mounted weapons / ammo / weapon-data) glossary — plain language.
import { buildGlossary, type GlossarySource } from "./core";

const all = [
  "AccuracyOffsetShakeHash", "AccuracySpread", "AccurateModeAccuracyModifier",
  "AiPotentialBlastEventRange", "AiSoundRange", "AimCameraHash", "AimProbeLengthMax",
  "AimProbeLengthMin", "AimProbeRadiusOverrideFPSIdle", "AimProbeRadiusOverrideFPSIdleStealth",
  "AimProbeRadiusOverrideFPSLT", "AimProbeRadiusOverrideFPSRNG", "AimProbeRadiusOverrideFPSScope",
  "AimingBreathingAdditiveWeight", "AimingInfo.ref", "AimingLeanAdditiveWeight",
  "AirborneAircraftLockOnMultiplier", "AlternateWaitTime", "AmmoDiminishingRate", "AmmoFlags",
  "AmmoInfo.ref", "AmmoMax", "AmmoMax100", "AmmoMax100MP", "AmmoMax50", "AmmoMax50MP",
  "AmmoMaxMP", "AmmoSpecialType", "AnimReloadRate", "ArmouredVehicleGlassDamageOverride",
  "Audio", "BatchSpread", "BulletBendingFarRadius", "BulletBendingNearRadius",
  "BulletBendingZoomedRadius", "BulletDirectionOffsetInDegrees", "BulletDirectionPitchHomingOffset",
  "BulletDirectionPitchOffset", "BulletsInBatch", "BulletsPerAnimLoop", "CameraFov",
  "ChargedLaunchSpeedMult", "ChargedLaunchTime", "ClipSize", "ClusterExplosionCount",
  "ClusterExplosionTag", "ClusterInbetweenDelay", "ClusterInitialDelay", "ClusterMaxRadius",
  "ClusterMinRadius", "CoronaIntensity", "CoronaSize", "CoronaZBias", "CoverCameraHash", "Damage",
  "DamageFallOffModifier", "DamageFallOffRangeMax", "DamageFallOffRangeMin", "DamageTime",
  "DamageTimeInVehicle", "DamageTimeInVehicleHeadShot", "DamageType", "Damping",
  "DefaultCameraHash", "DisturbFxDefault", "DisturbFxDirt", "DisturbFxFoliage",
  "DisturbFxProbeDist", "DisturbFxSand", "DisturbFxScale", "DisturbFxWater", "DropForwardVelocity",
  "ExpandPedCapsuleRadius", "ExplosionShakeAmplitude", "ExplosionTime", "FireCameraHash",
  "FireType", "FiringBreathingAdditiveWeight", "FiringLeanAdditiveWeight", "FiringPatternAliases.ref",
  "FirstPersonAimFovMax", "FirstPersonAimFovMin", "FirstPersonBulletBendingFarRadius",
  "FirstPersonBulletBendingNearRadius", "FirstPersonBulletBendingZoomedRadius",
  "FirstPersonDofMaxNearInFocusDistance", "FirstPersonDofMaxNearInFocusDistanceBlendLevel",
  "FirstPersonDofSubjectMagnificationPowerFactorNear", "FirstPersonReticuleStyleHash",
  "FirstPersonScopeAttachmentFov", "FirstPersonScopeFov", "Force", "ForceFalloffMin",
  "ForceFalloffRangeEnd", "ForceFalloffRangeStart", "ForceHitFlyingHeli", "ForceHitPed",
  "ForceHitVehicle", "ForceMaxStrengthMult", "FragImpulse", "FrictionMultiplier",
  "FromVehicleLifeTime", "FuseFx", "GravityFactor", "GroundFxProbeDistance",
  "HeadShotDamageModifierAI", "HeadShotDamageModifierPlayer", "HitLimbsDamageModifier",
  "HudAccuracy", "HudCapacity", "HudDamage", "HudRange", "HudSpeed", "HumanNameHash",
  "IkRecoilDisplacement", "IkRecoilDisplacementScaleBackward", "IkRecoilDisplacementScaleVertical",
  "IkRecoilDisplacementScope", "InitialRumbleDuration", "InitialRumbleDurationFps",
  "InitialRumbleIntensity", "InitialRumbleIntensityFps", "InitialRumbleIntensityTrigger",
  "KickbackAmplitude", "KickbackImpulse", "KickbackOverrideTiming", "KillshotImpulseScale",
  "KnockdownCount", "LaunchSpeed", "LifeTime", "LifeTimeAfterExplosion", "LifeTimeAfterImpact",
  "LightFalloffExp", "LightFlickers", "LightFrequency", "LightIntensity", "LightOnlyActiveWhenStuck",
  "LightPower", "LightRange", "LightSpeedsUp", "LightlyArmouredDamageModifier", "LockOnRange",
  "MaxHeadShotDistanceAI", "MaxHeadShotDistancePlayer", "MeleeRightFistTargetHealthDamageScaler",
  "MinHeadShotDistanceAI", "MinHeadShotDistancePlayer", "MinTimeBetweenRecoilShakes", "Model",
  "MovementModeConditionalIdle", "NetworkHeadShotPlayerDamageModifier",
  "NetworkHitLimbsDamageModifier", "NetworkPedDamageModifier", "NetworkPlayerDamageModifier",
  "NmShotTuningSet", "PedRicochetTolerance", "Penetration", "PovTurretCameraHash",
  "ProjectileFlags", "ProjectileForce", "ProximityActivationTime", "ProximityFuseTimePed",
  "ProximityFuseTimeVehicleMax", "ProximityFuseTimeVehicleMin", "ProximityFuseTimeVehicleSpeed",
  "ProximityLightFrequencyMultiplierTriggered", "ProximityTriggerRadius",
  "RecoilAccuracyMax", "RecoilAccuracyToAllowHeadShotAI", "RecoilAccuracyToAllowHeadShotPlayer",
  "RecoilErrorTime", "RecoilRecoveryRate", "RecoilShakeAmplitude", "RecoilShakeHash",
  "RecoilShakeHashFirstPerson", "ReloadTimeMP", "ReloadTimeSP", "ReloadUpperBodyFixupExpressionData.ref",
  "ReticuleMinSizeCrouched", "ReticuleMinSizeStanding", "ReticuleScale", "ReticuleStyleHash",
  "RicochetTolerance", "RotateBarrelBone", "RumbleDamageIntensity", "RumbleDuration",
  "RumbleDurationFps", "RumbleIntensity", "RumbleIntensityFps", "RumbleIntensityTrigger",
  "RunAndGunAccuracyMinOverride", "RunAndGunAccuracyModifier", "RunAndGunCameraHash",
  "SeparationTime", "Speed", "SpinDownTime", "SpinTime", "SpinUpTime", "StatName",
  "StealthAimingBreathingAdditiveWeight", "StealthAimingLeanAdditiveWeight",
  "StealthFiringBreathingAdditiveWeight", "StealthFiringLeanAdditiveWeight", "TimeBetweenShots",
  "TimeLeftBetweenShotsWhereShouldFireIsCached", "TimeToReachTarget", "TintSpecValues.ref",
  "TorsoIKAngleLimit", "TrailFx", "TrailFxFadeInTime", "TrailFxFadeOutTime", "VehicleAttackAngle",
  "VehicleDamageModifier", "VehicleReloadTime", "VehicleRicochetTolerance", "VehicleWeaponHash",
  "VerticalLaunchAdjustment", "WeaponFlags", "WeaponRange", "WheelSlot", "ZoomFactorForAccurateMode",
];

const guide = `
VehicleWeaponHash:<p>Which weapon definition this mounted weapon is (e.g. the gun/rocket used). The link to the actual weapon behaviour.</p>
Model:<p>Which weapon model (.wdr/.wft) the mounted gun uses.</p>
Audio:<p>Which sound set the mounted weapon uses when firing.</p>
DamageType:<p>What damage kind the rounds deal (BULLET, EXPLOSIVE, FIRE…).</p>
FireType:<p>How it fires: INSTANT_HIT (hitscan), PROJECTILE (rockets/grenades)…</p>
WeaponFlags:<p>Space-separated behaviour switches (Automatic, Explosive…). Read each flag name.</p>
AmmoInfo.ref:<p>Reference to the ammo-info definition this weapon uses (projectile behaviour, blast, light…).</p>
AimingInfo.ref:<p>Reference to the aiming-info (spread/bloom while aiming).</p>
FiringPatternAliases.ref:<p>Reference to firing-pattern aliases (which patterns the weapon cycles).</p>
TintSpecValues.ref:<p>Reference to weapon tint specification values.</p>
ReloadUpperBodyFixupExpressionData.ref:<p>Reference to a ragdoll/expression fixup used during reload.</p>
ClipSize:<p>Rounds per magazine before reload (mounted guns: ammo belt/salvo size).</p>
Damage:<p>Damage one round deals.</p>
<p><b>Up →</b> kills faster. Pair with TimeBetweenShots for "time to kill".</p>
TimeBetweenShots:<p>Seconds between shots = fire rate. Lower → faster.</p>
AccuracySpread:<p>Bullet scatter (bloom). Lower → tighter/accurate.</p>
AccurateModeAccuracyModifier:<p>Spread multiplier while aiming down sights.</p>
BatchSpread:<p>Extra spread between pellets/projectiles in one burst.</p>
BulletsInBatch:<p>Projectiles per trigger pull (shotgun pellets, rocket salvos).</p>
BulletsPerAnimLoop:<p>Rounds consumed per firing-animation loop.</p>
Speed:<p>Projectile speed (hitscan ignores this).</p>
WeaponRange:<p>Effective range (m). Beyond it the weapon stops being useful.</p>
DamageFallOffRangeMin:<p>Distance where damage falloff begins.</p>
DamageFallOffRangeMax:<p>Distance where falloff bottoms out.</p>
DamageFallOffModifier:<p>Damage multiplier at max range (0.5 = half damage far away).</p>
Force:<p>Knockback force of a hit.</p>
ForceHitPed:<p>Knockback applied to people.</p>
ForceHitVehicle:<p>Knockback applied to vehicles.</p>
ForceHitFlyingHeli:<p>Knockback applied to helicopters.</p>
ForceMaxStrengthMult:<p>Cap multiplier on knockback strength.</p>
ForceFalloffMin:<p>Minimum knockback at the end of range.</p>
ForceFalloffRangeStart:<p>Distance where knockback starts weakening.</p>
ForceFalloffRangeEnd:<p>Distance where knockback stops weakening.</p>
KnockdownCount:<p>Shots before a target is guaranteed knocked over (-1 = never).</p>
KillshotImpulseScale:<p>Extra shove on the killing shot.</p>
Penetration:<p>How many walls/objects a bullet passes through.</p>
ExplosionTime:<p>Delay before a projectile explodes after firing/impact.</p>
ExplosionShakeAmplitude:<p>Screen-shake strength from this weapon's explosions.</p>
ClusterExplosionCount:<p>How many sub-projectiles a cluster munition splits into.</p>
ClusterExplosionTag:<p>Explosion tag used by each cluster sub-bomb.</p>
ClusterInitialDelay:<p>Delay before the first cluster sub-explosion.</p>
ClusterInbetweenDelay:<p>Delay between cluster sub-explosions.</p>
ClusterMinRadius / ClusterMaxRadius:<p>Min/max radius the cluster sub-bombs scatter to.</p>
ProjectileForce:<p>Launch power for projectile rounds.</p>
ProjectileFlags:<p>Space-separated projectile behaviour flags.</p>
VerticalLaunchAdjustment:<p>Upward angle added to projectiles on launch.</p>
ChargedLaunchTime:<p>Time to hold/charge before a charged projectile launches.</p>
ChargedLaunchSpeedMult:<p>Speed multiplier applied to a charged launch.</p>
GravityFactor:<p>Gravity applied to the projectile (1.0 = normal, 0 = laser flat, lower = flatter arc).</p>
LaunchSpeed:<p>Initial speed of the projectile at launch.</p>
Damping:<p>Air-drag damping on the projectile over its flight.</p>
SeparationTime:<p>Delay before a projectile separates (e.g. missile drop-then-burn).</p>
TimeToReachTarget:<p>Time a homing projectile takes to reach its target.</p>
LifeTime:<p>How long the projectile exists before it despawns.</p>
LifeTimeAfterExplosion:<p>How long explosion effects persist.</p>
LifeTimeAfterImpact:<p>How long the projectile/effect persists after impact.</p>
FromVehicleLifeTime:<p>Projectile lifetime when fired from a vehicle.</p>
FuseFx:<p>Effect shown for the fuse while a projectile is armed.</p>
FrictionMultiplier:<p>Friction applied to rolling projectiles (grenades).</p>
RotateBarrelBone:<p>Which barrel bone rotates (gatling/multi-barrel).</p>
AmmoMax:<p>Max ammo reserve (belt/total rounds).</p>
AmmoMax50:<p>Ammo reserve for the 50-round variant (game mode dependent).</p>
AmmoMax100:<p>Ammo reserve for the 100-round variant.</p>
AmmoMaxMP:<p>Ammo reserve in multiplayer.</p>
AmmoMax50MP:<p>50-round-variant ammo in multiplayer.</p>
AmmoMax100MP:<p>100-round-variant ammo in multiplayer.</p>
AmmoSpecialType:<p>Special ammo type (armour-piercing, incendiary, tracer…).</p>
AmmoFlags:<p>Space-separated ammo behaviour flags.</p>
AmmoDiminishingRate:<p>How fast the reserve drains while firing.</p>
VehicleDamageModifier:<p>Damage multiplier vs vehicles.</p>
VehicleReloadTime:<p>Reload time while seated/operating the weapon.</p>
VehicleAttackAngle:<p>Engagement angle width for vehicle gunners.</p>
LockOnRange:<p>Max lock-on range for homing.</p>
HeadShotDamageModifierPlayer:<p>Headshot damage multiplier vs players.</p>
HeadShotDamageModifierAI:<p>Headshot damage multiplier vs NPCs.</p>
MinHeadShotDistancePlayer / MaxHeadShotDistancePlayer:<p>Range band where player headshots count.</p>
MinHeadShotDistanceAI / MaxHeadShotDistanceAI:<p>Range band where AI headshots count.</p>
HitLimbsDamageModifier:<p>Damage multiplier for limb hits.</p>
LightlyArmouredDamageModifier:<p>Damage multiplier vs lightly armoured targets.</p>
NetworkPedDamageModifier:<p>Damage tweak vs NPCs online.</p>
NetworkPlayerDamageModifier:<p>Damage tweak vs players online.</p>
NetworkHeadShotPlayerDamageModifier:<p>Headshot damage vs players online.</p>
NetworkHitLimbsDamageModifier:<p>Limb damage vs players online.</p>
ArmouredVehicleGlassDamageOverride:<p>Damage override vs armoured-vehicle glass.</p>
HudDamage / HudRange / HudAccuracy / HudCapacity / HudSpeed:<p>HUD stat bar values shown for this weapon (damage, range, accuracy, capacity, speed).</p>
HumanNameHash:<p>HUD display-name reference (leave as-is).</p>
StatName:<p>Weapon-stat group (leave as-is).</p>
NmShotTuningSet:<p>Ragdoll shot-reaction tuning set.</p>
MovementModeConditionalIdle:<p>Idle movement-mode reference.</p>
WheelSlot:<p>Which wheel slot a mounted weapon is attached to (for wheel weapons).</p>
WeaponRange:<p>Range stat.</p>
RecoilShakeHash / RecoilShakeHashFirstPerson:<p>Camera-shake profile used for recoil.</p>
RecoilShakeAmplitude:<p>Strength of the recoil camera shake.</p>
RecoilAccuracyMax:<p>Worst accuracy penalty full recoil causes.</p>
RecoilErrorTime:<p>How fast recoil bloom builds.</p>
RecoilRecoveryRate:<p>How fast the weapon settles back.</p>
RecoilAccuracyToAllowHeadShotPlayer:<p>Accuracy threshold below which headshots register for players.</p>
RecoilAccuracyToAllowHeadShotAI:<p>Same threshold for NPCs.</p>
MinTimeBetweenRecoilShakes:<p>Minimum gap between recoil shakes.</p>
InitialRumbleDuration / InitialRumbleIntensity / InitialRumbleDurationFps / InitialRumbleIntensityFps / InitialRumbleIntensityTrigger:<p>Controller rumble on the first shot of a burst (and FPS / trigger variants).</p>
RumbleDuration / RumbleIntensity / RumbleDurationFps / RumbleIntensityFps / RumbleIntensityTrigger:<p>Controller rumble strength/duration per shot (and FPS / trigger variants).</p>
RumbleDamageIntensity:<p>Rumble strength when dealing damage.</p>
KickbackAmplitude:<p>How hard the vehicle/ped is pushed by each shot (vehicle weapon kick).</p>
KickbackImpulse:<p>Kick impulse applied on firing.</p>
KickbackOverrideTiming:<p>Overrides kick timing (delayed kick for big guns).</p>
RicochetTolerance:<p>Chance bullets ricochet off surfaces.</p>
PedRicochetTolerance:<p>Bullet ricochet behaviour vs peds.</p>
VehicleRicochetTolerance:<p>Bullet ricochet behaviour vs vehicles.</p>
TrailFx:<p>Particle effect used for the projectile trail.</p>
TrailFxFadeInTime / TrailFxFadeOutTime:<p>Trail effect fade in/out times.</p>
LightIntensity:<p>Brightness of the projectile's light (flares/fire).</p>
LightRange:<p>Range of the projectile light.</p>
LightFalloffExp:<p>Falloff curve of the projectile light.</p>
LightFlickers:<p>Whether the projectile light flickers.</p>
LightFrequency:<p>Flicker frequency.</p>
LightSpeedsUp:<p>Whether the light speeds up as the projectile accelerates.</p>
LightOnlyActiveWhenStuck:<p>Whether the light only shows when the projectile is stuck/planted.</p>
LightPower:<p>Light power multiplier.</p>
CoronaSize / CoronaIntensity / CoronaZBias:<p>Glow "corona" around the projectile light (size / brightness / vertical bias).</p>
ProximityTriggerRadius:<p>Radius at which a proximity fuse activates.</p>
ProximityActivationTime:<p>Delay before the proximity fuse arms.</p>
ProximityFuseTimePed:<p>Proximity detonation delay near peds.</p>
ProximityFuseTimeVehicleMin:<p>Minimum proximity-fuse delay near vehicles.</p>
ProximityFuseTimeVehicleMax:<p>Maximum proximity-fuse delay near vehicles.</p>
ProximityFuseTimeVehicleSpeed:<p>Vehicle-speed factor for the proximity fuse.</p>
ProximityLightFrequencyMultiplierTriggered:<p>Light flicker multiplier once the proximity fuse is triggered.</p>
DisturbFxDefault / DisturbFxDirt / DisturbFxFoliage / DisturbFxSand / DisturbFxWater:<p>Effect strength that disturbs the environment (dirt/foliage/sand/water) as the projectile passes.</p>
DisturbFxScale:<p>Scale of the disturbance effects.</p>
DisturbFxProbeDist / GroundFxProbeDistance:<p>Probe distances used to detect ground/surface for effects.</p>
IkRecoilDisplacement:<p>IK-based recoil displacement.</p>
IkRecoilDisplacementScaleBackward:<p>Backward recoil displacement scale.</p>
IkRecoilDisplacementScaleVertical:<p>Vertical recoil displacement scale.</p>
IkRecoilDisplacementScope:<p>Recoil displacement while scoped.</p>
TorsoIKAngleLimit:<p>IK angle limit on the torso while firing.</p>
AimingBreathingAdditiveWeight / FiringBreathingAdditiveWeight:<p>Breathing animation weight while aiming/firing.</p>
AimingLeanAdditiveWeight / FiringLeanAdditiveWeight:<p>Lean animation weight while aiming/firing.</p>
StealthAimingBreathingAdditiveWeight / StealthFiringBreathingAdditiveWeight:<p>Breathing weights in stealth mode.</p>
StealthAimingLeanAdditiveWeight / StealthFiringLeanAdditiveWeight:<p>Lean weights in stealth mode.</p>
AimProbeLengthMin / AimProbeLengthMax:<p>Min/max camera aim-probe length (how far the aim camera can reach).</p>
AimProbeRadiusOverrideFPSIdle / AimProbeRadiusOverrideFPSIdleStealth / AimProbeRadiusOverrideFPSLT / AimProbeRadiusOverrideFPSRNG / AimProbeRadiusOverrideFPSScope:<p>Aim-probe radius overrides for first-person states (idle / stealth / light-throw / run-and-gun / scope).</p>
ExpandPedCapsuleRadius:<p>How much the target's hit capsule is enlarged (easier to hit).</p>
RunAndGunAccuracyModifier:<p>Spread multiplier while moving and hipfiring.</p>
RunAndGunAccuracyMinOverride:<p>Floor spread forced while run-and-gunning.</p>
RunAndGunCameraHash:<p>Camera used while run-and-gunning.</p>
MeleeRightFistTargetHealthDamageScaler:<p>Damage scaler vs targets (melee-ish).</p>
AlternateWaitTime:<p>Pause between burst groups.</p>
TimeLeftBetweenShotsWhereShouldFireIsCached:<p>Internal fire-cache window (leave as-is).</p>
SpinUpTime:<p>Delay from trigger to full fire rate (gatling).</p>
SpinTime:<p>Time to reach full speed.</p>
SpinDownTime:<p>How long the barrel keeps spinning after release.</p>
AnimReloadRate:<p>Reload animation speed.</p>
ReloadTimeSP / ReloadTimeMP:<p>Reload pacing in single-player / online.</p>
DropForwardVelocity:<p>Forward speed when dropped.</p>
VerticalLaunchAdjustment:<p>Upward launch angle for projectiles.</p>
FragImpulse:<p>Shove from explosion fragments.</p>
BulletDirectionOffsetInDegrees:<p>Fixed angular error added to every shot.</p>
BulletDirectionPitchOffset:<p>Fixed pitch (vertical) error per shot.</p>
BulletDirectionPitchHomingOffset:<p>Pitch offset applied to homing projectiles.</p>
BulletBendingNearRadius / BulletBendingFarRadius / BulletBendingZoomedRadius:<p>Radii where bullets start "bending" (aim assist) at near/far/zoomed ranges.</p>
FirstPersonBulletBendingNearRadius / FirstPersonBulletBendingFarRadius / FirstPersonBulletBendingZoomedRadius:<p>Same bullet-bending radii in first person.</p>
AirborneAircraftLockOnMultiplier:<p>Lock-on distance multiplier when the target is an airborne aircraft.</p>
AiSoundRange:<p>How far NPCs can hear this weapon.</p>
AiPotentialBlastEventRange:<p>How far NPCs react to its blasts.</p>
CameraFov:<p>Field of view while firing/aiming this weapon.</p>
AimCameraHash / CoverCameraHash / DefaultCameraHash / FireCameraHash:<p>Camera profiles (aim / cover / default / fire).</p>
FirstPersonAimFovMin / FirstPersonAimFovMax:<p>First-person aim FOV range.</p>
FirstPersonScopeFov:<p>First-person scope FOV.</p>
FirstPersonScopeAttachmentFov:<p>FOV with a scope attachment mounted.</p>
FirstPersonReticuleStyleHash:<p>First-person crosshair style.</p>
ReticuleStyleHash:<p>Crosshair style.</p>
ReticuleScale:<p>Crosshair size.</p>
ReticuleMinSizeStanding:<p>Smallest crosshair while standing.</p>
ReticuleMinSizeCrouched:<p>Smallest crosshair while crouched.</p>
FirstPersonDofMaxNearInFocusDistance:<p>First-person depth-of-field near focus distance.</p>
FirstPersonDofMaxNearInFocusDistanceBlendLevel:<p>Blend level of the DOF near focus.</p>
FirstPersonDofSubjectMagnificationPowerFactorNear:<p>Magnification factor for DOF near subject.</p>
PovTurretCameraHash:<p>First-person camera used at the turret.</p>
ZoomFactorForAccurateMode:<p>Zoom multiplier in accurate (ADS) mode.</p>
AccuracyOffsetShakeHash:<p>Camera shake profile used with accuracy offsets.</p>
RunAndGunAccuracyModifier:<p>Run-and-gun spread multiplier.</p>
`;

export const vehicleweaponsGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Vehicle weapon",
  all,
  guide,
  what: "vehicleweapons.meta weapon/ammo field",
});
