import { useCallback, useEffect, useState } from "react";
import { Input } from "antd-mobile";
import { Icon } from "../components/Icon";
import {
  allStatuses,
  isLoggedIn,
  logout,
  logoutAll,
  clearTimetableCache,
  takeLoginRequest,
  type PlatformId,
  type PlatformStatus,
} from "../lib/authManager";
import { login as loginYbt } from "../lib/classroom";
import {
  openLoginWindow as loginJw,
  hasPendingTimetableLogin,
} from "../lib/timetableSession";
import {
  saveOperator,
  getSavedOperator,
  forgetOperator,
} from "../lib/electricity";
import { getStudentId, saveStudentId } from "../lib/profile";

/**
 * 登录管理：校园平台的**唯一登录入口**。
 *
 * 功能页不做登录，只判断状态；未登录时跳到本页并自动发起对应登录，
 * 所以「登录动作」和「登录状态」都集中在这里。
 */
export function AuthPage({
  onBack,
  studentId,
  onStudentIdChange,
}: {
  onBack: () => void;
  studentId: string;
  onStudentIdChange: (studentId: string) => void;
}) {
  const [statuses, setStatuses] = useState<PlatformStatus[]>(() =>
    allStatuses(),
  );
  const [busy, setBusy] = useState<PlatformId | null>(null);
  const [error, setError] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [operatorInput, setOperatorInput] = useState(
    () => studentId || getSavedOperator() || getStudentId(),
  );
  const [binding, setBinding] = useState(false);

  const refresh = useCallback(() => setStatuses(allStatuses()), []);

  // 页面显示时刷新；另外处理「从功能页跳过来要自动登录」的请求
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);

    const requested = takeLoginRequest();
    if (requested) void startLogin(requested);

    return () => window.removeEventListener("focus", refresh);
    // 只在首次挂载跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLogin(id: PlatformId) {
    setError("");
    setBusy(id);
    try {
      if (id === "ybt") {
        await loginYbt();
        refresh();
        return;
      }
      if (id === "jw") {
        // 移动端会跳走，页面卸载；桌面端开窗口后回来继续
        await loginJw();
        return;
      }
      // 后勤只要学号，不需要密码
      setBinding(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setBusy((current) => (current === id ? null : current));
    }
  }

  const remove = (id: PlatformId) => {
    if (id === "jw") clearTimetableCache();
    else if (id === "zongwu") forgetOperator();
    else logout(id);
    refresh();
  };

  const removeAll = () => {
    logoutAll();
    setConfirmAll(false);
    refresh();
  };

  const bindOperator = () => {
    const value = operatorInput.trim();
    if (!value) {
      setError("请输入学号");
      return;
    }
    saveOperator(value);
    saveStudentId(value);
    onStudentIdChange(value);
    setBinding(false);
    setError("");
    refresh();
  };

  const activeCount = statuses.filter(
    (item) => item.platform.requiresLogin && item.state === "active",
  ).length;
  const hasLocalAccountData = statuses.some((item) => item.hasCredential);
  // 移动端登录过教务后，回到应用时提示正在等待读取
  const waitingJw = hasPendingTimetableLogin() && !isLoggedIn("jw");

  return (
    <div className="page feature-page auth-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={19} />
        返回
      </button>

      <section className="feature-intro">
        <span className="feature-hero-icon service-icon-account">
          <Icon name="person" size={30} />
        </span>
        <p className="eyebrow">账号</p>
        <h1>登录管理</h1>
        <p>各校园平台都在这里登录，其他功能直接复用。</p>
      </section>

      <section className="auth-summary">
        <div>
          <p className="elec-label">已验证的平台</p>
          <p className="auth-count">
            {activeCount}
            <span>
              {" "}
              / {statuses.filter((item) => item.platform.requiresLogin).length}
            </span>
          </p>
        </div>
        {hasLocalAccountData && (
          <button
            className="elec-ghost auth-clear"
            onClick={() => setConfirmAll(true)}
          >
            全部清除
          </button>
        )}
      </section>

      {error && <p className="elec-error-text auth-error">{error}</p>}

      <div className="auth-list">
        {statuses.map((item) => {
          const id = item.platform.id;
          const logged = item.state === "active";
          const bound = id === "zongwu" && item.hasCredential;
          const badge =
            id === "zongwu"
              ? bound
                ? "已绑定学号"
                : "未绑定"
              : item.state === "active"
                ? "已验证可用"
                : item.state === "expired"
                  ? "需要重新登录"
                  : id === "jw" && item.hasOfflineData
                    ? "有离线课表，会话未验证"
                    : item.hasCredential
                      ? "凭据已保存，待验证"
                      : "未验证";
          const isBusy = busy === id;
          const hasActions =
            (id !== "zongwu" && id !== "jw" && !logged) ||
            (id === "zongwu" && !bound && !binding) ||
            id === "jw" ||
            (id === "ybt" && item.hasCredential) ||
            bound;
          return (
            <section className="elec-card auth-item" key={id}>
              <header className="auth-item-head">
                <div>
                  <h2>{item.platform.name}</h2>
                  <p className="auth-host">{item.platform.host}</p>
                </div>
                <span className={`auth-badge${logged || bound ? " on" : ""}`}>
                  {badge}
                </span>
              </header>

              <dl className="auth-meta">
                <div>
                  <dt>用于</dt>
                  <dd>{item.platform.description}</dd>
                </div>
                <div>
                  <dt>认证</dt>
                  <dd>{item.platform.authHint}</dd>
                </div>
                {item.since && (
                  <div>
                    <dt>登录于</dt>
                    <dd>上次成功于 {formatTime(item.since)}</dd>
                  </div>
                )}
              </dl>

              {!logged && id === "zongwu" && binding && (
                <div className="auth-bind">
                  <Input
                    inputMode="numeric"
                    placeholder="输入学号"
                    value={operatorInput}
                    onChange={(value) =>
                      setOperatorInput(value.replace(/\D/g, ""))
                    }
                    clearable
                  />
                  <button className="elec-primary" onClick={bindOperator}>
                    保存
                  </button>
                </div>
              )}

              {hasActions && (
                <div className="auth-actions">
                  {id !== "zongwu" && id !== "jw" && !logged && (
                    <button
                      className="elec-primary auth-login-btn"
                      disabled={isBusy}
                      onClick={() => void startLogin(id)}
                    >
                      {isBusy ? "正在连接…" : "登录"}
                    </button>
                  )}
                  {id === "zongwu" && !bound && !binding && (
                    <button
                      className="elec-primary auth-login-btn"
                      onClick={() => setBinding(true)}
                    >
                      绑定学号
                    </button>
                  )}
                  {id === "jw" && (
                    <button
                      className="elec-primary auth-login-btn"
                      disabled={isBusy}
                      onClick={() => void startLogin("jw")}
                    >
                      {isBusy ? "正在打开…" : "打开教务系统"}
                    </button>
                  )}
                  {id === "jw" && item.hasOfflineData && (
                    <button
                      className="auth-remove"
                      onClick={() => remove("jw")}
                    >
                      清除离线课表
                    </button>
                  )}
                  {id === "ybt" && item.hasCredential && (
                    <button className="auth-remove" onClick={() => remove(id)}>
                      清除本机凭据
                    </button>
                  )}
                  {bound && (
                    <button
                      className="auth-remove"
                      onClick={() => remove("zongwu")}
                    >
                      解除学号绑定
                    </button>
                  )}
                </div>
              )}

              {id === "jw" && waitingJw && (
                <p className="auth-pending">
                  已在教务页面登录？回到课表点「手动读取」即可完成连接。
                </p>
              )}
            </section>
          );
        })}
      </div>

      <p className="auth-note">
        “已验证可用”表示最近一次登录或功能请求成功，不保证服务端会话之后不会过期；教务系统的
        Cookie 由 WebView 管理，清除离线课表不会退出教务账号。本应用不保存密码。
      </p>

      {confirmAll && (
        <div className="tt-sheet-mask" onClick={() => setConfirmAll(false)}>
          <div
            className="tt-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="tt-sheet-bar" style={{ background: "#c2542f" }} />
            <h2>清除本机凭据？</h2>
            <p className="auth-confirm-text">
              一站式服务大厅凭据和本机绑定学号会被清除。教务系统 Cookie 由
              WebView 管理，不会被此操作注销；已保存的课表也会保留。
            </p>
            <div className="tt-form-actions">
              <button
                className="elec-ghost"
                onClick={() => setConfirmAll(false)}
              >
                取消
              </button>
              <button className="elec-primary auth-danger" onClick={removeAll}>
                全部清除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 把时间戳格式化成「今天 14:23」这种易读形式。 */
function formatTime(at: number): string {
  const date = new Date(at);
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) return `今天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}
