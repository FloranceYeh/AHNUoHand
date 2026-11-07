import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { markLoggedIn, markLoginExpired } from "./authManager";

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
const BUILDING_CACHE_KEY = "ahnu.classroom.buildings.v1";
const ROOM_CACHE_KEY = "ahnu.classroom.rooms.v1";
const FAVORITES_KEY = "ahnu.classroom.favorites.v1";
const BUILDING_CACHE_TTL = 24 * 60 * 60 * 1000;
const ROOM_CACHE_TTL = 5 * 60 * 1000;
let renewalPromise: Promise<string> | null = null;

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
  clearClassroomCache();
  markLoginExpired("ybt");
}

interface CachedValue<T> {
  savedAt: number;
  value: T;
}

interface ClassroomFavorites {
  buildings: string[];
  rooms: string[];
  roomSnapshots: Record<string, EmptyRoom>;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Ignore unavailable or full storage. */
  }
}

function cacheKey(prefix: string, value: unknown): string {
  return `${prefix}:${JSON.stringify(value)}`;
}

function readCache<T>(key: string, ttl: number): T | null {
  const cached = readJson<CachedValue<T>>(key);
  if (
    !cached ||
    !Number.isFinite(cached.savedAt) ||
    Date.now() - cached.savedAt > ttl
  ) {
    return null;
  }
  return cached.value;
}

function saveCache<T>(key: string, value: T): void {
  writeJson(key, { savedAt: Date.now(), value } satisfies CachedValue<T>);
}

export function clearClassroomCache(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        key?.startsWith(`${BUILDING_CACHE_KEY}:`) ||
        key?.startsWith(`${ROOM_CACHE_KEY}:`)
      ) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export function loadClassroomFavorites(): ClassroomFavorites {
  const saved = readJson<Partial<ClassroomFavorites>>(FAVORITES_KEY);
  const savedRooms = Array.isArray(saved?.rooms)
    ? saved.rooms.filter((item): item is string => typeof item === "string")
    : [];
  const savedSnapshots =
    saved?.roomSnapshots && typeof saved.roomSnapshots === "object"
      ? (Object.fromEntries(
          Object.entries(saved.roomSnapshots).filter(([, room]) => {
            if (!room || typeof room !== "object") return false;
            const value = room as EmptyRoom;
            return (
              typeof value.name === "string" && Array.isArray(value.freePeriods)
            );
          }),
        ) as Record<string, EmptyRoom>)
      : {};
  return {
    buildings: Array.isArray(saved?.buildings)
      ? saved.buildings.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    rooms: savedRooms,
    roomSnapshots: savedSnapshots,
  };
}

export function saveClassroomFavorites(favorites: ClassroomFavorites): void {
  writeJson(FAVORITES_KEY, favorites);
}

function saveToken(token: string): void {
  try {
    if (localStorage.getItem(TOKEN_KEY) !== token) clearClassroomCache();
    localStorage.setItem(TOKEN_KEY, token);
    // 通知登录管理模块记下时间，设置页据此展示
    markLoggedIn("ybt");
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
 * 统一登录入口。
 *
 * 桌面端：另开一个窗口承载 CAS，登录完窗口自动关闭。
 * 移动端：Tauri 只能有一个 WebView，因此把主窗口跳到 CAS；
 *         登录后 Rust 在页面加载时截获 ticket 暂存，再把主窗口跳回应用，
 *         应用重新加载时由 resumeMobileLogin() 取回票据换 token。
 */
export async function login(): Promise<string> {
  if (isMobile()) return mobileLogin();
  return desktopLogin();
}

/**
 * 是否运行在移动端。
 *
 * Tauri 在手机上只有一个 WebView：无法另开登录窗口，`WebviewWindowBuilder`
 * 建不出第二个窗口。所以必须先正确区分平台，否则登录会走进桌面分支。
 *
 * 实测 Android 上 `__TAURI_INTERNALS__.metadata` 只有
 * `currentWindow` / `currentWebview`，没有平台字段，因此用 UA 判断更可靠
 * （WebView 的 UA 里带 `Android` / `iPhone` / `iPad`）。
 */
export function isMobile(): boolean {
  if (typeof window === "undefined") return false;

  const platform = (
    window as {
      __TAURI_INTERNALS__?: { metadata?: { currentPlatform?: string } };
    }
  ).__TAURI_INTERNALS__?.metadata?.currentPlatform;
  if (platform === "android" || platform === "ios") return true;
  if (platform === "windows" || platform === "macos" || platform === "linux")
    return false;

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

const PENDING_KEY = "ahnu.classroom.pendingLogin";
/** 登录前停留的功能页，回跳后据此还原。 */
const RETURN_KEY = "ahnu.classroom.returnTo";

/** 移动端登录：先记下"正在等回跳"，再跳去 CAS。 */
async function mobileLogin(): Promise<string> {
  localStorage.setItem(PENDING_KEY, String(Date.now()));
  try {
    await invoke("mobile_begin_login");
  } catch (cause) {
    localStorage.removeItem(PENDING_KEY);
    throw cause instanceof Error ? cause : new Error(String(cause));
  }
  // 主窗口即将被 CAS 页面替换，这个 Promise 不会 resolve；
  // 结果由应用重新加载后的 resumeMobileLogin() 接着处理。
  return new Promise<string>(() => {});
}

/** 是否有等待处理的移动端登录（判断要不要等换票再渲染）。 */
export function hasPendingLogin(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

/** 记下登录后应该回到哪个功能页。 */
export function rememberReturnTo(feature: string): void {
  try {
    localStorage.setItem(RETURN_KEY, feature);
  } catch {
    /* ignore */
  }
}

/** 取出并清除待返回的功能页。 */
export function takeReturnTo(): string | null {
  try {
    const value = localStorage.getItem(RETURN_KEY);
    if (value) localStorage.removeItem(RETURN_KEY);
    return value;
  } catch {
    return null;
  }
}

/**
 * 应用启动时调用：如果上次在等 CAS 回跳，就取回票据换取 token。
 *
 * 票据由 Rust 在页面加载时暂存，而应用重新加载与暂存之间可能有先后差，
 * 所以这里短暂轮询几次，拿到就立即兑换。
 */
export async function resumeMobileLogin(): Promise<string | null> {
  const pending = localStorage.getItem(PENDING_KEY);
  if (!pending) return null;

  localStorage.removeItem(PENDING_KEY);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const ticket = await invoke<string | null>("mobile_take_ticket");
      if (ticket) return await exchangeTicket(ticket);
    } catch {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

function desktopLogin(): Promise<string> {
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

/**
 * 访问一站式服务大厅的接口。
 *
 * 导出的目的是让校历等同类应用复用同一套鉴权与错误处理，
 * 避免每个功能各写一份 token 逻辑。
 */
export async function ybtRequest<T>(path: string, token?: string): Promise<T> {
  const active = token ?? getToken();
  try {
    return await sendYbtRequest<T>(path, active);
  } catch (cause) {
    if (!(cause instanceof YbtSessionExpiredError)) throw cause;
    if (!active) {
      clearToken();
      throw new Error("请先登录一站式服务大厅");
    }

    clearToken();
    let renewed: string;
    try {
      renewed = await renewYbtSession(path);
    } catch (renewalError) {
      const detail =
        renewalError instanceof Error ? `：${renewalError.message}` : "";
      throw new Error(`服务大厅会话已失效，自动续期失败${detail}`);
    }

    try {
      return await sendYbtRequest<T>(path, renewed);
    } catch (retryError) {
      if (retryError instanceof YbtSessionExpiredError) {
        clearToken();
        throw new Error("服务大厅登录已过期，请重新登录");
      }
      throw retryError;
    }
  }
}

class YbtSessionExpiredError extends Error {}

async function renewYbtSession(path: string): Promise<string> {
  if (!renewalPromise) {
    if (isMobile()) {
      const feature = path.startsWith("/applets/workhall/")
        ? "calendar"
        : "classroom";
      rememberReturnTo(feature);
    }
    renewalPromise = login()
      .catch((cause) => {
        if (isMobile()) takeReturnTo();
        throw cause;
      })
      .finally(() => {
        renewalPromise = null;
      });
  }
  return renewalPromise;
}

async function sendYbtRequest<T>(path: string, active: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (active) headers["X-Access-Token"] = active;
  let response: Response;
  try {
    response = await fetch(API + path, { headers, credentials: "omit" });
  } catch {
    throw new Error("连不上校园服务，请检查网络");
  }

  let data: Envelope<T> & { status?: number; error?: string };
  try {
    data = (await response.json()) as Envelope<T> & { status?: number };
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new YbtSessionExpiredError("服务大厅会话已失效");
    }
    throw new Error(`服务返回了无法解析的内容（HTTP ${response.status}）`);
  }

  const message = data.message ?? data.error ?? "";
  // 令牌失效时网关返回的是 `{status:500, message:"Token失效，请重新登录"}`，没有 code 字段
  if (
    /(?:token|令牌).*(?:失效|过期|无效|错误)|(?:登录|认证).*(?:失效|过期|超时|失败|重新)|未登录|未认证|请先登录/i.test(
      message,
    )
  ) {
    throw new YbtSessionExpiredError(message || "服务大厅会话已失效");
  }
  if (response.status === 401 || response.status === 403) {
    throw new YbtSessionExpiredError("服务大厅会话已失效");
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
  if (active) markLoggedIn("ybt");
  return (data.result ?? data) as T;
}

// ---------------------------------------------------------------------------
// 字典（无需登录）
// ---------------------------------------------------------------------------

export async function loadWeeks(): Promise<DictItem[]> {
  return ybtRequest<DictItem[]>("/sys/dict/getDictItems/school_zc");
}

export async function loadWeekdays(): Promise<DictItem[]> {
  return ybtRequest<DictItem[]>("/sys/dict/getDictItems/school_zc_xq");
}

export async function loadPeriods(): Promise<DictItem[]> {
  return ybtRequest<DictItem[]>("/sys/dict/getDictItems/school_zc_xq_jc");
}

// ---------------------------------------------------------------------------
// 业务（需要 token）
// ---------------------------------------------------------------------------

export async function loadCurrentTerm(): Promise<CurrentTerm> {
  const raw = await ybtRequest<Record<string, string>>(
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
  const key = cacheKey(BUILDING_CACHE_KEY, campus);
  const cached = readCache<Building[]>(key, BUILDING_CACHE_TTL);
  if (cached) return cached;

  const rows = await ybtRequest<
    Array<{ item_value?: string; item_text?: string }>
  >(
    `/rhpt-applets/kjs/api/getSchoolLhCode?xqName=${encodeURIComponent(campus)}`,
  );
  const buildings = (rows ?? []).map((row) => ({
    code: String(row.item_value ?? ""),
    name: String(row.item_text ?? ""),
  }));
  saveCache(key, buildings);
  return buildings;
}

export interface QueryOptions {
  week: string;
  weekday: string;
  campusCode: string;
  buildingCode: string;
  periodBegin?: string;
  periodEnd?: string;
  /** 忽略本地缓存，执行一次新查询。 */
  forceRefresh?: boolean;
}

export async function queryEmptyRooms(
  options: QueryOptions,
): Promise<EmptyRoom[]> {
  const cacheKeyValue = {
    week: options.week,
    weekday: options.weekday,
    campusCode: options.campusCode,
    buildingCode: options.buildingCode,
    periodBegin: options.periodBegin ?? "",
    periodEnd: options.periodEnd ?? "",
  };
  const key = cacheKey(ROOM_CACHE_KEY, cacheKeyValue);
  if (!options.forceRefresh) {
    const cached = readCache<EmptyRoom[]>(key, ROOM_CACHE_TTL);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    zcCode: options.week,
    zcXqCode: options.weekday,
    zcXqJcCodeBegin: options.periodBegin ?? "",
    zcXqJcCodeEnd: options.periodEnd ?? "",
    lhCode: options.buildingCode,
    xqCode: options.campusCode,
  });

  const rows = await ybtRequest<
    Array<{ js_name?: string; kxjc?: string; lh_name?: string }>
  >(`/rhpt-applets/kjs/api/getDataBy?${params.toString()}`);

  const rooms = (rows ?? []).map((row) => ({
    name: String(row.js_name ?? ""),
    building: String(row.lh_name ?? ""),
    freePeriods: String(row.kxjc ?? "")
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value)),
  }));
  saveCache(key, rooms);
  return rooms;
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
