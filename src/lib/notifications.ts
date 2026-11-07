import {
  isPermissionGranted,
  requestPermission,
  Schedule,
  sendNotification,
  pending,
  cancel,
} from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";
import { CACHE_KEY } from "./timetableSession";
import { resolveSemester } from "./semesterSettings";
import { parseCellText } from "./timetable";
import { isMobile } from "./classroom";
import { fetchElectricity, getSavedOperator, writeCache } from "./electricity";
import { currentSchoolCardMonth, querySchoolCardSilently } from "./schoolcard";

const SETTINGS_KEY = "ahnu.notifications.settings.v1";
const REMINDER_ID_START = 730000;

export interface NotificationSettings {
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
  classReminder: false,
  reminderMinutes: 10,
  electricityAlert: false,
  electricityBalance: 10,
  electricityPollMinutes: 360,
  schoolCardAlert: false,
  schoolCardBalance: 20,
  schoolCardPollMinutes: 360,
};

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
  await invoke("plugin:background-notifications|configure", {
    payload: {
      settings: JSON.stringify(settings),
      operatorNo: getSavedOperator(),
    },
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

export async function notify(title: string, body: string): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  sendNotification({ title, body });
  return true;
}

export async function syncCourseNotifications(
  settings = readNotificationSettings(),
): Promise<void> {
  const queued = await pending().catch(() => []);
  const oldIds = queued
    .map((item) => item.id)
    .filter((id) => id >= REMINDER_ID_START && id < REMINDER_ID_START + 10000);
  if (oldIds.length) await cancel(oldIds).catch(() => {});
  if (!settings.classReminder || !isMobile()) return;

  let grid: {
    startDate?: string;
    cells?: { weekday: number; period: number; span: number; text: string }[];
  };
  try {
    grid = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    return;
  }
  if (!grid?.startDate || !grid.cells?.length) return;
  const semester = resolveSemester(grid.startDate);
  if (!semester.firstStart) return;
  const firstMonday = new Date(semester.firstStart);
  firstMonday.setHours(0, 0, 0, 0);
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 35);
  let id = REMINDER_ID_START;
  const jobs: { id: number; title: string; body: string; date: Date }[] = [];
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
          title: "即将上课",
          body: `${slot.name}${details ? ` · ${details}` : ""} · ${settings.reminderMinutes} 分钟后开始`,
          date,
        });
      }
    }
  }
  if (!jobs.length || !(await ensureNotificationPermission())) return;
  for (const job of jobs) {
    sendNotification({
      id: job.id,
      title: job.title,
      body: job.body,
      schedule: Schedule.at(job.date, false, true),
    });
  }
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
  void notify(
    kind === "electricity" ? "宿舍用电提醒" : "一卡通余额提醒",
    kind === "electricity"
      ? `宿舍剩余电量 ${value.toFixed(1)} 度，已低于提醒阈值。`
      : `当前余额 ¥${value.toFixed(2)}，已低于提醒阈值。`,
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
