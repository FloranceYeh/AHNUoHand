import { Selector, Stepper, Switch } from "antd-mobile";
import { Icon } from "../components/Icon";
import type { AccentColor, ThemeMode } from "../lib/theme";
import {
  WIDGET_WEEK_CELL_HEIGHT,
  type TimetableWidgetSettings,
} from "../lib/timetableWidgetSettings";

/** 与外观设置页的主题色保持同一套名称和顺序。 */
const ACCENT_OPTIONS: { value: AccentColor; label: string }[] = [
  { value: "teal", label: "青绿" },
  { value: "blue", label: "海蓝" },
  { value: "violet", label: "柔紫" },
  { value: "amber", label: "琥珀" },
  { value: "rose", label: "玫红" },
];
const THEME_MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

type Settings = TimetableWidgetSettings;
type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];
type NumberKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

type SettingRow =
  | {
      kind: "switch";
      key: BooleanKey;
      icon: string;
      title: string;
      hint: string;
    }
  | {
      kind: "stepper";
      key: NumberKey;
      icon: string;
      title: string;
      hint: string;
      range: { min: number; max: number; step: number };
    };

interface SettingGroup {
  id: string;
  title: string;
  scope: string;
  rows: SettingRow[];
}

const GROUPS: SettingGroup[] = [
  {
    id: "content",
    title: "显示内容",
    scope: "全部小组件",
    rows: [
      {
        kind: "switch",
        key: "showTime",
        icon: "clock",
        title: "显示时间",
        hint: "在课程卡片中显示上课时段",
      },
      {
        kind: "switch",
        key: "showPlace",
        icon: "location",
        title: "显示教室",
        hint: "在课程卡片中显示上课地点",
      },
      {
        kind: "switch",
        key: "showTeacher",
        icon: "person",
        title: "显示教师",
        hint: "在课程卡片中显示授课教师",
      },
    ],
  },
  {
    id: "week",
    title: "课程表",
    scope: "一周课程",
    rows: [
      {
        kind: "switch",
        key: "showWeekend",
        icon: "calendar",
        title: "显示周末",
        hint: "显示周六和周日两列",
      },
      {
        kind: "stepper",
        key: "weekCellHeight",
        icon: "layoutGrid",
        title: "每格高度",
        hint: "调整每一节课所占的高度",
        range: WIDGET_WEEK_CELL_HEIGHT,
      },
    ],
  },
];

function previewSummary(settings: Settings): string {
  const details = [
    settings.showTime && "时间",
    settings.showPlace && "教室",
    settings.showTeacher && "教师",
  ].filter(Boolean);
  const content = details.length ? `${details.join(" · ")}` : "仅显示课程名";
  return `${content} | ${settings.showWeekend ? "含周末" : "仅工作日"}`;
}

export function WidgetSettingsPage({
  settings,
  onChange,
  onBack,
}: {
  settings: Settings;
  appAccent: AccentColor;
  onChange: (changes: Partial<Settings>) => void;
  onBack: () => void;
}) {
  const renderRow = (row: SettingRow) => (
    <div
      key={row.key}
      className={`widget-settings-row${
        row.kind === "stepper" ? " widget-settings-stepper-row" : ""
      }`}
    >
      <span className="settings-icon">
        <Icon name={row.icon} size={20} />
      </span>
      <span className="settings-copy">
        <strong>{row.title}</strong>
        <small>{row.hint}</small>
      </span>
      {row.kind === "switch" ? (
        <Switch
          checked={settings[row.key]}
          onChange={(checked) => onChange({ [row.key]: checked })}
        />
      ) : (
        <Stepper
          {...row.range}
          value={settings[row.key]}
          onChange={(value) => onChange({ [row.key]: value })}
        />
      )}
    </div>
  );

  return (
    <div className="page feature-page widget-settings-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={18} />
        返回
      </button>
      <div className="page-heading">
        <p className="eyebrow">HOME SCREEN WIDGETS</p>
        <h1>小组件设置</h1>
        <p>修改后桌面上的课表小组件会立即更新。</p>
      </div>

      <section className="widget-settings">
        <section className="widget-settings-preview" aria-label="当前设置">
          <div className="widget-settings-preview-icon">
            <Icon name="widget" size={22} />
          </div>
          <div>
            <strong>课表小组件</strong>
            <p>{previewSummary(settings)}</p>
          </div>
        </section>

        <section
          className="widget-settings-item"
          aria-labelledby="widget-settings-accent"
        >
          <div className="widget-settings-label">
            <div className="widget-settings-heading">
              <strong>主题色</strong>
              <span>全部小组件</span>
            </div>
          </div>
          <div className="widget-settings-rows">
            <div className="widget-settings-row">
              <span className="settings-icon">
                <Icon name="palette" size={20} />
              </span>
              <span className="settings-copy">
                <strong>跟随应用主题色</strong>
                <small>应用主题色变化时同步更新小组件</small>
              </span>
              <Switch
                checked={settings.followAppAccent}
                onChange={(checked) => onChange({ followAppAccent: checked })}
              />
            </div>
          </div>
          {!settings.followAppAccent && (
            <Selector
              className="appearance-selector accent-selector widget-settings-selector"
              columns={3}
              options={ACCENT_OPTIONS.map((option) => ({
                value: option.value,
                label: (
                  <span className="appearance-accent-option">
                    <i className={option.value} />
                    <span>{option.label}</span>
                  </span>
                ),
              }))}
              value={[settings.accent]}
              showCheckMark={false}
              onChange={(value) => {
                const [accent] = value as AccentColor[];
                if (accent) onChange({ accent });
              }}
            />
          )}
        </section>

        <section
          className="widget-settings-item"
          aria-labelledby="widget-settings-theme-mode"
        >
          <div className="widget-settings-label">
            <div className="widget-settings-heading">
              <strong>显示模式</strong>
              <span>全部小组件</span>
            </div>
            <small>跟随系统或手动选择明暗</small>
          </div>
          <Selector
            className="widget-settings-selector"
            columns={3}
            options={THEME_MODE_OPTIONS}
            value={[settings.themeMode]}
            onChange={(value) => {
              const [themeMode] = value as ThemeMode[];
              if (themeMode) onChange({ themeMode });
            }}
            showCheckMark={false}
          />
        </section>

        {GROUPS.map((group) => (
          <section
            key={group.id}
            className="widget-settings-section"
            aria-labelledby={`widget-settings-${group.id}`}
          >
            <div className="widget-settings-item">
              <div className="widget-settings-label">
                <div className="widget-settings-heading">
                  <strong id={`widget-settings-${group.id}`}>
                    {group.title}
                  </strong>
                  <span>{group.scope}</span>
                </div>
              </div>
              <div className="widget-settings-rows">
                {group.rows.map(renderRow)}
              </div>
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}
