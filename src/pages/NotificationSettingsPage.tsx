import { useState } from "react";
import { Stepper, Switch } from "antd-mobile";
import { Icon } from "../components/Icon";
import {
  ensureNotificationPermission,
  notify,
  type NotificationSettings,
} from "../lib/notifications";

export function NotificationSettingsPage({
  settings,
  onChange,
  onBack,
}: {
  settings: NotificationSettings;
  onChange: (settings: NotificationSettings) => void;
  onBack: () => void;
}) {
  const [permissionError, setPermissionError] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [testSending, setTestSending] = useState(false);
  const update = async (
    key: keyof NotificationSettings,
    value: boolean | number,
  ) => {
    const next = { ...settings, [key]: value };
    if (value === true && !(await ensureNotificationPermission())) {
      setPermissionError("未获得系统通知权限，请在系统设置中允许通知。");
      return;
    }
    setPermissionError("");
    onChange(next);
  };
  const toggleRow = (
    title: string,
    description: string,
    key: "classReminder" | "electricityAlert" | "schoolCardAlert",
    icon: string,
    category: "academic" | "life" | "account",
  ) => (
    <div className="notification-setting-row" key={key}>
      <span className={`notification-setting-icon service-icon-${category}`}>
        <Icon name={icon} size={19} />
      </span>
      <div className="notification-setting-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <Switch
        checked={settings[key]}
        onChange={(checked) => void update(key, checked)}
      />
    </div>
  );
  const sendTest = async () => {
    setTestSending(true);
    setTestStatus("");
    try {
      const sent = await notify(
        "AHNUoHand 通知测试",
        "通知权限和系统推送工作正常。",
      );
      setTestStatus(
        sent
          ? "测试通知已发送，请查看系统通知栏。"
          : "通知权限未开启，请在系统设置中允许通知。",
      );
    } catch {
      setTestStatus("测试通知发送失败，请检查系统通知权限。");
    } finally {
      setTestSending(false);
    }
  };
  return (
    <div className="page notification-settings-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={19} />
        返回
      </button>
      <div className="page-heading">
        <p className="eyebrow">PREFERENCES</p>
        <h1>通知订阅</h1>
        <p>管理课程与账户提醒</p>
      </div>
      {permissionError && (
        <p className="notification-permission-error" role="alert">
          {permissionError}
        </p>
      )}
      <section className="settings-list notification-settings-list">
        {toggleRow(
          "课前提醒",
          "根据已读取的课表，在上课前发送通知。",
          "classReminder",
          "book",
          "academic",
        )}
        {settings.classReminder && (
          <div className="notification-setting-row notification-stepper-row">
            <div className="notification-setting-copy">
              <strong>提前时间</strong>
              <small>分钟</small>
            </div>
            <Stepper
              min={5}
              max={60}
              step={5}
              value={settings.reminderMinutes}
              onChange={(value) => void update("reminderMinutes", value)}
            />
          </div>
        )}
        {toggleRow(
          "寝室月用电预警",
          "定时查询宿舍剩余电量，低于阈值时提醒。",
          "electricityAlert",
          "bolt",
          "life",
        )}
        {settings.electricityAlert && (
          <>
            <div className="notification-setting-row notification-stepper-row">
              <div className="notification-setting-copy">
                <strong>轮询间隔</strong>
                <small>分钟</small>
              </div>
              <Stepper
                min={30}
                max={1440}
                step={30}
                value={settings.electricityPollMinutes}
                onChange={(value) =>
                  void update("electricityPollMinutes", value)
                }
              />
            </div>
            <div className="notification-setting-row notification-stepper-row">
              <div className="notification-setting-copy">
                <strong>剩余电量阈值</strong>
                <small>度（kWh）</small>
              </div>
              <Stepper
                min={1}
                max={100}
                step={1}
                value={settings.electricityBalance}
                onChange={(value) => void update("electricityBalance", value)}
              />
            </div>
          </>
        )}
        {toggleRow(
          "一卡通余额预警",
          "定时查询一卡通余额，低于阈值时提醒。",
          "schoolCardAlert",
          "idCard",
          "account",
        )}
        {settings.schoolCardAlert && (
          <>
            <div className="notification-setting-row notification-stepper-row">
              <div className="notification-setting-copy">
                <strong>轮询间隔</strong>
                <small>分钟</small>
              </div>
              <Stepper
                min={30}
                max={1440}
                step={30}
                value={settings.schoolCardPollMinutes}
                onChange={(value) =>
                  void update("schoolCardPollMinutes", value)
                }
              />
            </div>
            <div className="notification-setting-row notification-stepper-row">
              <div className="notification-setting-copy">
                <strong>余额阈值</strong>
                <small>元</small>
              </div>
              <Stepper
                min={1}
                max={200}
                step={1}
                value={settings.schoolCardBalance}
                onChange={(value) => void update("schoolCardBalance", value)}
              />
            </div>
          </>
        )}
      </section>
      <p className="notification-setting-note">
        轮询仅在应用运行期间进行；一卡通轮询需要已登录的完美校园会话。关闭应用期间不会自动查询账户信息。
      </p>
      <button
        className="elec-ghost notification-test-button"
        onClick={() => void sendTest()}
        disabled={testSending}
      >
        <Icon name="bell" size={17} />
        {testSending ? "正在发送…" : "发送测试通知"}
      </button>
      {testStatus && (
        <p className="notification-test-status" role="status">
          {testStatus}
        </p>
      )}
    </div>
  );
}
