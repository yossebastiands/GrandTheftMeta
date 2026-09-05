mod commands;

use commands::carcols::{scan_carcols, update_carcols_files};
use commands::carvariations::{scan_carvariations, update_carvariations_files};
use commands::pick::pick_folder;
use commands::vehiclelayouts::{scan_vehiclelayouts, update_vehiclelayouts_files};
use commands::vehicleweapons::{scan_vehicleweapons, update_vehicleweapons_files};
use commands::scan::scan_folder;
use commands::update::update_files;
use commands::vehicles::{scan_vehicles, update_vehicle_files};
use commands::weaponanimations::{scan_weaponanimations, update_weaponanimations_files};
use commands::weaponarchetypes::{scan_weaponarchetypes, update_weaponarchetypes_files};
use commands::weapons::{scan_weapons, update_weapon_files};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            update_files,
            pick_folder,
            scan_carcols,
            update_carcols_files,
            scan_carvariations,
            update_carvariations_files,
            scan_vehiclelayouts,
            update_vehiclelayouts_files,
            scan_vehicleweapons,
            update_vehicleweapons_files,
            scan_vehicles,
            update_vehicle_files,
            scan_weaponanimations,
            update_weaponanimations_files,
            scan_weaponarchetypes,
            update_weaponarchetypes_files,
            scan_weapons,
            update_weapon_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running GrandTheftMeta");
}
