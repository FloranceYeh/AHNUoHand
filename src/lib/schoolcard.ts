import { invoke } from "@tauri-apps/api/core";
import { isMobile, rememberReturnTo } from "./classroom";
import { markLoggedIn } from "./authManager";

export const SCHOOLCARD_LOGIN_URL =
  "https://hub.17wanxiao.com/bsacs/light.action?flag=cassso_ansf_ecardh5&ecardFunc=index";
export const SCHOOLCARD_MOBILE_CAS_URL =
  "https://ids.ahnu.edu.cn/authserver/login?service=https%3A%2F%2Fhub.17wanxiao.com%2Fbsacs%2Flight.action%3Fflag%3Dcassso_ansf_ecardh5%26ecardFunc%3Dindex";
export const SCHOOLCARD_WINDOW = "schoolcard-login";

const CACHE_KEY = "ahnu.schoolcard.report.v2";
const ALIAS_KEY = "ahnu.schoolcard.aliases.v1";
const MOBILE_PENDING_KEY = "ahnu.schoolcard.pendingLogin";
const MOBILE_MONTH_KEY = "ahnu.schoolcard.pendingMonth";
const MOBILE_RESULT_KEY = "ahnu.schoolcard.mobileResult";

export interface SchoolCardTransaction {
  description: string;
  amount: number;
  date: string;
  terminal: string;
  orderNo: string;
  type: string;
}

export interface SchoolCardReport {
  month: string;
  fetchedAt: number;
  cardNo: string;
  expiry: string;
  balance: number;
  subsidy: number;
  main: number;
  fund: number;
  transactions: SchoolCardTransaction[];
}

interface CachedReports {
  reports: Record<string, { savedAt: number; report: SchoolCardReport }>;
}

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Ignore unavailable storage. */
  }
}

export function currentSchoolCardMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function readSchoolCardCache(
  month = currentSchoolCardMonth(),
): SchoolCardReport | null {
  const cached = safeRead<CachedReports>(CACHE_KEY);
  const entry = cached?.reports?.[month];
  return entry?.report ?? null;
}

export function hasSchoolCardData(): boolean {
  const cached = safeRead<CachedReports>(CACHE_KEY);
  return Boolean(cached?.reports && Object.keys(cached.reports).length);
}

function saveSchoolCardCache(report: SchoolCardReport): void {
  const cached = safeRead<CachedReports>(CACHE_KEY) ?? { reports: {} };
  cached.reports[report.month] = { savedAt: Date.now(), report };
  safeWrite(CACHE_KEY, cached);
}

export function clearSchoolCardCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(MOBILE_RESULT_KEY);
  } catch {
    /* Ignore unavailable storage. */
  }
}

export function readSchoolCardAliases(): Record<string, string> {
  return safeRead<Record<string, string>>(ALIAS_KEY) ?? {};
}

export function saveSchoolCardAliases(aliases: Record<string, string>): void {
  safeWrite(ALIAS_KEY, aliases);
}

export function schoolCardMerchantKey(
  transaction: SchoolCardTransaction,
): string {
  return transaction.terminal || transaction.description;
}

export function hasPendingSchoolCardLogin(): boolean {
  try {
    return localStorage.getItem(MOBILE_PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

export async function resumeMobileSchoolCardLogin(): Promise<boolean> {
  if (!hasPendingSchoolCardLogin()) return false;
  try {
    const raw = await invoke<string | null>("mobile_take_schoolcard");
    localStorage.removeItem(MOBILE_PENDING_KEY);
    if (!raw) return false;
    safeWrite(MOBILE_RESULT_KEY, raw);
    return true;
  } catch {
    try {
      localStorage.removeItem(MOBILE_PENDING_KEY);
    } catch {
      /* Ignore unavailable storage. */
    }
    return false;
  }
}

export function takeMobileSchoolCardResult():
  { report: SchoolCardReport } | { error: string } | null {
  const raw = safeRead<string>(MOBILE_RESULT_KEY);
  if (!raw) return null;
  try {
    localStorage.removeItem(MOBILE_RESULT_KEY);
  } catch {
    /* Ignore unavailable storage. */
  }
  try {
    const value = JSON.parse(raw) as SchoolCardReport & {
      state?: string;
      message?: string;
    };
    if (value.state === "error") {
      return { error: value.message || "一卡通查询失败，请重试" };
    }
    if (value.state !== "ready")
      return { error: "一卡通没有返回有效数据，请重试" };
    const report = normalizeReport(value);
    saveSchoolCardCache(report);
    markLoggedIn("schoolcard");
    return { report };
  } catch {
    return { error: "无法解析一卡通查询结果，请重试" };
  }
}

function buildFetchScript(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const endDay = new Date(year, monthNumber, 0).getDate();
  const beginDate = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(monthNumber).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return String.raw`(() => {
  const key = "__AHNU_SCHOOLCARD_RESULT_${month.replace(/[^0-9]/g, "")}";
  const post = (body) => fetch("/ecardh5/bootcallback", { method: "POST", credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body }).then((response) => response.json());
  if (!window[key]) {
    window[key] = { state: "loading" };
    Promise.all([post("gotowhere=XYK_BASE_INFO"), post("gotowhere=userInfo"), post("beginIndex=0&pageSize=100&type=-1&beginDate=${beginDate}&endDate=${endDate}&gotowhere=XYK_TRADE_DETAIL")]).then(([base, user, trade]) => {
      if (!base || base.result_ !== true || !trade || trade.result_ !== true) throw new Error("一卡通：完美校园会话已失效，请在登录管理中重新连接");
      const balance = base && base.data ? base.data : {};
      const userInfo = user && user.data ? user.data : {};
      const rows = trade && trade.data && Array.isArray(trade.data.data) ? trade.data.data : [];
      window[key] = { state: "ready", month: "${month}", cardNo: String(userInfo.thirdId || ""), expiry: String(balance.nouseDate || ""), balance: Number(balance.main_fare || balance.my_fare || 0), subsidy: Number(balance.subsidy_fare || 0), main: Number(balance.main_fare || 0), fund: Number(balance.fund_fare || 0), transactions: rows.map((row) => ({ description: String(row.description || row.accdscrp || "交易"), amount: Number(row.amount || 0), date: String(row.businessopdt || ""), terminal: String(row.term_name || ""), orderNo: String(row.orderno || ""), type: String(row.type || "0") })) };
    }).catch((error) => { window[key] = { state: "error", message: error instanceof Error ? error.message : "请求失败" }; });
  }
  return JSON.stringify(window[key]);
})()`;
}

export async function querySchoolCard(
  month = currentSchoolCardMonth(),
  onProgress?: (message: string) => void,
  force = false,
): Promise<SchoolCardReport> {
  const cached = readSchoolCardCache(month);
  if (cached && !force) return cached;
  if (isMobile()) {
    if (!force) {
      onProgress?.("正在后台读取一卡通数据…");
      const raw = await invoke<string>("query_schoolcard_silent", { month });
      const result = JSON.parse(raw) as {
        state?: string;
        message?: string;
      } & SchoolCardReport;
      if (result.state !== "ready") {
        throw new Error(result.message || "一卡通查询失败");
      }
      const report = normalizeReport(result);
      saveSchoolCardCache(report);
      markLoggedIn("schoolcard");
      return report;
    }
    try {
      localStorage.setItem(MOBILE_PENDING_KEY, String(Date.now()));
      localStorage.setItem(MOBILE_MONTH_KEY, month);
    } catch {
      /* Continue; the page can still be opened for a manual retry. */
    }
    rememberReturnTo("schoolcard");
    try {
      await invoke("mobile_begin_schoolcard", {
        url: SCHOOLCARD_MOBILE_CAS_URL,
        month,
      });
    } catch (cause) {
      try {
        localStorage.removeItem(MOBILE_PENDING_KEY);
      } catch {
        /* Ignore unavailable storage. */
      }
      throw cause;
    }
    return new Promise<SchoolCardReport>(() => {});
  }
  await invoke("open_login_window", {
    label: SCHOOLCARD_WINDOW,
    url: SCHOOLCARD_LOGIN_URL,
    title: "完美校园一卡通",
  });
  onProgress?.("等待完美校园登录…");
  const script = buildFetchScript(month);
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const state = await invoke<string | null>("window_current_url", {
      label: SCHOOLCARD_WINDOW,
    });
    if (state) {
      try {
        const parsed = JSON.parse(state) as { href?: string };
        if (parsed.href?.includes("ecardh5.17wanxiao.com/ecardh5/ecard_t/")) {
          onProgress?.("正在读取一卡通数据…");
          const result = await invoke<string | null>("read_window_page", {
            label: SCHOOLCARD_WINDOW,
            script,
          });
          if (result) {
            const parsedResult = JSON.parse(result) as {
              state?: string;
              message?: string;
            } & SchoolCardReport;
            if (parsedResult.state === "ready") {
              const report = normalizeReport(parsedResult);
              saveSchoolCardCache(report);
              markLoggedIn("schoolcard");
              await invoke("close_window", { label: SCHOOLCARD_WINDOW });
              return report;
            }
            if (parsedResult.state === "error")
              throw new Error(parsedResult.message || "一卡通查询失败");
          }
        }
      } catch (cause) {
        if (cause instanceof Error && cause.message.includes("一卡通"))
          throw cause;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("等待完美校园登录超时，请重试");
}

function normalizeReport(value: SchoolCardReport): SchoolCardReport {
  return {
    month: value.month || currentSchoolCardMonth(),
    fetchedAt: Date.now(),
    cardNo: String(value.cardNo || ""),
    expiry: String(value.expiry || ""),
    balance: Number(value.balance || 0),
    subsidy: Number(value.subsidy || 0),
    main: Number(value.main || 0),
    fund: Number(value.fund || 0),
    transactions: Array.isArray(value.transactions) ? value.transactions : [],
  };
}
