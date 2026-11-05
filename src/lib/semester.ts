/**
 * 学期周次计算：校历与课程表共用同一份。
 *
 * 只要「首周起始日」一致，两个功能显示的周次、日期范围就不会打架。
 * 首周起始日优先取教务系统页面上的「起始日期」。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");

/** 解析 `YYYY-MM-DD` 为本地日期，避免时区偏移。 */
export function parseDate(text?: string): Date | null {
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** 把日期格式化成 `YYYY-MM-DD`。 */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 格式化成 `M/D`。 */
export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 去掉时分秒，只留日期。 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 首周起始日。
 *
 * 教务给的起始日期通常是周一；万一是别的星期，回退到当周周一，
 * 否则后面所有周次都会错位。
 */
export function firstWeekStart(startDate?: string): Date | null {
  const start = parseDate(startDate);
  if (!start) return null;
  const offset = (start.getDay() + 6) % 7; // 周一 = 0
  return new Date(start.getTime() - offset * DAY_MS);
}

/** 第 week 周的周一。 */
export function weekStartDate(
  startDate: string | undefined,
  week: number,
): Date | null {
  const first = firstWeekStart(startDate);
  if (!first) return null;
  return new Date(first.getTime() + (week - 1) * 7 * DAY_MS);
}

/** 第 week 周的周日。 */
export function weekEndDate(
  startDate: string | undefined,
  week: number,
): Date | null {
  const start = weekStartDate(startDate, week);
  if (!start) return null;
  return new Date(start.getTime() + 6 * DAY_MS);
}

/** 某天落在第几周（可能 <1 或超出学期）。 */
export function weekOfDate(
  startDate: string | undefined,
  date: Date,
): number | null {
  const first = firstWeekStart(startDate);
  if (!first) return null;
  const diff = Math.floor(
    (startOfDay(date).getTime() - first.getTime()) / (7 * DAY_MS),
  );
  return diff + 1;
}

/**
 * 当前教学周。
 *
 * 假期或开学前会落在 1 以下，这里夹到 1；超出总周数则夹到末周，
 * 保证界面永远有个合理值可用。
 */
export function currentWeekOf(
  startDate: string | undefined,
  maxWeek: number,
  now = new Date(),
): number {
  const week = weekOfDate(startDate, now);
  if (week === null) return 1;
  if (week < 1) return 1;
  if (week > maxWeek) return maxWeek;
  return week;
}

/** 从一组周次里推出学期总周数。 */
export function maxWeekOf(weekLists: number[][]): number {
  let max = 1;
  for (const weeks of weekLists) {
    for (const week of weeks) {
      if (week > max) max = week;
    }
  }
  return max;
}

/** 今天的星期几，1 = 周一，7 = 周日。 */
export function weekdayIndex(date = new Date()): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}
