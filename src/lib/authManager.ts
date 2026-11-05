/** 登录信息的展示与本地会话标记。各平台的凭证仍由各自模块管理。 */

export type PlatformId = "ybt" | "jw" | "zongwu";

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  description: string;
  host: string;
  requiresLogin: boolean;
  authHint: string;
}

export const PLATFORMS: PlatformInfo[] = [
  {
    id: "ybt",
    name: "一站式服务大厅",
    description: "空教室、校历",
    host: "ybt.ahnu.edu.cn",
    requiresLogin: true,
    authHint: "统一身份认证（CAS）",
  },
  {
    id: "jw",
    name: "教务系统",
    description: "课程表读取",
    host: "jw.ahnu.edu.cn",
    requiresLogin: true,
    authHint: "教务系统会话 Cookie",
  },
  {
    id: "zongwu",
    name: "后勤服务",
    description: "宿舍电费",
    host: "zongwu.ahnu.edu.cn",
    requiresLogin: false,
    authHint: "本机绑定学号，不需要密码",
  },
];

const TOKEN_KEY = "ahnu.classroom.token";
const TIMETABLE_KEY = "ahnu.timetable.grid";
const OPERATOR_KEY = "ahnu.electricity.operator";
const ELECTRICITY_REPORT_KEY = "ahnu.electricity.report";
const STAMP_KEY = "ahnu.auth.stamps";
const SESSION_KEY = "ahnu.auth.session";

export type LoginState = "unknown" | "active" | "expired";

export interface PlatformStatus {
  platform: PlatformInfo;
  /** active 只表示本次应用运行期间有成功认证或成功读取的证据。 */
  state: LoginState;
  since?: number;
  /** 凭证/绑定存在；教务的课表缓存不算凭证。 */
  hasCredential: boolean;
  /** 可离线查看的数据，仅用于呈现，不代表当前已登录。 */
  hasOfflineData: boolean;
}

function safeGet(key: string, storage: Storage = localStorage): string {
  try {
    return storage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeSet(
  key: string,
  value: string,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* 存储不可用时继续工作 */
  }
}

function readMap(
  key: string,
  storage: Storage = localStorage,
): Record<string, string | number> {
  try {
    const parsed: unknown = JSON.parse(safeGet(key, storage));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function writeMap(
  key: string,
  values: Record<string, string | number>,
  storage: Storage = localStorage,
): void {
  safeSet(key, JSON.stringify(values), storage);
}

/** 认证/读取成功时调用。成功标记仅在本次应用运行期间作为已验证状态展示。 */
export function markLoggedIn(id: PlatformId): void {
  const stamps = readMap(STAMP_KEY);
  stamps[id] = Date.now();
  writeMap(STAMP_KEY, stamps);
  const session = readMap(SESSION_KEY);
  session[id] = "active";
  writeMap(SESSION_KEY, session, sessionStorage);
}

/** 明确遇到服务器拒绝凭证时调用。 */
export function markLoginExpired(id: PlatformId): void {
  const session = readMap(SESSION_KEY);
  session[id] = "expired";
  writeMap(SESSION_KEY, session, sessionStorage);
}

export function statusOf(info: PlatformInfo): PlatformStatus {
  const hasCredential =
    info.id === "ybt"
      ? Boolean(safeGet(TOKEN_KEY))
      : info.id === "jw"
        ? false // Cookie 由 WebView 管理，前端无法可靠检查
        : Boolean(safeGet(OPERATOR_KEY));
  const session = readMap(SESSION_KEY);
  const stamps = readMap(STAMP_KEY);
  return {
    platform: info,
    state:
      info.requiresLogin &&
      (session[info.id] === "active" || session[info.id] === "expired")
        ? (session[info.id] as LoginState)
        : "unknown",
    since:
      typeof stamps[info.id] === "number"
        ? (stamps[info.id] as number)
        : undefined,
    hasCredential,
    hasOfflineData: info.id === "jw" ? Boolean(safeGet(TIMETABLE_KEY)) : false,
  };
}

export function allStatuses(): PlatformStatus[] {
  return PLATFORMS.map(statusOf);
}

/** 清本地平台凭证；教务 Cookie 不受此操作影响。 */
export function logout(id: PlatformId): void {
  if (id === "ybt") {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  } else if (id === "zongwu") {
    try {
      localStorage.removeItem(OPERATOR_KEY);
      localStorage.removeItem(ELECTRICITY_REPORT_KEY);
    } catch {
      /* ignore */
    }
  }
  const stamps = readMap(STAMP_KEY);
  delete stamps[id];
  writeMap(STAMP_KEY, stamps);
  const session = readMap(SESSION_KEY);
  delete session[id];
  writeMap(SESSION_KEY, session, sessionStorage);
}

/** 清除课表离线副本。不会伪称为教务系统退出登录。 */
export function clearTimetableCache(): void {
  try {
    localStorage.removeItem(TIMETABLE_KEY);
  } catch {
    /* ignore */
  }
  const stamps = readMap(STAMP_KEY);
  delete stamps.jw;
  writeMap(STAMP_KEY, stamps);
  const session = readMap(SESSION_KEY);
  delete session.jw;
  writeMap(SESSION_KEY, session, sessionStorage);
}

export function logoutAll(): void {
  logout("ybt");
  logout("jw");
  logout("zongwu");
}

export function anyLoggedIn(): boolean {
  return PLATFORMS.some(
    (info) => info.requiresLogin && statusOf(info).state === "active",
  );
}

const REQUEST_KEY = "ahnu.auth.request";
export function requestLogin(id: PlatformId): void {
  safeSet(REQUEST_KEY, id);
}
export function takeLoginRequest(): PlatformId | null {
  try {
    const value = localStorage.getItem(REQUEST_KEY);
    if (value) localStorage.removeItem(REQUEST_KEY);
    return value === "ybt" || value === "jw" || value === "zongwu"
      ? value
      : null;
  } catch {
    return null;
  }
}

/** 用于判断当前应用会话里是否刚成功验证过；缓存不算登录凭证。 */
export function isLoggedIn(id: PlatformId): boolean {
  if (!PLATFORMS.some((item) => item.id === id && item.requiresLogin))
    return false;
  return statusOf(PLATFORMS.find((item) => item.id === id)!).state === "active";
}
