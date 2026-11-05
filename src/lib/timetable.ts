/**
 * 学生课表（教务 EAMS）的数据契约与解析。
 *
 * 数据来源：登录后由 WebView 页面提供。因为登录要过图形验证码，
 * 客户端不保存密码，而是让用户在窗口里自己登录，再把渲染好的页面读出来。
 *
 * 单元格原始文本的形态（结构示意，非真实数据）：
 *   示例课程甲 001
 *   (1~16周) (8:00-9:35) 某楼101 某老师
 *
 *   长期课程乙 002
 *   (2周) (9:50-11:25) 某楼201 某老师
 *   (5周) (3-4节) 某楼202 某老师      ← 同格多段
 */

export interface CourseSlot {
  /** 星期几，1 = 周一 */
  weekday: number;
  /** 起始节次 */
  period: number;
  /** 跨几节 */
  span: number;
  /** 课程名 */
  name: string;
  /** 课序号，例如 029 */
  section: string;
  /** 上课周次（升序去重） */
  weeks: number[];
  /** 校段时间，例如 800-935 */
  timeRange: string;
  /** 地点 */
  place: string;
  /** 教师 */
  teacher: string;
  /** 该格里的第几段（同一格可能排多段） */
  index: number;
}

export interface Timetable {
  /** 学期，例如 2026-2027-1 */
  semester: string;
  /** 学期 id，用于切换 */
  semesterId: string;
  slots: CourseSlot[];
}

const WEEK_PATTERN = /\((?:第)?(\d+(?:\s*[~-]\s*\d+)?(?:\s*[,、]\s*\d+)*)周\)/;
const TIME_PATTERN = /\(((?:\d{1,2}:?\d{2})-(?:\d{1,2}:?\d{2}))\)/;
const SECTION_PATTERN = /\s(\d{3})$/;

/** 把 `1~17` / `3` / `1,3,5~7` 展开成周次数组。 */
export function expandWeeks(text: string): number[] {
  const weeks = new Set<number>();
  for (const part of text.replace(/、/g, ",").split(",")) {
    const range = part
      .split(/[~-]/)
      .map((value) => Number.parseInt(value.trim(), 10));
    if (range.length === 2 && range.every(Number.isFinite)) {
      const [start, end] = range;
      for (
        let week = Math.min(start, end);
        week <= Math.max(start, end);
        week += 1
      ) {
        weeks.add(week);
      }
    } else if (range.length === 1 && Number.isFinite(range[0])) {
      weeks.add(range[0]);
    }
  }
  return [...weeks].sort((a, b) => a - b);
}

/**
 * 解析一个单元格的原始文本。
 *
 * 结构：第一行是「课程名 课序号」，之后每段是「(周次) (时间) 地点 教师」。
 * 同一格放多段时，会以空行或直接的 `(` 开头分隔。
 */
export function parseCellText(
  text: string,
  weekday: number,
  period: number,
  span: number,
): CourseSlot[] {
  const clean = text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const lines = clean
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  // 以「(…周)」开头的行是段落起点
  const header = lines[0];
  const firstWeekInHeader = header.search(
    /\((?:第)?\d+(?:\s*[~-]\s*\d+)?(?:\s*[,、]\s*\d+)*周\)/,
  );
  const headerText =
    firstWeekInHeader >= 0 ? header.slice(0, firstWeekInHeader).trim() : header;
  const slots: CourseSlot[] = [];

  let name = headerText;
  let section = "";
  const sectionMatch = SECTION_PATTERN.exec(headerText);
  if (sectionMatch) {
    section = sectionMatch[1];
    name = headerText.slice(0, sectionMatch.index).trim();
  }

  const segments: string[] = [];
  let current: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith("(")) {
      if (current.length) segments.push(current.join(" "));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) segments.push(current.join(" "));

  // 某些版本的 EAMS 会把同一段内容渲染成一行：
  // `(1-16周) (08:00-09:35) 教室 教师 (2周) ...`。
  // 上面的按行分段在这种情况下会漏掉周次，因此按每个周次标记再切一次。
  const inline =
    (firstWeekInHeader >= 0 ? header.slice(firstWeekInHeader) + " " : "") +
    lines.slice(1).join(" ");
  const weekStarts = [
    ...inline.matchAll(
      /\((?:第)?\d+(?:\s*[~-]\s*\d+)?(?:\s*[,、]\s*\d+)*周\)/g,
    ),
  ]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);
  if (weekStarts.length > 0) {
    segments.length = 0;
    weekStarts.forEach((start, index) => {
      const end =
        index + 1 < weekStarts.length ? weekStarts[index + 1] : inline.length;
      segments.push(inline.slice(start, end).trim());
    });
  }

  // 没有周次信息时，至少保留一条，避免丢课
  if (!segments.length) {
    return [
      {
        weekday,
        period,
        span,
        name,
        section,
        weeks: [],
        timeRange: "",
        place: "",
        teacher: "",
        index: 0,
      },
    ];
  }

  segments.forEach((segment, index) => {
    const weekMatch = WEEK_PATTERN.exec(segment);
    const timeMatch = TIME_PATTERN.exec(segment);

    let rest = segment;
    if (weekMatch) rest = rest.replace(weekMatch[0], "");
    if (timeMatch) rest = rest.replace(timeMatch[0], "");
    rest = rest.replace(/\((?:第)?\d+(?:\s*[-~]\s*\d+)?节\)/g, "").trim();

    // 剩下的部分：地点 教师（地点常带结尾的 *）
    const tokens = rest.split(/\s+/).filter(Boolean);
    const place = tokens[0] ?? "";
    const teacher = tokens.slice(1).join(" ");

    slots.push({
      weekday,
      period,
      span,
      name,
      section,
      weeks: weekMatch ? expandWeeks(weekMatch[1]) : [],
      timeRange: timeMatch ? timeMatch[1] : "",
      place,
      teacher,
      index,
    });
  });

  return slots;
}

/** 该课程在第 week 周是否有课。没有周次信息视为每周都有。 */
export function isActive(slot: CourseSlot, week: number): boolean {
  if (!slot.weeks.length) return true;
  return slot.weeks.includes(week);
}

/** 判断课程是否跨整个学期，用于界面上区分单双周/阶段性课程。 */
export function isFullTerm(slot: CourseSlot, maxWeek: number): boolean {
  return slot.weeks.length >= maxWeek - 1;
}

/** 课程配色：按名称稳定取色，同一门课每学期颜色一致。 */
const COURSE_COLORS = [
  { bg: "#5b8def", fg: "#ffffff" },
  { bg: "#e8749b", fg: "#ffffff" },
  { bg: "#e8883f", fg: "#ffffff" },
  { bg: "#3f6bb5", fg: "#ffffff" },
  { bg: "#57b894", fg: "#ffffff" },
  { bg: "#d9a03a", fg: "#ffffff" },
  { bg: "#a97bd4", fg: "#ffffff" },
  { bg: "#4aa8b8", fg: "#ffffff" },
];

export function courseColor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100000;
  }
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}
