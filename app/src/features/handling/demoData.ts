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


// Dev-only weapon sample rows (`?dw` in the browser) so the weapon editors can
// be inspected without the Tauri backend. Rows mirror the weapons.meta scanner:
// folder_name = relative meta file, handling_name = weapon Name, vehicle_type =
// Slot, vehicle_class = Group, params = CWeaponInfo scalar fields.
export function demoWeapons(count = 6): ScanResult {
  const base: Array<[string, string, string, string, Record<string, string>]> = [
    ["metas/ak47/weapons.meta", "WEAPON_AK47", "SLOT_WEAPON_AK47", "GROUP_RIFLE", { Damage: "30.000000", ClipSize: "30", AccuracySpread: "3.500000", RecoilErrorTime: "3.000000", WeaponFlags: "Automatic CarriedInHand", HumanNameHash: "WEAPON_AK47" }],
    ["metas/m4/weapons.meta", "WEAPON_M4", "SLOT_WEAPON_M4", "GROUP_RIFLE", { Damage: "32.000000", ClipSize: "30", AccuracySpread: "4.000000", RecoilErrorTime: "2.600000", WeaponFlags: "Automatic", HumanNameHash: "WEAPON_M4" }],
    ["metas/glock17/weapons.meta", "WEAPON_GLOCK17", "SLOT_WEAPON_PISTOL", "GROUP_HANDGUN", { Damage: "20.000000", ClipSize: "17", AccuracySpread: "1.500000", RecoilErrorTime: "2.000000", WeaponFlags: "Semiautomatic", HumanNameHash: "WEAPON_GLOCK17" }],
    ["metas/rpg/weapons.meta", "WEAPON_RPG", "SLOT_WEAPON_RPG", "GROUP_RPG", { Damage: "120.000000", ClipSize: "1", AccuracySpread: "0.000000", RecoilErrorTime: "0.500000", WeaponFlags: "Explosive", HumanNameHash: "WEAPON_RPG" }],
  ];
  const columns = ["Damage", "ClipSize", "AccuracySpread", "RecoilErrorTime", "WeaponFlags", "HumanNameHash"];
  const vehicles: VehicleRow[] = [];
  for (let i = 0; i < count; i++) {
    const [file, name, slot, group, params] = base[i % base.length];
    const dup = Math.floor(i / base.length);
    vehicles.push({
      folder_name: dup ? file.replace(".meta", `_${i}.meta`) : file,
      meta_path: "",
      handling_name: dup ? `${name}_${i}` : name,
      vehicle_type: slot,
      vehicle_class: group,
      params,
    });
  }
  return { vehicles, columns, skipped: [] };
}

// Dev-only vehicles.meta sample rows (`?dv`) so the vehicle-model editors can be
// inspected without the Tauri backend. Rows mirror the vehicles.meta scanner:
// folder_name = relative meta file, handling_name = modelName, vehicle_type /
// vehicle_class = FRIENDLY native labels, params = direct scalar leaves of the
// model item (raw type / vehicleClass / flags / value attrs / arrays…).
export function demoVehicles(count = 4): ScanResult {
  const base: Array<[string, string, string, string, Record<string, string>]> = [
    ["[mbo-vehicles]/Tank_t90m/vehicles.meta", "t90m", "Car", "Military", { txdName: "t90m", handlingId: "t90m", gameName: "T90M", audioNameHash: "RHINO", layout: "LAYOUT_T90M", explosionInfo: "EXPLOSION_INFO_DEFAULT", flags: "FLAG_HAS_LIVERY FLAG_IS_TANK FLAG_DONT_SPAWN_IN_CARGEN FLAG_DONT_SPAWN_AS_AMBIENT", type: "VEHICLE_TYPE_CAR", plateType: "VPT_NONE", vehicleClass: "VC_MILITARY", wheelType: "VWT_SPORT", defaultBodyHealth: "1000.000000", frequency: "100", maxNum: "5", diffuseTint: "0x00FFFFFF", wheelScale: "0.510000", lodDistances: "25 50 90 180 500 500" }],
    ["[mbo-vehicles]/Aircraft_j20s/vehicles.meta", "j20s", "Plane", "Plane", { txdName: "j20s", handlingId: "j20s", gameName: "J20S", audioNameHash: "LAZER", layout: "LAYOUT_J20S", explosionInfo: "EXPLOSION_INFO_DEFAULT", flags: "FLAG_NO_BOOT FLAG_HAS_LIVERY FLAG_DRIVER_NO_DRIVE_BY FLAG_DONT_SPAWN_IN_CARGEN FLAG_DONT_SPAWN_AS_AMBIENT FLAG_USE_PILOT_HELMET", type: "VEHICLE_TYPE_PLANE", plateType: "VPT_NONE", vehicleClass: "VC_PLANE", wheelType: "VWT_SPORT", defaultBodyHealth: "1000.000000", frequency: "60", maxNum: "5", diffuseTint: "0x00FFFFFF", wheelScale: "1.000000", lodDistances: "25 50 90 180 500 500" }],
    ["[mbo-vehicles]/Car_m3g80/vehicles.meta", "m3g80", "Car", "Super", { txdName: "m3g80", handlingId: "m3g80", gameName: "M3", audioNameHash: "SENTINEL", layout: "LAYOUT_M3G80", flags: "FLAG_HAS_LIVERY FLAG_USE_SCRIPT_DOORS", type: "VEHICLE_TYPE_CAR", plateType: "VPT_FRONT_AND_REAR_PLATES", vehicleClass: "VC_SUPER", wheelType: "VWT_SPORT", defaultBodyHealth: "1000.000000", frequency: "10", maxNumOfSameColor: "10", diffuseTint: "0x00FFFFFF", wheelScale: "1.000000", lodDistances: "25 50 90 180 500 500" }],
    ["[mbo-vehicles]/Helicopter_ah64e/vehicles.meta", "ah64e", "Helicopter", "Helicopter", { txdName: "ah64e", handlingId: "ah64e", gameName: "AH64E", audioNameHash: "BUZZARD", layout: "LAYOUT_AH64E", flags: "FLAG_HAS_LIVERY FLAG_DRIVER_NO_DRIVE_BY FLAG_DONT_SPAWN_IN_CARGEN FLAG_DONT_SPAWN_AS_AMBIENT", type: "VEHICLE_TYPE_HELI", plateType: "VPT_NONE", vehicleClass: "VC_HELICOPTER", defaultBodyHealth: "1000.000000", frequency: "10", maxNum: "5", diffuseTint: "0x00FFFFFF", wheelScale: "1.000000", lodDistances: "25 50 90 180 500 500" }],
  ];
  const columns = [
    "AllowBodyColorMapping", "audioNameHash", "defaultBodyHealth", "diffuseTint", "explosionInfo", "flags", "frequency", "gameName", "handlingId", "layout", "lodDistances", "maxNum", "maxNumOfSameColor", "plateType", "txdName", "type", "vehicleClass", "vehicleMakeName", "wheelScale", "wheelType",
  ].sort();
  const vehicles: VehicleRow[] = [];
  for (let i = 0; i < count; i++) {
    const [file, model, type, klass, params] = base[i % base.length];
    const dup = Math.floor(i / base.length);
    vehicles.push({
      folder_name: dup ? file.replace(".meta", `_${i}.meta`) : file,
      meta_path: "",
      handling_name: dup ? `${model}_${i}` : model,
      vehicle_type: type,
      vehicle_class: klass,
      params,
    });
  }
  return { vehicles, columns, skipped: [] };
}

// Dev-only carcols.meta sample rows (`?dc`) so the list-style editors can be
// inspected without the Tauri backend. Rows mirror the carcols scanner:
// handling_name = structural path into the file, vehicle_type = Kind
// (Kit / Visible Mod / Stat Mod / Slot Name…), vehicle_class = the kit name,
// params = the entry's direct scalar leaves.
export function demoCarcols(count = 8): ScanResult {
  const base: Array<[string, string, string, string, Record<string, string>]> = [
    ["[mbo-vehicles]/Tank_t90m/carcols.meta", "Kits/0", "Kit", "951_t90m_modkit", { kitName: "951_t90m_modkit", id: "951", kitType: "MKT_SPECIAL" }],
    ["[mbo-vehicles]/Tank_t90m/carcols.meta", "Kits/0/visibleMods/0", "Visible Mod", "951_t90m_modkit", { modelName: "t90m_barrels", modShopLabel: "WT_T90MBARREL", type: "VMT_SPOILER", bone: "mod_c", collisionBone: "mod_col_1", cameraPos: "VMCP_DEFAULT", audioApply: "1.000000", weight: "500", turnOffExtra: "false", disableBonnetCamera: "false", allowBonnetSlide: "true" }],
    ["[mbo-vehicles]/Tank_t90m/carcols.meta", "Kits/0/visibleMods/1", "Visible Mod", "951_t90m_modkit", { modelName: "t90m_barrels_2", type: "VMT_SPOILER", bone: "mod_c", audioApply: "1.000000", weight: "250", turnOffExtra: "false" }],
    ["[mbo-vehicles]/Tank_t90m/carcols.meta", "Kits/0/statMods/0", "Stat Mod", "951_t90m_modkit", { modifier: "25", audioApply: "1.000000", weight: "20", type: "VMT_ENGINE" }],
    ["[mbo-vehicles]/Tank_t90m/carcols.meta", "Kits/0/statMods/1", "Stat Mod", "951_t90m_modkit", { modifier: "100", audioApply: "1.000000", weight: "40", type: "VMT_ARMOUR" }],
    ["[mbo-vehicles]/Tank_t90m/carcols.meta", "Kits/0/slotNames/0", "Slot Name", "951_t90m_modkit", { slot: "VMT_SPOILER", name: "WT_T90CHASSIS" }],
    ["[mbo-vehicles]/Aircraft_f16c/carcols.meta", "Kits/0", "Kit", "f16c_modkit", { kitName: "f16c_modkit", id: "916", kitType: "MKT_SPECIAL" }],
    ["[mbo-vehicles]/Aircraft_f16c/carcols.meta", "Kits/0/visibleMods/0", "Visible Mod", "f16c_modkit", { modelName: "f16c_pylon", type: "VMT_SPOILER", bone: "chassis", weight: "10" }],
  ];
  const columns = Array.from(new Set(base.flatMap((b) => Object.keys(b[4])))).sort();
  const vehicles: VehicleRow[] = [];
  for (let i = 0; i < count; i++) {
    const [file, path, kind, kit, params] = base[i % base.length];
    const dup = Math.floor(i / base.length);
    vehicles.push({
      folder_name: dup ? file.replace(".meta", `_${i}.meta`) : file,
      meta_path: "",
      handling_name: dup ? `${path}/${i}` : path,
      vehicle_type: kind,
      vehicle_class: kit,
      params,
    });
  }
  return { vehicles, columns, skipped: [] };
}

// Dev-only carvariations.meta sample rows (`?cv`) so the variation editors can
// be inspected without the Tauri backend. Mirrors the scanner: handling_name =
// structural path, vehicle_type = Kind (Variation/Colour/Kit/Livery/Plate…),
// vehicle_class = the model name, params = the entry's scalar leaves
// (leaf entries expose Item.text / Item.value).
export function demoCarvariations(count = 7): ScanResult {
  const base: Array<[string, string, string, string, Record<string, string>]> = [
    ["[mbo-vehicles]/Tank_t90m/carvariations.meta", "variationData/0", "Variation", "t90m", { modelName: "t90m", lightSettings: "18", sirenSettings: "0" }],
    ["[mbo-vehicles]/Tank_t90m/carvariations.meta", "variationData/0/colors/0", "Colour", "t90m", { indices: "132 92 8 156" }],
    ["[mbo-vehicles]/Tank_t90m/carvariations.meta", "variationData/0/kits/0", "Kit", "t90m", { "Item.text": "951_t90m_modkit" }],
    ["[mbo-vehicles]/Tank_t90m/carvariations.meta", "variationData/0/plateProbabilities/Probabilities/0", "Plate Probability", "t90m", { Name: "police guv plate", Value: "100" }],
    ["[mbo-vehicles]/Tank_t90m/carvariations.meta", "variationData/0/plateProbabilities/Probabilities/1", "Plate Probability", "t90m", { Name: "normal", Value: "0" }],
    ["[mbo-vehicles]/Aircraft_f16c/carvariations.meta", "variationData/0", "Variation", "f16c", { modelName: "f16c", lightSettings: "18", sirenSettings: "0" }],
    ["[mbo-vehicles]/Aircraft_f16c/carvariations.meta", "variationData/0/kits/0", "Kit", "f16c", { "Item.text": "947_f16c_modkit" }],
  ];
  const columns = Array.from(new Set(base.flatMap((b) => Object.keys(b[4])))).sort();
  const vehicles: VehicleRow[] = [];
  for (let i = 0; i < count; i++) {
    const [file, path, kind, model, params] = base[i % base.length];
    const dup = Math.floor(i / base.length);
    vehicles.push({
      folder_name: dup ? file.replace(".meta", `_${i}.meta`) : file,
      meta_path: "",
      handling_name: dup ? `${path}/${i}` : path,
      vehicle_type: kind,
      vehicle_class: model,
      params,
    });
  }
  return { vehicles, columns, skipped: [] };
}

// Dev-only vehiclelayouts.meta sample rows (`?vl`) so the layout editors can be
// inspected without the Tauri backend. Mirrors the scanner: handling_name =
// structural path, vehicle_type = Kind, vehicle_class = the typed entry's Name
// (group), params = scalar leaves incl. ref attributes (SeatInfo.ref etc.).
export function demoVehiclelayouts(count = 6): ScanResult {
  const base: Array<[string, string, string, string, Record<string, string>]> = [
    ["[mbo-vehicles]/Tank_t90m/vehiclelayouts.meta", "VehicleLayoutInfos/0", "Layout", "LAYOUT_T90M", { Name: "LAYOUT_T90M", LayoutFlags: "StreamAnims DisableJackingAndBusting", MaxXAcceleration: "25.000000" }],
    ["[mbo-vehicles]/Tank_t90m/vehiclelayouts.meta", "VehicleLayoutInfos/0/Seats/0", "Seat", "LAYOUT_T90M", { "SeatInfo.ref": "SEAT_TANK_KHANJALI_FRONT_LEFT", "SeatAnimInfo.ref": "SEAT_ANIM_T90M_DRIVER" }],
    ["[mbo-vehicles]/Tank_t90m/vehiclelayouts.meta", "VehicleLayoutInfos/0/Seats/1", "Seat", "LAYOUT_T90M", { "SeatInfo.ref": "SEAT_TANK_APC_FRONT_RIGHT", "SeatAnimInfo.ref": "SEAT_ANIM_TANK_APC_FRONT_RIGHT" }],
    ["[mbo-vehicles]/Tank_t90m/vehiclelayouts.meta", "VehicleEntryPointInfos/0", "Entry Point", "ENTRY_POINT_MP_T90M_WARP_REAR_LEFT", { Name: "ENTRY_POINT_MP_T90M_WARP_REAR_LEFT", DoorBoneName: "door_dside_r", WindowId: "INVALID", VehicleSide: "SIDE_LEFT" }],
    ["[mbo-vehicles]/Tank_t90m/vehiclelayouts.meta", "VehicleEntryPointInfos/0/AccessableSeats/0", "Accessible Seat", "ENTRY_POINT_MP_T90M_WARP_REAR_LEFT", { "Item.ref": "SEAT_STANDARD_NO_SHUFFLE_REAR_LEFT" }],
    ["[mbo-vehicles]/Tank_t90m/vehiclelayouts.meta", "VehicleExtraPointsInfos/0/ExtraVehiclePoints/0", "Extra Vehicle Point", "EXTRA_VEHICLE_POINTS_INVALID_DRIVER", { LocationType: "SEAT_RELATIVE", PointType: "GET_IN", Heading: "1.570000" }],
  ];
  const columns = Array.from(new Set(base.flatMap((b) => Object.keys(b[4])))).sort();
  const vehicles: VehicleRow[] = [];
  for (let i = 0; i < count; i++) {
    const [file, path, kind, group, params] = base[i % base.length];
    const dup = Math.floor(i / base.length);
    vehicles.push({
      folder_name: dup ? file.replace(".meta", `_${i}.meta`) : file,
      meta_path: "",
      handling_name: dup ? `${path}/${i}` : path,
      vehicle_type: kind,
      vehicle_class: group,
      params,
    });
  }
  return { vehicles, columns, skipped: [] };
}

// Dev-only vehicleweapons.meta sample rows (`?vw`) so the vehicle-weapon editors
// can be inspected without the Tauri backend. Mirrors the scanner: handling_name
// = entry Name, vehicle_type = Kind (Vehicle Weapon / Ammo / Weapon Data),
// params = scalar leaves incl. ref links (AmmoInfo.ref).
export function demoVehicleweapons(count = 6): ScanResult {
  const base: Array<[string, string, string, string, Record<string, string>]> = [
    ["[mbo-vehicles]/Tank_t90m/vehicleweapons_t90m.meta", "VEHICLE_WEAPON_T90M_CANNON", "Vehicle Weapon", "", { DamageType: "EXPLOSIVE", FireType: "PROJECTILE", "AmmoInfo.ref": "AMMO_T90M", ClipSize: "1", AccuracySpread: "1.000000" }],
    ["[mbo-vehicles]/Tank_t90m/vehicleweapons_t90m.meta", "VEHICLE_WEAPON_T90M_MG", "Vehicle Weapon", "", { DamageType: "NONE", FireType: "INSTANT_HIT", "AmmoInfo.ref": "AMMO_T90M_MG", ClipSize: "150" }],
    ["[mbo-vehicles]/Tank_t90m/vehicleweapons_t90m.meta", "AMMO_T90M", "Ammo", "", { Damage: "0.000000", LifeTime: "4.000000", LaunchSpeed: "400.000000", ProjectileFlags: "DestroyOnImpact ProcessImpacts" }],
    ["[mbo-vehicles]/Tank_t90m/vehicleweapons_t90m.meta", "AMMO_T90M_CANNON_APFSDS", "Ammo", "", { Damage: "5000.000000", LifeTime: "2.000000", LaunchSpeed: "500.000000", ProjectileFlags: "DestroyOnImpact ProcessImpacts", ClusterExplosionCount: "5" }],
    ["[mbo-vehicles]/Tank_t90m/vehicleweapons_t90m.meta", "VEHICLE_DATA_KHANJALI_CANNON", "Weapon Data", "", { KickbackAmplitude: "0.005000", KickbackImpulse: "0.800000" }],
    ["[mbo-vehicles]/Tank_t90m/vehicleweapons_t90m.meta", "VEHICLE_DATA_KHANJALI_MG", "Weapon Data", "", { KickbackAmplitude: "0.001000", KickbackImpulse: "0.025000" }],
  ];
  const columns = Array.from(new Set(base.flatMap((b) => Object.keys(b[4])))).sort();
  const vehicles: VehicleRow[] = [];
  for (let i = 0; i < count; i++) {
    const [file, name, kind, group, params] = base[i % base.length];
    const dup = Math.floor(i / base.length);
    vehicles.push({
      folder_name: dup ? file.replace(".meta", `_${i}.meta`) : file,
      meta_path: "",
      handling_name: dup ? `${name}_${i}` : name,
      vehicle_type: kind,
      vehicle_class: group,
      params,
    });
  }
  return { vehicles, columns, skipped: [] };
}
