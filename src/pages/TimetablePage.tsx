import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "../components/Icon";
import { DatePicker, Popup, Stepper } from "antd-mobile";
import {
  courseColor,
  isActive,
  parseCellText,
  type CourseSlot,
} from "../lib/timetable";
import {
  currentWeekOf,
  formatMonthDay,
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
  readTimetable,
  takeMobileTimetableResult,
  type GridResult,
} from "../lib/timetableSession";
import { rememberReturnTo } from "../lib/classroom";

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
  onNeedLogin,
}: {
  onBack: () => void;
  /** 从校历跳转过来时指定要看的周次 */
  initialWeek?: number;
  onOpenCalendar?: () => void;
  /** 把首周与总周数上报给外层，供校历共用 */
  onSemesterChange?: (info: { startDate?: string; maxWeek?: number }) => void;
  /** 未登录时跳到登录管理页 */
  onNeedLogin: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [grid, setGrid] = useState<CachedGrid | null>(null);
  const [week, setWeek] = useState(1);
  const [hint, setHint] = useState("");
  const [selected, setSelected] = useState<CourseSlot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [weekStripReady, setWeekStripReady] = useState(false);
  const [weekTransitionDirection, setWeekTransitionDirection] = useState(0);
  const drawerTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.75 };
  const cancelledRef = useRef(false);
  const swipeRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    startedAt: number;
    horizontal: boolean;
  } | null>(null);
  const didSwipeRef = useRef(false);
  const weekStripRef = useRef<HTMLDivElement>(null);

  const closeOverlay = () => {
    setSelected(null);
    setSettingsOpen(false);
    setDatePickerOpen(false);
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

  // Android 登录回跳时，原生主 WebView 已在教务页面完成读取，并把结果暂存。
  useEffect(() => {
    try {
      const result = takeMobileTimetableResult();
      if (result) applyResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取课表失败");
      setPhase("error");
    }
    // 回跳数据只消费一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 登录统一在「登录管理」里完成；这里只做读取。
  // 桌面端由管理页开窗口登录后，回到本页点「读取课表」即可。
  const startAuto = () => {
    rememberReturnTo("schedule");
    onNeedLogin();
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
    setWeekStripReady(true);
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
    setWeek((value) => {
      const next = Math.min(maxWeek, Math.max(1, value + delta));
      if (next !== value) setWeekTransitionDirection(next > value ? 1 : -1);
      return next;
    });
  };

  const lastPositionedWeekRef = useRef<number | null>(null);
  useEffect(() => {
    if (!weekStripReady) return;
    const strip = weekStripRef.current;
    const active = strip?.querySelector<HTMLElement>(
      ".tt-weekstrip-item.active",
    );
    if (!strip || !active) return;
    if (lastPositionedWeekRef.current === week) return;
    const firstPosition = lastPositionedWeekRef.current === null;
    lastPositionedWeekRef.current = week;
    const left =
      active.offsetLeft - (strip.clientWidth - active.clientWidth) / 2;
    strip.scrollTo({
      left,
      behavior:
        firstPosition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  }, [week, weekStripReady]);

  // Preserve vertical page scrolling while recognizing a deliberate horizontal swipe.
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    swipeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: event.timeStamp,
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
  };
  const finishSwipe = (event: React.PointerEvent, cancelled = false) => {
    const gesture = swipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (cancelled || !gesture.horizontal) return;
    const dx = event.clientX - gesture.x;
    const elapsed = Math.max(1, event.timeStamp - gesture.startedAt);
    const velocity = dx / elapsed;
    const isFlick = Math.abs(dx) > 18 && Math.abs(velocity) > 0.55;
    if (Math.abs(dx) > 48 || isFlick) {
      goWeek(dx < 0 || velocity < -0.45 ? 1 : -1);
    }
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
            <h2>{phase === "reading" ? "正在读取" : "需要先连接教务系统"}</h2>
            <p className="elec-desc">
              教务系统的登录要输入图形验证码，统一在「登录管理」里完成。
              连接好之后回到这里，课表会自动读取。
            </p>

            {phase === "reading" ? (
              <div className="tt-progress">
                <span className="tt-spinner" aria-hidden="true" />
                <span>{hint || "处理中…"}</span>
              </div>
            ) : (
              <div className="tt-steps">
                <span>
                  <b>1</b> 去「登录管理」连接教务系统
                </span>
                <span>
                  <b>2</b> 登录并进入课表页
                </span>
                <span>
                  <b>3</b> 回到这里读取
                </span>
              </div>
            )}

            <div className="elec-actions">
              <button className="elec-primary" onClick={startAuto}>
                去登录
              </button>
              <button
                className="elec-ghost"
                onClick={() => void manualRead()}
                disabled={phase === "reading"}
              >
                手动读取
              </button>
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
                  onClick={() => {
                    if (value !== week) {
                      setWeekTransitionDirection(value > week ? 1 : -1);
                      setWeek(value);
                    }
                  }}
                >
                  {value}
                </button>
              ),
            )}
          </div>

          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={week}
              className="tt-calendar-stage"
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, x: weekTransitionDirection >= 0 ? 26 : -26 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={
                reduceMotion
                  ? undefined
                  : {
                      opacity: 0,
                      x: weekTransitionDirection >= 0 ? -26 : 26,
                    }
              }
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
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
                    ? new Date(
                        monday.getTime() + (day - 1) * 24 * 60 * 60 * 1000,
                      )
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
                  Array.from(
                    { length: maxPeriod },
                    (_, index) => index + 1,
                  ).map((period) => (
                    <div
                      className="tt-gridcell"
                      key={`g-${day}-${period}`}
                      style={{ gridColumn: day + 1, gridRow: period + 1 }}
                    />
                  )),
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
                        <span className="tt-course-teacher">
                          {slot.teacher}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          <p className="tt-swipe-hint">左右滑动切换周次 · 点击课程查看详情</p>

          {settingsOpen && (
            <Popup
              visible={settingsOpen}
              position="bottom"
              destroyOnClose={false}
              onMaskClick={() => setSettingsOpen(false)}
              onClose={() => setSettingsOpen(false)}
              bodyStyle={{
                borderRadius: "25px 25px 0 0",
                maxHeight: "calc(100dvh - env(safe-area-inset-top) - 8px)",
                overflowY: "auto",
                overscrollBehavior: "contain",
              }}
            >
              <motion.section
                className="tt-settings"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tt-settings-title"
                initial={reduceMotion ? false : { y: "7%", opacity: 0.7 }}
                animate={{ y: 0, opacity: 1 }}
                transition={drawerTransition}
              >
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
                    <button
                      type="button"
                      className="tt-date-picker-trigger"
                      onClick={() => setDatePickerOpen(true)}
                    >
                      {draftStart || "选择日期"}
                    </button>
                  </label>

                  <label className="tt-field">
                    <span>总周数</span>
                    <Stepper
                      min={1}
                      max={30}
                      value={Number(draftWeek) || 1}
                      onChange={(value) => setDraftWeek(String(value ?? 1))}
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
              </motion.section>
            </Popup>
          )}
        </div>
      )}

      {selected && (
        <Popup
          visible
          position="bottom"
          destroyOnClose={false}
          onMaskClick={() => setSelected(null)}
          onClose={() => setSelected(null)}
          bodyStyle={{
            borderRadius: "22px 22px 0 0",
            maxHeight: "min(82dvh, 720px)",
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          <motion.div
            className="tt-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tt-course-title"
            initial={reduceMotion ? false : { y: "10%", opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            transition={drawerTransition}
          >
            <div className="tt-popup-handle" aria-hidden="true">
              <span style={{ background: courseColor(selected.name).bg }} />
            </div>
            <div className="tt-course-title-row">
              <span
                className="tt-course-title-icon"
                style={{ background: courseColor(selected.name).bg }}
              >
                <Icon name="book" size={20} />
              </span>
              <div>
                <p className="tt-sheet-kicker">课程详情</p>
                <h2 id="tt-course-title">{selected.name}</h2>
              </div>
            </div>
            <div className="tt-course-summary">
              <span>
                <Icon name="calendar" size={14} />
                {WEEKDAY_FULL[selected.weekday]}
              </span>
              <span>
                <Icon name="clock" size={14} />第 {selected.period}
                {selected.span > 1
                  ? `–${selected.period + selected.span - 1}`
                  : ""}{" "}
                节
              </span>
            </div>
            <dl className="tt-detail">
              <div>
                <dt>
                  <span className="tt-detail-icon">
                    <Icon name="person" size={16} />
                  </span>
                  <span>教师</span>
                </dt>
                <dd>{selected.teacher || "—"}</dd>
              </div>
              <div>
                <dt>
                  <span className="tt-detail-icon">
                    <Icon name="location" size={16} />
                  </span>
                  <span>地点</span>
                </dt>
                <dd>{selected.place || "—"}</dd>
              </div>
              <div>
                <dt>
                  <span className="tt-detail-icon">
                    <Icon name="clock" size={16} />
                  </span>
                  <span>时间</span>
                </dt>
                <dd>
                  {WEEKDAY_FULL[selected.weekday]} 第 {selected.period}
                  {selected.span > 1
                    ? `–${selected.period + selected.span - 1}`
                    : ""}{" "}
                  节{selected.timeRange ? `（${selected.timeRange}）` : ""}
                </dd>
              </div>
              <div>
                <dt>
                  <span className="tt-detail-icon">
                    <Icon name="calendar" size={16} />
                  </span>
                  <span>周次</span>
                </dt>
                <dd>{formatWeeks(selected.weeks)}</dd>
              </div>
              {selected.section && (
                <div>
                  <dt>
                    <span className="tt-detail-icon">
                      <Icon name="hash" size={16} />
                    </span>
                    <span>课序号</span>
                  </dt>
                  <dd>{selected.section}</dd>
                </div>
              )}
            </dl>
            <button className="elec-primary" onClick={() => setSelected(null)}>
              关闭
            </button>
          </motion.div>
        </Popup>
      )}

      <DatePicker
        visible={datePickerOpen}
        getContainer={() => document.body}
        value={draftStart ? new Date(`${draftStart}T00:00:00`) : undefined}
        min={new Date(2000, 0, 1)}
        max={new Date(2100, 11, 31)}
        onClose={() => setDatePickerOpen(false)}
        onConfirm={(date) => {
          setDraftStart(toInputDate(date));
          setDatePickerOpen(false);
        }}
      />
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
