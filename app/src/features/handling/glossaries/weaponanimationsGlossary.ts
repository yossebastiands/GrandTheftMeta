// weaponanimations.meta (per personality-set weapon animation) glossary — plain language.
//
// These are all animation clips / clip-set hashes: each field tells the game which
// animation clip to play for one situation while carrying this weapon. The values
// are *names* of clips that already exist in the game/animation dicts.
import { buildGlossary, type GlossarySource } from "./core";

const all = [
  "AimGrenadeThrowAlternateClipsetHash", "AimGrenadeThrowNormalClipsetHash",
  "AimTurnStandingClipSetHash", "AimingDownTheBarrel", "AlternativeClipSetWhenBlocked",
  "AnimBlindFireRateModifier", "AnimFireRateModifier", "AnimWantingToShootFireRateModifier",
  "CombatReactionOverrideClipSetHash", "CoverAlternateMovementClipSetHash",
  "CoverMovementClipSetHash", "CoverMovementExtraClipSetHash", "CoverWeaponClipSetHash",
  "FPSTransitionFromIdleHash", "FPSTransitionFromLTHash", "FPSTransitionFromRNGHash",
  "FPSTransitionFromScopeHash", "FPSTransitionFromStealthHash", "FPSTransitionFromUnholsterHash",
  "FPSTransitionToStealthFromUnholsterHash", "FPSTransitionToStealthHash",
  "FallUpperbodyClipSetHash", "FiringVariationsStandingClipSetHash",
  "FromStrafeTransitionUpperBodyClipSetHash", "GestureBeckonOverrideClipSetHash",
  "GestureGlancesOverrideClipSetHash", "GestureHaltOverrideClipSetHash",
  "GestureOverThereOverrideClipSetHash", "JumpUpperbodyClipSetHash", "MeleeClipSetHash",
  "MeleeVariationClipSetHash", "MotionClipSetHash", "MotionFilterHash",
  "MotionStrafingClipSetHash", "MotionStrafingStealthClipSetHash",
  "MotionStrafingUpperBodyClipSetHash", "MovementOverrideClipSetHash", "ScopeWeaponClipSet",
  "ShellShockedClipSetHash", "SwapWeaponFilterHash", "SwapWeaponInLowCoverFilterHash",
  "UseFromStrafeUpperBodyAimNetwork", "UseLeftHandIKAllowTags", "WeaponClipSetHash",
  "WeaponClipSetHashForClone", "WeaponClipSetHashHiCover", "WeaponClipSetHashInjured",
  "WeaponClipSetHashStealth", "WeaponClipSetHashStreamed", "WeaponSwapClipSetHash",
  "WeaponSwapData.ref",
];

const guide = `
MotionClipSetHash:<p>The main movement clip set used while carrying this weapon (walking/running stance with the gun).</p>
WeaponClipSetHash:<p>The weapon-specific clip set for the default grip/pose (how the hands hold and carry the gun).</p>
WeaponClipSetHashForClone:<p>Clip set used when another character "clones" this weapon pose (e.g. cutscenes/multiplayer).</p>
WeaponClipSetHashStreamed:<p>Streamed (loaded-on-demand) variant of the weapon clip set.</p>
WeaponClipSetHashStealth:<p>Clip set used while moving in stealth with this weapon.</p>
WeaponClipSetHashInjured:<p>Clip set used when the character is injured while carrying the weapon.</p>
WeaponClipSetHashHiCover:<p>Clip set used in high cover with this weapon.</p>
CoverWeaponClipSetHash:<p>Clip set used while in cover with this weapon.</p>
CoverMovementClipSetHash:<p>Movement clip set used while moving in cover.</p>
CoverAlternateMovementClipSetHash:<p>Alternate movement clip set used in cover.</p>
CoverMovementExtraClipSetHash:<p>Extra cover-movement clip set (additional variants).</p>
MotionStrafingClipSetHash:<p>Strafe movement clip set (moving sideways while aiming).</p>
MotionStrafingStealthClipSetHash:<p>Strafe clip set used in stealth.</p>
MotionStrafingUpperBodyClipSetHash:<p>Upper-body strafe clip set (legs walk while upper body aims).</p>
FromStrafeTransitionUpperBodyClipSetHash:<p>Upper-body transition clip when entering/leaving a strafe.</p>
MotionFilterHash:<p>Filter that blends the movement network for this weapon (how body layers combine).</p>
UseFromStrafeUpperBodyAimNetwork:<p>Whether to use the "strafe upper-body aim" animation network for this weapon (true/false).</p>
UseLeftHandIKAllowTags:<p>Whether left-hand IK is allowed while holding this weapon (left hand supports/grips).</p>
MeleeClipSetHash:<p>Clip set used when melee-attacking while holding this weapon (rifle butt, pistol whip).</p>
MeleeVariationClipSetHash:<p>Variant melee clip set (alternate melee attacks).</p>
SwapWeaponClipSetHash:<p>Clip set played when swapping to/from this weapon.</p>
WeaponSwapData.ref:<p>Reference to the weapon-swap animation set (how the gun appears in the holster/swap pose).</p>
SwapWeaponFilterHash:<p>Filter used while swapping weapons (blends the swap animation).</p>
SwapWeaponInLowCoverFilterHash:<p>Filter used when swapping weapons while in low cover.</p>
AimingDownTheBarrel:<p>Whether this weapon uses the down-the-barrel aim pose (FPS aim) — true/false.</p>
ScopeWeaponClipSet:<p>Clip set used when scoped (holding a scoped weapon at the eye).</p>
AimTurnStandingClipSetHash:<p>Clip set used when turning while aiming standing.</p>
FallUpperbodyClipSetHash:<p>Upper-body clip used while falling/jumping with the weapon.</p>
JumpUpperbodyClipSetHash:<p>Upper-body clip used while jumping.</p>
FiringVariationsStandingClipSetHash:<p>Standing firing-variation clip set (recoil variety while firing standing).</p>
AnimFireRateModifier:<p>Multiplier on how fast the firing animation plays (≈1.0 = syncs to the fire rate).</p>
AnimBlindFireRateModifier:<p>Firing-animation rate multiplier for blind fire (over cover).</p>
AnimWantingToShootFireRateModifier:<p>Rate multiplier for the "wanting to shoot" (pre-fire) animation.</p>
CombatReactionOverrideClipSetHash:<p>Clip set overriding combat-reaction animations (getting hit/under fire).</p>
ShellShockedClipSetHash:<p>Clip set for the shell-shocked (suppressed) state.</p>
GestureBeckonOverrideClipSetHash:<p>Gesture clip override for "beckon" (come here) while holding the weapon.</p>
GestureGlancesOverrideClipSetHash:<p>Gesture clip override for glancing around.</p>
GestureHaltOverrideClipSetHash:<p>Gesture clip override for the "halt/stop" signal.</p>
GestureOverThereOverrideClipSetHash:<p>Gesture clip override for the "over there" point.</p>
MovementOverrideClipSetHash:<p>Override movement clip set for special cases.</p>
AlternativeClipSetWhenBlocked:<p>Alternative clip set used when the default one is blocked/unavailable.</p>
AimGrenadeThrowNormalClipsetHash:<p>Clip set for a normal grenade throw while this weapon is held.</p>
AimGrenadeThrowAlternateClipsetHash:<p>Alternate grenade-throw clip set (overhand/underhand variant).</p>
FPSTransitionFromIdleHash:<p>First-person transition clip when leaving idle.</p>
FPSTransitionFromLTHash:<p>First-person transition from the light-throw (LT) pose.</p>
FPSTransitionFromRNGHash:<p>First-person transition from run-and-gun.</p>
FPSTransitionFromScopeHash:<p>First-person transition from scoped aim.</p>
FPSTransitionFromStealthHash:<p>First-person transition from stealth.</p>
FPSTransitionFromUnholsterHash:<p>First-person transition after unholstering.</p>
FPSTransitionToStealthHash:<p>First-person transition into stealth.</p>
FPSTransitionToStealthFromUnholsterHash:<p>First-person transition into stealth right after unholstering.</p>
`;

export const weaponanimationsGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Clip set",
  all,
  guide,
  what: "weaponanimations.meta animation-clip field",
});
