import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import {
  fetchElectricity,
  forgetOperator,
  formatKwh,
  formatMoney,
  formatTime,
  getSavedOperator,
  isCacheFresh,
  readCache,
  saveOperator,
  writeCache,
  type ElectricityReport,
} from "../lib/electricity";

type Phase = "setup" | "loading" | "ready" | "error";

const OPERATOR_PATTERN = /^[0-9]{6,20}$/;

export function ElectricityPage({ onBack }: { onBack: () => void }) {
  const [operatorNo, setOperatorNo] = useState(() => getSavedOperator());
  const [draft, setDraft] = useState(() => getSavedOperator());
  const [phase, setPhase] = useState<Phase>(() =>
    getSavedOperator() ? "loading" : "setup",
  );
  const [report, setReport] = useState<ElectricityReport | null>(null);
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
    const saved = getSavedOperator();
    if (!saved) {
      setPhase("setup");
      return;
    }
    const cache = readCache();
    if (cache && cache.operatorNo === saved && isCacheFresh(cache.savedAt)) {
      setReport(cache.report);
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
    void load(value);
  };

  const changeOperator = () => {
    forgetOperator();
    setReport(null);
    setError("");
    setDraft(operatorNo);
    setPhase("setup");
  };

  const daily = report?.daily ?? [];
  const dailyMax = useMemo(
    () => Math.max(1, ...daily.map((point) => point.kwh)),
    [daily],
  );
  const dailyTotal = useMemo(
    () => daily.reduce((sum, point) => sum + point.kwh, 0),
    [daily],
  );
  const monthMax = report
    ? Math.max(1, report.month.thisMonthKwh, report.month.lastMonthKwh)
    : 1;

  return (
    <div className="page feature-page electricity-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={19} />
        返回
      </button>

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
            <input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setFormError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="输入学号"
              aria-label="学号"
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
                className="elec-chart"
                role="img"
                aria-label={`近 ${daily.length} 天每日用电量`}
              >
                {daily.map((point, index) => (
                  <div
                    className="elec-bar"
                    key={`${point.date}-${index}`}
                    title={`${point.date}：${formatKwh(point.kwh)} 度，余 ${formatKwh(point.remain)} 度`}
                  >
                    <span
                      className="elec-bar-fill"
                      style={{
                        height: `${Math.max(3, (point.kwh / dailyMax) * 100)}%`,
                      }}
                    />
                    {index % 5 === 0 && (
                      <span className="elec-bar-label">
                        {point.date.slice(5)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="elec-empty">这段时间还没有用电记录</p>
            )}
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
