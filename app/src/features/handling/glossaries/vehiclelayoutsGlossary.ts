// vehiclelayouts.meta (seats, entry points, cover, animations) glossary — plain language.
import { buildGlossary, type GlossarySource } from "./core";

const all = [
  "ActionFlags", "AdditionalPartVelocityMaxAngle", "AdditionalPartVelocityMaxMagnitude",
  "AdditionalPartVelocityMinAngle", "AdditionalPartVelocityMinMagnitude", "AgitatedClipSet",
  "AllowLookback", "AlternateBeJackedFromOutSideClipId", "AlternateEntryPointClipSetId",
  "AlternateForcedEntryClipId", "AlternateJackFromOutSideClipId", "AlternateTryLockedDoorClipId",
  "AnimRateSet.ref", "ApproachSpeedToWithinMaxBlendDelta", "BicycleInfo.ref", "BodyLeanXApproachSpeed",
  "BodyLeanXSmallDelta", "BreakoutTestPoint", "ClipSet", "ClipSetId", "CommonClipSetMap.ref",
  "DefaultCarTask", "DelayTimeMs", "DoorBoneName", "DoorHandleBoneName", "DriveByCamera",
  "DriveByClipSet", "DriveByFlags", "DriveByInfo.ref", "DuckedClipSet", "EnterVehicleMoveNetwork",
  "EntryAnimVariations.ref", "EntryClipSetMap.ref", "EntryHeadingChange", "EntryPointAnimInfo.ref",
  "EntryPointFlags", "EntryPointInfo.ref", "ExitClipSetMap.ref", "ExitToAimInfoName",
  "ExplosionTag", "ExtraBackwardOffset", "ExtraForwardOffset", "ExtraSideOffset",
  "ExtraZForMPPlaneWarp", "ExtraZForWaterEntry", "ExtraZOffset", "FPSMaxSteeringRateOverride",
  "FPSMinSteeringRateOverride", "FemaleGestureClipSetId", "FirstPersonDriveByClipSet",
  "FirstPersonMaxAimSweepHeadingAngleDegs", "FirstPersonMinAimSweepHeadingAngleDegs",
  "FirstPersonUnarmedMaxAimSweepHeadingAngleDegs", "FirstPersonUnarmedMinAimSweepHeadingAngleDegs",
  "Flags", "HairScale", "HandsUpClipSetId", "Heading", "Height", "InVehicleMoveNetwork",
  "InsideClipSetMap.ref", "Item.ref", "Item.text", "LayoutFlags", "Length", "LocationType",
  "LookBackApproachSpeedScale", "LowLODIdleAnim", "MaleGestureClipSetId",
  "MaxAimSweepHeadingAngleDegs", "MaxLateralLeanBlendWeightDelta",
  "MaxLongitudinalLeanBlendWeightDelta", "MaxRestrictedAimSweepHeadingAngleDegs",
  "MaxSmashWindowAngleDegs", "MaxSmashWindowAngleFirstPersonDegs", "MaxSpeedParam",
  "MaxUnarmedDrivebyYawIfWindowRolledUp", "MaxXAcceleration",
  "MinAimSweepHeadingAngleDegs", "MinRestrictedAimSweepHeadingAngleDegs", "MinSmashWindowAngleDegs",
  "MinSmashWindowAngleFirstPersonDegs", "MinUnarmedDrivebyYawIfWindowRolledUp",
  "NMJumpFromVehicleTuningSet", "Name", "Network", "Offset", "OpenDoorHeadingChange",
  "OverrideMaxAimAngle", "OverrideMaxRestrictedAimAngle", "OverrideMinAimAngle",
  "OverrideMinRestrictedAimAngle", "PanicClipSet", "PartDeletionChance", "Pitch", "PointType",
  "PositionAtPetrolTank", "PositionInBoundingBox", "Radius", "RestrictedDriveByClipSet", "Scale",
  "SeatAmbientContext", "SeatAnimFlags", "SeatAnimInfo.ref", "SeatBoneName", "SeatFlags",
  "SeatInfo.ref", "SeatOverrideAnimInfo.ref", "SecondDoorBoneName", "ShuffleLink", "ShuffleLink2",
  "SpineAdditiveBlendInDelay", "SpineAdditiveBlendInDuration", "SpineAdditiveBlendInDurationStill",
  "SpineAdditiveBlendOutDelay", "SpineAdditiveBlendOutDuration", "SteeringSmoothing",
  "UseOverrideAngles", "VarClipSetId", "VehicleExtraPointsInfo.ref", "VehicleSide",
  "WeaponGroup.ref", "Width", "WindowId",
];

const guide = `
Name:<p>The layout's unique name (e.g. LAYOUT_T90M) that vehicles.meta points at through its <b>layout</b> field.</p>
<p><b>Rename →</b> update the vehicle's layout reference too.</p>
LayoutFlags:<p>Space-separated behaviour flags for the whole layout (e.g. StreamAnims DisableJackingAndBusting). Read each flag name.</p>
MaxXAcceleration:<p>Acceleration clamp for the layout — caps how fast the seat/ped can move to a new seat or enter/exit.</p>
SteeringSmoothing:<p>How much steering input is smoothed while moving inside the vehicle.</p>
SeatBoneName:<p>Which bone of the vehicle the seat is attached to (e.g. chassis, seat_dside_f). The driver/occupant sits at this bone.</p>
SeatInfo.ref:<p>Reference to a seat-info definition this seat uses (drive-by/animation behaviour for the seat).</p>
SeatAnimInfo.ref:<p>Reference to the seat-animation info (enter/exit and idle anims) used at this seat.</p>
SeatFlags:<p>Space-separated flags for the seat (which doors it uses, whether it's a driver/weapon seat, etc).</p>
SeatAnimFlags:<p>Flags controlling the seat's animation behaviour.</p>
SeatAmbientContext:<p>Ambient animation context the occupant plays while sitting.</p>
EntryPointInfo.ref:<p>Reference to the entry-point definition used to climb into this seat.</p>
EntryPointAnimInfo.ref:<p>Reference to the entry-point animation (the actual climb anim) for this entry.</p>
EntryPointFlags:<p>Space-separated flags for the entry point (e.g. whether it is a door, a hatch, a plane warp…).</p>
EntryHeadingChange:<p>How much the ped's heading changes as they finish entering (degrees).</p>
OpenDoorHeadingChange:<p>Heading change applied while the door is opening.</p>
DoorBoneName:<p>Which bone the entry door is attached to (so the game opens the right door).</p>
SecondDoorBoneName:<p>Secondary door bone (for double doors / larger vehicles).</p>
DoorHandleBoneName:<p>Bone of the door handle used by the reach/grabbing animation.</p>
VehicleSide:<p>Which side of the vehicle this entry/point is on (SIDE_LEFT / SIDE_RIGHT).</p>
WindowId:<p>Which window id this entry point relates to (for smashing windows / rolling them down).</p>
Heading:<p>The ped's heading (direction) used at this extra point / entry.</p>
LocationType:<p>What the extra point is relative to — e.g. SEAT_RELATIVE (a point placed relative to a seat).</p>
PointType:<p>What the point is for — e.g. GET_IN, GET_OUT, EXIT_POINT…</p>
PositionInBoundingBox:<p>Whether the point is positioned in the vehicle's bounding box (vs a fixed world position).</p>
PositionAtPetrolTank:<p>Whether the point sits at the petrol tank (used for explosion/repair positioning).</p>
Offset:<p>Local offset (vector) of the point from its reference seat/bone.</p>
ExtraForwardOffset:<p>Forward offset added to the extra point (for getting the ped clear of the vehicle).</p>
ExtraBackwardOffset:<p>Backward offset added to the extra point.</p>
ExtraSideOffset:<p>Sideways offset added to the extra point.</p>
ExtraZOffset:<p>Vertical offset added to the extra point.</p>
ExtraZForMPPlaneWarp:<p>Extra vertical offset used when warping into multiplayer plane seats.</p>
ExtraZForWaterEntry:<p>Extra vertical offset used when entering from the water.</p>
Radius:<p>Radius of the extra point — how far the ped must be to use it.</p>
Width:<p>Width of the point/bounding volume.</p>
Length:<p>Length of the point/bounding volume.</p>
Height:<p>Height of the point/bounding volume.</p>
Scale:<p>Scale of the point's volume.</p>
Pitch:<p>Pitch (up/down angle) applied at the point.</p>
BreakoutTestPoint:<p>Whether this point is used as a "breakout" test point (rescue position when stuck).</p>
Flags:<p>Space-separated flags for the point/entry (behaviour switches).</p>
VehicleExtraPointsInfo.ref:<p>Reference to a shared extra-points-info definition.</p>
DriveByClipSet:<p>Animation clip used for drive-by shooting at this seat.</p>
DriveByCamera:<p>Camera used while drive-by shooting.</p>
DriveByFlags:<p>Drive-by behaviour flags for this seat.</p>
DriveByInfo.ref:<p>Reference to a drive-by info definition (which seats can drive-by, restricted sets).</p>
RestrictedDriveByClipSet:<p>Animation clip used when drive-by is restricted (e.g. window rolled up).</p>
FirstPersonDriveByClipSet:<p>First-person drive-by animation clip.</p>
MaxUnarmedDrivebyYawIfWindowRolledUp:<p>Maximum yaw (turn) allowed for an unarmed drive-by when the window is rolled up.</p>
MinUnarmedDrivebyYawIfWindowRolledUp:<p>Minimum yaw allowed for an unarmed drive-by with the window rolled up.</p>
MaxAimSweepHeadingAngleDegs:<p>Maximum heading angle the occupant can sweep while aiming (degrees).</p>
MinAimSweepHeadingAngleDegs:<p>Minimum heading angle for aiming sweep.</p>
MaxRestrictedAimSweepHeadingAngleDegs:<p>Aim-sweep cap when in a restricted pose.</p>
MinRestrictedAimSweepHeadingAngleDegs:<p>Aim-sweep minimum in a restricted pose.</p>
OverrideMaxAimAngle:<p>Switch (true/false): use the max aim-sweep override angle instead of the default.</p>
OverrideMaxRestrictedAimAngle:<p>Switch: use the max restricted-pose aim-sweep override angle.</p>
OverrideMinAimAngle:<p>Switch: use the min aim-sweep override angle.</p>
OverrideMinRestrictedAimAngle:<p>Switch: use the min restricted-pose aim-sweep override angle.</p>
UseOverrideAngles:<p>Whether to use the override aim angles for this seat.</p>
FirstPersonMaxAimSweepHeadingAngleDegs:<p>First-person aim-sweep maximum (degrees).</p>
FirstPersonMinAimSweepHeadingAngleDegs:<p>First-person aim-sweep minimum (degrees).</p>
FirstPersonUnarmedMaxAimSweepHeadingAngleDegs:<p>First-person aim-sweep maximum when unarmed.</p>
FirstPersonUnarmedMinAimSweepHeadingAngleDegs:<p>First-person aim-sweep minimum when unarmed.</p>
MaxSmashWindowAngleDegs:<p>Maximum angle from which the occupant can smash a window.</p>
MinSmashWindowAngleDegs:<p>Minimum angle for smashing a window.</p>
MaxSmashWindowAngleFirstPersonDegs:<p>First-person window-smash maximum angle.</p>
MinSmashWindowAngleFirstPersonDegs:<p>First-person window-smash minimum angle.</p>
MaxSpeedParam:<p>Speed parameter used by entry/exit blend logic.</p>
ApproachSpeedToWithinMaxBlendDelta:<p>How close the ped must approach before blend starts (entry animation).</p>
MaxLateralLeanBlendWeightDelta:<p>How fast lateral (side) leaning blend can change.</p>
MaxLongitudinalLeanBlendWeightDelta:<p>How fast forward/back leaning blend can change.</p>
BodyLeanXApproachSpeed:<p>Speed at which the body reaches its lean target.</p>
BodyLeanXSmallDelta:<p>Small-lean threshold used to avoid jitter.</p>
SpineAdditiveBlendInDelay:<p>Delay before the spine-additive anim blends in.</p>
SpineAdditiveBlendInDuration:<p>How long the spine-additive anim takes to blend in.</p>
SpineAdditiveBlendInDurationStill:<p>Blend-in duration while the vehicle is still.</p>
SpineAdditiveBlendOutDelay:<p>Delay before the spine-additive anim blends out.</p>
SpineAdditiveBlendOutDuration:<p>How long the spine-additive anim takes to blend out.</p>
LookBackApproachSpeedScale:<p>Scale on approach speed for the look-back animation.</p>
AllowLookback:<p>Whether the occupant can look behind while driving this vehicle.</p>
LowLODIdleAnim:<p>Cheap idle animation used when the vehicle is at low LOD / far away.</p>
HandsUpClipSetId:<p>Animation clip used when the occupant raises their hands (surrendering/cops).</p>
MaleGestureClipSetId:<p>Gesture animation clip used by male occupants.</p>
FemaleGestureClipSetId:<p>Gesture animation clip used by female occupants.</p>
AgitatedClipSet:<p>Animation clip used by an agitated occupant.</p>
PanicClipSet:<p>Animation clip used when the occupant panics (e.g. under fire).</p>
DuckedClipSet:<p>Animation clip used when the occupant ducks.</p>
VarClipSetId:<p>Variable animation clip reference.</p>
ClipSet:<p>An animation clip used at this point/seat.</p>
ClipSetId:<p>Reference to a named animation clip set.</p>
DefaultCarTask:<p>The default task the ped performs in this seat (e.g. driving or sitting).</p>
DelayTimeMs:<p>Delay (ms) applied before a behaviour/animation step happens.</p>
AlternateEntryPointClipSetId:<p>Alternative animation clip used for entering from this point.</p>
AlternateForcedEntryClipId:<p>Animation clip used for a forced entry (breaking in).</p>
AlternateJackFromOutSideClipId:<p>Animation clip for jacking (pulling someone out) from outside.</p>
AlternateBeJackedFromOutSideClipId:<p>Animation clip for being jacked from outside.</p>
AlternateTryLockedDoorClipId:<p>Animation clip for trying a locked door.</p>
Network:<p>Networking behaviour flag for this point/seat (synced entry/exit).</p>
EnterVehicleMoveNetwork:<p>Whether entry uses a "move network" (scripted movement path) into the vehicle.</p>
InVehicleMoveNetwork:<p>Whether the seat uses a move network while inside the vehicle.</p>
CommonClipSetMap.ref:<p>Reference to a shared clip-set map (entry/exit anims shared by many vehicles).</p>
EntryClipSetMap.ref:<p>Reference to the entry clip-set map used at this seat.</p>
ExitClipSetMap.ref:<p>Reference to the exit clip-set map.</p>
InsideClipSetMap.ref:<p>Reference to the inside (seated) clip-set map.</p>
EntryAnimVariations.ref:<p>Reference to entry-animation variation definitions (per-vehicle entry anims).</p>
SeatOverrideAnimInfo.ref:<p>Reference to a seat-animation override info.</p>
AnimRateSet.ref:<p>Reference to an animation-rate tuning set.</p>
BicycleInfo.ref:<p>Reference to bicycle-specific layout info.</p>
WeaponGroup.ref:<p>Reference to the weapon group used at this seat (which weapons can be used).</p>
NMJumpFromVehicleTuningSet:<p>Named ragdoll tuning for jumping out of the vehicle.</p>
ExitToAimInfoName:<p>Name of the "exit to aim" info used when the ped exits into an aiming state.</p>
ExplosionTag:<p>Explosion tag linked to this seat/point (e.g. fuel tank position explosion).</p>
HairScale:<p>Scale applied to hair when wearing a helmet at this seat (so it doesn't clip).</p>
ActionFlags:<p>Space-separated action flags for this entry (extra behaviours on entry).</p>
ShuffleLink:<p>Seat shuffling link — the game moves occupants between linked seats to fill seats.</p>
ShuffleLink2:<p>Secondary shuffle link.</p>
FPSMaxSteeringRateOverride:<p>First-person max steering-rate override.</p>
FPSMinSteeringRateOverride:<p>First-person min steering-rate override.</p>
AdditionalPartVelocityMinMagnitude / AdditionalPartVelocityMaxMagnitude:<p>Min/max magnitude of extra velocity applied to a detached part.</p>
AdditionalPartVelocityMinAngle / AdditionalPartVelocityMaxAngle:<p>Min/max angle for the extra part velocity.</p>
PartDeletionChance:<p>Chance a detached part is deleted instead of left lying around.</p>
Item.ref:<p>Reference value of a list entry (e.g. a linked seat/entry ref inside a list).</p>
Item.text:<p>Text value of a list entry (e.g. a name inside a list).</p>
`;

export const vehiclelayoutsGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Layout",
  all,
  guide,
  what: "vehiclelayouts.meta layout field",
});
