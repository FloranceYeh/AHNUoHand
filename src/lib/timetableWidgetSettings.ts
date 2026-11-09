import { ACCENT_COLORS, type AccentColor } from "./theme";

export interface TimetableWidgetSettings {
  showTime: boolean;
  showPlace: boolean;
  showTeacher: boolean;
  showWeekend: boolean;
  weekCellHeight: number;
  /** 是否跟随应用外观设置中的主题色。 */
  followAppAccent: boolean;
  /** 小组件配色，取值与外观设置里的主题色一致。 */
  accent: AccentColor;
}

export const DEFAULT_TIMETABLE_WIDGET_SETTINGS: TimetableWidgetSettings = {
  showTime: true,
  showPlace: true,
  showTeacher: true,
  showWeekend: true,
  weekCellHeight: 40,
  followAppAccent: true,
  accent: "teal",
};

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
  "followAppAccent",
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
  const accent = source.accent;
  if (ACCENT_COLORS.includes(accent as AccentColor)) {
    settings.accent = accent as AccentColor;
  }
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
