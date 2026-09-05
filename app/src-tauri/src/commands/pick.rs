use tauri_plugin_dialog::DialogExt;

/// Open the native OS folder picker. Returns `None` when the user cancels.
#[tauri::command]
pub fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match app.dialog().file().blocking_pick_folder() {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}
