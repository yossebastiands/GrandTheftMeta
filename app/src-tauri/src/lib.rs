mod commands;

use commands::pick::pick_folder;
use commands::scan::scan_folder;
use commands::update::update_files;
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
            scan_weapons,
            update_weapon_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running GrandTheftMeta");
}
