mod classroom;
mod mobile_login;
mod windows;

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    // 移动端只有一个 WebView，登录靠主窗口跳转完成，
    // 因此需要一个页面加载钩子来捕捉 CAS 回跳里的 ticket。
    #[cfg(mobile)]
    let builder = builder.on_page_load(|webview, payload| {
        use tauri::Manager;
        if webview.label() == "main" && payload.event() == tauri::webview::PageLoadEvent::Finished {
            mobile_login::handle_page_load(webview.app_handle(), payload.url().as_str());
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            exit_app,
            classroom::classroom_login,
            windows::open_login_window,
            windows::read_window_page,
            windows::window_current_url,
            windows::navigate_window,
            windows::close_window,
            windows::hide_window,
            mobile_login::mobile_begin_login,
            mobile_login::mobile_take_ticket,
            mobile_login::mobile_take_timetable,
            mobile_login::mobile_cancel_login,
            mobile_login::mobile_watch_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
