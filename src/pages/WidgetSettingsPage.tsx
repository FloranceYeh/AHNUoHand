import { Stepper, Switch } from "antd-mobile";
import { Icon } from "../components/Icon";
import {
  WIDGET_WEEK_CELL_HEIGHT,
  type TimetableWidgetSettings,
} from "../lib/timetableWidgetSettings";

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
  const content = details.length ? `显示${details.join("、")}` : "仅显示课程名";
  return `${content} · ${settings.showWeekend ? "含周末" : "仅工作日"}`;
}

export function WidgetSettingsPage({
  settings,
  onChange,
  onBack,
}: {
  settings: Settings;
  onChange: (changes: Partial<Settings>) => void;
  onBack: () => void;
}) {
  const renderRow = (row: SettingRow) => (
    <div
      key={row.key}
      className={`settings-row widget-settings-row${
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

      <section className="widget-settings-preview" aria-label="当前设置">
        <div className="widget-settings-preview-icon">
          <Icon name="calendar" size={22} />
        </div>
        <div>
          <strong>课表小组件</strong>
          <p>{previewSummary(settings)}</p>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section
          key={group.id}
          className="customization-section"
          aria-labelledby={`widget-settings-${group.id}`}
        >
          <div className="customization-heading">
            <h2 id={`widget-settings-${group.id}`}>{group.title}</h2>
            <span>{group.scope}</span>
          </div>
          <div className="settings-list widget-settings-list">
            {group.rows.map(renderRow)}
          </div>
        </section>
      ))}
    </div>
  );
}
