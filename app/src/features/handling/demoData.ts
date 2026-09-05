// Dev-only sample data (used when the app is opened with `?demo` in dev) so
// the grid can be inspected in a plain browser where the Tauri backend is absent.
// `?demo=150` scales it to 150 rows to exercise the virtualized table path.
import type { ScanResult, VehicleRow } from "../../shared/models";

const COLS = [
  "fMass",
  "fInitialDragCoeff",
  "fPercentSubmerged",
  "fDriveBiasFront",
  "nInitialDriveGears",
  "fInitialDriveForce",
  "fDriveInertia",
  "fInitialDriveMaxFlatVel",
  "fBrakeForce",
  "fSteeringLock",
  "fTractionCurveMax",
  "fTractionCurveMin",
  "fSuspensionForce",
  "fAntiRollBarForce",
  "fLowSpeedTractionLossMult",
  "fCamberStiffnesss",
  "fSuspensionRaise",
  "fCollisionDamageMult",
  "fWeaponDamageMult",
  "CFlyingHandlingData.fThrust",
  "CFlyingHandlingData.fThrustFallOff",
  "CFlyingHandlingData.fYawMult",
  "CFlyingHandlingData.fYawStabilise",
  "CFlyingHandlingData.fRollMult",
  "CFlyingHandlingData.fRollStabilise",
  "CFlyingHandlingData.fPitchMult",
  "CFlyingHandlingData.fPitchStabilise",
  "CFlyingHandlingData.fFormLiftMult",
  "CFlyingHandlingData.fGearDownDragV",
  "CFlyingHandlingData.vecTurnRes.x",
  "CBoatHandlingData.fRudderForce",
  "CVehicleWeaponHandlingData.fTurretSpeed",
  "strHandlingFlags",
  "strModelFlags",
  "handlingType",
];

const ROWS: Array<[string, string, string, string, Record<string, string>]> = [
  ["Aircraft_F22A", "Plane", "Plane", "f22a", { fMass: "8000", fInitialDriveMaxFlatVel: "328.6", "CFlyingHandlingData.fThrust": "2.45", "CFlyingHandlingData.fYawMult": "-0.001", strHandlingFlags: "000100" }],
  ["Aircraft_mir2k", "Plane", "Plane", "mir2k", { fMass: "7700", fInitialDriveMaxFlatVel: "315.0", "CFlyingHandlingData.fThrust": "2.6", strHandlingFlags: "C201001" }],
  ["Aircraft_f16c", "Plane", "Plane", "f16c", { fMass: "7500", fInitialDriveMaxFlatVel: "320.0", "CFlyingHandlingData.fYawMult": "-0.002" }],
  ["Helicopter_ah64e", "Helicopter", "Helicopter", "ah64e", { fMass: "5200", fInitialDriveForce: "0.35", "CFlyingHandlingData.fThrust": "2.2", strHandlingFlags: "000100" }],
  ["Tank_abramsx", "Car", "Military", "abramsx", { fMass: "62000", fInitialDriveForce: "0.16", fBrakeForce: "1.0", strHandlingFlags: "C201001" }],
  ["IFV_rosomak", "Amphibious", "Off-Road", "rosomak", { fMass: "11000", fInitialDriveForce: "0.12", "CBoatHandlingData.fRudderForce": "5.0" }],
  ["Naval_usnavyfleet", "Boat", "Boat", "arleigh", { fMass: "40000", fPercentSubmerged: "290.0" }],
  ["Car_m3g80", "Car", "Super", "m3g80", { fMass: "1650", fInitialDriveMaxFlatVel: "200.0", fBrakeForce: "0.9", strHandlingFlags: "0" }],
];

export function demoScan(count = 8): ScanResult {
  const vehicles: VehicleRow[] = [];
  for (let i = 0; i < count; i++) {
    const [folder_name, vehicle_type, vehicle_class, handling_name, params] =
      ROWS[i % ROWS.length];
    const dup = Math.floor(i / ROWS.length);
    vehicles.push({
      folder_name: dup ? `${folder_name}_#${i}` : folder_name,
      vehicle_type,
      vehicle_class,
      handling_name: dup ? `${handling_name}${i}` : handling_name,
      meta_path: "",
      params,
    });
  }
  return {
    columns: COLS,
    skipped: [],
    vehicles,
  };
}
