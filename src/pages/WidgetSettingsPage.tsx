import { Stepper, Switch } from "antd-mobile";
import { Icon } from "../components/Icon";
import type { TimetableWidgetSettings } from "../lib/timetableWidgetSettings";

export function WidgetSettingsPage({
  settings,
  onChange,
  onBack,
}: {
  settings: TimetableWidgetSettings;
  onChange: (changes: Partial<TimetableWidgetSettings>) => void;
  onBack: () => void;
}) {
  return (
    <div className="page feature-page widget-settings-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={18} />
        返回
      </button>
      <div className="page-heading">
        <p className="eyebrow">HOME SCREEN WIDGETS</p>
        <h1>小组件设置</h1>
        <p>选择桌面课表小组件显示的内容和课程数量。</p>
      </div>

      <section className="widget-settings-preview" aria-label="小组件预览">
        <div className="widget-settings-preview-icon">
          <Icon name="calendar" size={22} />
        </div>
        <div>
          <strong>课表小组件</strong>
          <p>
            {settings.showTime ? "时间" : ""}
            {settings.showPlace ? "、教室" : ""}
            {settings.showTeacher ? "、教师" : ""} · 最多 {settings.maxCourses} 节课
          </p>
        </div>
      </section>

      <section className="settings-list widget-settings-list">
        <div className="settings-row widget-settings-row">
          <span className="settings-icon">
            <Icon name="clock" size={20} />
          </span>
          <span className="settings-copy">
            <strong>显示时间</strong>
            <small>在课程标题中显示上课时段</small>
          </span>
          <Switch
            checked={settings.showTime}
            onChange={(checked) => onChange({ showTime: checked })}
          />
        </div>
        <div className="settings-row widget-settings-row">
          <span className="settings-icon">
            <Icon name="location" size={20} />
          </span>
          <span className="settings-copy">
            <strong>显示教室</strong>
            <small>在课程详情中显示上课地点</small>
          </span>
          <Switch
            checked={settings.showPlace}
            onChange={(checked) => onChange({ showPlace: checked })}
          />
        </div>
        <div className="settings-row widget-settings-row">
          <span className="settings-icon">
            <Icon name="person" size={20} />
          </span>
          <span className="settings-copy">
            <strong>显示教师</strong>
            <small>在课程详情中显示授课教师</small>
          </span>
          <Switch
            checked={settings.showTeacher}
            onChange={(checked) => onChange({ showTeacher: checked })}
          />
        </div>
        <div className="settings-row widget-settings-row">
          <span className="settings-icon">
            <Icon name="calendar" size={20} />
          </span>
          <span className="settings-copy">
            <strong>显示周末</strong>
            <small>一周课程小组件显示周六和周日</small>
          </span>
          <Switch
            checked={settings.showWeekend}
            onChange={(checked) => onChange({ showWeekend: checked })}
          />
        </div>
        <div className="settings-row widget-settings-row widget-settings-stepper-row">
          <span className="settings-icon">
            <Icon name="layoutGrid" size={20} />
          </span>
          <span className="settings-copy">
            <strong>最多显示课程</strong>
            <small>小组件空间有限，最多显示 8 节课</small>
          </span>
          <Stepper
            min={1}
            max={8}
            step={1}
            value={settings.maxCourses}
            onChange={(value) => onChange({ maxCourses: value })}
          />
        </div>
        <div className="settings-row widget-settings-row widget-settings-stepper-row">
          <span className="settings-icon">
            <Icon name="layoutGrid" size={20} />
          </span>
          <span className="settings-copy">
            <strong>每格高度</strong>
            <small>调整一周课程小组件的节次高度</small>
          </span>
          <Stepper
            min={28}
            max={64}
            step={2}
            value={settings.weekCellHeight}
            onChange={(value) => onChange({ weekCellHeight: value })}
          />
        </div>
      </section>
    </div>
  );
}
