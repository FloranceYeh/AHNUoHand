import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { getToken, rememberReturnTo } from "../lib/classroom";
import {
  buildMonthGrid,
  loadMonth,
  WEEK_HEADERS,
  type CalendarDay,
} from "../lib/calendar";
import {
  courseColor,
  isActive,
  parseCellText,
  type CourseSlot,
} from "../lib/timetable";
import { CACHE_KEY, type GridResult } from "../lib/timetableSession";
import {
  currentWeekOf,
  dateKey,
  formatMonthDay,
  weekOfDate,
} from "../lib/semester";
import { resolveSemester, toInputDate } from "../lib/semesterSettings";
import {
  eveningRange,
  nextSeasonChange,
  seasonOf,
  SEASON_LABEL,
  timesFor,
} from "../lib/periodSchedule";

type Phase = "loading" | "login" | "ready" | "error";

const MONTH_NAMES = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

type SeasonMode = "auto" | "summer" | "winter";

interface CachedGrid extends GridResult {
  savedAt: number;
}

export function CalendarPage({
  onBack,
  onOpenTimetable,
  semesterStart,
  maxWeek,
  onNeedLogin,
}: {
  onBack: () => void;
  onOpenTimetable?: (week: number) => void;
  semesterStart?: string;
  maxWeek?: number;
  /** 未登录时跳到登录管理页 */
  onNeedLogin: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [marks, setMarks] = useState<CalendarDay[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>("auto");
  const [grid, setGrid] = useState<CachedGrid | null>(null);

  const today = useMemo(() => new Date(), []);
  const season = seasonMode === "auto" ? seasonOf(today) : seasonMode;
  const switchInfo = nextSeasonChange(today);
  const periodTimes = useMemo(() => timesFor(today), [today]);

  // 课表数据（本地缓存），用来展示每天上什么课、推算首周
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CachedGrid;
      if (parsed?.cells?.length) setGrid(parsed);
    } catch {
      /* 缓存损坏忽略 */
    }
  }, []);

  const slots: CourseSlot[] = useMemo(() => {
    if (!grid) return [];
    return grid.cells
      .flatMap((cell) =>
        parseCellText(cell.text, cell.weekday, cell.period, cell.span),
      )
      .sort((a, b) => a.period - b.period);
  }, [grid]);

  // 首周起始日：优先外层传入，其次课表缓存，最后空；用户设置覆盖以上
  const autoStart = semesterStart || grid?.startDate || "";
  const autoMaxWeek =
    maxWeek ?? slots.reduce((max, slot) => Math.max(max, ...slot.weeks, 0), 0);
  const semester = resolveSemester(autoStart, autoMaxWeek);
  const startDate = semester.firstStart ? toInputDate(semester.firstStart) : "";
  const totalWeeks = semester.maxWeek;
  const firstStart = semester.firstStart;
  const nowWeek =
    totalWeeks > 0
      ? currentWeekOf(startDate, totalWeeks, today)
      : weekOfDate(startDate, today);

  useEffect(() => {
    if (!getToken()) {
      setPhase("login");
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    void refreshMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const refreshMonth = async () => {
    try {
      setMarks(await loadMonth(cursor));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "读取失败";
      if (/登录|Token/i.test(message)) {
        setPhase("login");
        return;
      }
      setError(message);
    }
  };

  const refresh = async () => {
    setPhase("loading");
    setError("");
    try {
      setMarks(await loadMonth(cursor));
      setPhase("ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "读取失败";
      if (/登录|Token/i.test(message)) {
        setPhase("login");
        return;
      }
      setError(message);
      setPhase("error");
    }
  };

  // 登录统一在「登录管理」里进行，这里只负责跳过去
  const doLogin = () => {
    rememberReturnTo("calendar");
    onNeedLogin();
  };

  const cells = useMemo(() => buildMonthGrid(cursor, marks), [cursor, marks]);
  const holidays = useMemo(
    () => [
      ...new Set(
        marks.filter((mark) => mark.holiday).map((mark) => mark.holiday),
      ),
    ],
    [marks],
  );

  const shiftMonth = (delta: number) => {
    setSelected(null);
    setCursor(
      (value) => new Date(value.getFullYear(), value.getMonth() + delta, 1),
    );
  };

  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(dateKey(today));
  };

  // 选中日期的课程：从课表缓存里按「周次 + 星期」筛
  const selectedInfo = useMemo(() => {
    if (!selected) return null;
    const date = parseKey(selected);
    const week = weekOfDate(startDate, date);
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    if (week === null || week < 1) {
      return { week, weekday, daySlots: [] as CourseSlot[] };
    }
    const daySlots = slots.filter(
      (slot) => slot.weekday === weekday && isActive(slot, week),
    );
    return { week, weekday, daySlots };
  }, [selected, slots, startDate]);

  const selectedMark = selected
    ? marks.find((mark) => mark.date === selected)
    : undefined;

  return (
    <div className="page feature-page cal-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={19} />
        返回
      </button>

      <section className="feature-intro">
        <span className="feature-hero-icon service-icon-academic">
          <Icon name="calendar" size={30} />
        </span>
        <p className="eyebrow">学习服务</p>
        <h1>校历</h1>
        <p>查看教学周、节假日与作息时间。</p>
      </section>

      {phase === "login" && (
        <section className="elec-card elec-setup">
          <h2>需要先连接一站式服务大厅</h2>
          <p className="elec-desc">
            节假日与休息日来自学校一站式服务大厅。登录统一在「登录管理」里完成，与空教室共用同一份。
          </p>
          <div className="elec-actions">
            <button className="elec-primary" onClick={doLogin}>
              去登录
            </button>
          </div>
          {error && <p className="elec-error-text">{error}</p>}
        </section>
      )}

      {phase === "loading" && (
        <section className="elec-card elec-setup">
          <div className="tt-progress">
            <span className="tt-spinner" aria-hidden="true" />
            <span>正在读取校历…</span>
          </div>
        </section>
      )}

      {phase === "error" && (
        <section className="elec-card elec-error">
          <span className="placeholder-symbol">
            <Icon name="clock" size={24} />
          </span>
          <strong>没能读到校历</strong>
          <p>{error}</p>
          <div className="elec-actions">
            <button className="elec-primary" onClick={() => void refresh()}>
              重试
            </button>
          </div>
        </section>
      )}

      {phase === "ready" && (
        <div className="cal-view">
          <section className="cal-head">
            <div>
              <p className="cal-month">
                {cursor.getFullYear()} 年 {MONTH_NAMES[cursor.getMonth()]}
              </p>
              <p className="cal-sub">
                {nowWeek ? `第 ${nowWeek} 教学周` : "教学周未获取"}
                {firstStart && ` · 首周 ${formatMonthDay(firstStart)} 起`}
              </p>
            </div>
            <div className="cal-arrows">
              <button onClick={() => shiftMonth(-1)} aria-label="上个月">
                ‹
              </button>
              <button onClick={() => shiftMonth(1)} aria-label="下个月">
                ›
              </button>
            </div>
          </section>

          <section className="cal-terms">
            <div className="cal-term-item">
              <span>首周</span>
              <b>{firstStart ? formatMonthDay(firstStart) : "—"}</b>
            </div>
            <div className="cal-term-item">
              <span>当前周</span>
              <b>{nowWeek ?? "—"}</b>
            </div>
            <div className="cal-term-item">
              <span>总周数</span>
              <b>{totalWeeks || "—"}</b>
            </div>
            <button
              className="cal-term-item cal-season"
              onClick={() =>
                setSeasonMode((mode) =>
                  mode === "auto"
                    ? "summer"
                    : mode === "summer"
                      ? "winter"
                      : "auto",
                )
              }
              title="点击切换：自动 / 夏令时 / 冬令时"
            >
              <span>作息{seasonMode === "auto" ? "（自动）" : "（手动）"}</span>
              <b>{SEASON_LABEL[season]}</b>
            </button>
          </section>

          <p className="cal-season-hint">
            {SEASON_LABEL[season]}作息，下午第一节 {periodTimes[5]?.[0] ?? "—"}{" "}
            开始，晚上 {eveningRange(season)}
            {seasonMode === "auto" &&
              ` · ${formatMonthDay(switchInfo.date)} 起转${SEASON_LABEL[switchInfo.season]}`}
            {holidays.length > 0 && ` · 本月含 ${holidays.join("、")}`}
          </p>

          <section className="elec-card cal-card">
            <div className="cal-weekhead">
              {WEEK_HEADERS.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <div className="cal-grid">
              {cells.map((cell) => {
                const classes = [
                  "cal-day",
                  cell.inMonth ? "" : "out",
                  cell.rest ? "rest" : "",
                  cell.holiday ? "holiday" : "",
                  cell.today ? "today" : "",
                  selected === cell.key ? "picked" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={cell.key}
                    className={classes}
                    onClick={() => setSelected(cell.key)}
                  >
                    <span className="cal-day-num">{cell.date.getDate()}</span>
                    {cell.holiday ? (
                      <span className="cal-day-holiday">{cell.holiday}</span>
                    ) : cell.rest ? (
                      <span className="cal-day-tag">休</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="cal-legend">
              <span>
                <i className="dot rest" />
                休息
              </span>
              <span>
                <i className="dot holiday" />
                节假日
              </span>
              <span>
                <i className="dot today" />
                今天
              </span>
              <button className="cal-today-btn" onClick={goToday}>
                回到今天
              </button>
            </div>
          </section>

          {selected && selectedInfo && (
            <section className="elec-card cal-detail">
              <header className="elec-card-head">
                <h2>{formatFullDate(selected)}</h2>
                {selectedInfo.week && selectedInfo.week >= 1 ? (
                  <span>第 {selectedInfo.week} 周</span>
                ) : null}
              </header>

              {selectedMark?.holiday && (
                <p className="cal-holiday-note">
                  {selectedMark.holiday} · 放假
                </p>
              )}

              {!grid && (
                <p className="cal-empty">
                  还没有课表数据，先去「课程表」读取一次。
                </p>
              )}

              {grid &&
                selectedInfo.daySlots.length === 0 &&
                !selectedMark?.holiday && (
                  <p className="cal-empty">这天没有课</p>
                )}

              {selectedInfo.daySlots.map((slot, index) => {
                const time = periodTimes[slot.period - 1];
                const color = courseColor(slot.name);
                return (
                  <div className="cal-class" key={index}>
                    <span className="cal-class-time">
                      {time ? time[0] : `第${slot.period}节`}
                    </span>
                    <span
                      className="cal-class-mark"
                      style={{ background: color.bg }}
                    />
                    <span className="cal-class-name">{slot.name}</span>
                    {slot.place && (
                      <span className="cal-class-end">{slot.place}</span>
                    )}
                  </div>
                );
              })}

              {onOpenTimetable &&
                selectedInfo.week &&
                selectedInfo.week >= 1 && (
                  <button
                    className="cal-jump"
                    onClick={() => onOpenTimetable(selectedInfo.week!)}
                  >
                    在课程表中查看第 {selectedInfo.week} 周
                    <Icon name="arrow" size={16} />
                  </button>
                )}
            </section>
          )}

          {error && <p className="elec-error-text">{error}</p>}
        </div>
      )}
    </div>
  );
}

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatFullDate(key: string): string {
  const date = parseKey(key);
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    date.getDay()
  ];
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${weekday}`;
}
