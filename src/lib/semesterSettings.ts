/**
 * 学期设置：首周日期与总周数，允许用户手动指定。
 *
 * 从教务读到的值只是「默认值」，用户可以覆盖：
 *   1. 自动读到的起始日期有时是错的（或者干脆读不到）；
 *   2. 有些学期周数要靠课表之外的安排来定（如实训周、考试周）。
 *
 * 覆盖值存在本地，优先级高于自动读到的值，校历与课程表共用同一份。
 */

import { firstWeekStart, parseDate } from "./semester";

const KEY = "ahnu.semester.override";

export interface SemesterOverride {
  /** 首周起始日 YYYY-MM-DD（可以是首周任意一天，使用时会归到周一） */
  startDate?: string;
  /** 总周数 */
  maxWeek?: number;
}

export interface SemesterResolved {
  /** 实际生效的首周周一 */
  firstStart: Date | null;
  /** 实际生效的总周数，0 表示未知 */
  maxWeek: number;
  /** 首周是否来自用户设置 */
  overridden: boolean;
}

export function readOverride(): SemesterOverride {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SemesterOverride;
    return {
      startDate:
        typeof parsed.startDate === "string" ? parsed.startDate : undefined,
      maxWeek: typeof parsed.maxWeek === "number" ? parsed.maxWeek : undefined,
    };
  } catch {
    return {};
  }
}

export function saveOverride(next: SemesterOverride): void {
  try {
    const clean: SemesterOverride = {};
    if (next.startDate) clean.startDate = next.startDate;
    if (next.maxWeek && next.maxWeek > 0) clean.maxWeek = next.maxWeek;
    if (Object.keys(clean).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export function clearOverride(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 合并「自动读到的值」与「用户设置」，得出实际使用的值。
 *
 * 用户设置优先；没有设置时才用自动值。
 */
export function resolveSemester(
  autoStartDate?: string,
  autoMaxWeek?: number,
): SemesterResolved {
  const over = readOverride();

  const startSource = over.startDate || autoStartDate;
  const firstStart = startSource ? firstWeekStart(startSource) : null;

  const maxWeek =
    over.maxWeek && over.maxWeek > 0 ? over.maxWeek : (autoMaxWeek ?? 0);

  return {
    firstStart,
    maxWeek,
    overridden: Boolean(over.startDate || over.maxWeek),
  };
}

/** 把日期格式化成 <input type="date"> 需要的 YYYY-MM-DD。 */
export function toInputDate(date: Date | null): string {
  if (!date) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 校验用户输入的首周日期，返回错误提示或 null。 */
export function validateStartDate(text: string): string | null {
  if (!text) return null;
  const date = parseDate(text);
  if (!date) return "日期格式不对";
  if (date.getFullYear() < 2000 || date.getFullYear() > 2100)
    return "年份看起来不对";
  return null;
}

/** 校验周数。 */
export function validateMaxWeek(value: number): string | null {
  if (!Number.isFinite(value)) return "请输入数字";
  if (value < 1) return "至少 1 周";
  if (value > 30) return "最多 30 周";
  return null;
}
