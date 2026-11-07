/**
 * 课表读取的会话逻辑。
 *
 * 教务系统的登录要过图形验证码，无法后台静默完成，因此必须由用户亲自登录。
 * 两个平台的差异很大：
 *
 *   桌面端：另开一个 WebView 窗口承载登录页，登录完自动跳课表并抓取。
 *
 *   移动端：Tauri 只能有一个 WebView，开不出第二个窗口。改为把主窗口
 *          跳到教务登录页；用户登录后按返回/重新打开应用，应用重新加载，
 *          此时教务的会话 cookie 还在，直接重新进入课表页读取即可。
 *
 * 密码始终只在学校页面里输入，本应用不保存；登录态留在 WebView 自己的 cookie 里。
 */

import { invoke } from "@tauri-apps/api/core";
import { isMobile } from "./classroom.ts";
import { EXTRACT_SCRIPT } from "./timetableExtract.ts";

export const CACHE_KEY = "ahnu.timetable.grid";

export const WINDOW_LABEL = "timetable-login";

/** 移动端登录后是否待重新读取课表。 */
const MOBILE_PENDING_KEY = "ahnu.timetable.pendingLogin";
const MOBILE_RESULT_KEY = "ahnu.timetable.mobileResult";

export const LOGIN_URL = "https://jw.ahnu.edu.cn/student/login";
/** 课表页；其打印视图（/semester/<id>/print）才渲染完整网格，最适合解析。 */
export const COURSE_TABLE_URL =
  "https://jw.ahnu.edu.cn/student/for-std/course-table";

/** 从页面学期下拉框里取 semesterId。 */
const READ_SEMESTER_SCRIPT = String.raw`
(() => {
  const sel = document.querySelector('#allSemesters');
  if (!sel) {
    const m = /\/course-table\/semester\/(\d+)/.exec(location.href);
    return JSON.stringify({ semesterId: m ? m[1] : null, label: '' });
  }
  return JSON.stringify({
    semesterId: sel.value || null,
    label: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '',
  });
})()
`;

/** 兜底：从页面任意链接里找 /semester/<id>。 */
const SCAN_SEMESTER_LINK_SCRIPT = String.raw`
(() => {
  const urls = [...document.querySelectorAll('a[href*="semester"], option')]
    .map((el) => el.getAttribute('href') || el.value || '');
  for (const url of urls) {
    const m = /\/semester\/(\d+)/.exec(url);
    if (m) return JSON.stringify({ semesterId: m[1] });
  }
  const sel = document.querySelector('select[name="allSemesters"], #allSemesters');
  if (sel && sel.value) return JSON.stringify({ semesterId: sel.value });
  return JSON.stringify({ semesterId: null });
})()
`;

export interface GridCell {
  weekday: number;
  period: number;
  span: number;
  text: string;
}

export interface GridResult {
  semesterLabel: string;
  cells: GridCell[];
  remark: string;
  /** 学期起始日期（周一），用于推算当前周次，形如 2026-08-31 */
  startDate?: string;
  /** 页面里读到的节次时间，按 hh:mm 顺序；读不到时界面用默认值 */
  times?: string[];
}

interface ExtractResult {
  error?: string;
  head?: string[];
  cells?: GridCell[];
  remark?: string;
  semester?: string;
  startDate?: string;
  times?: string[];
}

/**
 * 让学生登录教务系统。
 *
 * 桌面端另开窗口；移动端只有一个 WebView，因此由 Rust 将当前历史项替换为登录页，
 * 并记下「待读取」标记。Rust 侧的页面钩子看到登录后的教务页面时会把用户送回应用，
 * 前端启动时再自动续上读取。
 */
export async function openLoginWindow(): Promise<void> {
  if (isMobile()) {
    localStorage.setItem(MOBILE_PENDING_KEY, String(Date.now()));
    // 原生侧以 replace 导航，避免认证跳转链留在 WebView 返回历史中
    try {
      await invoke("mobile_watch_login", { url: LOGIN_URL });
    } catch (cause) {
      clearPendingTimetableLogin();
      throw cause;
    }
    return;
  }

  await invoke("open_login_window", {
    label: WINDOW_LABEL,
    url: LOGIN_URL,
    title: "教务系统登录",
  });
}

/** 是否还有一次「登录后待读取课表」没有完成。 */
export function hasPendingTimetableLogin(): boolean {
  try {
    return localStorage.getItem(MOBILE_PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

/** 清除待读取标记（读取成功或用户放弃时调用）。 */
export function clearPendingTimetableLogin(): void {
  try {
    localStorage.removeItem(MOBILE_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** 应用从教务页返回后，取回原生 WebView 已读取的课程数据。 */
export async function resumeMobileTimetableLogin(): Promise<boolean> {
  if (!hasPendingTimetableLogin()) return false;
  try {
    const raw = await invoke<string | null>("mobile_take_timetable");
    if (!raw) {
      clearPendingTimetableLogin();
      await invoke("mobile_cancel_login").catch(() => undefined);
      return false;
    }
    localStorage.setItem(MOBILE_RESULT_KEY, raw);
    clearPendingTimetableLogin();
    return true;
  } catch {
    clearPendingTimetableLogin();
    return false;
  }
}

export function takeMobileTimetableResult(): GridResult | null {
  try {
    const raw = localStorage.getItem(MOBILE_RESULT_KEY);
    if (!raw) return null;
    localStorage.removeItem(MOBILE_RESULT_KEY);
    const parsed = JSON.parse(raw) as GridResult & { error?: string };
    if (parsed.error) {
      if (parsed.error === "no-grid")
        throw new Error("教务系统没有返回课表，请确认已选学期后重试");
      if (parsed.error === "no-semester")
        throw new Error("教务系统页面还没加载出学期，请稍后重试");
      throw new Error("教务系统页面没有响应，请重新登录后重试");
    }
    if (!Array.isArray(parsed.cells) || parsed.cells.length === 0)
      throw new Error("教务系统返回的课表为空");
    return parsed;
  } catch (cause) {
    if (cause instanceof Error) throw cause;
    throw new Error("无法解析教务系统返回的课表");
  }
}

/** 关闭课表登录窗口。窗口只用于登录和读取，结果已回到主窗口后不再保留。 */
export async function closeLoginWindow(): Promise<void> {
  try {
    await invoke("close_window", { label: WINDOW_LABEL });
  } catch {
    // 窗口可能已被用户手动关闭；不影响已经读取到的课表结果。
  }
}

async function hideLoginWindow(): Promise<void> {
  try {
    await invoke("hide_window", { label: WINDOW_LABEL });
  } catch {
    // 隐藏失败不应阻止继续读取，成功后仍会关闭窗口。
  }
}

/**
 * 判断某个 URL 是否属于「已登录之后」的教务页面。
 */
export function isLoggedInUrl(url: string): boolean {
  if (!url.includes("jw.ahnu.edu.cn")) return false;
  if (url.includes("/login")) return false;
  return url.includes("/student/");
}

export interface PageState {
  href: string;
  title: string;
  ready: string;
  hasGrid: boolean;
  hasTable: boolean;
  semesterId?: string;
  grids?: number;
}

/** 读取登录窗口当前页面的状态。 */
export async function readPageState(): Promise<PageState | null> {
  const raw = await invoke<string | null>("window_current_url", {
    label: WINDOW_LABEL,
  });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PageState;
  } catch {
    return null;
  }
}

/**
 * 轮询登录窗口，直到进入课表页（或登录后的页面）。
 *
 * 为什么不用 `on_navigation` 事件：WebView2 对 JS 发起的跳转
 * （`location.href`、history API）不保证触引导航回调，而教务系统登录成功后
 * 恰恰多用这些方式，实测事件收不到。轮询在任何跳转方式下都可靠。
 *
 * @param shouldStop 返回 true 时提前结束（用户取消）
 */
export async function waitForLogin(
  onProgress: (hint: string) => void,
  shouldStop: () => boolean,
  timeoutMs = 5 * 60 * 1000,
): Promise<PageState> {
  const started = Date.now();
  let loggedIn = false;
  let sentToCourseTable = false;

  while (Date.now() - started < timeoutMs) {
    if (shouldStop()) throw new Error("已取消");

    let state: PageState | null = null;
    try {
      state = await readPageState();
    } catch (cause) {
      // 窗口被关掉
      throw new Error(cause instanceof Error ? cause.message : "窗口已关闭");
    }

    if (state) {
      if (state.hasGrid) {
        onProgress("已找到课表，正在读取…");
        return state;
      }
      if (isLoggedInUrl(state.href)) {
        if (!loggedIn) {
          loggedIn = true;
          onProgress("登录成功，正在打开课表…");
          await hideLoginWindow();
        }

        // 登录成功后教务系统通常先落到首页。首页没有学期下拉框，
        // 直接在那里读取一定会失败，所以这里明确导航到学生课表页。
        if (
          !sentToCourseTable &&
          !state.href.includes("/for-std/course-table")
        ) {
          await invoke("navigate_window", {
            label: WINDOW_LABEL,
            url: COURSE_TABLE_URL,
          });
          sentToCourseTable = true;
          onProgress("正在定位课表…");
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        } else {
          onProgress("已登录，正在等待课表页…");
        }
        // 已登录但页面还在过渡，继续等它稳定。课表页没有网格时，
        // readTimetable 会读取学期 id 后再跳转到打印视图。
        if (
          state.href.includes("/for-std/course-table") &&
          state.ready === "complete"
        ) {
          return state;
        }
      } else if (state.href.includes("/login")) {
        onProgress("等待登录…");
      } else {
        onProgress(`正在加载：${state.title || state.href.slice(0, 40)}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  throw new Error("等待登录超时，请重试");
}

/** 手动触发一次读取（自动化失败时的兜底）。 */
export async function readTimetable(): Promise<GridResult> {
  let parsed = await extractOnce();

  // 主课表页不渲染网格（只有打印视图才渲染），此时读出学期号再跳过去
  if (parsed.error === "no-grid") {
    const id = await resolveSemesterId();
    if (!id) {
      const page = await readPageState();
      throw new Error(
        `没找到课表网格。当前页面：${page?.title || "未知"}（${page?.href?.slice(0, 60) || "?"}）。` +
          "请确认已登录并打开「课表」。",
      );
    }

    await invoke("navigate_window", {
      label: WINDOW_LABEL,
      url: `${COURSE_TABLE_URL}/semester/${id}/print?semesterId=${id}`,
    });

    // 打印视图需要时间渲染网格，轮询等它出现，而不是盲等固定时长
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      parsed = await extractOnce();
      if (parsed.error !== "no-grid") break;
    }
  }

  if (parsed.error === "no-grid") {
    const page = await readPageState();
    throw new Error(
      `打印视图里也没有网格。页面：${page?.href?.slice(0, 70) || "?"}，` +
        `readyState=${page?.ready || "?"}，网格数=${page?.grids ?? "?"}`,
    );
  }
  if (!parsed.cells || parsed.cells.length === 0) {
    throw new Error("课表是空的，可能还没选学期或页面仍在加载");
  }

  const result = {
    semesterLabel: parsed.semester ?? "",
    cells: parsed.cells,
    remark: parsed.remark ?? "",
    startDate: parsed.startDate || undefined,
    times: parsed.times && parsed.times.length ? parsed.times : undefined,
  };

  // 读取在独立 WebView 内完成，成功后立即销毁窗口，避免用户还要手动关掉它。
  await closeLoginWindow();
  return result;
}

/**
 * 找出当前学期的 id。三条来源依次尝试：
 * 页面里的学期下拉框、URL 中的 /semester/<id>、页面上任意链接。
 */
async function resolveSemesterId(): Promise<string | null> {
  const semester = await readSemester();
  if (semester?.semesterId) return semester.semesterId;

  const page = await readPageState();
  if (page?.semesterId) return page.semesterId;
  const fromUrl = page?.href ? /\/semester\/(\d+)/.exec(page.href) : null;
  if (fromUrl) return fromUrl[1];

  // 最后兜底：从页面链接里找
  const found = await invoke<string | null>("read_window_page", {
    label: WINDOW_LABEL,
    script: SCAN_SEMESTER_LINK_SCRIPT,
  });
  if (found) {
    try {
      const data = JSON.parse(found) as { semesterId?: string };
      return data.semesterId ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

async function extractOnce(): Promise<ExtractResult> {
  const raw = await invoke<string | null>("read_window_page", {
    label: WINDOW_LABEL,
    script: EXTRACT_SCRIPT,
  });
  if (!raw) throw new Error("窗口还没打开，或页面还没加载完");
  try {
    return JSON.parse(raw) as ExtractResult;
  } catch {
    throw new Error("页面返回了无法解析的内容");
  }
}

async function readSemester(): Promise<{
  semesterId?: string;
  label?: string;
} | null> {
  const raw = await invoke<string | null>("read_window_page", {
    label: WINDOW_LABEL,
    script: READ_SEMESTER_SCRIPT,
  });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { semesterId?: string; label?: string };
  } catch {
    return null;
  }
}
