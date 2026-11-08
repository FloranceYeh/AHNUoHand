export interface TimetableWidgetSettings {
  showTime: boolean;
  showPlace: boolean;
  showTeacher: boolean;
  showWeekend: boolean;
  weekCellHeight: number;
  maxCourses: number;
}

export const DEFAULT_TIMETABLE_WIDGET_SETTINGS: TimetableWidgetSettings = {
  showTime: true,
  showPlace: true,
  showTeacher: true,
  showWeekend: true,
  weekCellHeight: 39,
  maxCourses: 4,
};

const STORAGE_KEY = "ahnu.timetable.widget.settings.v1";

function clampMaxCourses(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TIMETABLE_WIDGET_SETTINGS.maxCourses;
  }
  return Math.min(8, Math.max(1, Math.round(value)));
}

function clampWeekCellHeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TIMETABLE_WIDGET_SETTINGS.weekCellHeight;
  }
  return Math.min(64, Math.max(28, Math.round(value / 2) * 2));
}

export function readTimetableWidgetSettings(): TimetableWidgetSettings {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<TimetableWidgetSettings> | null;
    return {
      showTime:
        typeof parsed?.showTime === "boolean"
          ? parsed.showTime
          : DEFAULT_TIMETABLE_WIDGET_SETTINGS.showTime,
      showPlace:
        typeof parsed?.showPlace === "boolean"
          ? parsed.showPlace
          : DEFAULT_TIMETABLE_WIDGET_SETTINGS.showPlace,
      showTeacher:
        typeof parsed?.showTeacher === "boolean"
          ? parsed.showTeacher
          : DEFAULT_TIMETABLE_WIDGET_SETTINGS.showTeacher,
      showWeekend:
        typeof parsed?.showWeekend === "boolean"
          ? parsed.showWeekend
          : DEFAULT_TIMETABLE_WIDGET_SETTINGS.showWeekend,
      weekCellHeight: clampWeekCellHeight(parsed?.weekCellHeight),
      maxCourses: clampMaxCourses(parsed?.maxCourses),
    };
  } catch {
    return { ...DEFAULT_TIMETABLE_WIDGET_SETTINGS };
  }
}

export function saveTimetableWidgetSettings(
  settings: TimetableWidgetSettings,
): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
