import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "../components/Icon";
import { APP_NAME, APP_VERSION } from "../lib/appVersion";

const links = [
  {
    icon: "message",
    title: "联系开发者",
    detail: "QQ: 3393314989",
    url: "mqqwpa://im/chat?chat_type=wpa&uin=3393314989&version=1&src_type=web",
    fallbackUrl: "https://wpa.qq.com/msgrd?v=3&uin=3393314989&site=qq&menu=yes",
  },
  {
    icon: "globe",
    title: "个人主页",
    detail: "florance.top",
    url: "https://florance.top",
  },
  {
    icon: "gitBranch",
    title: "项目仓库",
    detail: "GitHub/FloranceYeh/AHNUoHand",
    url: "https://github.com/FloranceYeh/AHNUoHand",
  },
] as const;

export function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="page about-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={19} />
        返回
      </button>
      <div className="page-heading">
        <p className="eyebrow">ABOUT</p>
        <h1>关于与反馈</h1>
        <p>项目主页、源码与反馈渠道</p>
      </div>
      <section className="settings-list" aria-label="项目链接">
        {links.map((link) => (
          <button
            className="settings-row about-link-row"
            key={link.url}
            onClick={() => {
              const open =
                link.icon === "message"
                  ? invoke("open_qq_contact")
                  : openUrl(link.url);
              void open.catch(() =>
                openUrl(
                  "fallbackUrl" in link ? link.fallbackUrl : link.url,
                ).catch(console.error),
              );
            }}
          >
            <span className="settings-icon">
              <Icon name={link.icon} size={20} />
            </span>
            <span className="settings-copy">
              <strong>{link.title}</strong>
              <small>{link.detail}</small>
            </span>
            <Icon name="externalLink" size={17} className="service-chevron" />
          </button>
        ))}
      </section>
      <p className="about-feedback-note">
        遇到问题或有功能建议？请前往项目仓库提交 Issue 或联系开发者。
      </p>
      <div className="profile-version">
        {APP_NAME} <span>版本 {APP_VERSION}</span>
      </div>
    </div>
  );
}
