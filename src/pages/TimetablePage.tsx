import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  courseColor,
  isActive,
  parseCellText,
  type CourseSlot,
} from "../lib/timetable";
import {
  currentWeekOf,
  formatMonthDay,
  weekEndDate,
  weekStartDate,
  weekdayIndex,
} from "../lib/semester";
import {
  clearOverride,
  readOverride,
  resolveSemester,
  saveOverride,
  toInputDate,
  validateMaxWeek,
  validateStartDate,
} from "../lib/semesterSettings";
import { markLoggedIn } from "../lib/authManager";
import {
  eveningRange,
  nextSeasonChange,
  pairTimes,
  PERIOD_COUNT,
  seasonOf,
  SEASON_LABEL,
  timesFor,
} from "../lib/periodSchedule";
import {
  CACHE_KEY,
  closeLoginWindow,
  openLoginWindow,
  readTimetable,
  waitForLogin,
  type GridResult,
} from "../lib/timetableSession";

type Phase = "idle" | "waiting" | "reading" | "ready" | "error";

interface CachedGrid extends GridResult {
  savedAt: number;
}

const WEEKDAY_SHORT = ["", "一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_FULL = [
  "",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
];

export function TimetablePage({
  onBack,
  initialWeek,
  onOpenCalendar,
  onSemesterChange,
}: {
  onBack: () => void;
  /** 从校历跳转过来时指定要看的周次 */
  initialWeek?: number;
  onOpenCalendar?: () => void;
  /** 把首周与总周数上报给外层，供校历共用 */
  onSemesterChange?: (info: { startDate?: string; maxWeek?: number }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [grid, setGrid] = useState<CachedGrid | null>(null);
  const [week, setWeek] = useState(1);
  const [hint, setHint] = useState("");
  const [selected, setSelected] = useState<CourseSlot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cancelledRef = useRef(false);
  const swipeRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    lastX: number;
    lastAt: number;
    horizontal: boolean;
  } | null>(null);
  const didSwipeRef = useRef(false);
  const sheetDidDragRef = useRef(false);
  const weekStripRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const sheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetDragRef = useRef<{
    pointerId: number;
    y: number;
    lastY: number;
    lastAt: number;
  } | null>(null);

  const closeOverlay = () => {
    if (sheetCloseTimerRef.current) clearTimeout(sheetCloseTimerRef.current);
    sheetCloseTimerRef.current = null;
    setSelected(null);
    setSettingsOpen(false);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CachedGrid;
      if (parsed?.cells?.length) {
        setGrid(parsed);
        setPhase("ready");
      }
    } catch {
      /* 缓存损坏时忽略 */
    }
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  useEffect(() => {
    document.documentElement.classList.add("tt-page-active");
    document.body.classList.add("tt-page-active");
    return () => {
      document.documentElement.classList.remove("tt-page-active");
      document.body.classList.remove("tt-page-active");
    };
  }, []);

  useEffect(() => {
    if (!selected && !settingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Back") {
        event.preventDefault();
        closeOverlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected, settingsOpen]);

  const applyResult = (result: GridResult) => {
    const cached: CachedGrid = { ...result, savedAt: Date.now() };
    setGrid(cached);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    // 教务读到了课表，说明会话可用，记入登录管理
    markLoggedIn("jw");
    const nextSlots = result.cells.flatMap((cell) =>
      parseCellText(cell.text, cell.weekday, cell.period, cell.span),
    );
    const nextMaxWeek = nextSlots.reduce(
      (max, slot) => Math.max(max, ...slot.weeks, 1),
      1,
    );
    setWeek(initialWeek ?? currentWeekOf(result.startDate, nextMaxWeek));
    setPhase("ready");
    setHint("");
  };

  const startAuto = async () => {
    setError("");
    setPhase("waiting");
    setHint("正在打开登录窗口…");
    cancelledRef.current = false;
    try {
      await openLoginWindow();
      await waitForLogin(
        (text) => setHint(text),
        () => cancelledRef.current,
      );
      setPhase("reading");
      setHint("正在读取课表…");
      applyResult(await readTimetable());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "读取失败";
      if (message === "已取消") return;
      setError(message);
      setPhase("error");
      await closeLoginWindow();
    }
  };

  const manualRead = async () => {
    setPhase("reading");
    setError("");
    setHint("正在读取课表…");
    try {
      applyResult(await readTimetable());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取失败");
      setPhase("error");
      await closeLoginWindow();
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    void closeLoginWindow();
    setPhase(grid ? "ready" : "idle");
    setHint("");
  };

  const slots: CourseSlot[] = useMemo(() => {
    if (!grid) return [];
    return grid.cells
      .flatMap((cell) =>
        parseCellText(cell.text, cell.weekday, cell.period, cell.span),
      )
      .sort((a, b) => a.weekday - b.weekday || a.period - b.period);
  }, [grid]);

  // 课表里出现过的最大周次，作为「未设置时的默认周数」
  const detectedMaxWeek = useMemo(
    () => slots.reduce((max, slot) => Math.max(max, ...slot.weeks, 1), 1),
    [slots],
  );

  // 用户可在设置里覆盖首周与周数
  const [override, setOverrideState] = useState(() => readOverride());
  const semester = useMemo(
    () => resolveSemester(grid?.startDate, detectedMaxWeek),
    [grid?.startDate, detectedMaxWeek, override],
  );
  const maxWeek = semester.maxWeek || detectedMaxWeek;

  // 设置面板里的编辑草稿
  const [draftStart, setDraftStart] = useState("");
  const [draftWeek, setDraftWeek] = useState("");
  const [draftError, setDraftError] = useState("");

  const periodTimes = useMemo(
    () => timesFor(new Date(), pairTimes(grid?.times)),
    [grid?.times],
  );

  const today = useMemo(() => new Date(), []);
  const todayIndex = weekdayIndex(today);
  const season = seasonOf(today);
  const seasonSwitch = nextSeasonChange(today);

  const nowWeek = currentWeekOf(
    semester.firstStart ? toInputDate(semester.firstStart) : undefined,
    maxWeek,
    today,
  );

  // 默认定位到当前周；从校历跳转过来时用指定周次
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || initialisedRef.current) return;
    initialisedRef.current = true;
    setWeek(initialWeek ?? nowWeek);
  }, [phase, nowWeek, initialWeek]);

  const activeSlots = useMemo(
    () => slots.filter((slot) => isActive(slot, week)),
    [slots, week],
  );

  const maxPeriod = useMemo(() => {
    const used = activeSlots.reduce(
      (max, slot) => Math.max(max, slot.period + slot.span - 1),
      0,
    );
    return Math.max(used, PERIOD_COUNT);
  }, [activeSlots]);

  const showWeekend = useMemo(
    () => activeSlots.some((slot) => slot.weekday >= 6),
    [activeSlots],
  );

  const days = showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];

  const startKey = semester.firstStart
    ? toInputDate(semester.firstStart)
    : undefined;
  const monday = weekStartDate(startKey, week);
  const sunday = weekEndDate(startKey, week);
  const semesterStart = semester.firstStart;
  const isThisWeek = week === nowWeek;

  // 把生效的首周与总周数同步给外层，校历据此对齐
  useEffect(() => {
    if (phase !== "ready") return;
    onSemesterChange?.({ startDate: startKey, maxWeek });
  }, [phase, startKey, maxWeek, onSemesterChange]);

  // 打开设置时把当前生效值填入草稿
  const openSettings = () => {
    setDraftStart(startKey ?? "");
    setDraftWeek(String(maxWeek));
    setDraftError("");
    setSettingsOpen(true);
  };

  const applyDraft = () => {
    const startError = validateStartDate(draftStart);
    if (startError) {
      setDraftError(startError);
      return;
    }
    const weekNumber = Number.parseInt(draftWeek, 10);
    const weekError = validateMaxWeek(weekNumber);
    if (weekError) {
      setDraftError(weekError);
      return;
    }

    saveOverride({ startDate: draftStart || undefined, maxWeek: weekNumber });
    const next = readOverride();
    setOverrideState(next);
    setDraftError("");
    setSettingsOpen(false);

    // 改了首周后，周次可能落到范围外，夹一下
    const clampedWeek = Math.min(weekNumber, Math.max(1, week));
    setWeek(clampedWeek);
  };

  const resetDraft = () => {
    clearOverride();
    setOverrideState({});
    setDraftStart(grid?.startDate ?? "");
    setDraftWeek(String(detectedMaxWeek));
    setDraftError("");
  };

  const goWeek = (delta: number) => {
    setWeek((value) => Math.min(maxWeek, Math.max(1, value + delta)));
  };

  useEffect(() => {
    const strip = weekStripRef.current;
    const active = strip?.querySelector<HTMLElement>(
      ".tt-weekstrip-item.active",
    );
    if (!strip || !active) return;
    const left =
      active.offsetLeft - (strip.clientWidth - active.clientWidth) / 2;
    strip.scrollTo({
      left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [week]);

  // Preserve vertical page scrolling while recognizing a deliberate horizontal swipe.
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      horizontal: false,
    };
    didSwipeRef.current = false;
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const gesture = swipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (
      !gesture.horizontal &&
      Math.abs(dx) > 10 &&
      Math.abs(dx) > Math.abs(dy) * 1.2
    ) {
      gesture.horizontal = true;
      didSwipeRef.current = true;
    }
    if (gesture.horizontal) event.preventDefault();
    gesture.lastX = event.clientX;
    gesture.lastAt = event.timeStamp;
  };
  const finishSwipe = (event: React.PointerEvent, cancelled = false) => {
    const gesture = swipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    if (cancelled || !gesture.horizontal) return;
    const dx = event.clientX - gesture.x;
    const elapsed = Math.max(1, event.timeStamp - gesture.lastAt);
    const velocity = (event.clientX - gesture.lastX) / elapsed;
    if (Math.abs(dx) > 48 || Math.abs(velocity) > 0.45) {
      goWeek(dx < 0 || velocity < -0.45 ? 1 : -1);
    }
  };

  const onSheetPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (sheetCloseTimerRef.current) clearTimeout(sheetCloseTimerRef.current);
    sheetCloseTimerRef.current = null;
    sheetRef.current?.style.setProperty("transition", "none");
    sheetRef.current?.style.removeProperty("--tt-sheet-drag");
    sheetDidDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetDragRef.current = {
      pointerId: event.pointerId,
      y: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
    };
  };
  const onSheetPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = sheetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || event.clientY < drag.y)
      return;
    event.preventDefault();
    if (event.clientY - drag.y > 8) sheetDidDragRef.current = true;
    sheetRef.current?.style.setProperty(
      "--tt-sheet-drag",
      `${event.clientY - drag.y}px`,
    );
    drag.lastY = event.clientY;
    drag.lastAt = event.timeStamp;
  };
  const finishSheetDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const drag = sheetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    sheetDragRef.current = null;
    const distance = Math.max(0, event.clientY - drag.y);
    const velocity =
      (event.clientY - drag.lastY) / Math.max(1, event.timeStamp - drag.lastAt);
    const sheet = sheetRef.current;
    if (!cancelled && (distance > 96 || velocity > 0.55) && sheet) {
      sheet.style.setProperty(
        "transition",
        "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      );
      sheet.style.setProperty(
        "--tt-sheet-drag",
        `${sheet.offsetHeight + 24}px`,
      );
      sheetCloseTimerRef.current = setTimeout(closeOverlay, 185);
      return;
    }
    if (sheet) {
      sheet.style.setProperty(
        "transition",
        "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      );
      requestAnimationFrame(() =>
        sheet.style.removeProperty("--tt-sheet-drag"),
      );
    }
  };
  const onSheetHandleClick = (close: () => void) => {
    if (sheetDidDragRef.current) {
      sheetDidDragRef.current = false;
      return;
    }
    close();
  };

  const template = `46px repeat(${days.length}, minmax(0, 1fr))`;

  const displayDate = isThisWeek ? today : monday;
  const dateTitle = displayDate
    ? `${displayDate.getFullYear()}/${String(displayDate.getMonth() + 1).padStart(2, "0")}/${String(
        displayDate.getDate(),
      ).padStart(2, "0")}`
    : "课程安排";

  return (
    <div className="page feature-page tt-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={19} />
        返回
      </button>

      {phase !== "ready" && (
        <>
          <section className="feature-intro">
            <span className="feature-hero-icon service-icon-academic">
              <Icon name="calendar" size={30} />
            </span>
            <p className="eyebrow">学习服务</p>
            <h1>课程表</h1>
            <p>登录教务系统后自动读取本学期课表。</p>
          </section>

          <section className="elec-card elec-setup">
            <h2>
              {phase === "waiting" || phase === "reading"
                ? "正在连接"
                : "读取课表"}
            </h2>
            <p className="elec-desc">
              点「开始」会打开学校教务的登录页，用学号和密码登录即可（需要输入验证码）。
              登录后会自动跳到课表并读取，无需其他操作。
            </p>

            {phase === "waiting" || phase === "reading" ? (
              <div className="tt-progress">
                <span className="tt-spinner" aria-hidden="true" />
                <span>{hint || "处理中…"}</span>
              </div>
            ) : (
              <div className="tt-steps">
                <span>
                  <b>1</b> 点「开始」并登录
                </span>
                <span>
                  <b>2</b> 自动打开课表
                </span>
                <span>
                  <b>3</b> 自动读取完成
                </span>
              </div>
            )}

            <div className="elec-actions">
              <button
                className="elec-primary"
                onClick={() => void startAuto()}
                disabled={phase === "waiting" || phase === "reading"}
              >
                开始
              </button>
              {phase === "waiting" || phase === "reading" ? (
                <button className="elec-ghost" onClick={cancel}>
                  取消
                </button>
              ) : (
                <button
                  className="elec-ghost"
                  onClick={() => void manualRead()}
                >
                  手动读取
                </button>
              )}
            </div>
            {error && <p className="elec-error-text">{error}</p>}
          </section>
        </>
      )}

      {phase === "ready" && grid && (
        <div className="tt-view">
          <header className="tt-topbar tt-topbar-light">
            <div className="tt-date-block">
              <p className="tt-date-title">{dateTitle}</p>
              <p className="tt-date-subtitle">
                第 {week} 周 <span>·</span>{" "}
                {isThisWeek ? `周${WEEKDAY_SHORT[todayIndex]}` : "课表周视图"}
              </p>
            </div>
            <div className="tt-toolbar">
              <button
                className="tt-icon-button"
                onClick={openSettings}
                aria-label="课表设置"
              >
                <Icon name="settings" size={19} />
              </button>
            </div>
          </header>

          <div
            className="tt-weekstrip"
            aria-label="选择周次"
            ref={weekStripRef}
          >
            {Array.from({ length: maxWeek }, (_, index) => index + 1).map(
              (value) => (
                <button
                  key={value}
                  className={`tt-weekstrip-item${value === week ? " active" : ""}${
                    value === nowWeek ? " now" : ""
                  }`}
                  onClick={() => setWeek(value)}
                >
                  {value}
                </button>
              ),
            )}
          </div>

          <div
            className="tt-calendar tt-calendar-swipe"
            style={{
              ["--tt-template" as string]: template,
              ["--tt-rows" as string]: `30px repeat(${maxPeriod}, minmax(46px, auto))`,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishSwipe}
            onPointerCancel={(event) => finishSwipe(event, true)}
          >
            <div className="tt-corner" />
            {days.map((day) => {
              const date = monday
                ? new Date(monday.getTime() + (day - 1) * 24 * 60 * 60 * 1000)
                : null;
              const isToday = isThisWeek && day === todayIndex;
              return (
                <div
                  className={`tt-dayhead${isToday ? " today" : ""}`}
                  key={`h-${day}`}
                >
                  <span className="tt-dayname">{WEEKDAY_SHORT[day]}</span>
                  <span className="tt-daydate">
                    {date ? formatMonthDay(date) : ""}
                  </span>
                </div>
              );
            })}

            {isThisWeek && (
              <div
                className="tt-today-col"
                style={{
                  gridColumn: todayIndex + 1,
                  gridRow: `2 / span ${maxPeriod}`,
                }}
              />
            )}

            {Array.from({ length: maxPeriod }, (_, index) => index + 1).map(
              (period) => {
                const time = periodTimes[period - 1];
                return (
                  <div
                    className="tt-timecell"
                    key={`t-${period}`}
                    style={{ gridRow: period + 1 }}
                  >
                    <b>{period}</b>
                    {time && (
                      <>
                        <em>{time[0]}</em>
                        <em>{time[1]}</em>
                      </>
                    )}
                  </div>
                );
              },
            )}

            {days.map((day) =>
              Array.from({ length: maxPeriod }, (_, index) => index + 1).map(
                (period) => (
                  <div
                    className="tt-gridcell"
                    key={`g-${day}-${period}`}
                    style={{ gridColumn: day + 1, gridRow: period + 1 }}
                  />
                ),
              ),
            )}

            {activeSlots.map((slot, index) => {
              const color = courseColor(slot.name);
              return (
                <button
                  type="button"
                  className="tt-course"
                  key={`c-${slot.weekday}-${slot.period}-${index}`}
                  style={{
                    gridColumn: slot.weekday + 1,
                    gridRow: `${slot.period + 1} / span ${Math.max(1, slot.span)}`,
                    background: color.bg,
                    color: color.fg,
                  }}
                  onClick={() => {
                    if (didSwipeRef.current) {
                      didSwipeRef.current = false;
                      return;
                    }
                    setSelected(slot);
                  }}
                >
                  <span className="tt-course-name">{slot.name}</span>
                  {slot.place && (
                    <span className="tt-course-place">@ {slot.place}</span>
                  )}
                  {slot.teacher && (
                    <span className="tt-course-teacher">{slot.teacher}</span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="tt-swipe-hint">左右滑动切换周次 · 点击课程查看详情</p>

          {settingsOpen && (
            <div
              className="tt-settings-mask"
              onClick={() => setSettingsOpen(false)}
            >
              <section
                className="tt-settings"
                ref={(node) => {
                  sheetRef.current = node;
                }}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tt-settings-title"
              >
                <button
                  className="tt-sheet-handle"
                  type="button"
                  aria-label="下滑关闭设置"
                  onClick={() =>
                    onSheetHandleClick(() => setSettingsOpen(false))
                  }
                  onPointerDown={onSheetPointerDown}
                  onPointerMove={onSheetPointerMove}
                  onPointerUp={finishSheetDrag}
                  onPointerCancel={(event) => finishSheetDrag(event, true)}
                >
                  <span />
                </button>
                <header className="tt-settings-head">
                  <div>
                    <p className="eyebrow">课程表</p>
                    <h2 id="tt-settings-title">课表设置</h2>
                  </div>
                  <button
                    className="tt-icon-button tt-icon-button-muted"
                    onClick={() => setSettingsOpen(false)}
                    aria-label="关闭设置"
                  >
                    <Icon name="close" size={20} />
                  </button>
                </header>

                <div className="tt-setting-group">
                  <button
                    className="tt-setting-row"
                    onClick={() => {
                      setWeek(nowWeek);
                      setSettingsOpen(false);
                    }}
                  >
                    <span>
                      <b>回到本周</b>
                      <small>快速跳转到当前日期所在周</small>
                    </span>
                    <span className="tt-setting-value">第 {nowWeek} 周</span>
                  </button>
                  {onOpenCalendar && (
                    <button
                      className="tt-setting-row"
                      onClick={() => {
                        setSettingsOpen(false);
                        onOpenCalendar();
                      }}
                    >
                      <span>
                        <b>查看校历</b>
                        <small>按月查看休息日与每日课程</small>
                      </span>
                      <Icon name="arrow" size={18} />
                    </button>
                  )}
                  <button
                    className="tt-setting-row"
                    onClick={() => {
                      setSettingsOpen(false);
                      setPhase("idle");
                    }}
                  >
                    <span>
                      <b>重新读取课表</b>
                      <small>登录教务系统获取最新课程</small>
                    </span>
                    <Icon name="refresh" size={18} />
                  </button>
                </div>

                <div className="tt-setting-meta">
                  <div>
                    <span>学期</span>
                    <b>{grid.semesterLabel || "本学期"}</b>
                  </div>
                  <div>
                    <span>作息</span>
                    <b>
                      {SEASON_LABEL[season]}
                      <em>
                        {formatMonthDay(seasonSwitch.date)} 起转
                        {SEASON_LABEL[seasonSwitch.season]}
                      </em>
                    </b>
                  </div>
                </div>

                <div className="tt-setting-form">
                  <h3>学期设置</h3>
                  <p className="tt-setting-tip">
                    自动读到的值可能不准，可以在这里自己定。改完后课表与校历会一起跟着变。
                  </p>

                  <label className="tt-field">
                    <span>首周日期</span>
                    <input
                      type="date"
                      value={draftStart}
                      onChange={(event) => setDraftStart(event.target.value)}
                    />
                  </label>

                  <label className="tt-field">
                    <span>总周数</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={draftWeek}
                      onChange={(event) => setDraftWeek(event.target.value)}
                    />
                  </label>

                  <div className="tt-setting-note">
                    <span className="tt-setting-dot" />
                    <span>
                      {semester.overridden
                        ? "当前使用你设置的值"
                        : "当前使用自动读取的值"}
                      {semesterStart &&
                        ` · 首周 ${formatMonthDay(semesterStart)}`}
                      {` · ${maxWeek} 周`}
                    </span>
                  </div>

                  {draftError && (
                    <p className="elec-error-text">{draftError}</p>
                  )}

                  <div className="tt-form-actions">
                    <button className="elec-primary" onClick={applyDraft}>
                      保存
                    </button>
                    <button className="elec-ghost" onClick={resetDraft}>
                      恢复自动
                    </button>
                  </div>
                </div>

                <div className="tt-setting-note">
                  <span className="tt-setting-dot" />
                  <span>
                    {monday && sunday
                      ? `第 ${week} 周：${formatMonthDay(monday)} – ${formatMonthDay(sunday)}`
                      : `共 ${maxWeek} 周`}
                    {" · 晚上 " + eveningRange(season)}
                  </span>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="tt-sheet-mask" onClick={closeOverlay}>
          <div
            className="tt-sheet"
            ref={(node) => {
              sheetRef.current = node;
            }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tt-course-title"
          >
            <button
              className="tt-sheet-handle"
              type="button"
              aria-label="下滑关闭课程详情"
              onClick={() => onSheetHandleClick(() => setSelected(null))}
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={finishSheetDrag}
              onPointerCancel={(event) => finishSheetDrag(event, true)}
            >
              <span style={{ background: courseColor(selected.name).bg }} />
            </button>
            <h2 id="tt-course-title">{selected.name}</h2>
            <dl className="tt-detail">
              <div>
                <dt>教师</dt>
                <dd>{selected.teacher || "—"}</dd>
              </div>
              <div>
                <dt>地点</dt>
                <dd>{selected.place || "—"}</dd>
              </div>
              <div>
                <dt>时间</dt>
                <dd>
                  {WEEKDAY_FULL[selected.weekday]} 第 {selected.period}
                  {selected.span > 1
                    ? `–${selected.period + selected.span - 1}`
                    : ""}{" "}
                  节{selected.timeRange ? `（${selected.timeRange}）` : ""}
                </dd>
              </div>
              <div>
                <dt>周次</dt>
                <dd>{formatWeeks(selected.weeks)}</dd>
              </div>
              {selected.section && (
                <div>
                  <dt>课序号</dt>
                  <dd>{selected.section}</dd>
                </div>
              )}
            </dl>
            <button className="elec-primary" onClick={() => setSelected(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 把周次数组压成 `1–16` 或 `1,3,5–7` 这种紧凑写法。 */
function formatWeeks(weeks: number[]): string {
  if (!weeks.length) return "每周";
  const parts: string[] = [];
  let start = weeks[0];
  let previous = weeks[0];
  for (let index = 1; index <= weeks.length; index += 1) {
    const current = weeks[index];
    if (current !== previous + 1) {
      parts.push(start === previous ? `${start}` : `${start}–${previous}`);
      start = current;
    }
    previous = current;
  }
  return `${parts.join("、")} 周`;
}
