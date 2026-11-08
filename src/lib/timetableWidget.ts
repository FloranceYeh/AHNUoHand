import { invoke } from "@tauri-apps/api/core";
import { isMobile } from "./classroom";
import { parseCellText, type CourseSlot } from "./timetable";
import type { GridResult } from "./timetableSession";

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
    payload: { data: JSON.stringify(payload) },
  });
}
