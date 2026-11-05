mod classroom;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            classroom::classroom_login,
            windows::open_login_window,
            windows::read_window_page,
            windows::window_current_url,
            windows::navigate_window,
            windows::close_window,
            windows::hide_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
