/**
 * 校历（学校「一站式服务大厅」的日程页）。
 *
 * 复用空教室那套 CAS 登录拿到的 `X-Access-Token`，因此不需要第二次登录。
 *
 * 接口：GET /applets/workhall/api/calendar?date=YYYY-MM
 *
 * 实测返回（2026-10）：
 *   result = { last: [...], now: [...], next: [...] }
 *   每项 { exactDate, flag, weekStr, remark, weekInt }
 *
 *     flag   1 = 休息，0 = 上班上课
 *     weekStr 周几
 *     remark  普通周末是「周六」「周日」，节假日是节日名，如「国庆节」
 *
 * 也就是说节假日信息就在 remark 里，普通周末的 remark 与 weekStr 相同。
 */

import { ybtRequest } from "./classroom.ts";

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** 是否休息（flag = 1） */
  rest: boolean;
  /** 节日名；普通周末为空 */
  holiday: string;
}

/** 某天的课程，来自已读取的教务课表（不额外请求）。 */
export interface DayCourse {
  name: string;
  place: string;
  teacher: string;
  period: number;
  span: number;
  timeRange: string;
}

interface CalendarPoint {
  exactDate?: string;
  flag?: number | string;
  weekStr?: string;
  remark?: string;
  weekInt?: number | string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 把 Date 格式化成 YYYY-MM-DD。 */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 把 Date 格式化成 YYYY-MM。 */
export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

const WEEKDAY_TEXT = /^周[一二三四五六日天]$/;

/**
 * 读取某个月的标记日。
 *
 * 返回按 `last / now / next` 分成三组（上月、本月、下月），
 * 三组都要，因为月视图首尾会用到相邻月的日期。
 */
export async function loadMonth(month: Date): Promise<CalendarDay[]> {
  const raw = await ybtRequest<Record<string, CalendarPoint[]>>(
    `/applets/workhall/api/calendar?date=${toMonthKey(month)}`,
  );

  const points: CalendarPoint[] = [];
  for (const value of Object.values(raw ?? {})) {
    if (Array.isArray(value)) points.push(...value);
  }

  const merged = new Map<string, CalendarDay>();
  for (const point of points) {
    const date = point.exactDate;
    if (!date) continue;

    const key = date.slice(0, 10);
    const remark = (point.remark ?? "").trim();
    // remark 与 weekStr 相同说明只是普通周末，不是节日
    const holiday = remark && !WEEKDAY_TEXT.test(remark) ? remark : "";
    const rest = Number(point.flag) === 1;

    const existing = merged.get(key);
    if (existing) {
      existing.rest = existing.rest || rest;
      if (!existing.holiday && holiday) existing.holiday = holiday;
    } else {
      merged.set(key, { date: key, rest, holiday });
    }
  }

  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthCell {
  date: Date;
  key: string;
  /** 是否属于本月（否则是上月/下月的补位） */
  inMonth: boolean;
  rest: boolean;
  holiday: string;
  today: boolean;
}

/**
 * 生成 42 格（6 行 × 7 列）的月视图，周一为每行第一列。
 */
export function buildMonthGrid(month: Date, marks: CalendarDay[]): MonthCell[] {
  const byDate = new Map(marks.map((mark) => [mark.date, mark]));
  const todayKey = toDateKey(new Date());

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // JS 里周日是 0，这里换算成「周一为 0」
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  const cells: MonthCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    const mark = byDate.get(key);
    cells.push({
      date,
      key,
      inMonth: date.getMonth() === month.getMonth(),
      rest: mark?.rest ?? false,
      holiday: mark?.holiday ?? "",
      today: key === todayKey,
    });
  }
  return cells;
}

export const WEEK_HEADERS = ["一", "二", "三", "四", "五", "六", "日"] as const;
