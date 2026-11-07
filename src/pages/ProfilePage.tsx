import { Icon } from "../components/Icon";
import type { PersonalInfo } from "../lib/profile";
import { APP_NAME, APP_VERSION } from "../lib/appVersion";

const settings = [
  { icon: "chat", title: "关于与反馈", description: "了解应用并提出建议" },
];

export function ProfilePage({
  onOpenAuth,
  onOpenAppearance,
  onOpenHomeNavigation,
  profile,
  onOpenPersonalInfo,
}: {
  onOpenAuth?: () => void;
  onOpenAppearance: () => void;
  onOpenHomeNavigation: () => void;
  profile: PersonalInfo;
  onOpenPersonalInfo: () => void;
}) {
  return (
    <div className="page profile-page">
      <div className="page-heading">
        <p className="eyebrow">YOUR CAMPUS</p>
        <h1>我的</h1>
        <p>个人设置与校园信息</p>
      </div>
      <button className="profile-card" onClick={onOpenPersonalInfo}>
        <span className={`profile-avatar${profile.avatar ? " has-image" : ""}`}>
          {profile.avatar ? (
            <img src={profile.avatar} alt="个人头像" />
          ) : (
            profile.nickname.slice(0, 1) || "同"
          )}
        </span>
        <div>
          <strong>{profile.nickname}</strong>
          <p className={profile.studentId ? undefined : "profile-hint"}>
            {profile.studentId
              ? `学号 ${profile.studentId}`
              : "点击编辑个人资料"}
          </p>
        </div>
        <span className="profile-tag">编辑</span>
        <Icon name="chevron" size={18} className="service-chevron" />
      </button>
      <section className="settings-list">
        <button className="settings-row" onClick={onOpenAuth}>
          <span className="settings-icon">
            <Icon name="keyRound" size={20} />
          </span>
          <span className="settings-copy">
            <strong>登录管理</strong>
            <small>查看并管理各校园平台的登录状态</small>
          </span>
          <Icon name="chevron" size={18} className="service-chevron" />
        </button>
        <button className="settings-row" onClick={onOpenAppearance}>
          <span className="settings-icon">
            <Icon name="spark" size={20} />
          </span>
          <span className="settings-copy">
            <strong>外观设置</strong>
            <small>主题、主题色与导航栏显示</small>
          </span>
          <Icon name="chevron" size={18} className="service-chevron" />
        </button>
        <button className="settings-row" onClick={onOpenHomeNavigation}>
          <span className="settings-icon">
            <Icon name="layoutGrid" size={20} />
          </span>
          <span className="settings-copy">
            <strong>主页与导航</strong>
            <small>自定义常用服务与底部菜单，拖动调整顺序</small>
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
        {APP_NAME} <span>版本 {APP_VERSION}</span>
      </div>
    </div>
  );
}
