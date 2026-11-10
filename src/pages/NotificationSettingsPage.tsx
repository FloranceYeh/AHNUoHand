import { useState } from "react";
import {
  Collapse,
  Input,
  Selector,
  Stepper,
  Switch,
  TextArea,
} from "antd-mobile";
import { Icon } from "../components/Icon";
import { isLoggedIn } from "../lib/authManager";
import { getSavedOperator } from "../lib/electricity";
import {
  DEFAULT_NOTIFICATION_ICONS,
  ensureNotificationPermission,
  notify,
  type NotificationSettings,
} from "../lib/notifications";
import { CACHE_KEY } from "../lib/timetableSession";

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
  const iconOptions = [
    { label: <Icon name="school" size={21} />, value: "school", title: "校园" },
    { label: <Icon name="bell" size={21} />, value: "bell", title: "通知" },
    { label: <Icon name="book" size={21} />, value: "book", title: "课程" },
    { label: <Icon name="bolt" size={21} />, value: "bolt", title: "电量" },
    {
      label: <Icon name="idCard" size={21} />,
      value: "idCard",
      title: "一卡通",
    },
    {
      label: <Icon name="settings" size={21} />,
      value: "settings",
      title: "设置",
    },
  ];
  const update = async (
    key: keyof NotificationSettings,
    value: boolean | number | string,
  ) => {
    const next = { ...settings, [key]: value };
    if (value === true) {
      if (key === "classReminder") {
        try {
          const grid = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
          if (!Array.isArray(grid?.cells) || grid.cells.length === 0) {
            setPermissionError("请先读取课表，再开启课前提醒。");
            return;
          }
        } catch {
          setPermissionError("请先读取课表，再开启课前提醒。");
          return;
        }
      }
      if (
        key === "electricityAlert" &&
        !/^\d{8,20}$/.test(getSavedOperator())
      ) {
        setPermissionError(
          "请先在登录管理中绑定后勤服务学号，再开启电费预警。",
        );
        return;
      }
      if (key === "schoolCardAlert" && !isLoggedIn("schoolcard")) {
        setPermissionError(
          "请先在登录管理中验证完美校园，再开启一卡通余额预警。",
        );
        return;
      }
    }
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
  const notificationEditor = (
    iconKey: keyof NotificationSettings,
    titleKey: keyof NotificationSettings,
    bodyKey: keyof NotificationSettings,
  ) => (
    <Collapse className="notification-editor">
      <Collapse.Panel key={`${String(iconKey)}-custom`} title="自定义通知">
        <div className="notification-copy-fields">
          <div className="notification-copy-field">
            <label className="notification-copy-field-label">标题</label>
            <Input
              value={String(settings[titleKey])}
              placeholder="通知标题"
              onChange={(value) => void update(titleKey, value)}
            />
          </div>
          <div className="notification-copy-field">
            <label className="notification-copy-field-label">文案</label>
            <TextArea
              value={String(settings[bodyKey])}
              placeholder="通知内容"
              autoSize={{ minRows: 2, maxRows: 4 }}
              onChange={(value) => void update(bodyKey, value)}
            />
          </div>
        </div>
        <span className="notification-icon-field-label">配图</span>
        <Selector
          columns={3}
          options={iconOptions}
          value={[settings[iconKey] as string]}
          onChange={(value) => value[0] && void update(iconKey, value[0])}
          showCheckMark={false}
        />
      </Collapse.Panel>
    </Collapse>
  );
  const sendTest = async () => {
    setTestSending(true);
    setTestStatus("");
    try {
      const sent = await notify(
        settings.testTitle,
        settings.testBody,
        settings.testIcon,
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
          DEFAULT_NOTIFICATION_ICONS.class,
          "academic",
        )}
        {settings.classReminder && (
          <>
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
            <div className="notification-setting-row notification-editor-row">
              {notificationEditor("classIcon", "classTitle", "classBody")}
            </div>
          </>
        )}
        {toggleRow(
          "寝室月用电预警",
          "定时查询宿舍剩余电量，低于阈值时提醒。",
          "electricityAlert",
          DEFAULT_NOTIFICATION_ICONS.electricity,
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
            <div className="notification-setting-row notification-editor-row">
              {notificationEditor("electricityIcon", "electricityTitle", "electricityBody")}
            </div>
          </>
        )}
        {toggleRow(
          "一卡通余额预警",
          "定时查询一卡通余额，低于阈值时提醒。",
          "schoolCardAlert",
          DEFAULT_NOTIFICATION_ICONS.schoolCard,
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
            <div className="notification-setting-row notification-editor-row">
              {notificationEditor("schoolCardIcon", "schoolCardTitle", "schoolCardBody")}
            </div>
          </>
        )}
      </section>
      <p className="notification-setting-note">
        普通关闭应用后，系统会按轮询间隔继续执行；一卡通需要已登录的完美校园会话。系统强制停止应用或限制后台活动时不会执行。
      </p>
      <div className="notification-test">
        <button
          className="elec-ghost notification-test-button"
          onClick={() => void sendTest()}
          disabled={testSending}
        >
          <Icon name={DEFAULT_NOTIFICATION_ICONS.test} size={17} />
          {testSending ? "正在发送…" : "发送测试通知"}
        </button>
        {notificationEditor("testIcon", "testTitle", "testBody")}
        {testStatus && (
          <p className="notification-test-status" role="status">
            {testStatus}
          </p>
        )}
      </div>
    </div>
  );
}
