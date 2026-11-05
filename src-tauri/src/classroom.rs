//! 空教室查询的登录桥。
//!
//! 学校的统一身份认证（CAS）在独立窗口里完成，这里只负责开窗，
//! 并在跳转回业务域名时把 `ticket` 截下来交给前端 —— 前端再用它换 token。
//! 这样 Rust 侧完全不需要发起 HTTPS 请求。

use tauri::{Emitter, Manager};

/// CAS 登录入口。`service` 必须是学校 H5 应用自身的地址，票据才会带回该域名。
const CAS_LOGIN: &str = "https://ids.ahnu.edu.cn/authserver/login?service=https%3A%2F%2Fybt.ahnu.edu.cn%2FzhxyH5%2F";

const LOGIN_WINDOW: &str = "classroom-login";

/// 打开统一认证窗口。登录成功后通过 `classroom-ticket` 事件回传票据。
#[tauri::command]
pub async fn classroom_login(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = existing.close();
    }

    let url = CAS_LOGIN.parse().map_err(|_| "登录地址无效".to_string())?;

    let handle = app.clone();
    tauri::WebviewWindowBuilder::new(&app, LOGIN_WINDOW, tauri::WebviewUrl::External(url))
        .title("统一身份认证")
        .inner_size(520.0, 760.0)
        .center()
        .on_navigation(move |target| {
            let full = target.as_str();
            if let Some(index) = full.find("ticket=") {
                let ticket = full[index + 7..]
                    .split('&')
                    .next()
                    .unwrap_or_default()
                    .to_string();

                if !ticket.is_empty() {
                    let _ = handle.emit("classroom-ticket", ticket);
                }
                if let Some(window) = handle.get_webview_window(LOGIN_WINDOW) {
                    let _ = window.close();
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|error| format!("无法打开登录窗口：{error}"))?;

    Ok(())
}
