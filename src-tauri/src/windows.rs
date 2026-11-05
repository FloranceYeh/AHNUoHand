//! 窗口桥：给学生课表（教务 EAMS）与 WebVPN 备用入口使用。
//!
//! 教务系统的登录要过图形验证码，无法在后台静默完成，所以这里只负责：
//!   1. 打开一个 WebView 窗口，让用户自己完成登录；
//!   2. 轮询窗口当前地址，判断是否已进入登录后的页面；
//!   3. 在该窗口里执行脚本，把渲染好的课表网格取回来。
//!
//! 这里用「轮询地址」而不是 `on_navigation` 回调，是因为 WebView2 对 JS 发起的
//! 跳转（`location.href`、history API）不保证触引导航回调，而登录成功后恰恰多用这些方式。
//!
//! 登录凭据始终留在 WebView 自己的 cookie 罐里，本应用不保存密码。

use std::sync::mpsc;
use std::time::Duration;

use tauri::{Emitter, Manager};

/// 打开一个登录窗口。宽度给得比较宽，方便教务系统的表格显示。
#[tauri::command]
pub async fn open_login_window(
    app: tauri::AppHandle,
    label: String,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    let target = url.parse().map_err(|_| "窗口地址无效".to_string())?;
    let event_name = format!("{label}-url");
    let handle = app.clone();
    let popup_label = label.clone();
    let popup_handle = app.clone();

    let window = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(target))
        .title(title.unwrap_or_else(|| "登录".to_string()))
        .inner_size(720.0, 900.0)
        .center()
        // 代码创建的窗口默认不抢焦点，无边框主窗口下会表现为「页面看得见但点不动」
        .focused(true)
        .visible(true)
        .on_navigation(move |next| {
            // 能触发时顺手发一次，前端可据此立刻反应；轮询作为兜底
            let _ = handle.emit(&event_name, next.as_str().to_string());
            true
        })
        // 教务系统的菜单是 window.open / target=_blank，默认会被丢弃，
        // 表现为「登录后点什么都没反应」。这里改成在同一个窗口内打开。
        .on_new_window(move |next, _features| {
            if let Some(webview) = popup_handle.get_webview_window(&popup_label) {
                let _ = webview.navigate(next);
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
        .map_err(|error| format!("无法打开窗口：{error}"))?;

    let _ = window.set_focus();
    let _ = window.unminimize();

    Ok(())
}

/// 读取窗口当前地址与页面状态。页面还没加载完时返回 None。
///
/// 轮询会用这个命令，所以超时要短——页面卡住时不能让每次轮询都等 5 秒。
#[tauri::command]
pub async fn window_current_url(
    app: tauri::AppHandle,
    label: String,
) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "窗口没有打开".to_string())?;

    let script = r#"
      (() => {
        const sel = document.querySelector('#allSemesters');
        const grid = document.querySelectorAll('td.td-content, td[class*="td-content"]').length;
        return JSON.stringify({
          href: location.href,
          title: document.title,
          ready: document.readyState,
          hasGrid: grid > 0,
          grids: grid,
          hasTable: !!sel,
          semesterId: sel ? sel.value : '',
        });
      })()
    "#;

    let (sender, receiver) = mpsc::channel::<String>();
    window
        .eval_with_callback(script, move |value| {
            let _ = sender.send(value);
        })
        .map_err(|error| format!("读取地址失败：{error}"))?;

    match receiver.recv_timeout(Duration::from_secs(3)) {
        Ok(value) => Ok(decode_result(&value)),
        Err(_) => Ok(None),
    }
}

/// 在指定窗口里执行脚本并取回结果（结果应为字符串）。
#[tauri::command]
pub async fn read_window_page(
    app: tauri::AppHandle,
    label: String,
    script: String,
) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "窗口没有打开".to_string())?;

    let (sender, receiver) = mpsc::channel::<String>();
    window
        .eval_with_callback(&script, move |value| {
            let _ = sender.send(value);
        })
        .map_err(|error| format!("执行脚本失败：{error}"))?;

    match receiver.recv_timeout(Duration::from_secs(15)) {
        Ok(value) => Ok(decode_result(&value)),
        Err(_) => Err("页面没有响应，可能仍在加载".to_string()),
    }
}

/// Tauri 会把结果序列化成 JSON 字符串，这里剥掉一层引号与转义。
fn decode_result(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return None;
    }
    if let Ok(text) = serde_json::from_str::<String>(trimmed) {
        return Some(text);
    }
    Some(trimmed.to_string())
}

/// 关闭指定窗口。
#[tauri::command]
pub async fn close_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }
    Ok(())
}

/// 隐藏指定窗口，但保留其 WebView、Cookie 和当前页面，供后台继续读取。
#[tauri::command]
pub async fn hide_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.hide().map_err(|error| format!("隐藏窗口失败：{error}"))?;
    }
    Ok(())
}

/// 让指定窗口跳转到另一个地址（用于自动切到课表打印视图）。
#[tauri::command]
pub async fn navigate_window(
    app: tauri::AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "窗口没有打开".to_string())?;
    let target = url.parse().map_err(|_| "地址无效".to_string())?;
    window
        .navigate(target)
        .map_err(|error| format!("跳转失败：{error}"))
}
