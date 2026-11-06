import { Button, Input, Selector } from "antd-mobile";
import {
  DEFAULT_HOME_EMOJI,
  DEFAULT_HOME_GREETING,
  type ThemeSettings,
} from "../../lib/theme";
import { Icon } from "../Icon";

const emojiOptions = ["👋", "☀️", "🌻", "✨", "🎓", "🚀"].map((emoji) => ({
  label: emoji,
  value: emoji,
}));

export function HomeWelcomeSettings({
  settings,
  onChange,
}: {
  settings: Pick<ThemeSettings, "homeGreeting" | "homeEmoji">;
  onChange: (changes: Partial<ThemeSettings>) => void;
}) {
  return (
    <section
      className="customization-section"
      aria-labelledby="home-welcome-title"
    >
      <div className="customization-heading">
        <h2 id="home-welcome-title">主页欢迎语</h2>
        <Button
          size="small"
          fill="outline"
          className="customization-add-button"
          onClick={() =>
            onChange({
              homeGreeting: DEFAULT_HOME_GREETING,
              homeEmoji: DEFAULT_HOME_EMOJI,
            })
          }
        >
          <Icon name="refresh" size={16} />
          恢复默认
        </Button>
      </div>
      <div className="home-welcome-settings">
        <div className="home-welcome-preview" aria-label="欢迎语预览">
          <h3>
            {settings.homeGreeting.trim() || DEFAULT_HOME_GREETING}
            {settings.homeEmoji.trim() && (
              <span>{settings.homeEmoji.trim()}</span>
            )}
          </h3>
        </div>
        <div className="personal-fields">
          <div className="personal-field">
            <label className="personal-field-label" htmlFor="home-greeting">
              欢迎语
            </label>
            <Input
              id="home-greeting"
              value={settings.homeGreeting}
              maxLength={32}
              placeholder={DEFAULT_HOME_GREETING}
              clearable
              onChange={(homeGreeting) => onChange({ homeGreeting })}
            />
          </div>
          <div className="personal-field">
            <label className="personal-field-label" htmlFor="home-emoji">
              Emoji
            </label>
            <Input
              id="home-emoji"
              value={settings.homeEmoji}
              maxLength={32}
              placeholder="输入喜欢的表情"
              clearable
              onChange={(homeEmoji) => onChange({ homeEmoji })}
            />
          </div>
        </div>
        <Selector
          className="appearance-selector home-emoji-selector"
          columns={6}
          options={emojiOptions}
          value={settings.homeEmoji ? [settings.homeEmoji] : []}
          showCheckMark={false}
          onChange={(values) => onChange({ homeEmoji: values[0] ?? "" })}
        />
        <p className="home-welcome-hint">
          自动保存。可用键盘输入其他表情，Emoji 留空则隐藏。
        </p>
      </div>
    </section>
  );
}
