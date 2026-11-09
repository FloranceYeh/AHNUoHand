import { invoke } from "@tauri-apps/api/core";
import { isMobile } from "./classroom";
import { parseCellText, type CourseSlot } from "./timetable";
import type { GridResult } from "./timetableSession";
import type { TimetableWidgetSettings } from "./timetableWidgetSettings";

interface WidgetPayload {
  startDate?: string;
  maxWeek: number;
  week: number;
  slots: CourseSlot[];
  times?: string[];
}

/** `data` 与 `settings` 均可省略，省略的部分沿用设备上已保存的值。 */
interface SyncWidgetRequest {
  data?: string;
  settings?: TimetableWidgetSettings;
}

function supportsWidgets(): boolean {
  return isMobile() && /Android/i.test(navigator.userAgent);
}

function syncWidget(payload: SyncWidgetRequest): Promise<void> {
  return invoke("plugin:background-notifications|sync_widget", { payload });
}

/** 将最近一次课表缓存同步给 Android 桌面小组件。 */
export async function syncTimetableWidget(
  grid: GridResult | null,
  maxWeek: number,
  currentWeek: number,
  startDate = grid?.startDate,
): Promise<void> {
  if (!grid || !supportsWidgets()) return;
  const slots = grid.cells.flatMap((cell) =>
    parseCellText(cell.text, cell.weekday, cell.period, cell.span),
  );
  const payload: WidgetPayload = {
    startDate,
    maxWeek,
    week: currentWeek,
    slots,
    times: grid.times,
  };
  await syncWidget({ data: JSON.stringify(payload) });
}

let settingsInFlight: Promise<void> | null = null;
let queuedSettings: TimetableWidgetSettings | null = null;

/**
 * 实时推送小组件显示设置。
 *
 * 同一时间只有一次同步在进行；期间的多次修改只保留最后一次，
 * 当前同步结束后立即发送。这样连续点 Stepper 时既不会乱序，
 * 也不会堆积一串过时的请求。
 */
export function syncTimetableWidgetSettings(
  settings: TimetableWidgetSettings,
): Promise<void> {
  if (!supportsWidgets()) return Promise.resolve();
  queuedSettings = settings;
  if (!settingsInFlight) {
    settingsInFlight = (async () => {
      // 只有最后一次发送的结果有意义：它决定小组件最终显示什么。
      let lastError: unknown = null;
      while (queuedSettings) {
        const next = queuedSettings;
        queuedSettings = null;
        try {
          await syncWidget({ settings: next });
          lastError = null;
        } catch (error) {
          lastError = error;
        }
      }
      settingsInFlight = null;
      if (lastError) throw lastError;
    })();
  }
  return settingsInFlight;
}
