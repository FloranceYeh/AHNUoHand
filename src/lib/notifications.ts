import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";
import { renderNotificationImage } from "./notificationImage";
import { CACHE_KEY } from "./timetableSession";
import { resolveSemester } from "./semesterSettings";
import { parseCellText } from "./timetable";
import { isMobile } from "./classroom";
import { fetchElectricity, getSavedOperator, writeCache } from "./electricity";
import { currentSchoolCardMonth, querySchoolCardSilently } from "./schoolcard";

const SETTINGS_KEY = "ahnu.notifications.settings.v1";
const REMINDER_ID_START = 730000;

export type NotificationKind = "class" | "electricity" | "schoolCard" | "test";

export const DEFAULT_NOTIFICATION_ICONS = {
  class: "book",
  electricity: "bolt",
  schoolCard: "idCard",
  test: "bell",
} satisfies Record<NotificationKind, string>;

export interface NotificationSettings {
  classIcon: string;
  classTitle: string;
  classBody: string;
  electricityIcon: string;
  electricityTitle: string;
  electricityBody: string;
  schoolCardIcon: string;
  schoolCardTitle: string;
  schoolCardBody: string;
  testIcon: string;
  testTitle: string;
  testBody: string;
  classReminder: boolean;
  reminderMinutes: number;
  electricityAlert: boolean;
  electricityBalance: number;
  electricityPollMinutes: number;
  schoolCardAlert: boolean;
  schoolCardBalance: number;
  schoolCardPollMinutes: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  classIcon: DEFAULT_NOTIFICATION_ICONS.class,
  classTitle: "即将上课",
  classBody: "{{course}}{{details}} · {{minutes}} 分钟后开始",
  electricityIcon: DEFAULT_NOTIFICATION_ICONS.electricity,
  electricityTitle: "宿舍剩余电量提醒",
  electricityBody:
    "宿舍剩余电量 {{value}} 度，已低于设定阈值 {{threshold}} 度。",
  schoolCardIcon: DEFAULT_NOTIFICATION_ICONS.schoolCard,
  schoolCardTitle: "一卡通余额提醒",
  schoolCardBody: "当前余额 ¥{{value}}，已低于设定阈值 ¥{{threshold}}。",
  testIcon: DEFAULT_NOTIFICATION_ICONS.test,
  testTitle: "AHNUoHand 通知测试",
  testBody: "通知权限和系统推送工作正常。",
  classReminder: false,
  reminderMinutes: 10,
  electricityAlert: false,
  electricityBalance: 10,
  electricityPollMinutes: 360,
  schoolCardAlert: false,
  schoolCardBalance: 20,
  schoolCardPollMinutes: 360,
};

function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

export function readNotificationSettings(): NotificationSettings {
  try {
    const value = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}",
    ) as Partial<NotificationSettings>;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...value };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function syncBackgroundNotificationTask(
  settings = readNotificationSettings(),
): Promise<void> {
  if (!isMobile()) return;
  const settingsWithImages = {
    ...settings,
    electricityImageBase64: settings.electricityAlert
      ? await renderNotificationImage(settings.electricityIcon)
      : "",
    schoolCardImageBase64: settings.schoolCardAlert
      ? await renderNotificationImage(settings.schoolCardIcon)
      : "",
  };
  await invoke("plugin:background-notifications|configure", {
    payload: {
      settings: JSON.stringify(settingsWithImages),
      operatorNo: getSavedOperator(),
    },
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

export async function notify(
  title: string,
  body: string,
  iconName = "bell",
): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  if (isMobile()) {
    await invoke("plugin:background-notifications|notify", {
      payload: {
        title,
        body,
        imageBase64: await renderNotificationImage(iconName),
      },
    });
  } else {
    sendNotification({ title, body });
  }
  return true;
}

export async function syncCourseNotifications(
  settings = readNotificationSettings(),
): Promise<void> {
  if (!isMobile()) return;
  if (!settings.classReminder) {
    await invoke("plugin:background-notifications|schedule", {
      payload: { jobs: "[]" },
    });
    return;
  }

  let grid: {
    startDate?: string;
    cells?: { weekday: number; period: number; span: number; text: string }[];
  };
  try {
    grid = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    await invoke("plugin:background-notifications|schedule", {
      payload: { jobs: "[]" },
    });
    return;
  }
  if (!grid?.startDate || !grid.cells?.length) {
    await invoke("plugin:background-notifications|schedule", {
      payload: { jobs: "[]" },
    });
    return;
  }
  const semester = resolveSemester(grid.startDate);
  if (!semester.firstStart) {
    await invoke("plugin:background-notifications|schedule", {
      payload: { jobs: "[]" },
    });
    return;
  }
  const firstMonday = new Date(semester.firstStart);
  firstMonday.setHours(0, 0, 0, 0);
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 35);
  let id = REMINDER_ID_START;
  const jobs: {
    id: number;
    title: string;
    body: string;
    at: number;
    imageBase64?: string;
  }[] = [];
  const imageBase64 = await renderNotificationImage(settings.classIcon);
  for (const cell of grid.cells) {
    const slots = parseCellText(
      cell.text,
      cell.weekday,
      cell.period,
      cell.span,
    );
    for (const slot of slots) {
      const [startText] = slot.timeRange.split("-");
      if (!startText || !slot.weeks.length) continue;
      const start = startText.includes(":")
        ? startText
        : `${startText.slice(0, -2)}:${startText.slice(-2)}`;
      const [hour, minute] = start.split(":").map(Number);
      for (const week of slot.weeks) {
        const date = new Date(firstMonday);
        date.setDate(date.getDate() + (week - 1) * 7 + slot.weekday - 1);
        date.setHours(hour, minute - settings.reminderMinutes, 0, 0);
        if (date <= now || date > end || jobs.length >= 200) continue;
        const details = [slot.place, slot.teacher].filter(Boolean).join(" · ");
        jobs.push({
          id: id++,
          title: renderTemplate(settings.classTitle, {
            course: slot.name,
            details: details ? ` · ${details}` : "",
            minutes: String(settings.reminderMinutes),
          }),
          body: renderTemplate(settings.classBody, {
            course: slot.name,
            details: details ? ` · ${details}` : "",
            minutes: String(settings.reminderMinutes),
          }),
          at: date.getTime(),
          imageBase64,
        });
      }
    }
  }
  if (!(await ensureNotificationPermission())) return;
  await invoke("plugin:background-notifications|schedule", {
    payload: { jobs: JSON.stringify(jobs) },
  });
}

export function checkThresholdAlert(
  kind: "electricity" | "schoolcard",
  value: number,
  period: string,
  threshold: number,
): void {
  if (!Number.isFinite(value)) return;
  const reached = value <= threshold;
  if (!reached) return;
  const key = `ahnu.notifications.alerted.${kind}.${period}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");
  const settings = readNotificationSettings();
  const isElectricity = kind === "electricity";
  void notify(
    renderTemplate(
      settings[isElectricity ? "electricityTitle" : "schoolCardTitle"],
      {
        value: isElectricity ? value.toFixed(1) : value.toFixed(2),
        threshold: threshold.toString(),
        period,
      },
    ),
    renderTemplate(
      settings[isElectricity ? "electricityBody" : "schoolCardBody"],
      {
        value: isElectricity ? value.toFixed(1) : value.toFixed(2),
        threshold: threshold.toString(),
        period,
      },
    ),
    settings[isElectricity ? "electricityIcon" : "schoolCardIcon"],
  );
}

export async function pollNotificationSources(
  settings = readNotificationSettings(),
): Promise<void> {
  const now = Date.now();
  if (settings.electricityAlert) {
    const operator = getSavedOperator();
    const previous = Number(
      localStorage.getItem("ahnu.notifications.poll.electricity") || 0,
    );
    if (
      operator &&
      now - previous >= settings.electricityPollMinutes * 60_000
    ) {
      localStorage.setItem("ahnu.notifications.poll.electricity", String(now));
      try {
        const report = await fetchElectricity(operator, 15);
        writeCache(operator, report);
        checkThresholdAlert(
          "electricity",
          report.balance.kwhLeft,
          new Date().toISOString().slice(0, 10),
          settings.electricityBalance,
        );
      } catch {
        /* Network and service errors should not interrupt app use. */
      }
    }
  }
  if (settings.schoolCardAlert && isMobile()) {
    const previous = Number(
      localStorage.getItem("ahnu.notifications.poll.schoolcard") || 0,
    );
    if (now - previous >= settings.schoolCardPollMinutes * 60_000) {
      localStorage.setItem("ahnu.notifications.poll.schoolcard", String(now));
      try {
        const report = await querySchoolCardSilently(currentSchoolCardMonth());
        checkThresholdAlert(
          "schoolcard",
          report.balance,
          report.month,
          settings.schoolCardBalance,
        );
      } catch {
        /* Requires a valid school-card session and network access. */
      }
    }
  }
}
