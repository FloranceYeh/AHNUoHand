import { Selector } from "antd-mobile";
import { Icon } from "../components/Icon";
import { BrandIcon } from "../components/BrandIcon";
import type {
  AccentColor,
  ContentMode,
  ThemeMode,
  ThemeSettings,
} from "../lib/theme";

const themeOptions = [
  { label: "跟随系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
];
const accentOptions = [
  {
    label: (
      <span className="appearance-accent-option">
        <i className="teal" />
        青绿
      </span>
    ),
    value: "teal",
  },
  {
    label: (
      <span className="appearance-accent-option">
        <i className="blue" />
        海蓝
      </span>
    ),
    value: "blue",
  },
  {
    label: (
      <span className="appearance-accent-option">
        <i className="violet" />
        柔紫
      </span>
    ),
    value: "violet",
  },
  {
    label: (
      <span className="appearance-accent-option">
        <i className="amber" />
        琥珀
      </span>
    ),
    value: "amber",
  },
  {
    label: (
      <span className="appearance-accent-option">
        <i className="rose" />
        玫红
      </span>
    ),
    value: "rose",
  },
];
const navigationOptions = [
  { label: "图标 + 文字", value: "icon-label" },
  { label: "仅图标", value: "icon-only" },
];
const appearanceModeOptions = [
  { label: "普通模式", value: "normal" },
  { label: "简洁模式", value: "simple" },
];

export function AppearancePage({
  settings,
  onChange,
  onBack,
}: {
  settings: ThemeSettings;
  onChange: (settings: ThemeSettings) => void;
  onBack: () => void;
}) {
  const update = (changes: Partial<ThemeSettings>) =>
    onChange({ ...settings, ...changes });

  return (
    <div className="page feature-page appearance-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={18} />
        返回
      </button>
      <div className="page-heading">
        <p className="eyebrow">PERSONALIZATION</p>
        <h1>外观设置</h1>
        <p>按你的习惯调整应用的颜色与导航显示。</p>
      </div>
      <section className="appearance-preview" aria-label="外观实时预览">
        <div className="appearance-preview-heading">
          <span>实时预览</span>
          <span className="appearance-preview-mode">
            {settings.mode === "system"
              ? "跟随系统"
              : settings.mode === "dark"
                ? "深色模式"
                : "浅色模式"}
          </span>
        </div>
        <div className="appearance-preview-card">
          <div className="appearance-preview-brand">
            <BrandIcon />
            <span>AHNUoHand</span>
          </div>
          <div className="appearance-preview-content">
            <span className="appearance-preview-orb">
              <Icon name="spark" size={18} />
            </span>
            <span>
              <strong>校园生活，一站开启</strong>
              <small>主题色与显示模式预览</small>
            </span>
          </div>
          <div
            className={`appearance-preview-nav${settings.navigationDisplay === "icon-only" ? " icons-only" : ""}`}
          >
            {[
              { name: "home", label: "首页" },
              { name: "grid", label: "服务" },
              { name: "person", label: "我的" },
            ].map((item, index) => (
              <span className={index === 0 ? "is-active" : ""} key={item.name}>
                <Icon name={item.name} size={17} />
                {settings.navigationDisplay === "icon-label" && (
                  <small>{item.label}</small>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="appearance-settings" aria-label="外观选项">
        <div className="appearance-control">
          <div className="appearance-label">
            <strong>界面模式</strong>
            <small>简洁模式隐藏提示和辅助描述</small>
          </div>
          <Selector
            className="appearance-selector"
            columns={2}
            options={appearanceModeOptions}
            value={[settings.contentMode]}
            onChange={(value) =>
              update({ contentMode: value[0] as ContentMode })
            }
            showCheckMark={false}
          />
        </div>
        <div className="appearance-control">
          <div className="appearance-label">
            <strong>显示模式</strong>
            <small>跟随系统或手动选择明暗</small>
          </div>
          <Selector
            className="appearance-selector"
            columns={3}
            options={themeOptions}
            value={[settings.mode]}
            onChange={(value) => update({ mode: value[0] as ThemeMode })}
            showCheckMark={false}
          />
        </div>
        <div className="appearance-control">
          <div className="appearance-label">
            <strong>主题色</strong>
            <small>选择应用的强调颜色</small>
          </div>
          <Selector
            className="appearance-selector accent-selector"
            columns={3}
            options={accentOptions}
            value={[settings.accent]}
            onChange={(value) => update({ accent: value[0] as AccentColor })}
            showCheckMark={false}
          />
        </div>
        <div className="appearance-control">
          <div className="appearance-label">
            <strong>底部导航栏</strong>
            <small>选择导航项目的显示方式</small>
          </div>
          <Selector
            className="appearance-selector"
            columns={2}
            options={navigationOptions}
            value={[settings.navigationDisplay]}
            onChange={(value) =>
              update({
                navigationDisplay:
                  value[0] as ThemeSettings["navigationDisplay"],
              })
            }
            showCheckMark={false}
          />
        </div>
      </section>
    </div>
  );
}
