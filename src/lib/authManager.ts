/**
 * 校园平台的统一登录管理。
 *
 * 学校的服务分散在几个互不相通的后台上，各自认证方式不同：
 *
 *   | 平台            | 域名                | 认证方式                  | 谁在用        |
 *   | --------------- | ------------------- | ------------------------- | ------------- |
 *   | 一站式服务大厅  | ybt.ahnu.edu.cn     | CAS 票据换 JWT            | 空教室、校历  |
 *   | 教务系统 EAMS   | jw.ahnu.edu.cn      | 图形验证码 + 会话 cookie  | 课程表        |
 *   | 后勤服务        | zongwu.ahnu.edu.cn  | 学号密码参与签名，无需登录 | 电费          |
 *
 * 本模块只做「记录与查询」，具体的登录动作仍由各功能自己完成，
 * 因为它们的流程差异太大（窗口登录 / 单页跳转 / 纯前端签名）。
 * 这样设置页能集中展示与清除，各功能也不必重复实现状态读取。
 */

export type PlatformId = "ybt" | "jw" | "zongwu";

export interface PlatformInfo {
  id: PlatformId;
  /** 展示名 */
  name: string;
  /** 说明这个平台管哪些功能 */
  description: string;
  /** 后台域名 */
  host: string;
  /** 是否需要登录才能用 */
  requiresLogin: boolean;
  /** 认证方式的一句话说明 */
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
    description: "课程表",
    host: "jw.ahnu.edu.cn",
    requiresLogin: true,
    authHint: "学号密码 + 图形验证码",
  },
  {
    id: "zongwu",
    name: "后勤服务",
    description: "宿舍电费",
    host: "zongwu.ahnu.edu.cn",
    requiresLogin: false,
    authHint: "仅需学号，无需密码",
  },
];

/** 各平台用于判断登录态的存储键。 */
const CREDENTIAL_KEYS: Record<PlatformId, string> = {
  ybt: "ahnu.classroom.token",
  // 教务的会话在 WebView cookie 里，本地只留课表缓存；有缓存即视为可离线查看
  jw: "ahnu.timetable.grid",
  // 电费不需要密码，只需绑定过学号
  zongwu: "ahnu.electricity.operator",
};

export type LoginState = "unknown" | "active" | "expired";

export interface PlatformStatus {
  platform: PlatformInfo;
  state: LoginState;
  /** 登录取到的时间（毫秒时间戳），没有记录则为空 */
  since?: number;
  /** 凭据的粗略长度，用于判断是否为空，不展示原值 */
  hasCredential: boolean;
}

interface Stamp {
  at: number;
}

const STAMP_KEY = "ahnu.auth.stamps";

function readStamps(): Record<string, Stamp> {
  try {
    const raw = localStorage.getItem(STAMP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Stamp>) : {};
  } catch {
    return {};
  }
}

function writeStamp(id: PlatformId): void {
  try {
    const stamps = readStamps();
    stamps[id] = { at: Date.now() };
    localStorage.setItem(STAMP_KEY, JSON.stringify(stamps));
  } catch {
    /* 隐私模式下忽略 */
  }
}

function dropStamp(id: PlatformId): void {
  try {
    const stamps = readStamps();
    delete stamps[id];
    localStorage.setItem(STAMP_KEY, JSON.stringify(stamps));
  } catch {
    /* ignore */
  }
}

/** 登录成功时调用，记下时间供设置页展示。 */
export function markLoggedIn(id: PlatformId): void {
  writeStamp(id);
}

/** 判断某个平台当前是否已登录。 */
export function statusOf(info: PlatformInfo): PlatformStatus {
  let value = "";
  try {
    value = localStorage.getItem(CREDENTIAL_KEYS[info.id]) ?? "";
  } catch {
    value = "";
  }

  if (!info.requiresLogin) {
    return { platform: info, state: "active", hasCredential: true };
  }

  const hasCredential = value.length > 0;
  const stamp = readStamps()[info.id];

  return {
    platform: info,
    state: hasCredential ? "active" : "unknown",
    since: stamp?.at,
    hasCredential,
  };
}

/** 读取全部平台的状态。 */
export function allStatuses(): PlatformStatus[] {
  return PLATFORMS.map(statusOf);
}

/** 清除某个平台的登录状态。 */
export function logout(id: PlatformId): void {
  try {
    localStorage.removeItem(CREDENTIAL_KEYS[id]);
  } catch {
    /* ignore */
  }
  dropStamp(id);
}

/** 清除全部平台的登录状态。 */
export function logoutAll(): void {
  for (const info of PLATFORMS) logout(info.id);
}

/** 是否有任意平台已登录。 */
export function anyLoggedIn(): boolean {
  return PLATFORMS.some((info) => info.requiresLogin && statusOf(info).hasCredential);
}
