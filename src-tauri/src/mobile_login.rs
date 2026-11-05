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

/// 正在等待登录完成的站点主机名（用于没有票据的系统，如教务）。
static PENDING_HOST: Mutex<Option<String>> = Mutex::new(None);

/// 教务登录后在主 WebView 读取的课表，等应用页重新加载后取回。
static PENDING_TIMETABLE: Mutex<Option<String>> = Mutex::new(None);

const JW_COURSE_TABLE: &str = "https://jw.ahnu.edu.cn/student/for-std/course-table";

const JW_EXTRACT_SCRIPT: &str = r#"(() => {
  const cell = document.querySelector('td.td-content, td[class*="td-content"]');
  if (!cell) return JSON.stringify({ error: 'no-grid' });
  const table = cell.closest('table');
  const raw = [];
  for (const tr of table.rows) {
    const unit = tr.querySelector('td.dayPartUnit');
    if (!unit) continue;
    const period = Number.parseInt(unit.innerText.trim(), 10);
    if (!Number.isFinite(period)) continue;
    for (const td of tr.cells) {
      if (!td.classList.contains('td-content') && !td.className.includes('td-content')) continue;
      const weekday = [...td.classList].find((name) => /^[1-7]$/.test(name));
      if (!weekday) continue;
      const box = td.querySelector('.tdHtml') || td;
      const text = (box.innerText || box.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (text) raw.push({ weekday: Number(weekday), period, span: td.rowSpan || 1, text });
    }
  }
  const body = (document.body.innerText || '').replace(/\u00a0/g, ' ');
  const start = /起始日期\s*[:：]?\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(body);
  const pad = (n) => String(n).padStart(2, '0');
  const times = [];
  for (const td of table.querySelectorAll('td.timeArea, td.timeAreaTd, td.timearea'))
    times.push(...((td.innerText || '').match(/\d{1,2}:\d{2}/g) || []));
  const remark = document.querySelector('.course-table-remark');
  const semester = document.querySelector('#allSemesters option:checked') || document.querySelector('#allSemesters option[selected]');
  return JSON.stringify({ cells: raw, remark: remark ? remark.innerText.trim() : '', semester: semester ? (semester.innerText || semester.textContent || '').trim() : '', startDate: start ? start[1] + '-' + pad(start[2]) + '-' + pad(start[3]) : '', times });
})()"#;

// 文档记载主课表页只加载数据，DOM 不一定在首次 load 事件时就已完成。
// 同时兼容当前学期选择框、URL、以及菜单/选项里的打印视图链接。
const JW_SEMESTER_SCRIPT: &str = r#"(() => {
  const fromUrl = (location.href.match(/\/semester\/(\d+)/) || [])[1];
  const select = document.querySelector('#allSemesters, select[name="allSemesters"]');
  const selected = select && (select.value || (select.options[select.selectedIndex] && select.options[select.selectedIndex].value));
  if (selected) return String(selected).match(/\d+/)?.[0] || String(selected);
  if (fromUrl) return fromUrl;
  for (const el of document.querySelectorAll('a[href], option, [data-url], [data-href]')) {
    const value = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('data-href') || el.value || '';
    const match = /\/semester\/(\d+)/.exec(value);
    if (match) return match[1];
  }
  return '';
})()"#;

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

/// 教务登录后由主 WebView 提取课表，应用页重载后取回一次。
#[tauri::command]
pub async fn mobile_take_timetable() -> Result<Option<String>, String> {
    match PENDING_TIMETABLE.lock() {
        Ok(mut pending) => Ok(pending.take()),
        Err(_) => Err("状态异常".to_string()),
    }
}

/// 记录「正在等某个站点登录完成」。
///
/// 页面跳转由前端自己做（`window.location.href = url`）——
/// 实测从页面内赋值可靠，而 Rust 侧 `eval` 在导航瞬间可能打到已卸载的上下文。
/// 这里只负责登记，等 `on_page_load` 看到该站点的登录后页面时把用户送回应用。
#[tauri::command]
pub async fn mobile_watch_login(url: String) -> Result<(), String> {
    if let Ok(mut host) = PENDING_HOST.lock() {
        *host = host_of(&url);
    }
    println!("[mobile_login] watch {url}");
    Ok(())
}

/// 从 URL 里取出主机名，用于判断「是不是在等这个站点的登录」。
fn host_of(url: &str) -> Option<String> {
    let rest = url.split("://").nth(1)?;
    let host = rest.split('/').next()?.split(':').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// 判断某个地址是否属于「登录完成后的教务页面」。
fn is_jw_logged_in(url: &str) -> bool {
    url.contains("jw.ahnu.edu.cn")
        && url.contains("/student/")
        && !url.contains("/login")
        && !url.contains("/logout")
}

fn retry_later(app: tauri::AppHandle, action: fn(&tauri::AppHandle, u8), attempt: u8) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(900));
        action(&app, attempt);
    });
}

fn read_jw_semester(app: &tauri::AppHandle, attempt: u8) {
    let Some(window) = app.get_webview_window("main") else { return; };
    let handle = app.clone();
    let _ = window.eval_with_callback(JW_SEMESTER_SCRIPT, move |value| {
        let id = decode_webview_string(&value).unwrap_or_default();
        if !id.is_empty() {
            let print_url = format!("{JW_COURSE_TABLE}/semester/{id}/print?semesterId={id}");
            if let Some(webview) = handle.get_webview_window("main") {
                let _ = webview.eval(&format!("window.location.replace({print_url:?});"));
            }
        } else if attempt < 12 {
            retry_later(handle.clone(), read_jw_semester, attempt + 1);
        } else {
            finish_mobile_jw(&handle, r#"{"error":"no-semester"}"#.to_string());
        }
    });
}

fn read_jw_grid(app: &tauri::AppHandle, attempt: u8) {
    let Some(window) = app.get_webview_window("main") else { return; };
    let handle = app.clone();
    let _ = window.eval_with_callback(JW_EXTRACT_SCRIPT, move |value| {
        let result = decode_webview_string(&value)
            .unwrap_or_else(|| r#"{"error":"empty-result"}"#.to_string());
        if result.contains("\"error\":\"no-grid\"") && attempt < 12 {
            retry_later(handle.clone(), read_jw_grid, attempt + 1);
        } else {
            finish_mobile_jw(&handle, result);
        }
    });
}

/// 在 `on_page_load` 里调用：检测 CAS 回跳并截取 ticket。
pub fn handle_page_load(app: &tauri::AppHandle, url: &str) {
    let active = match LOGIN_ROUND.lock() {
        Ok(round) => *round,
        Err(_) => false,
    };
    println!("[mobile_login] page_load active={active} url={url}");

    // 教务这类没有票据的系统：等它自己落到登录后的页面，就送回应用
    let waiting_host = PENDING_HOST.lock().ok().and_then(|host| host.clone());
    if let Some(host) = waiting_host {
        let matches_site = url.contains(&host);
        if matches_site && is_jw_logged_in(url) {
            if let Some(window) = app.get_webview_window("main") {
                if !url.contains("/for-std/course-table") {
                    let _ = window.eval(&format!("window.location.replace({JW_COURSE_TABLE:?});"));
                    return;
                }
                if !url.contains("/print") {
                    read_jw_semester(app, 0);
                    return;
                }

                read_jw_grid(app, 0);
            }
            return;
        }
    }

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

fn decode_webview_string(raw: &str) -> Option<String> {
    serde_json::from_str::<String>(raw).ok().or_else(|| {
        let trimmed = raw.trim();
        (!trimmed.is_empty() && trimmed != "null").then(|| trimmed.to_string())
    })
}

fn finish_mobile_jw(app: &tauri::AppHandle, result: String) {
    if let Ok(mut pending) = PENDING_TIMETABLE.lock() {
        *pending = Some(result);
    }
    if let Ok(mut host) = PENDING_HOST.lock() {
        *host = None;
    }
    if let Some(window) = app.get_webview_window("main") {
        let script = format!("window.location.replace({APP_URL:?});");
        let _ = window.eval(&script);
    }
}

/// 用户取消登录时调用，清掉进行中的标记。
#[tauri::command]
pub async fn mobile_cancel_login() -> Result<(), String> {
    if let Ok(mut round) = LOGIN_ROUND.lock() {
        *round = false;
    }
    if let Ok(mut host) = PENDING_HOST.lock() {
        *host = None;
    }
    Ok(())
}
