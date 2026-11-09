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
  weekCellHeight: 40,
  maxCourses: 4,
};

/** 取值范围，与 Android 端 `WidgetSettings` 的夹取保持一致。 */
export const WIDGET_MAX_COURSES = { min: 1, max: 8, step: 1 } as const;
export const WIDGET_WEEK_CELL_HEIGHT = { min: 28, max: 64, step: 2 } as const;

const STORAGE_KEY = "ahnu.timetable.widget.settings.v1";

type BooleanKey = {
  [
    K in keyof TimetableWidgetSettings
  ]: TimetableWidgetSettings[K] extends boolean ? K : never;
}[keyof TimetableWidgetSettings];

const BOOLEAN_KEYS: BooleanKey[] = [
  "showTime",
  "showPlace",
  "showTeacher",
  "showWeekend",
];

function clampStep(
  value: unknown,
  range: { min: number; max: number; step: number },
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, stepped));
}

/** 把任意输入整理成合法设置，缺失或越界的字段回退到默认值。 */
export function normalizeTimetableWidgetSettings(
  input: unknown,
): TimetableWidgetSettings {
  const source = (input && typeof input === "object" ? input : {}) as Partial<
    Record<keyof TimetableWidgetSettings, unknown>
  >;
  const defaults = DEFAULT_TIMETABLE_WIDGET_SETTINGS;
  const settings = { ...defaults };
  for (const key of BOOLEAN_KEYS) {
    const value = source[key];
    if (typeof value === "boolean") settings[key] = value;
  }
  settings.maxCourses = clampStep(
    source.maxCourses,
    WIDGET_MAX_COURSES,
    defaults.maxCourses,
  );
  settings.weekCellHeight = clampStep(
    source.weekCellHeight,
    WIDGET_WEEK_CELL_HEIGHT,
    defaults.weekCellHeight,
  );
  return settings;
}

export function readTimetableWidgetSettings(): TimetableWidgetSettings {
  try {
    return normalizeTimetableWidgetSettings(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_TIMETABLE_WIDGET_SETTINGS };
  }
}

export function saveTimetableWidgetSettings(
  settings: TimetableWidgetSettings,
): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* Ignore unavailable storage. */
  }
}
