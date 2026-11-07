import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "antd-mobile";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Icon } from "../components/Icon";
import {
  fetchElectricity,
  forgetOperator,
  formatKwh,
  formatMoney,
  formatTime,
  getSavedOperator,
  isCacheFresh,
  readHistory,
  readCache,
  saveHistory,
  saveOperator,
  writeCache,
  type ElectricityReport,
} from "../lib/electricity";
import { saveStudentId } from "../lib/profile";

type Phase = "setup" | "loading" | "ready" | "error";

const OPERATOR_PATTERN = /^[0-9]{6,20}$/;

export function ElectricityPage({
  onBack,
  studentId,
  onStudentIdChange,
}: {
  onBack?: () => void;
  studentId: string;
  onStudentIdChange: (studentId: string) => void;
}) {
  const initialStudentId = () => studentId || getSavedOperator();
  const [operatorNo, setOperatorNo] = useState(initialStudentId);
  const [draft, setDraft] = useState(initialStudentId);
  const [phase, setPhase] = useState<Phase>(() =>
    initialStudentId() ? "loading" : "setup",
  );
  const [report, setReport] = useState<ElectricityReport | null>(null);
  const [history, setHistory] = useState<ElectricityReport[]>([]);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(async (target: string) => {
    setPhase("loading");
    setError("");
    try {
      const data = await fetchElectricity(target, 15);
      setReport(data);
      setOperatorNo(target);
      saveOperator(target);
      writeCache(target, data);
      setHistory(readHistory(target));
      setPhase("ready");
    } catch (cause) {
      const message =
        typeof cause === "string"
          ? cause
          : cause instanceof Error
            ? cause.message
            : "查询失败，请稍后重试";
      setError(message);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    const saved = initialStudentId();
    if (!saved) {
      setPhase("setup");
      return;
    }
    if (!studentId) {
      saveStudentId(saved);
      onStudentIdChange(saved);
    }
    const cache = readCache();
    if (cache && cache.operatorNo === saved && isCacheFresh(cache.savedAt)) {
      setReport(cache.report);
      setHistory(saveHistory(saved, cache.report));
      setPhase("ready");
      return;
    }
    void load(saved);
  }, [load]);

  const submit = () => {
    const value = draft.trim();
    if (!OPERATOR_PATTERN.test(value)) {
      setFormError("请填写你的学号（纯数字，见「电费充值」页的「用户编号」）");
      return;
    }
    setFormError("");
    setOperatorNo(value);
    saveStudentId(value);
    onStudentIdChange(value);
    void load(value);
  };

  const changeOperator = () => {
    forgetOperator();
    setReport(null);
    setHistory([]);
    setError("");
    setDraft(operatorNo);
    setPhase("setup");
  };

  const daily = report?.daily ?? [];
  const dailyTotal = useMemo(
    () => daily.reduce((sum, point) => sum + point.kwh, 0),
    [daily],
  );
  const monthMax = report
    ? Math.max(1, report.month.thisMonthKwh, report.month.lastMonthKwh)
    : 1;
  const dailyChart = useMemo(
    () =>
      daily.map((point) => ({
        ...point,
        label: point.date.slice(5),
      })),
    [daily],
  );
  const balanceChart = useMemo(
    () =>
      history.map((item) => ({
        label: formatTime(item.fetchedAt).slice(0, 5),
        balance: item.balance.total,
        remaining: item.balance.kwhLeft,
      })),
    [history],
  );
  const averageDaily = daily.length ? dailyTotal / daily.length : 0;
  const estimatedDays =
    averageDaily > 0 ? report!.balance.kwhLeft / averageDaily : 0;
  const latestHistory = history[history.length - 1];
  const balanceDelta =
    latestHistory && history.length > 1
      ? report!.balance.total - history[history.length - 2].balance.total
      : 0;

  return (
    <div className="page feature-page electricity-page">
      {onBack && (
        <button className="back-button" onClick={onBack}>
          <Icon name="arrow" size={19} />
          返回
        </button>
      )}

      <section className="feature-intro">
        <span className="feature-hero-icon service-icon-life">
          <Icon name="bolt" size={30} />
        </span>
        <p className="eyebrow">生活服务</p>
        <h1>宿舍电费</h1>
        <p>数据来自学校总务平台，余额与用电量实时查询。</p>
      </section>

      {phase === "setup" && (
        <section className="elec-card elec-setup">
          <h2>绑定你的学号</h2>
          <p className="elec-desc">
            打开今日校园的「电费充值」，页面上方的「用户编号」就是你的学号。绑定后只存在本机，用来查询你自己的宿舍。
          </p>
          <div className="elec-input-row">
            <Input
              value={draft}
              onChange={(value) => {
                setDraft(value.replace(/\D/g, ""));
                setFormError("");
              }}
              inputMode="numeric"
              placeholder="输入学号"
              aria-label="学号"
              clearable
            />
          </div>
          {formError && <p className="elec-error-text">{formError}</p>}
          <button className="elec-primary" onClick={submit}>
            开始查询
          </button>
        </section>
      )}

      {phase === "loading" && (
        <section
          className="elec-card elec-skeleton"
          aria-busy="true"
          aria-label="正在查询"
        >
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
          <strong>没能查到数据</strong>
          <p>{error}</p>
          <div className="elec-actions">
            <button
              className="elec-primary"
              onClick={() => void load(operatorNo || draft)}
            >
              重试
            </button>
            <button className="elec-ghost" onClick={changeOperator}>
              换个编号
            </button>
          </div>
        </section>
      )}

      {phase === "ready" && report && (
        <div className="elec-report">
          <section className="elec-hero">
            <div>
              <p className="elec-label">账户余额</p>
              <p className="elec-amount">
                <span className="elec-currency">¥</span>
                {formatMoney(report.balance.total)}
              </p>
              <p className="elec-sub">
                剩余 {formatKwh(report.balance.kwhLeft)} 度 · 电价{" "}
                {formatMoney(report.balance.price)} 元/度
              </p>
            </div>
            <span className="elec-room">
              {report.room.house
                ? `${report.room.house}-${report.room.name}`
                : report.room.fullName}
            </span>
          </section>

          <div className="elec-meta">
            <span>充值余额 {formatMoney(report.balance.recharged)} 元</span>
            <span>补助余额 {formatMoney(report.balance.subsidy)} 元</span>
            <span>更新于 {formatTime(report.fetchedAt)}</span>
          </div>

          <section className="elec-card">
            <header className="elec-card-head">
              <h2>本月与上月</h2>
              <span>{formatKwh(report.month.thisMonthKwh)} 度</span>
            </header>
            <div className="elec-month">
              <div className="elec-month-row">
                <span className="elec-month-label">本月</span>
                <span className="elec-month-track">
                  <span
                    className="elec-month-fill"
                    style={{
                      width: `${Math.max(4, (report.month.thisMonthKwh / monthMax) * 100)}%`,
                    }}
                  />
                </span>
                <span className="elec-month-value">
                  {formatKwh(report.month.thisMonthKwh)}
                </span>
              </div>
              <div className="elec-month-row">
                <span className="elec-month-label">上月</span>
                <span className="elec-month-track">
                  <span
                    className="elec-month-fill muted"
                    style={{
                      width: `${Math.max(4, (report.month.lastMonthKwh / monthMax) * 100)}%`,
                    }}
                  />
                </span>
                <span className="elec-month-value">
                  {formatKwh(report.month.lastMonthKwh)}
                </span>
              </div>
            </div>
            <p className="elec-split">
              照明 {formatKwh(report.month.thisMonthLight)} 度 · 空调{" "}
              {formatKwh(report.month.thisMonthAc)} 度 · 本月补助{" "}
              {formatKwh(report.month.thisMonthSubsidy)} 度
            </p>
          </section>

          <section className="elec-card">
            <header className="elec-card-head">
              <h2>近 {daily.length || 15} 天用电</h2>
              <span>合计 {formatKwh(dailyTotal)} 度</span>
            </header>
            {daily.length > 0 ? (
              <div
                className="elec-rechart"
                role="img"
                aria-label={`近 ${daily.length} 天每日用电量`}
              >
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={dailyChart}
                    margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="electricityKwhFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0.32}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0.03}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--color-line)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid var(--color-line-strong)",
                        borderRadius: "12px",
                        background: "var(--color-surface-raised)",
                        boxShadow: "var(--shadow-floating)",
                      }}
                      labelStyle={{
                        color: "var(--color-ink)",
                        fontWeight: 700,
                      }}
                      itemStyle={{ color: "var(--color-ink-secondary)" }}
                      formatter={(value, name) => [
                        `${formatKwh(Number(value))} 度`,
                        String(name),
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="kwh"
                      name="用电量"
                      stroke="var(--color-primary)"
                      strokeWidth={2.5}
                      fill="url(#electricityKwhFill)"
                    />
                    <Line
                      type="monotone"
                      dataKey="remain"
                      name="剩余电量"
                      stroke="var(--color-warning)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="elec-empty">这段时间还没有用电记录</p>
            )}
          </section>

          <section className="elec-card">
            <header className="elec-card-head">
              <h2>用电分析</h2>
              <span>{history.length} 次记录</span>
            </header>
            <div className="elec-analysis-grid">
              <div className="elec-analysis-item">
                <span>日均用电</span>
                <strong>{formatKwh(averageDaily)} 度</strong>
              </div>
              <div className="elec-analysis-item">
                <span>预计可用</span>
                <strong>
                  {estimatedDays > 0
                    ? `${Math.round(estimatedDays)} 天`
                    : "暂无"}
                </strong>
              </div>
              <div className="elec-analysis-item">
                <span>余额变化</span>
                <strong className={balanceDelta < 0 ? "negative" : "positive"}>
                  {balanceDelta > 0 ? "+" : ""}
                  {formatMoney(balanceDelta)} 元
                </strong>
              </div>
            </div>
            {balanceChart.length > 1 && (
              <div className="elec-rechart elec-balance-chart">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={balanceChart}
                    margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--color-line)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid var(--color-line-strong)",
                        borderRadius: "12px",
                        background: "var(--color-surface-raised)",
                        boxShadow: "var(--shadow-floating)",
                      }}
                      labelStyle={{
                        color: "var(--color-ink)",
                        fontWeight: 700,
                      }}
                      itemStyle={{ color: "var(--color-ink-secondary)" }}
                      formatter={(value, name) => [
                        name === "余额"
                          ? `${formatMoney(Number(value))} 元`
                          : `${formatKwh(Number(value))} 度`,
                        String(name),
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      name="余额"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="remaining"
                      name="剩余电量"
                      stroke="var(--color-warning)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="elec-month-analysis">
              <div>
                <span>本月结构</span>
                <strong>
                  照明 {formatKwh(report.month.thisMonthLight)} · 空调{" "}
                  {formatKwh(report.month.thisMonthAc)}
                </strong>
              </div>
              <div>
                <span>环比变化</span>
                <strong>
                  {formatKwh(
                    report.month.thisMonthKwh - report.month.lastMonthKwh,
                  )}{" "}
                  度
                </strong>
              </div>
            </div>
          </section>

          <div className="elec-actions">
            <button
              className="elec-ghost"
              onClick={() => void load(operatorNo)}
            >
              刷新数据
            </button>
            <button className="elec-ghost" onClick={changeOperator}>
              更换编号
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
