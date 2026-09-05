// handling.meta (CHandlingData + sub-handling) field glossary — plain language.
//
// Rewrites the technical Apollo-flight-program descriptions into the same
// "what / up → / down → / start with" style used by the weapons glossary.
// Every entry answers what the value does and which way to turn it for a feel.
// Fields shared by several vehicle modules (Car, Plane, Heli, Boat, Bike…) are
// described once; the wording stays true for all of them.

import { parseGuide } from "./glossaries/core";

const GUIDE = `
fMass:<p>Total mass of the vehicle in kg (e.g. 1500.000000). It scales EVERYTHING: acceleration, braking, collisions, ramming.</p>
<p><b>Up →</b> slower to accelerate/brake but ploughs through traffic and feels heavy; high speed is harder to stop.</p>
<p><b>Down →</b> light and twitchy — fast off the line, easy to spin, pushed around by bumps.</p>
<p><b>Start with:</b> sedan/sports ~1200–1800 · muscle ~1600–1900 · trucks/SUVs ~2000–3000 · keep it believable for the model's size.</p>
nInitialDriveGears:<p>How many gears the transmission has.</p>
<p><b>Up →</b> more shifts on the way to top speed (feels sporty, keeps revs/torque usable longer).</p>
<p><b>Down →</b> fewer shifts, longer ratios (lazier, can feel flat off the line).</p>
<p><b>Start with:</b> 4–6 for road cars; race/super cars 6–7.</p>
fDriveBiasFront:<p>Where engine power goes — 0 = rear-wheel drive, 1 = front-wheel drive, ~0.5 = all-wheel drive.</p>
<p><b>0 (RWD) →</b> playful rear end, can oversteer/drift; classic sports setup.</p>
<p><b>1 (FWD) →</b> safer, understeers (won't spin easily) but less fun and nose-heavy.</p>
<p><b>0.5 (AWD) →</b> launches and grips best; very stable, some say "too easy".</p>
fBrakeBiasFront:<p>Braking split 0–1 — how much braking happens on the front wheels.</p>
<p><b>Up (towards 1) →</b> stable straight-line stops but nose dives; too high and the rear barely brakes.</p>
<p><b>Down (towards 0) →</b> more rear braking; can step the tail out under hard braking.</p>
<p><b>Start with:</b> ~0.5–0.7 for road cars.</p>
fBrakeForce:<p>Overall brake strength multiplier (1.000000 = stock).</p>
<p><b>Up →</b> shorter stopping distance, easier to lock up. <b>Down →</b> long lazy stops.</p>
fHandBrakeForce:<p>Handbrake (space) strength — how hard the rear locks for drifts/turns.</p>
<p><b>Up →</b> instant 180s and sharp drifts. <b>Down →</b> weak, won't kick the tail out.</p>
fSteeringLock:<p>Steering wheel lock in degrees — how far the front wheels can turn.</p>
<p><b>Up →</b> tighter turning circle but twitchy/jerky at speed. <b>Down →</b> wider turns, calmer at speed.</p>
<p><b>Start with:</b> ~30–40 for road cars.</p>
fTractionBiasFront:<p>Where the tyre grip is biased, front vs rear (0–1) — how much of the traction is expected at the front.</p>
<p><b>Up (towards 1) →</b> grip biased to the front — safer, understeer tendency.</p>
<p><b>Down (towards 0) →</b> rear-biased grip — livelier rear, oversteer tendency.</p>
fTractionCurveMax:<p>Maximum grip (traction) the tyres get at LOW speed / from a standstill.</p>
<p><b>Up →</b> strong launch grip, less wheelspin, sticks in slow corners.</p>
<p><b>Down →</b> easy wheelspin and sliding at low speed.</p>
fTractionCurveMin:<p>Minimum grip the tyres fall to at HIGH speed.</p>
<p><b>Up →</b> stable and planted at high speed. <b>Down →</b> slippery when fast (drifty at speed).</p>
<p>Keep it below fTractionCurveMax (grip falls off as speed rises).</p>
fTractionCurveLateral:<p>Sideways (cornering) grip multiplier on top of the traction curve.</p>
<p><b>Up →</b> tyres stick in corners, less understeer/oversteer. <b>Down →</b> slides sideways easily.</p>
fTractionSpringDeltaMax:<p>How quickly grip transitions between the min and max traction curves.</p>
<p><b>Up →</b> grip snaps in/out quickly (snappy, can feel sudden). <b>Down →</b> smooth, gradual changes.</p>
fLowSpeedTractionLossMult:<p>How much grip is lost when you floor it at LOW speed.</p>
<p><b>0 →</b> no wheelspin from a standstill — full traction launches.</p>
<p><b>Up →</b> tyres break loose more when launching (more spin, less effective power).</p>
fTractionLossMult:<p>Overall traction-loss multiplier under power while moving.</p>
<p><b>Up →</b> more power-oversteer/wheelspin (power becomes less usable).</p>
<p><b>Down (towards 0) →</b> more grip under throttle — faster but less "fun".</p>
fSuspensionBiasFront:<p>How much of the suspension/weight is biased to the front (0–1).</p>
<p><b>Up →</b> firmer front — understeer tendency. <b>Down →</b> more rear bias — lively rear.</p>
fSuspensionForce:<p>Suspension spring stiffness (how hard the springs push back).</p>
<p><b>Up →</b> stiff, flat through corners, but harsh over bumps (skips).</p>
<p><b>Down →</b> soft, comfy cruiser that rolls and bottoms out.</p>
fSuspensionCompDamp:<p>How hard the suspension resists compressing (hitting a bump).</p>
<p><b>Up →</b> absorbs hits stiffly (no bounce) but jarring. <b>Down →</b> soft squish on impacts.</p>
fSuspensionReboundDamp:<p>How hard the suspension resists extending back after a bump.</p>
<p><b>Up →</b> returns slowly, stays settled. <b>Down →</b> bounces/rebounds quickly after bumps.</p>
fSuspensionUpperLimit:<p>How far the suspension can compress (travel up) before bottoming out.</p>
fSuspensionLowerLimit:<p>How far the suspension can extend down (droop) before topping out.</p>
fSuspensionRaise:<p>Static ride height offset — raises or lowers the body from the wheels.</p>
<p><b>Positive →</b> lifted (off-road look/clearance). <b>Negative →</b> lowered (stance).</p>
fAntiRollBarForce:<p>Anti-roll bar stiffness — resists body roll side to side.</p>
<p><b>Up →</b> flat corners, less lean; too stiff and the inside wheel lifts.</p>
<p><b>Down →</b> leans/rolls a lot in corners.</p>
fAntiRollBarBiasFront:<p>How much of the anti-roll stiffness is at the front.</p>
<p><b>Up →</b> flatter front = understeer. <b>Down →</b> more rear roll resistance = oversteer tendency.</p>
fRollCentreHeightFront:<p>Front roll-centre height — geometry point the body rolls around at the front.</p>
<p><b>Up →</b> less body roll but can feel perched; <b>down →</b> more roll.</p>
fRollCentreHeightRear:<p>Rear roll-centre height — same idea for the rear axle.</p>
fCollisionDamageMult:<p>Multiplier on damage taken when crashing into things.</p>
<p><b>Up →</b> wrecks easily. <b>Down →</b> tanks crashes like nothing. 0 = indestructible.</p>
fWeaponDamageMult:<p>Multiplier on damage taken from weapons (bullets/explosions hitting it).</p>
<p><b>Up →</b> dies fast to gunfire. <b>Down →</b> armoured feel. 0 = bulletproof-ish.</p>
fDeformationDamageMult:<p>How much the body visually deforms (crumples/dents) when damaged.</p>
fEngineDamageMult:<p>How fast engine damage builds (engine failure from impacts).</p>
fBodyDamageControlEffectMult:<p>How much body damage degrades handling/steering control.</p>
<p><b>0 →</b> body damage never affects driving. <b>Up →</b> a dented car starts pulling/driving badly.</p>
fOilVolume:<p>Oil capacity — how much engine damage it takes once oil is lost.</p>
fPetrolTankVolume:<p>Fuel tank size — how long it drives, and when the tank "leaks/explodes" risk appears.</p>
fSeatOffsetDistX:<p>Driver seat sideways offset from centre (left/right).</p>
fSeatOffsetDistY:<p>Driver seat forward/back offset from centre.</p>
fSeatOffsetDistZ:<p>Driver seat height offset from centre.</p>
fDriveInertia:<p>Drivetrain inertia — how lazy or eager the engine spins up.</p>
<p><b>Up →</b> revs build sluggishly (heavy flywheel feel). <b>Down →</b> instant rev response.</p>
fInitialDriveForce:<p>Engine power multiplier (1.000000 = stock power). THE acceleration dial.</p>
<p><b>Up →</b> faster acceleration, more wheelspin. <b>Down →</b> weaker pull.</p>
<p><b>Start with:</b> 0.35–0.5 for normal cars · 0.6–0.9 for fast/super cars; pair with fInitialDriveMaxFlatVel for top speed.</p>
fInitialDriveMaxFlatVel:<p>Top-speed ceiling — the maximum velocity the drive force can reach.</p>
<p><b>Up →</b> higher top speed (also needs power to reach it). <b>Down →</b> lower cap.</p>
fClutchChangeRateScaleUpShift:<p>Multiplier on how fast up-shifts happen.</p>
<p><b>Up →</b> quicker shifts, less power loss between gears. <b>Down →</b> slow, ponderous shifts.</p>
fClutchChangeRateScaleDownShift:<p>Multiplier on how fast down-shifts happen.</p>
fInitialDragCoeff:<p>Aerodynamic drag coefficient.</p>
<p><b>Up →</b> more drag — lower top speed, more stable at speed, decelerates when you lift off.</p>
<p><b>Down →</b> cuts through air — higher top end, less natural braking from drag.</p>
fDownforceModifier:<p>Downforce multiplier (ground effect pushing the car into the road).</p>
<p><b>Up →</b> planted at high speed (like a racing car) but more drag/less top end.</p>
<p><b>Down →</b> light and floaty at speed.</p>
fPercentSubmerged:<p>The fraction of the vehicle submerged in water before buoyancy/behaviour kicks in (0–1).</p>
fMoveRes:<p>Rolling resistance — how easily the car coasts.</p>
<p><b>Up →</b> slows down when you lift off (engine braking feel). <b>Down →</b> free-wheels for ages.</p>
fInputSensitivityForDifficulty:<p>Extra steering input sensitivity applied on lower difficulty levels.</p>
<p>Higher = easier/snappier steering for casual players; leave at stock unless tuning for accessibility.</p>
fMiscGadgetVar:<p>A general-purpose tuning variable used by special vehicles/weapons.</p>
<p><b>Advice:</b> keep whatever your pack sets — only change if you know the gadget it feeds.</p>
nMonetaryValue:<p>The vehicle's monetary value (used by garages/insurance in game modes, not driving feel).</p>
strHandlingFlags:<p>Space-separated handling behaviour switches (e.g. SAND_OFF_ROAD? no — names like AXLE_F_NONE, OFFROAD_ABILITIES, TYRE_CAN_BURST…).</p>
<p><b>Add/remove words here</b> to enable/disable behaviour; read each flag name.</p>
strModelFlags:<p>Space-separated model flags (like IS_ELECTRIC, HAS_INTERIOR_LIGHTS, RAMP…).</p>
strDamageFlags:<p>Space-separated damage flags (e.g. EXPLOSION_ON_COLLISION, DONT_VISUALLY_DAMAGE…).</p>
vecCentreOfMassOffset:<p>The centre-of-mass offset (X Y Z in metres) from the middle of the vehicle.</p>
<p><b>Move it forward/down →</b> more stable, less likely to flip. <b>Move it up/back →</b> prone to tipping/wheelies.</p>
vecInertiaMultiplier:<p>Multiplier on rotational inertia (how hard the body resists spinning).</p>
<p><b>Higher →</b> less twitchy, resists spinning (boat-like, stable). <b>Lower →</b> spins/flips easily.</p>
vecSpeedRes:<p>Speed-response multiplier — how eagerly the vehicle accelerates/reacts along its axis (used by boats/watercraft).</p>
vecTurnRes:<p>Turn-response multiplier — how eagerly the vehicle reacts to steering/yaw (used by boats/watercraft and flying).</p>
<p><b>Up →</b> sharper, more responsive turning. <b>Down →</b> sluggish, heavy turning.</p>
fThrust:<p>Engine thrust force for aircraft/boats — the main propulsion dial (like fInitialDriveForce for air/water).</p>
<p><b>Up →</b> stronger acceleration/climb. <b>Down →</b> weaker.</p>
fThrustFallOff:<p>How quickly thrust fades as speed increases.</p>
<p><b>Up →</b> strong at low speed, weak top end. <b>Down →</b> thrust holds to higher speed.</p>
fThrustVectoring:<p>How quickly the thrust direction/engine vector reacts to input (agility).</p>
<p><b>Up →</b> snappy, agile direction changes. <b>Down →</b> slower, heavier feel.</p>
fYawMult:<p>Yaw (turning around the vertical axis) authority multiplier for air/water.</p>
<p><b>Up →</b> faster, sharper turns. <b>Down →</b> lazy turning.</p>
fYawStabilise:<p>Automatic yaw stabilisation — dampens unwanted sideways drifting.</p>
<p><b>Up →</b> holds a straight heading firmly. <b>Down →</b> drifts/skates around the yaw axis.</p>
fPitchMult:<p>Pitch (nose up/down) authority multiplier for aircraft.</p>
fPitchStabilise:<p>Automatic pitch stabilisation — self-levels the nose.</p>
<p><b>Up →</b> returns to level on its own. <b>Down →</b> nose stays where you leave it.</p>
fRollMult:<p>Roll (banking) authority multiplier for aircraft.</p>
fRollStabilise:<p>Automatic roll stabilisation — self-levels the wings.</p>
<p><b>Up →</b> wings return to level, easier to fly straight. <b>Down →</b> you hold the bank yourself.</p>
fAttackDiveMult:<p>How strongly the aircraft pitches down when you dive (attack run feel).</p>
fAttackLiftMult:<p>Lift added during dives/attack manoeuvres — helps pull out of steep dives.</p>
fFormLiftMult:<p>General wing-lift multiplier for aircraft.</p>
<p><b>Up →</b> floatier, generates lift easily. <b>Down →</b> sinks, needs constant speed/thrust.</p>
fEngineOffGlideMulti:<p>How well the aircraft glides with the engine off (dead-stick).</p>
<p><b>Up →</b> glides far. <b>Down →</b> drops like a brick when power is lost.</p>
fWindMult:<p>How strongly wind pushes the aircraft around.</p>
fTurublenceForceMulti:<p>Multiplier on the force of turbulence (shaking/pushing).</p>
fTurublenceMagnitudeMax:<p>Maximum magnitude of turbulence effects.</p>
fTurublencePitchTorqueMulti:<p>How much turbulence pitches (nods) the aircraft.</p>
fTurublenceRollTorqueMulti:<p>How much turbulence rolls (banks) the aircraft.</p>
fUvAnimationMult:<p>Speed of UV/texture animation on the vehicle (visual, e.g. scrolling decals).</p>
fSideSlipMult:<p>Side-slip resistance — how easily the vehicle slides sideways.</p>
<p><b>Up →</b> resists sliding (grippier sideways). <b>Down →</b> drifts/skates sideways more.</p>
fCamberStiffnesss:<p>Camber stiffness (motorcycle/bike lean) — how much the tyres grip when leaned over.</p>
<p><b>Up →</b> stable while leaning in corners. <b>Down →</b> washes out when leaned.</p>
fOnGroundYawBoostSpeedPeak:<p>Speed at which a land-plane gets its full on-ground yaw boost (steering on the runway).</p>
fOnGroundYawBoostSpeedCap:<p>Cap on the on-ground yaw boost (max extra steering while taxiing).</p>
fWheelImpactOffset:<p>Wheel impact offset used for weapon kickback behaviour on special vehicles.</p>
fGearDownDragV:<p>Extra drag applied when landing gear is down (aircraft).</p>
fGearDownLiftMult:<p>Lift change when landing gear is down (aircraft).</p>
`.trim();

const PLAIN = parseGuide(GUIDE);

/** Plain-language description for a handling element name (undefined = use fallback). */
export function handlingPlain(name: string): string | undefined {
  return PLAIN.get(name);
}
