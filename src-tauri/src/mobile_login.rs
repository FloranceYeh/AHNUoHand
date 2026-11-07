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

/// 完美校园一卡通查询结果，等应用页重新加载后取回。
static PENDING_SCHOOLCARD: Mutex<Option<String>> = Mutex::new(None);
static PENDING_SCHOOLCARD_MONTH: Mutex<Option<String>> = Mutex::new(None);

const JW_COURSE_TABLE: &str = "https://jw.ahnu.edu.cn/student/for-std/course-table";
const SCHOOLCARD_EXTRACT_SCRIPT: &str = r#"(() => {
  const selectedMonth = window.__AHNU_SCHOOLCARD_MONTH__ || '';
  const key = '__AHNU_SCHOOLCARD_RESULT_' + selectedMonth.replace(/[^0-9]/g, '') + '__';
  const pad = (value) => String(value).padStart(2, '0');
  const now = new Date();
  const year = selectedMonth ? Number(selectedMonth.slice(0, 4)) : now.getFullYear();
  const month = selectedMonth ? Number(selectedMonth.slice(5, 7)) : now.getMonth() + 1;
  const beginDate = year + '-' + pad(month) + '-01';
  const endDate = year + '-' + pad(month) + '-' + new Date(year, month, 0).getDate();
  const post = (body) => fetch('/ecardh5/bootcallback', {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
    body,
  }).then((response) => response.json());
  if (!window[key]) {
    window[key] = {state: 'loading'};
    Promise.all([
      post('gotowhere=XYK_BASE_INFO'),
      post('gotowhere=userInfo'),
      post('beginIndex=0&pageSize=100&type=-1&beginDate=' + beginDate + '&endDate=' + endDate + '&gotowhere=XYK_TRADE_DETAIL'),
    ]).then(([base, user, trade]) => {
      if (!base || base.result_ !== true || !trade || trade.result_ !== true) throw new Error('完美校园会话已失效，请在登录管理中重新连接');
      const balance = base && base.data ? base.data : {};
      const userInfo = user && user.data ? user.data : {};
      const rows = trade && trade.data && Array.isArray(trade.data.data) ? trade.data.data : [];
      window[key] = {
        state: 'ready',
        month: year + '-' + pad(month),
        cardNo: String(userInfo.thirdId || ''),
        expiry: String(balance.nouseDate || ''),
        balance: Number(balance.main_fare || balance.my_fare || 0),
        subsidy: Number(balance.subsidy_fare || 0),
        main: Number(balance.main_fare || 0),
        fund: Number(balance.fund_fare || 0),
        transactions: rows.map((row) => ({
          description: String(row.description || row.accdscrp || '交易'),
          amount: Number(row.amount || 0),
          date: String(row.businessopdt || ''),
          terminal: String(row.term_name || ''),
          orderNo: String(row.orderno || ''),
          type: String(row.type || '0'),
        })),
      };
    }).catch((error) => {
      window[key] = {state: 'error', message: error instanceof Error ? error.message : '请求失败'};
    });
  }
  return JSON.stringify(window[key]);
})()"#;

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

/// 完美校园一卡通查询完成后由应用页取回一次结果。
#[tauri::command]
pub async fn mobile_take_schoolcard() -> Result<Option<String>, String> {
    match PENDING_SCHOOLCARD.lock() {
        Ok(mut pending) => Ok(pending.take()),
        Err(_) => Err("状态异常".to_string()),
    }
}

#[tauri::command]
pub async fn mobile_begin_schoolcard(
    app: tauri::AppHandle,
    url: String,
    month: String,
) -> Result<(), String> {
    if !url.starts_with("https://ids.ahnu.edu.cn/authserver/login?service=") {
        return Err("一卡通统一认证地址无效".to_string());
    }
    if let Ok(mut host) = PENDING_HOST.lock() {
        *host = Some("hub.17wanxiao.com".to_string());
    }
    if let Ok(mut selected) = PENDING_SCHOOLCARD_MONTH.lock() {
        *selected = Some(month);
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window
        .eval("window.location.replace('about:blank');")
        .map_err(|error| format!("无法进入一卡通登录中转页：{error}"))?;
    tokio_sleep(180).await;
    window
        .eval(&format!("window.location.replace({url:?});"))
        .map_err(|error| format!("无法打开一卡通统一认证：{error}"))?;
    println!("[mobile_login] begin_schoolcard via about:blank");
    Ok(())
}

#[tauri::command]
pub async fn query_schoolcard_silent(
    app: tauri::AppHandle,
    month: String,
) -> Result<String, String> {
    let (year, month_number) = month
        .split_once('-')
        .and_then(|(year, month)| Some((year.parse::<i32>().ok()?, month.parse::<u32>().ok()?)))
        .filter(|(year, month)| *year >= 2000 && (1..=12).contains(month))
        .ok_or_else(|| "查询月份无效".to_string())?;
    let days = match month_number {
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    let origin = "https://ecardh5.17wanxiao.com";
    let api = format!("{origin}/ecardh5/bootcallback");
    let cookie_url = api.parse().map_err(|_| "一卡通接口地址无效".to_string())?;
    let webview = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let cookies = webview
        .cookies_for_url(cookie_url)
        .map_err(|error| format!("读取完美校园登录状态失败：{error}"))?;
    let cookie_header = cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    if cookie_header.is_empty() {
        return Err("尚未登录完美校园，请先打开登录入口连接一次".to_string());
    }

    let client = reqwest::Client::new();
    let post = |body: String| {
        client
            .post(&api)
            .header(reqwest::header::COOKIE, cookie_header.clone())
            .header(reqwest::header::ORIGIN, origin)
            .header(
                reqwest::header::REFERER,
                "https://ecardh5.17wanxiao.com/ecardh5/ecard_t/",
            )
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded;charset=UTF-8",
            )
            .body(body)
    };
    let begin_date = format!("{year}-{month_number:02}-01");
    let end_date = format!("{year}-{month_number:02}-{days:02}");
    let balance_response = post("gotowhere=XYK_BASE_INFO".to_string())
        .send()
        .await
        .map_err(|error| format!("查询一卡通余额失败：{error}"))?;
    let user_response = post("gotowhere=userInfo".to_string())
        .send()
        .await
        .map_err(|error| format!("查询一卡通信息失败：{error}"))?;
    let trade_response = post(format!("beginIndex=0&pageSize=100&type=-1&beginDate={begin_date}&endDate={end_date}&gotowhere=XYK_TRADE_DETAIL"))
        .send()
        .await
        .map_err(|error| format!("查询一卡通交易失败：{error}"))?;
    if !balance_response.status().is_success()
        || !user_response.status().is_success()
        || !trade_response.status().is_success()
    {
        return Err("完美校园接口暂时不可用，请稍后重试".to_string());
    }
    let balance: serde_json::Value = balance_response
        .json()
        .await
        .map_err(|error| format!("无法解析一卡通余额：{error}"))?;
    let user: serde_json::Value = user_response
        .json()
        .await
        .map_err(|error| format!("无法解析一卡通信息：{error}"))?;
    let trade: serde_json::Value = trade_response
        .json()
        .await
        .map_err(|error| format!("无法解析一卡通交易：{error}"))?;
    if balance.get("result_").and_then(serde_json::Value::as_bool) != Some(true)
        || trade.get("result_").and_then(serde_json::Value::as_bool) != Some(true)
    {
        return Err("完美校园会话已失效，请重新登录".to_string());
    }
    let balance_data = balance.get("data").unwrap_or(&serde_json::Value::Null);
    let user_data = user.get("data").unwrap_or(&serde_json::Value::Null);
    let trade_rows = trade
        .pointer("/data/data")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let number = |value: Option<&serde_json::Value>| -> f64 {
        value
            .and_then(|value| value.as_f64().or_else(|| value.as_str()?.parse().ok()))
            .unwrap_or(0.0)
    };
    let text = |value: Option<&serde_json::Value>| -> String {
        value
            .and_then(|value| {
                value
                    .as_str()
                    .map(str::to_owned)
                    .or_else(|| value.as_i64().map(|number| number.to_string()))
            })
            .unwrap_or_default()
    };
    let balance_main = number(balance_data.get("main_fare"));
    let balance_value = if balance_main != 0.0 {
        balance_main
    } else {
        number(balance_data.get("my_fare"))
    };
    let transactions = trade_rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "description": text(row.get("description").or_else(|| row.get("accdscrp"))),
                "amount": number(row.get("amount")),
                "date": text(row.get("businessopdt")),
                "terminal": text(row.get("term_name")),
                "orderNo": text(row.get("orderno")),
                "type": text(row.get("type")),
            })
        })
        .collect::<Vec<_>>();
    let fetched_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    serde_json::to_string(&serde_json::json!({
        "state": "ready",
        "month": month,
        "fetchedAt": fetched_at,
        "cardNo": text(user_data.get("thirdId")),
        "expiry": text(balance_data.get("nouseDate")),
        "balance": balance_value,
        "subsidy": number(balance_data.get("subsidy_fare")),
        "main": balance_main,
        "fund": number(balance_data.get("fund_fare")),
        "transactions": transactions,
    }))
    .map_err(|error| format!("无法序列化一卡通结果：{error}"))
}

/// 记录「正在等某个站点登录完成」。
///
/// 用 `replace` 将应用历史项替换为登录页，避免认证站点进入主 WebView 的
/// 返回历史；登录完成后页面加载钩子再用 `replace` 把用户送回应用。
#[tauri::command]
pub async fn mobile_watch_login(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let target_host = host_of(&url).ok_or_else(|| "登录地址无效".to_string())?;
    if let Ok(mut host) = PENDING_HOST.lock() {
        *host = Some(target_host.clone());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window
        .eval(&format!("window.location.replace({url:?});"))
        .map_err(|error| format!("无法打开登录页面：{error}"))?;
    println!("[mobile_login] begin site login host={target_host}");
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

fn is_schoolcard_logged_in(url: &str) -> bool {
    url.contains("ecardh5.17wanxiao.com/ecardh5/ecard_t/")
}

fn retry_later(app: tauri::AppHandle, action: fn(&tauri::AppHandle, u8), attempt: u8) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(900));
        action(&app, attempt);
    });
}

fn read_jw_semester(app: &tauri::AppHandle, attempt: u8) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
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
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
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

fn read_schoolcard(app: &tauri::AppHandle, attempt: u8) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.clone();
    let month = PENDING_SCHOOLCARD_MONTH
        .lock()
        .ok()
        .and_then(|selected| selected.clone())
        .unwrap_or_default();
    let _ = window.eval(&format!("window.__AHNU_SCHOOLCARD_MONTH__ = {month:?};"));
    let _ = window.eval_with_callback(SCHOOLCARD_EXTRACT_SCRIPT, move |value| {
        let result = decode_webview_string(&value).unwrap_or_default();
        println!(
            "[mobile_login] schoolcard extract attempt={attempt} result={}",
            if result.contains("\"state\":\"ready\"") {
                "ready"
            } else if result.contains("\"state\":\"error\"") {
                "error"
            } else if result.is_empty() {
                "empty"
            } else {
                "loading"
            }
        );
        if result.is_empty() || result.contains("\"state\":\"loading\"") {
            if attempt < 30 {
                retry_later(handle.clone(), read_schoolcard, attempt + 1);
            } else {
                finish_mobile_schoolcard(
                    &handle,
                    r#"{"state":"error","message":"一卡通页面没有响应"}"#.to_string(),
                );
            }
        } else {
            finish_mobile_schoolcard(&handle, result);
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
        let matches_site = url.contains(&host)
            || ((host == "hub.17wanxiao.com" || host == "ecardh5.17wanxiao.com")
                && is_schoolcard_logged_in(url));
        if matches_site && is_schoolcard_logged_in(url) {
            println!("[mobile_login] schoolcard destination matched host={host}");
            read_schoolcard(app, 0);
            return;
        }
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

fn finish_mobile_schoolcard(app: &tauri::AppHandle, result: String) {
    if let Ok(mut pending) = PENDING_SCHOOLCARD.lock() {
        *pending = Some(result);
    }
    if let Ok(mut host) = PENDING_HOST.lock() {
        *host = None;
    }
    if let Ok(mut month) = PENDING_SCHOOLCARD_MONTH.lock() {
        *month = None;
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
