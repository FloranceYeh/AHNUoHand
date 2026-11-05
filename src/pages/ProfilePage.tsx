import { Icon } from "../components/Icon";

const settings = [
  { icon: "spark", title: "外观设置", description: "主题与显示偏好" },
  { icon: "chat", title: "关于与反馈", description: "了解应用并提出建议" },
];

export function ProfilePage({ onOpenAuth }: { onOpenAuth?: () => void }) {
  return (
    <div className="page profile-page">
      <div className="page-heading">
        <p className="eyebrow">YOUR CAMPUS</p>
        <h1>我的</h1>
        <p>个人设置与校园信息</p>
      </div>
      <section className="profile-card">
        <span className="profile-avatar">同</span>
        <div>
          <strong>师大学子</strong>
          <p>校园身份尚未关联</p>
        </div>
        <span className="profile-tag">访客模式</span>
      </section>
      <section className="settings-list">
        <button className="settings-row" onClick={onOpenAuth}>
          <span className="settings-icon">
            <Icon name="person" size={20} />
          </span>
          <span className="settings-copy">
            <strong>登录管理</strong>
            <small>查看并管理各校园平台的登录状态</small>
          </span>
          <Icon name="chevron" size={18} className="service-chevron" />
        </button>
        {settings.map((item) => (
          <button className="settings-row" key={item.title}>
            <span className="settings-icon">
              <Icon name={item.icon} size={20} />
            </span>
            <span className="settings-copy">
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <Icon name="chevron" size={18} className="service-chevron" />
          </button>
        ))}
      </section>
      <div className="profile-version">
        AHNUoHand <span>版本 0.1.0</span>
      </div>
    </div>
  );
}
