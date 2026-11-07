import { useEffect, useMemo, useState } from "react";
import { Input, Picker } from "antd-mobile";
import {
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
  currentSchoolCardMonth,
  querySchoolCard,
  readSchoolCardAliases,
  readSchoolCardCache,
  saveSchoolCardAliases,
  schoolCardMerchantKey,
  takeMobileSchoolCardResult,
  type SchoolCardReport,
} from "../lib/schoolcard";

type Phase = "idle" | "loading" | "ready" | "error";

function monthOptions(): string[] {
  const now = new Date();
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function SchoolCardPage({ onBack }: { onBack?: () => void }) {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(currentSchoolCardMonth);
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<SchoolCardReport | null>(() =>
    readSchoolCardCache(currentSchoolCardMonth()),
  );
  const [progress, setProgress] = useState("正在连接完美校园…");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aliases, setAliases] = useState(readSchoolCardAliases);
  const [aliasTarget, setAliasTarget] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");

  useEffect(() => {
    const result = takeMobileSchoolCardResult();
    if (result && "report" in result) {
      setMonth(result.report.month);
      setReport(result.report);
      setPhase("ready");
    } else if (result && "error" in result) {
      setError(result.error);
      setPhase("error");
    } else if (report) {
      setPhase("ready");
    }
  }, [report]);

  const refresh = async (targetMonth = month, force = false) => {
    setPhase("loading");
    setError("");
    try {
      const result = await querySchoolCard(targetMonth, setProgress, force);
      setMonth(result.month);
      setReport(result);
      setPhase("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "一卡通查询失败");
      setPhase("error");
    }
  };

  const merchantStats = useMemo(() => {
    if (!report) return [];
    const grouped = new Map<
      string,
      { key: string; count: number; total: number }
    >();
    report.transactions.forEach((item) => {
      const key = schoolCardMerchantKey(item);
      const entry = grouped.get(key) ?? { key, count: 0, total: 0 };
      entry.count += 1;
      entry.total += item.type === "0" ? item.amount : -item.amount;
      grouped.set(key, entry);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [report]);

  const dailyStats = useMemo(() => {
    if (!report) return [];
    const daily = new Map<string, number>();
    report.transactions.forEach((item) => {
      const date = item.date.slice(0, 10);
      daily.set(
        date,
        (daily.get(date) ?? 0) +
          (item.type === "0" ? item.amount : -item.amount),
      );
    });
    return [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ label: date.slice(5), amount }));
  }, [report]);

  const totalSpend = merchantStats.reduce((sum, item) => sum + item.total, 0);
  const openAlias = (key: string) => {
    setAliasTarget(key);
    setAliasDraft(aliases[key] ?? "");
  };
  const saveAlias = () => {
    if (!aliasTarget) return;
    const next = { ...aliases };
    const value = aliasDraft.trim();
    if (value) next[aliasTarget] = value;
    else delete next[aliasTarget];
    setAliases(next);
    saveSchoolCardAliases(next);
    setAliasTarget(null);
  };

  return (
    <div className="page feature-page schoolcard-page">
      {onBack && (
        <button className="back-button" onClick={onBack}>
          <Icon name="arrow" size={19} />
          返回
        </button>
      )}
      <section className="feature-intro">
        <span className="feature-hero-icon service-icon-life">
          <Icon name="idCard" size={30} />
        </span>
        <p className="eyebrow">生活服务</p>
        <h1>校园一卡通</h1>
        <p>查看卡余额、消费记录，并分析每月开销。</p>
      </section>

      {phase === "idle" && (
        <section className="elec-card schoolcard-connect">
          <h2>连接完美校园</h2>
          <p className="elec-desc">
            登录入口使用学校统一认证，会话由完美校园管理。本应用不会保存密码。
          </p>
          <button
            className="elec-primary"
            onClick={() => void refresh(month, true)}
          >
            登录并查询
          </button>
        </section>
      )}
      {phase === "loading" && (
        <section className="elec-card elec-skeleton" aria-busy="true">
          <span className="elec-skeleton-line wide" />
          <span className="elec-skeleton-line" />
          <span className="elec-skeleton-line narrow" />
          <p className="schoolcard-progress">{progress}</p>
        </section>
      )}
      {phase === "error" && (
        <section className="elec-card elec-error">
          <span className="placeholder-symbol">
            <Icon name="clock" size={24} />
          </span>
          <strong>暂时无法读取一卡通</strong>
          <p>{error}</p>
          <button className="elec-primary" onClick={() => void refresh()}>
            重试
          </button>
          {error.includes("登录") && (
            <button
              className="elec-ghost"
              onClick={() => void refresh(month, true)}
            >
              打开完美校园登录
            </button>
          )}
        </section>
      )}

      {phase === "ready" && report && (
        <div className="elec-report">
          <section className="elec-hero">
            <div>
              <p className="elec-label">卡余额</p>
              <p className="elec-amount">
                <span className="elec-currency">¥</span>
                {formatMoney(report.balance)}
              </p>
              <p className="elec-sub">
                主钱包 {formatMoney(report.main)} 元 · 补助钱包{" "}
                {formatMoney(report.subsidy)} 元
              </p>
            </div>
            <span className="elec-room">卡号：{report.cardNo}</span>
          </section>

          <div className="elec-meta">
            {report.expiry && <span>有效期至 {report.expiry}</span>}
            <span>更新于 {formatDateTime(report.fetchedAt)}</span>
          </div>

          <section className="schoolcard-controls">
            <button
              className="schoolcard-month-control"
              onClick={() => setPickerOpen(true)}
            >
              <span className="elec-label">查询月份</span>
              <strong>{month}</strong>
              <Icon name="chevronDown" size={17} />
            </button>
          </section>
          <Picker
            visible={pickerOpen}
            columns={[months.map((value) => ({ label: value, value }))]}
            value={[month]}
            onClose={() => setPickerOpen(false)}
            onConfirm={(values) => {
              const value = String(values[0] ?? month);
              setPickerOpen(false);
              void refresh(value);
            }}
          />

          <section className="elec-card">
            <header className="elec-card-head">
              <h2>消费趋势</h2>
              <span>支出 {formatMoney(totalSpend)} 元</span>
            </header>
            {dailyStats.length ? (
              <div className="elec-rechart schoolcard-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={dailyStats}
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
                      width={34}
                    />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid var(--color-line-strong)",
                        borderRadius: "12px",
                        background: "var(--color-surface-raised)",
                        boxShadow: "var(--shadow-floating)",
                      }}
                      formatter={(value) => [
                        `${formatMoney(Number(value))} 元`,
                        "消费",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      name="每日消费"
                      stroke="var(--color-primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="elec-empty">本月暂无消费记录</p>
            )}
          </section>

          <section className="elec-card">
            <header className="elec-card-head">
              <h2>消费分析</h2>
              <span>{merchantStats.length} 个消费点</span>
            </header>
            <div className="schoolcard-analysis-grid">
              <div>
                <span>消费笔数</span>
                <strong>{report.transactions.length} 笔</strong>
              </div>
              <div>
                <span>平均每笔</span>
                <strong>
                  {formatMoney(
                    report.transactions.length
                      ? totalSpend / report.transactions.length
                      : 0,
                  )}{" "}
                  元
                </strong>
              </div>
              <div>
                <span>最高消费点</span>
                <strong>
                  {merchantStats[0]
                    ? aliases[merchantStats[0].key] || merchantStats[0].key
                    : "暂无"}
                </strong>
              </div>
            </div>
            <div className="schoolcard-merchant-list">
              {merchantStats.map((item) => (
                <button
                  className="schoolcard-merchant"
                  key={item.key}
                  onClick={() => openAlias(item.key)}
                >
                  <span>
                    <strong>{aliases[item.key] || item.key}</strong>
                    <div className="schoolcard-merchant-meta">
                      <small>{item.count} 笔</small>
                      <small className="schoolcard-merchant-meta-hint">
                        {" "}
                        · 点击设置别名
                      </small>
                    </div>
                  </span>
                  <b>{formatMoney(item.total)} 元</b>
                </button>
              ))}
            </div>
          </section>

          <section className="elec-card schoolcard-transactions">
            <header className="elec-card-head">
              <h2>交易明细</h2>
              <span>{report.transactions.length} 笔</span>
            </header>
            <div className="schoolcard-transaction-list">
              {report.transactions.map((item) => (
                <article
                  className="schoolcard-transaction"
                  key={item.orderNo || `${item.date}-${item.amount}`}
                >
                  <div>
                    <strong>{item.description}</strong>
                    <small>
                      {item.date}
                      {item.terminal
                        ? ` · ${aliases[item.terminal] || item.terminal}`
                        : ""}
                    </small>
                  </div>
                  <b className={item.type === "0" ? "negative" : "positive"}>
                    {item.type === "0" ? "-" : "+"}
                    {formatMoney(item.amount)}
                  </b>
                </article>
              ))}
            </div>
          </section>

          <div className="elec-actions">
            <button
              className="elec-ghost"
              onClick={() => void refresh(month, true)}
            >
              <Icon name="refresh" size={16} />
              <span>刷新数据</span>
            </button>
          </div>
        </div>
      )}

      {aliasTarget && (
        <div className="tt-sheet-mask" onClick={() => setAliasTarget(null)}>
          <div
            className="tt-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tt-popup-handle" aria-hidden="true">
              <span />
            </div>
            <div className="tt-course-title-row">
              <h2 id="tt-course-title">设置消费点别名</h2>
            </div>
            <div className="personal-field">
              <label
                className="personal-field-label"
                htmlFor="personal-nickname"
              >
                原名称：{aliasTarget}
              </label>
              <Input
                id="personal-nickname"
                value={aliasDraft}
                maxLength={24}
                placeholder="例如：盖浇饭窗口"
                clearable
                onChange={setAliasDraft}
              />
            </div>
            <div className="tt-form-actions">
              <button
                className="elec-ghost"
                onClick={() => setAliasTarget(null)}
              >
                取消
              </button>
              <button className="elec-primary" onClick={saveAlias}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}
function formatDateTime(at: number): string {
  const date = new Date(at);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
