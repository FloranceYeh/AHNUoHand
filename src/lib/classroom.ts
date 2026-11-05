import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * 空教室查询（学校「一站式服务大厅」H5 应用）。
 *
 * 协议要点：
 *   - 基站 `https://ybt.ahnu.edu.cn/zhxyApi`
 *   - 业务接口需要请求头 `X-Access-Token`（由 CAS 票据换取）
 *   - 该站点对我们的来源放行 CORS，因此可以直接 fetch
 *   - 字典接口（周次/星期/节次）无需 token，可公开访问
 */

const API = "https://ybt.ahnu.edu.cn/zhxyApi";
const CAS_SERVICE = "https://ybt.ahnu.edu.cn/zhxyH5/";

const TOKEN_KEY = "ahnu.classroom.token";

/** 校区与代码的对应关系来自实地抓包（不同校区楼号前缀分别为 1/2/3）。 */
export const CAMPUSES = [
  { name: "赭山校区", code: "1" },
  { name: "花津校区", code: "2" },
  { name: "天门山校区", code: "3" },
] as const;

export interface DictItem {
  value: string;
  text: string;
}

export interface Building {
  code: string;
  name: string;
}

export interface EmptyRoom {
  name: string;
  building: string;
  freePeriods: number[];
}

export interface CurrentTerm {
  week: string;
  year: string;
  term: string;
  weekday: string;
  startDate: string;
  endDate: string;
}

interface Envelope<T> {
  success?: boolean;
  code?: number;
  message?: string;
  result?: T;
}

// ---------------------------------------------------------------------------
// token
// ---------------------------------------------------------------------------

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

/** 用 CAS 票据换取 token（票据来自登录窗口的回跳地址）。 */
async function exchangeTicket(ticket: string): Promise<string> {
  const url = `${API}/cas/client/validateLogin?ticket=${encodeURIComponent(ticket)}&service=${encodeURIComponent(CAS_SERVICE)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  const data = (await response.json()) as Envelope<{ token?: string }>;

  const token = data?.result?.token;
  if (!data?.success || !token) {
    throw new Error(data?.message || "登录校验失败，请重试");
  }
  saveToken(token);
  return token;
}

/**
 * 打开统一认证窗口完成登录。
 * 登录成功后由 Rust 侧截获回跳地址里的 ticket 并通过事件传回。
 */
export async function login(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(
      () => {
        if (!settled) {
          settled = true;
          reject(new Error("登录超时，请重试"));
        }
      },
      5 * 60 * 1000,
    );

    let unlisten: (() => void) | null = null;

    const cleanup = () => {
      window.clearTimeout(timer);
      unlisten?.();
    };

    listen<string>("classroom-ticket", (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      exchangeTicket(event.payload).then(resolve).catch(reject);
    })
      .then((off) => {
        unlisten = off;
        return invoke("classroom_login");
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

// ---------------------------------------------------------------------------
// 请求
// ---------------------------------------------------------------------------

async function request<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const active = token ?? getToken();
  if (active) headers["X-Access-Token"] = active;

  let response: Response;
  try {
    response = await fetch(API + path, { headers, credentials: "omit" });
  } catch {
    throw new Error("连不上空教室服务，请检查网络");
  }

  let data: Envelope<T> & { status?: number; error?: string };
  try {
    data = (await response.json()) as Envelope<T> & { status?: number };
  } catch {
    throw new Error(`服务返回了无法解析的内容（HTTP ${response.status}）`);
  }

  const message = data.message ?? data.error ?? "";
  // 令牌失效时网关返回的是 `{status:500, message:"Token失效，请重新登录"}`，没有 code 字段
  if (/Token|登录|token/i.test(message)) {
    clearToken();
    throw new Error("登录已过期，请重新登录");
  }
  if (
    data.success === false ||
    (data.code !== undefined && data.code !== 200)
  ) {
    throw new Error(message || "查询失败");
  }
  if (typeof data.status === "number" && data.status >= 400) {
    throw new Error(message || `查询失败（HTTP ${data.status}）`);
  }
  return (data.result ?? data) as T;
}

// ---------------------------------------------------------------------------
// 字典（无需登录）
// ---------------------------------------------------------------------------

export async function loadWeeks(): Promise<DictItem[]> {
  return request<DictItem[]>("/sys/dict/getDictItems/school_zc");
}

export async function loadWeekdays(): Promise<DictItem[]> {
  return request<DictItem[]>("/sys/dict/getDictItems/school_zc_xq");
}

export async function loadPeriods(): Promise<DictItem[]> {
  return request<DictItem[]>("/sys/dict/getDictItems/school_zc_xq_jc");
}

// ---------------------------------------------------------------------------
// 业务（需要 token）
// ---------------------------------------------------------------------------

export async function loadCurrentTerm(): Promise<CurrentTerm> {
  const raw = await request<Record<string, string>>(
    "/rhpt-applets/kjs/api/getNowZcAndXq",
  );
  return {
    week: raw.ZC ?? "",
    year: raw.XN ?? "",
    term: raw.XQ ?? "",
    weekday: raw.xqj ?? "",
    startDate: raw.KSRQ ?? "",
    endDate: raw.JSRQ ?? "",
  };
}

export async function loadBuildings(campus: string): Promise<Building[]> {
  const rows = await request<
    Array<{ item_value?: string; item_text?: string }>
  >(
    `/rhpt-applets/kjs/api/getSchoolLhCode?xqName=${encodeURIComponent(campus)}`,
  );
  return (rows ?? []).map((row) => ({
    code: String(row.item_value ?? ""),
    name: String(row.item_text ?? ""),
  }));
}

export interface QueryOptions {
  week: string;
  weekday: string;
  campusCode: string;
  buildingCode: string;
  periodBegin?: string;
  periodEnd?: string;
}

export async function queryEmptyRooms(
  options: QueryOptions,
): Promise<EmptyRoom[]> {
  const params = new URLSearchParams({
    zcCode: options.week,
    zcXqCode: options.weekday,
    zcXqJcCodeBegin: options.periodBegin ?? "",
    zcXqJcCodeEnd: options.periodEnd ?? "",
    lhCode: options.buildingCode,
    xqCode: options.campusCode,
  });

  const rows = await request<
    Array<{ js_name?: string; kxjc?: string; lh_name?: string }>
  >(`/rhpt-applets/kjs/api/getDataBy?${params.toString()}`);

  return (rows ?? []).map((row) => ({
    name: String(row.js_name ?? ""),
    building: String(row.lh_name ?? ""),
    freePeriods: String(row.kxjc ?? "")
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value)),
  }));
}

/** 把 `1,2,3` 这类空闲节次合并成「第 1-3 节」这样的可读文本。 */
export function formatPeriods(periods: number[]): string {
  if (!periods.length) return "无空闲";
  const sorted = [...periods].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (const period of sorted.slice(1)) {
    if (period === prev + 1) {
      prev = period;
      continue;
    }
    ranges.push(start === prev ? `第${start}节` : `第${start}-${prev}节`);
    start = period;
    prev = period;
  }
  ranges.push(start === prev ? `第${start}节` : `第${start}-${prev}节`);
  return ranges.join("、");
}
