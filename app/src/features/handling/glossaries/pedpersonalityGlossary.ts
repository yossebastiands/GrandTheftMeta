// pedpersonality.meta (movement / unholster clip bindings) glossary — plain language.
import { buildGlossary, type GlossarySource } from "./core";

const all = [
  "Clip", "IdleTransitionBlendOutTime", "MovementClipSetId", "UnholsterClipData",
  "UnholsterClipData.ref", "UnholsterClipSetId", "UpperBodyFeatheredLeanEnabled",
  "UpperBodyShadowExpressionEnabled", "UseLeftHandIk", "UseWeaponAnimsForGrip",
  "WeaponClipFilterId", "WeaponClipSetId",
];

const guide = `
Clip:<p>The movement clip played while holstering/unholstering this weapon (e.g. unarmed_holster_1h). One unholster binding = one clip.</p>
<p>Swap it to change how the character stows/draws the gun.</p>
MovementClipSetId:<p>The core movement clip set for this weapon grip — how the character walks/runs while carrying the weapon (e.g. MOVE_ACTION@P_M_ZERO@ARMED@CORE).</p>
WeaponClipSetId:<p>The clip set that poses the upper body / arms while this weapon is held (e.g. MOVE_ACTION@…@ARMED@1H@UPPER).</p>
WeaponClipFilterId:<p>Filter that blends the weapon pose onto the body (e.g. UpperbodyAndIk_filter) so arms aim properly while legs walk.</p>
UseWeaponAnimsForGrip:<p>Whether to use this weapon's own grip animations (true) or fall back to generic ones (false).</p>
UseLeftHandIk:<p>Whether the left hand uses IK to support/grip the weapon (true/false).</p>
UpperBodyShadowExpressionEnabled:<p>Whether the upper body keeps casting a "shadow" expression pose (keeps aiming silhouette natural).</p>
UpperBodyFeatheredLeanEnabled:<p>Whether upper-body leaning is feathered (soft-blended) while aiming — smoother lean transitions.</p>
IdleTransitionBlendOutTime:<p>How long the idle→move transition takes to blend out (seconds). Higher = slower, softer transitions.</p>
UnholsterClipSetId:<p>The clip set used while unholstering this weapon in the movement set (the draw animation set).</p>
UnholsterClipData:<p>The named unholster scenario used by this binding (e.g. UNHOLSTER_1H) — matches a MovementModeUnholsterData entry's Name.</p>
UnholsterClipData.ref:<p>Same as UnholsterClipData but written as a ref — the scenario name the draw animation points to.</p>
`;

export const pedpersonalityGlossary: GlossarySource = buildGlossary({
  moduleLabel: "Binding",
  all,
  guide,
  what: "pedpersonality.meta clip-binding field",
});
