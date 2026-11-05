import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import {
  allStatuses,
  logout,
  logoutAll,
  type PlatformStatus,
} from "../lib/authManager";

/**
 * 登录管理。
 *
 * 学校的服务分散在几个互不相通的后台，各自认证方式不同，
 * 这里把它们的登录状态集中展示，也支持单独或一键清除。
 */
export function AuthPage({ onBack }: { onBack: () => void }) {
  const [statuses, setStatuses] = useState<PlatformStatus[]>(() => allStatuses());
  const [confirmAll, setConfirmAll] = useState(false);

  // 页面回到前台时刷新一次，登录状态可能在别处刚变过
  useEffect(() => {
    const refresh = () => setStatuses(allStatuses());
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const refresh = () => setStatuses(allStatuses());

  const remove = (id: PlatformStatus["platform"]["id"]) => {
    logout(id);
    refresh();
  };

  const removeAll = () => {
    logoutAll();
    setConfirmAll(false);
    refresh();
  };

  const activeCount = statuses.filter((item) => item.hasCredential).length;

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
        <p>统一查看各校园平台的登录状态，随时清除。</p>
      </section>

      <section className="auth-summary">
        <div>
          <p className="elec-label">已连接</p>
          <p className="auth-count">
            {activeCount}
            <span> / {statuses.length}</span>
          </p>
        </div>
        {activeCount > 0 && (
          <button className="elec-ghost auth-clear" onClick={() => setConfirmAll(true)}>
            全部清除
          </button>
        )}
      </section>

      <div className="auth-list">
        {statuses.map((item) => (
          <section className="elec-card auth-item" key={item.platform.id}>
            <header className="auth-item-head">
              <div>
                <h2>{item.platform.name}</h2>
                <p className="auth-host">{item.platform.host}</p>
              </div>
              <span className={`auth-badge${item.hasCredential ? " on" : ""}`}>
                {item.hasCredential ? "已登录" : "未登录"}
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
              {!item.platform.requiresLogin && (
                <div>
                  <dt>说明</dt>
                  <dd>此平台不需要密码，绑定学号即可使用</dd>
                </div>
              )}
              {item.since && (
                <div>
                  <dt>登录于</dt>
                  <dd>{formatTime(item.since)}</dd>
                </div>
              )}
            </dl>

            {item.hasCredential && item.platform.requiresLogin && (
              <button className="auth-remove" onClick={() => remove(item.platform.id)}>
                退出登录
              </button>
            )}
          </section>
        ))}
      </div>

      <p className="auth-note">
        退出后对应功能需要重新登录。本应用不保存密码，登录凭据只存在本机。
      </p>

      {confirmAll && (
        <div className="tt-sheet-mask" onClick={() => setConfirmAll(false)}>
          <div className="tt-sheet" onClick={(event) => event.stopPropagation()}>
            <span className="tt-sheet-bar" style={{ background: "#c2542f" }} />
            <h2>清除全部登录状态？</h2>
            <p className="auth-confirm-text">
              所有校园平台的登录凭据都会被删除，下次使用对应功能时需要重新登录。
            </p>
            <div className="tt-form-actions">
              <button className="elec-ghost" onClick={() => setConfirmAll(false)}>
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
