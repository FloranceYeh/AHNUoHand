import { md5Hex, saltedDecrypt, saltedEncrypt, swapCase } from "./crypto.ts";
import { markLoggedIn } from "./authManager";

export interface RoomInfo {
  no: string;
  name: string;
  house: string;
  area: string;
  fullName: string;
}

export interface Balance {
  total: number;
  recharged: number;
  subsidy: number;
  kwhLeft: number;
  kwhRecharged: number;
  kwhSubsidy: number;
  price: number;
}

export interface MonthStat {
  lastMonthKwh: number;
  lastMonthAc: number;
  lastMonthLight: number;
  thisMonthKwh: number;
  thisMonthAc: number;
  thisMonthLight: number;
  thisMonthSubsidy: number;
  thisMonthRecharge: number;
}

export interface DailyPoint {
  date: string;
  kwh: number;
  remain: number;
}

export interface ElectricityReport {
  room: RoomInfo;
  balance: Balance;
  month: MonthStat;
  daily: DailyPoint[];
  fetchedAt: string;
}

interface StoredReport {
  operatorNo: string;
  savedAt: number;
  report: ElectricityReport;
}

/**
 * 学校总务平台的网关。请求走 WebView 的 fetch（浏览器网络栈），
 * 一是能通过网关对非浏览器 TLS 指纹的拦截，二是网关注明了 `Access-Control-Allow-Origin: *`。
 */
const GATEWAY = "https://zongwu.ahnu.edu.cn/gateway/sso/bbs/";
const APP_ID = "00000001";
const APP_SECRET = "abcdefg";
/** 页面运行时 `window.RequestBodyAesKey()` 的返回值；学校若更换，改这里即可。 */
const BODY_KEY = "12345678cgg54321";
const ORG_NO = "00110001";

const REPORT_KEY = "ahnu.electricity.report";
const HISTORY_KEY = "ahnu.electricity.history";
const OPERATOR_KEY = "ahnu.electricity.operator";
const CACHE_TTL = 5 * 60 * 1000;
const HISTORY_LIMIT = 30;
const HISTORY_TTL = 90 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 协议层
// ---------------------------------------------------------------------------

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** `HeadJson`：Code 为本地时间 yyyyMMddHHmmss，Sign 为 md5(Code+密钥) 后再换大小写。 */
function headJson(): string {
  const now = new Date();
  const code =
    `${now.getFullYear()}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}` +
    `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
  return JSON.stringify({
    AppID: APP_ID,
    Code: code,
    Sign: swapCase(md5Hex(code + APP_SECRET)),
  });
}

function basePayload(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    TimeStamp: "",
    iPageSize: 20,
    pageIndex: 1,
    bIsPage: true,
    DBSrc: "10",
    ...extra,
  };
}

async function post<T = unknown>(
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const form = new URLSearchParams();
  form.set(
    "json",
    `PWDDATA_${saltedEncrypt(JSON.stringify(payload), BODY_KEY)}`,
  );

  let response: Response;
  try {
    response = await fetch(GATEWAY + path, {
      method: "POST",
      headers: {
        HeadJson: headJson(),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: form,
      mode: "cors",
      credentials: "omit",
    });
  } catch {
    throw new Error("连不上学校服务器，请检查网络后重试");
  }

  if (!response.ok) {
    throw new Error(`学校网关返回 HTTP ${response.status}`);
  }

  const text = await response.text();
  let data: { State?: string; Msg?: string; Model?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`学校返回的内容无法解析：${text.slice(0, 80)}`);
  }

  if (data.State !== "1") {
    throw new Error(data.Msg?.trim() || "学校接口返回失败");
  }

  if (typeof data.Model === "string" && data.Model.startsWith("PWDDATA_")) {
    const plain = saltedDecrypt(data.Model.slice(8), BODY_KEY);
    if (plain === null) {
      throw new Error("解密失败：接口口令可能已被学校更换");
    }
    data.Model = JSON.parse(plain);
  }

  return data as T;
}

function num(source: Record<string, unknown> | undefined, key: string): number {
  const value = source?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function str(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// 业务查询
// ---------------------------------------------------------------------------

export async function fetchElectricity(
  operatorNo: string,
  days = 15,
): Promise<ElectricityReport> {
  const operator = operatorNo.trim();
  if (!operator) throw new Error("请先填写学号");
  if (!/^[0-9]{8,20}$/.test(operator)) throw new Error("学号格式不正确");

  const span = Math.min(31, Math.max(1, days));

  // 1) 学号 -> 房间
  const roomResponse = await post<{ Model?: Record<string, unknown> }>(
    "Org/SchoolRoom/ClientSchoolRoom",
    basePayload({
      Opt: "DetailByOperatorNo",
      OrgNo: ORG_NO,
      OptNo: operator,
      pageIndex: 0,
    }),
  );
  const room = roomResponse.Model;
  if (!room || !str(room, "No")) {
    throw new Error("没有找到该学号对应的宿舍，请核对后重试");
  }
  const roomNo = str(room, "No");

  // 2) 房间电费详情
  const detailResponse = await post<{ Model?: Record<string, unknown> }>(
    "Org/SchoolRoom/ClientSchoolRoom",
    basePayload({ Opt: "Detail", OrgNo: ORG_NO, No: roomNo }),
  );
  const detail = detailResponse.Model;
  if (!detail) throw new Error("没有查到该宿舍的电费明细");

  // 3) 本月 / 上月汇总
  const monthResponse = await post<{ Model?: Record<string, unknown>[] }>(
    "Org/SchoolLOT/ClientSchoolLOT",
    basePayload({ Opt: "DataCount", OrgNo: ORG_NO, Key: "28", Like0: roomNo }),
  );
  const month = monthResponse.Model?.[0];

  // 4) 每日用量
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (span - 1));
  const iso = (date: Date) =>
    `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

  const dailyResponse = await post<{ Model?: Record<string, unknown>[] }>(
    "Org/SchoolLOT/ClientSchoolLOT",
    basePayload({
      Opt: "DataCount",
      OrgNo: ORG_NO,
      Key: "10",
      Like1: str(detail, "AreaID"),
      Like2: str(detail, "HouseNo"),
      Like3: roomNo,
      sDate: iso(start),
      eDate: iso(today),
      FKey: "1000",
      pageIndex: 0,
      iPageSize: 100,
    }),
  );

  const daily: DailyPoint[] = (dailyResponse.Model ?? []).map((row) => ({
    date: str(row, "日期"),
    kwh: num(row, "Count"),
    remain: num(row, "剩余量"),
  }));

  return {
    room: {
      no: roomNo,
      name: str(detail, "Name"),
      house: str(detail, "HouseName"),
      area: str(detail, "AreaName"),
      fullName: str(detail, "RoomNameStr"),
    },
    balance: {
      total: num(detail, "AmountDianShengYuAll"),
      recharged: num(detail, "AmountDianBuyShengYu"),
      subsidy: num(detail, "AmountDianUseShengYu"),
      kwhLeft: num(detail, "NumDianShengYuALL"),
      kwhRecharged: num(detail, "NumDianBuyShengYu"),
      kwhSubsidy: num(detail, "NumDianBuZhuShengYu"),
      price: num(detail, "DianPrice"),
    },
    month: {
      lastMonthKwh: num(month, "上月用电"),
      lastMonthAc: num(month, "上月空调用电"),
      lastMonthLight: num(month, "上月照明用电"),
      thisMonthKwh: num(month, "当月用电"),
      thisMonthAc: num(month, "当月空调用电"),
      thisMonthLight: num(month, "当月照明用电"),
      thisMonthSubsidy: num(month, "当月用电补助"),
      thisMonthRecharge: num(month, "当月用电充值"),
    },
    daily,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 本地缓存与展示辅助
// ---------------------------------------------------------------------------

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式下 localStorage 不可用，忽略即可 */
  }
}

export function getSavedOperator(): string {
  return safeGet(OPERATOR_KEY);
}

export function saveOperator(operatorNo: string): void {
  safeSet(OPERATOR_KEY, operatorNo);
  markLoggedIn("zongwu");
}

export function forgetOperator(): void {
  const operator = getSavedOperator();
  try {
    localStorage.removeItem(OPERATOR_KEY);
    localStorage.removeItem(REPORT_KEY);
    if (operator) localStorage.removeItem(historyKey(operator));
  } catch {
    /* ignore */
  }
}

function historyKey(operatorNo: string): string {
  return `${HISTORY_KEY}.${operatorNo}`;
}

export function readHistory(operatorNo: string): ElectricityReport[] {
  const raw = safeGet(historyKey(operatorNo));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - HISTORY_TTL;
    return parsed
      .filter((item): item is ElectricityReport => {
        if (!item || typeof item !== "object") return false;
        const report = item as ElectricityReport;
        return (
          typeof report.fetchedAt === "string" &&
          !Number.isNaN(Date.parse(report.fetchedAt)) &&
          Date.parse(report.fetchedAt) >= cutoff &&
          typeof report.balance?.kwhLeft === "number"
        );
      })
      .sort(
        (a, b) =>
          new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime(),
      );
  } catch {
    return [];
  }
}

export function saveHistory(
  operatorNo: string,
  report: ElectricityReport,
): ElectricityReport[] {
  const history = [
    ...readHistory(operatorNo).filter(
      (item) => item.fetchedAt !== report.fetchedAt,
    ),
    report,
  ]
    .sort(
      (a, b) =>
        new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime(),
    )
    .slice(-HISTORY_LIMIT);
  safeSet(historyKey(operatorNo), JSON.stringify(history));
  return history;
}

export function readCache(): StoredReport | null {
  const raw = safeGet(REPORT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredReport;
    return parsed?.report?.room ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCache(
  operatorNo: string,
  report: ElectricityReport,
): void {
  safeSet(
    REPORT_KEY,
    JSON.stringify({
      operatorNo,
      savedAt: Date.now(),
      report,
    } satisfies StoredReport),
  );
  saveHistory(operatorNo, report);
}

export function isCacheFresh(savedAt: number): boolean {
  return Date.now() - savedAt < CACHE_TTL;
}

export function formatMoney(value: number): string {
  return value.toFixed(2);
}

export function formatKwh(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}
