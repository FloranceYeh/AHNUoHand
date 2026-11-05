/**
 * 作息时间表：夏令时 / 冬令时。
 *
 * 学校每天 13 节课，分三段：
 *   上午 1–5、下午 6–10、晚上 11–13
 *
 * 两套表只差下午与晚上的钟点：
 *   冬令时：下午 14:00 开始，晚上 11–13 节 19:00–21:25
 *   夏令时：下午 14:30 开始，晚上 11–13 节 19:00–21:00
 *
 * 学期切换规则：5 月 1 日至 9 月 30 日按夏令时，其余按冬令时。
 * 若学校实际安排有出入，只改本文件即可，校历与课程表会自动跟随。
 */

export type Season = "summer" | "winter";

export const SEASON_LABEL: Record<Season, string> = {
  summer: "夏令时",
  winter: "冬令时",
};

/** 夏令时的起止（含首尾），格式 MM-DD。 */
export const SUMMER_RANGE = { from: "05-01", to: "09-30" };

/** 每节课的 [开始, 结束] 时间。 */
export type PeriodTime = [string, string];

/** 一天共 13 节。 */
export const PERIOD_COUNT = 13;

/** 晚上第一节的序号。 */
export const EVENING_START = 11;

/** 夏令时：下午 14:30 开始，晚上 19:00–21:00。 */
export const SUMMER_TIMES: PeriodTime[] = [
  // 上午
  ["08:00", "08:45"],
  ["08:50", "09:35"],
  ["09:50", "10:35"],
  ["10:40", "11:25"],
  ["11:30", "12:15"],
  // 下午
  ["14:30", "15:15"],
  ["15:20", "16:05"],
  ["16:10", "16:55"],
  ["17:00", "17:45"],
  ["17:50", "18:35"],
  // 晚上 19:00–21:00，三段各 40 分钟
  ["19:00", "19:40"],
  ["19:40", "20:20"],
  ["20:20", "21:00"],
];

/** 冬令时：下午 14:00 开始，晚上 19:00–21:25。 */
export const WINTER_TIMES: PeriodTime[] = [
  // 上午
  ["08:00", "08:45"],
  ["08:50", "09:35"],
  ["09:50", "10:35"],
  ["10:40", "11:25"],
  ["11:30", "12:15"],
  // 下午
  ["14:00", "14:45"],
  ["14:50", "15:35"],
  ["15:40", "16:25"],
  ["16:30", "17:15"],
  ["17:20", "18:05"],
  // 晚上 19:00–21:25，三段各 45 分钟，中间各休 5 分钟
  ["19:00", "19:45"],
  ["19:50", "20:35"],
  ["20:40", "21:25"],
];

const pad = (value: number) => String(value).padStart(2, "0");

/** 判断某天属于哪个作息季节。 */
export function seasonOf(date: Date): Season {
  const key = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return key >= SUMMER_RANGE.from && key <= SUMMER_RANGE.to
    ? "summer"
    : "winter";
}

/** 取某季的作息表。 */
export function timesOfSeason(season: Season): PeriodTime[] {
  return season === "summer" ? SUMMER_TIMES : WINTER_TIMES;
}

/**
 * 取某天的作息表。
 *
 * 页面里读到的真实时间优先（`pageTimes`），因为它就是学校当下在用的；
 * 读不到时才按季节取默认表。
 */
export function timesFor(date: Date, pageTimes?: PeriodTime[]): PeriodTime[] {
  if (pageTimes && pageTimes.length >= 8) return pageTimes;
  return timesOfSeason(seasonOf(date));
}

/** 把页面读到的 hh:mm 序列两两配对成节次时间。 */
export function pairTimes(flat?: string[]): PeriodTime[] | undefined {
  if (!flat || flat.length < 16 || flat.length % 2 !== 0) return undefined;
  const pairs: PeriodTime[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    pairs.push([flat[index], flat[index + 1]]);
  }
  return pairs.length >= 8 ? pairs : undefined;
}

/** 下一个切换日期（用于界面上提示「何时切换作息」）。 */
export function nextSeasonChange(date: Date): { season: Season; date: Date } {
  const year = date.getFullYear();
  if (seasonOf(date) === "summer") {
    return { season: "winter", date: new Date(year, 9, 1) };
  }
  const may = new Date(year, 4, 1);
  if (date < may) return { season: "summer", date: may };
  return { season: "summer", date: new Date(year + 1, 4, 1) };
}

/** 晚上时段的整体范围，用于界面上一句话说明。 */
export function eveningRange(season: Season): string {
  const times = timesOfSeason(season);
  const first = times[EVENING_START - 1];
  const last = times[times.length - 1];
  if (!first || !last) return "";
  return `${first[0]}–${last[1]}`;
}
