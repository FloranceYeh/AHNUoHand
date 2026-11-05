//! 移动端登录：在**主 WebView 内**完成 CAS 认证。
//!
//! 桌面端可以另开一个窗口承载登录页，但 Tauri 在 Android/iOS 上只能存在一个
//! WebView，`WebviewWindowBuilder` 建不出第二个窗口，`on_navigation` 也不生效。
//! 而学校的 CAS 页面又带 `X-Frame-Options: DENY`，iframe 内嵌同样不可行。
//!
//! 所以移动端走「单窗口跳转」：
//!   1. 记录当前应用地址（`http://tauri.localhost/`）；
//!   2. 把主 WebView 跳到 CAS 登录页，用户在里面正常登录；
//!   3. CAS 回跳到 `https://ybt.ahnu.edu.cn/zhxyH5/?ticket=ST-xxx`；
//!   4. `on_page_load` 钩子看到这个地址，取出 ticket 并发出事件；
//!   5. 立刻把主 WebView 跳回应用地址，前端用 ticket 换 token。
//!
//! 密码始终只在学校页面里输入，本应用不接触。

use std::sync::Mutex;

use tauri::Manager;

/// CAS 登录入口。`service` 必须是学校 H5 应用自身的地址，票据才会带回该域名。
const CAS_LOGIN: &str =
    "https://ids.ahnu.edu.cn/authserver/login?service=https%3A%2F%2Fybt.ahnu.edu.cn%2FzhxyH5%2F";

/// 登录完成后要返回的应用内地址。
const APP_URL: &str = "http://tauri.localhost/";

/// 正在等待 CAS 回跳。
static LOGIN_ROUND: Mutex<bool> = Mutex::new(false);

/// 回跳时截获到的票据，等前端启动后来取。
///
/// 之所以「存起来再取」而不是直接发事件：移动端登录后主 WebView 会被导航回应用，
/// 页面随之重新加载，此时前端刚启动、监听器还没挂上，事件会丢失。
static PENDING_TICKET: Mutex<Option<String>> = Mutex::new(None);

/// 在异步上下文里等待一小段时间。
///
/// 用线程睡眠而不是引第三方运行时依赖，代价只是占用一个阻塞线程几十毫秒。
async fn tokio_sleep(millis: u64) {
    std::thread::sleep(std::time::Duration::from_millis(millis));
}

/// 启动移动端登录。
///
/// 不能用 `window.navigate()`：实测在 Android 主 WebView 上它会静默失败
/// （命令返回成功，但页面地址不变）。改为在主 WebView 内直接跳转，
/// 由页面自己发起导航，WebView 必然响应。
#[tauri::command]
pub async fn mobile_begin_login(app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(mut round) = LOGIN_ROUND.lock() {
        *round = true;
    }
    if let Ok(mut pending) = PENDING_TICKET.lock() {
        *pending = None;
    }

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;

    // 关键：不能从应用页直接跳 CAS。
    //
    // CAS 服务端把 Referer 为 localhost / tauri.localhost 的请求判为非法，
    // 直接返回 404；而 Referer 由 WebView 在顶层导航时自动带上，
    // 页面里改不掉（referrerPolicy 对顶层导航无效）。
    //
    // 可行的顺序：先跳 about:blank，它的 Referer 为空；
    // 再从 about:blank 跳 CAS，CAS 即可正常加载。
    // 两次跳转必须分开执行，否则第二次的 Referer 仍然是应用地址。
    window
        .eval("window.location.replace('about:blank');")
        .map_err(|error| format!("无法进入中转页：{error}"))?;

    // 等 about:blank 就位后再跳 CAS
    tokio_sleep(180).await;

    let script = format!("window.location.replace({CAS_LOGIN:?});");
    println!("[mobile_login] begin_login via about:blank");
    window
        .eval(&script)
        .map_err(|error| format!("无法打开登录页：{error}"))?;

    Ok(())
}

/// 前端启动后取回票据。取过一次即清空。
#[tauri::command]
pub async fn mobile_take_ticket() -> Result<Option<String>, String> {
    match PENDING_TICKET.lock() {
        Ok(mut pending) => Ok(pending.take()),
        Err(_) => Err("状态异常".to_string()),
    }
}

/// 在 `on_page_load` 里调用：检测 CAS 回跳并截取 ticket。
pub fn handle_page_load(app: &tauri::AppHandle, url: &str) {
    let active = match LOGIN_ROUND.lock() {
        Ok(round) => *round,
        Err(_) => false,
    };
    println!("[mobile_login] page_load active={active} url={url}");
    if !active {
        return;
    }

    let Some(index) = url.find("ticket=") else {
        return;
    };

    // CAS 的 ticket 形如 `ST-2630652-S0NZqiluSfDrpAop7SVgOU-p0jw`：
    // 只含字母、数字、连字符，遇到 `&`、`#`、`/` 或其它字符即为结束。
    // 不能只用 `split('&')`——回跳地址里偶有把 service 参数拼接在后、
    // 甚至直接接上域名的情况，那样会把多余内容吞进 ticket。
    let ticket: String = url[index + 7..]
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();

    if ticket.is_empty() || !ticket.starts_with("ST-") {
        return;
    }

    // 结束本轮，并暂存票据
    if let Ok(mut round) = LOGIN_ROUND.lock() {
        *round = false;
    }
    if let Ok(mut pending) = PENDING_TICKET.lock() {
        *pending = Some(ticket);
    }

    // 回到应用内页面，前端启动后会调用 mobile_take_ticket 取票。
    // 同样不能用 navigate（Android 上静默失效），改为在页面内跳转。
    if let Some(window) = app.get_webview_window("main") {
        let script = format!("window.location.href = {APP_URL:?};");
        let _ = window.eval(&script);
    }
}

/// 用户取消登录时调用，清掉进行中的标记。
#[tauri::command]
pub async fn mobile_cancel_login() -> Result<(), String> {
    if let Ok(mut round) = LOGIN_ROUND.lock() {
        *round = false;
    }
    Ok(())
}
