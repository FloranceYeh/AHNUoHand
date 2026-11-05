import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Picker, Selector } from "antd-mobile";
import {
  CAMPUSES,
  clearToken,
  formatPeriods,
  getToken,
  loadBuildings,
  loadCurrentTerm,
  loadWeekdays,
  loadWeeks,
  queryEmptyRooms,
  rememberReturnTo,
  type Building,
  type CurrentTerm,
  type DictItem,
  type EmptyRoom,
} from "../lib/classroom";

type Phase = "login" | "loading" | "ready" | "error";

export function ClassroomPage({
  onBack,
  onNeedLogin,
}: {
  onBack: () => void;
  /** 未登录时跳到登录管理页 */
  onNeedLogin: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(() =>
    getToken() ? "loading" : "login",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [term, setTerm] = useState<CurrentTerm | null>(null);
  const [weekdays, setWeekdays] = useState<DictItem[]>([]);
  const [weekList, setWeekList] = useState<DictItem[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);

  const [campus, setCampus] = useState<string>(CAMPUSES[0].name);
  const [buildingCode, setBuildingCode] = useState("");
  const [week, setWeek] = useState("");
  const [weekday, setWeekday] = useState("");
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [weekdayPickerOpen, setWeekdayPickerOpen] = useState(false);
  const [rooms, setRooms] = useState<EmptyRoom[]>([]);
  const [queried, setQueried] = useState(false);
  const [keyword, setKeyword] = useState("");

  const campusCode = useMemo(
    () => CAMPUSES.find((item) => item.name === campus)?.code ?? "1",
    [campus],
  );

  /** 空闲节次的展示范围：以数据里出现过的最大节次为准，至少 12 节。 */
  const maxPeriod = useMemo(() => {
    const highest = rooms.reduce(
      (max, room) => Math.max(max, ...room.freePeriods, 0),
      0,
    );
    return Math.max(12, highest);
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    const list = key
      ? rooms.filter(
          (room) =>
            room.name.toLowerCase().includes(key) ||
            room.building.toLowerCase().includes(key),
        )
      : rooms;
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true }),
    );
  }, [rooms, keyword]);

  const bootstrap = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const [current, days, weeks] = await Promise.all([
        loadCurrentTerm(),
        loadWeekdays(),
        loadWeeks(),
      ]);
      setTerm(current);
      setWeekdays(days);
      setWeekList(weeks.filter((item) => Number(item.value) <= 30));
      setWeekday(current.weekday || days[0]?.value || "");
      setWeek(current.week || "1");
      setPhase("ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "加载失败";
      setError(message);
      if (message.includes("登录")) setPhase("login");
      else setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (getToken()) void bootstrap();
  }, [bootstrap]);

  const loadBuildingList = useCallback(async (campusName: string) => {
    try {
      const list = await loadBuildings(campusName);
      setBuildings(list);
      setBuildingCode(list[0]?.code ?? "");
    } catch {
      setBuildings([]);
      setBuildingCode("");
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    void loadBuildingList(campus);
    setRooms([]);
    setQueried(false);
  }, [phase, campus, loadBuildingList]);

  // 登录统一在「登录管理」里进行，这里只负责跳过去
  const doLogin = () => {
    rememberReturnTo("classroom");
    onNeedLogin();
  };

  const doQuery = async () => {
    if (!buildingCode || !week || !weekday) {
      setError("请先选择楼栋、周次和星期");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await queryEmptyRooms({
        week,
        weekday,
        campusCode,
        buildingCode,
      });
      setRooms(result);
      setQueried(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "查询失败";
      setError(message);
      if (message.includes("登录")) {
        clearToken();
        setPhase("login");
      }
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    clearToken();
    setRooms([]);
    setQueried(false);
    setPhase("login");
  };

  return (
    <div className="page feature-page classroom-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={19} />
        返回
      </button>

      <section className="feature-intro">
        <span className="feature-hero-icon service-icon-academic">
          <Icon name="school" size={30} />
        </span>
        <p className="eyebrow">学习服务</p>
        <h1>空教室</h1>
        <p>按校区、楼栋和周次查询空闲教室，数据来自学校一站式服务大厅。</p>
      </section>

      {phase === "login" && (
        <section className="elec-card elec-setup">
          <h2>需要先连接一站式服务大厅</h2>
          <p className="elec-desc">
            空教室数据需要学校账号授权。登录统一在「登录管理」里完成，连接后这里会自动恢复。
          </p>
          <button className="elec-primary" onClick={doLogin}>
            去登录
          </button>
          {error && <p className="elec-error-text">{error}</p>}
        </section>
      )}

      {phase === "loading" && (
        <section className="elec-card elec-skeleton" aria-busy="true">
          <span className="elec-skeleton-line wide" />
          <span className="elec-skeleton-line" />
          <span className="elec-skeleton-line narrow" />
        </section>
      )}

      {phase === "error" && (
        <section className="elec-card elec-error">
          <span className="placeholder-symbol">
            <Icon name="clock" size={24} />
          </span>
          <strong>没能加载</strong>
          <p>{error}</p>
          <div className="elec-actions">
            <button className="elec-primary" onClick={() => void bootstrap()}>
              重试
            </button>
            <button className="elec-ghost" onClick={signOut}>
              重新登录
            </button>
          </div>
        </section>
      )}

      {phase === "ready" && (
        <div className="cls-report">
          <section className="elec-card">
            <header className="elec-card-head">
              <h2>查询条件</h2>
              <span>
                {term?.year} 学年 第{term?.term}学期
              </span>
            </header>

            <div className="cls-field">
              <label>校区</label>
              <Selector
                className="cls-selector"
                options={CAMPUSES.map((item) => ({ label: item.name, value: item.name }))}
                value={[campus]}
                onChange={(values) => values[0] && setCampus(String(values[0]))}
                showCheckMark={false}
              />
            </div>

            <div className="cls-field">
              <label>楼栋</label>
              {buildings.length ? (
                <Selector
                  className="cls-selector cls-building-selector"
                  options={buildings.map((item) => ({ label: item.name, value: item.code }))}
                  value={[buildingCode]}
                  onChange={(values) => values[0] && setBuildingCode(String(values[0]))}
                  showCheckMark={false}
                />
              ) : (
                <span className="elec-empty">该校区暂无楼栋数据</span>
              )}
            </div>

            <div className="cls-row">
              <div className="cls-field grow">
                <label>周次</label>
                <button
                  type="button"
                  className="cls-picker-trigger"
                  onClick={() => setWeekPickerOpen(true)}
                  disabled={!weekList.length}
                >
                  {weekList.find((item) => item.value === week)?.text || "选择周次"}
                  <Icon name="arrow" size={15} />
                </button>
                <Picker
                  columns={[weekList.map((item) => ({ label: item.text, value: item.value }))]}
                  visible={weekPickerOpen}
                  value={[week]}
                  onClose={() => setWeekPickerOpen(false)}
                  onConfirm={(values) => setWeek(String(values[0] ?? week))}
                />
              </div>
              <div className="cls-field grow">
                <label>星期</label>
                <button
                  type="button"
                  className="cls-picker-trigger"
                  onClick={() => setWeekdayPickerOpen(true)}
                  disabled={!weekdays.length}
                >
                  {weekdays.find((item) => item.value === weekday)?.text || "选择星期"}
                  <Icon name="arrow" size={15} />
                </button>
                <Picker
                  columns={[weekdays.map((item) => ({ label: item.text, value: item.value }))]}
                  visible={weekdayPickerOpen}
                  value={[weekday]}
                  onClose={() => setWeekdayPickerOpen(false)}
                  onConfirm={(values) => setWeekday(String(values[0] ?? weekday))}
                />
              </div>
            </div>

            {error && <p className="elec-error-text">{error}</p>}

            <button
              className="elec-primary"
              onClick={() => void doQuery()}
              disabled={busy}
            >
              {busy ? "查询中…" : "查询空教室"}
            </button>
          </section>

          {queried && (
            <section className="elec-card">
              <header className="elec-card-head">
                <h2>空闲教室</h2>
                <span>
                  {keyword
                    ? `${visibleRooms.length} / ${rooms.length} 间`
                    : `共 ${rooms.length} 间`}
                </span>
              </header>

              {rooms.length > 0 && (
                <>
                  <div className="cls-search">
                    <span className="cls-search-icon" aria-hidden="true">
                      ⌕
                    </span>
                    <input
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="搜索教室号，例如 1510"
                      aria-label="搜索教室"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {keyword && (
                      <button
                        className="cls-search-clear"
                        onClick={() => setKeyword("")}
                        aria-label="清除搜索"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="cls-legend">
                    <span className="cls-legend-item">
                      <i className="cls-cell on" />
                      空闲
                    </span>
                    <span className="cls-legend-item">
                      <i className="cls-cell" />
                      有课
                    </span>
                    <span className="cls-legend-hint">
                      色条依次对应第 1–{maxPeriod} 节
                    </span>
                  </div>
                </>
              )}

              {rooms.length === 0 ? (
                <p className="elec-empty">这个时段没有空闲教室</p>
              ) : visibleRooms.length === 0 ? (
                <p className="elec-empty">没有匹配「{keyword}」的教室</p>
              ) : (
                <div className="cls-grid">
                  {visibleRooms.map((room) => {
                    const allDay = room.freePeriods.length >= maxPeriod;
                    return (
                      <article
                        className="cls-card"
                        key={`${room.building}-${room.name}`}
                      >
                        <div className="cls-card-top">
                          <span className="cls-card-name">{room.name}</span>
                          {allDay && <span className="cls-badge">全天</span>}
                        </div>
                        <div className="cls-track">
                          {Array.from({ length: maxPeriod }, (_, index) => {
                            const period = index + 1;
                            const free = room.freePeriods.includes(period);
                            return (
                              <span
                                className={`cls-cell${free ? " on" : ""}`}
                                key={period}
                                title={`第${period}节  ${free ? "空闲" : "有课"}`}
                              />
                            );
                          })}
                        </div>
                        <p className="cls-card-note">
                          {formatPeriods(room.freePeriods)}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <div className="elec-actions">
            <button className="elec-ghost" onClick={signOut}>
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
