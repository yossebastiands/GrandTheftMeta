// Parameter hints, sourced from the "afp Vehicle Advanced Debugger" glossary
// (its config.lua `ConfigModules.<type>.Fields`). Descriptions contain light
// HTML (lists etc.) and are rendered inside the hint popover.
//
// Schema of hints.json: Array<{ t: module, n: element name, d: html }>

import hintsData from "./hints.json";

export interface HintEntry {
  /** Module: automobile | bike | boat | heli | plane | submarine | trailer */
  t: string;
  /** Handling element name, e.g. "fMass". */
  n: string;
  /** HTML description. */
  d: string;
}

const HINTS = hintsData as unknown as HintEntry[];

const TYPE_MODULE: Record<string, string> = {
  Car: "automobile",
  Motorcycle: "bike",
  Quadbike: "bike",
  Boat: "boat",
  Helicopter: "heli",
  Plane: "plane",
  Submarine: "submarine",
  Trailer: "trailer",
};

/** Pick the glossary module for a column + native vehicle type. */
function moduleFor(col: string, vehicleType?: string): string | undefined {
  const m = /^C([A-Za-z]+)HandlingData\./.exec(col);
  if (m) {
    const kind = m[1].toLowerCase(); // flying | car | bike | boat | ...
    switch (kind) {
      case "car":
        return "automobile";
      case "bike":
        return "bike";
      case "boat":
        return "boat";
      case "submarine":
        return "submarine";
      case "trailer":
        return "trailer";
      case "flying":
        return vehicleType === "Helicopter" ? "heli" : "plane";
      default:
        return undefined;
    }
  }
  return vehicleType ? TYPE_MODULE[vehicleType] : undefined;
}

/** Map a column name to its glossary element name.
 *  `CFlyingHandlingData.vecTurnRes.x` → `vecTurnRes`, `fMass` → `fMass`. */
function elementName(col: string): string {
  let c = col;
  if (/\.(x|y|z)$/.test(c)) c = c.slice(0, -2);
  const i = c.indexOf(".");
  return i >= 0 ? c.slice(i + 1) : c;
}

const byModule = new Map<string, Map<string, string>>();
const byName = new Map<string, string>();
for (const h of HINTS) {
  let mm = byModule.get(h.t);
  if (!mm) {
    mm = new Map();
    byModule.set(h.t, mm);
  }
  if (!mm.has(h.n)) mm.set(h.n, h.d);
  if (!byName.has(h.n)) byName.set(h.n, h.d);
}

// Hand-written fallbacks for common params the debugger glossary doesn't cover
// (mainly CVehicleWeaponHandlingData + a few CBoatHandlingData fields).
const EXTRA: Record<string, string> = {
  uWeaponHash:
    "Weapon hashes mounted per vehicle weapon slot; aligned positionally with the other weapon arrays.",
  WeaponSeats: "Which seat can operate each weapon slot (aligned with uWeaponHash).",
  WeaponVehicleModType:
    "Vehicle-mod type (VMT_*) that toggles each weapon slot; empty slots stay empty.",
  fTurretSpeed: "Turret traverse speed per weapon slot (degrees/second).",
  fTurretPitchMin: "Minimum turret pitch (depression) per weapon slot.",
  fTurretPitchMax: "Maximum turret pitch (elevation) per weapon slot.",
  fTurretCamPitchMin: "Turret camera minimum pitch per weapon slot.",
  fTurretCamPitchMax: "Turret camera maximum pitch per weapon slot.",
  fBulletVelocityForGravity: "Bullet speed used to compute projectile gravity drop.",
  fTurretPitchForwardMin:
    "Minimum turret pitch when aimed forward, so it won't clip the hull.",
  fUvAnimationMult: "UV/animation texture speed multiplier for weapon or effect materials.",
  fMiscGadgetVar: "Miscellaneous gadget variable (special weapon/effect behaviour).",
  fWheelImpactOffset: "Wheel impact (weapon kick) offset applied to the vehicle.",
  fRudderForce: "How strongly the rudder steers the boat.",
  fRudderOffsetSubmerge: "Rudder submergence offset (how deep the rudder sits).",
  fRudderOffsetForce: "Steering force applied by the rudder offset.",
  fRudderOffsetForceZMult: "Vertical force multiplier of the rudder offset.",
  fBoxFrontMult: "Buoyancy box multiplier at the boat's front.",
  fBoxRearMult: "Buoyancy box multiplier at the boat's rear.",
  fBoxSideMult: "Buoyancy box multiplier along the boat's sides.",
  fSampleTop: "Water sampling height above the hull (top buoyancy sample).",
  fSampleBottom: "Water sampling depth below the hull (bottom buoyancy sample).",
  fPropRadius: "Propeller radius (affects thrust/audio).",
  fImpellerForceMult: "Jet-drive impeller thrust multiplier.",
};

/** Returns the HTML description for a parameter column, or undefined. */
export function paramHint(col: string, vehicleType?: string): string | undefined {
  const el = elementName(col);
  const mod = moduleFor(col, vehicleType);
  if (mod) {
    const d = byModule.get(mod)?.get(el);
    if (d) return d;
  }
  return byName.get(el) ?? EXTRA[el];
}

// ---------------------------------------------------------------------------
// Full glossary (for the Glossary view)
// ---------------------------------------------------------------------------

const MODULE_LABEL: Record<string, string> = {
  automobile: "Car",
  plane: "Plane",
  heli: "Helicopter",
  boat: "Boat",
  submarine: "Submarine",
  bike: "Bike / Motorcycle",
  trailer: "Trailer",
  misc: "Supplementary",
};

export interface GlossaryEntry {
  name: string;
  moduleLabel: string;
  description: string;
}

/** Unique param list (by element name) with descriptions, for the glossary view. */
export function handlingGlossary(): GlossaryEntry[] {
  const byName = new Map<string, GlossaryEntry>();
  for (const h of HINTS) {
    if (!byName.has(h.n)) {
      byName.set(h.n, {
        name: h.n,
        moduleLabel: MODULE_LABEL[h.t] ?? h.t,
        description: h.d,
      });
    }
  }
  for (const [name, description] of Object.entries(EXTRA)) {
    if (!byName.has(name)) {
      byName.set(name, { name, moduleLabel: MODULE_LABEL.misc, description });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
