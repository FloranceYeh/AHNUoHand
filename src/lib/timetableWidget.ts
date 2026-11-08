import { invoke } from "@tauri-apps/api/core";
import { isMobile } from "./classroom";
import { parseCellText, type CourseSlot } from "./timetable";
import type { GridResult } from "./timetableSession";
import {
  readTimetableWidgetSettings,
  type TimetableWidgetSettings,
} from "./timetableWidgetSettings";

interface WidgetPayload {
  startDate?: string;
  maxWeek: number;
  week: number;
  slots: CourseSlot[];
}

/** 将最近一次课表缓存同步给 Android 桌面小组件。 */
export async function syncTimetableWidget(
  grid: GridResult | null,
  maxWeek: number,
  currentWeek: number,
  startDate = grid?.startDate,
): Promise<void> {
  if (!grid || !isMobile() || !/Android/i.test(navigator.userAgent)) return;
  const slots = grid.cells.flatMap((cell) =>
    parseCellText(cell.text, cell.weekday, cell.period, cell.span),
  );
  const payload: WidgetPayload = {
    startDate,
    maxWeek,
    week: currentWeek,
    slots,
  };
  await invoke("plugin:background-notifications|sync_widget", {
    payload: {
      data: JSON.stringify(payload),
      settings: JSON.stringify(readTimetableWidgetSettings()),
    },
  });
}

/** 在不重新读取课表的情况下刷新小组件显示设置。 */
export async function syncTimetableWidgetSettings(
  settings: TimetableWidgetSettings,
): Promise<void> {
  if (!isMobile() || !/Android/i.test(navigator.userAgent)) return;
  await invoke("plugin:background-notifications|sync_widget", {
    payload: { settings: JSON.stringify(settings) },
  });
}
