export type ThemeMode = "system" | "light" | "dark";
export type AccentColor = "teal" | "blue" | "violet" | "amber" | "rose";
export type NavigationDisplay = "icon-label" | "icon-only";
export type ContentMode = "normal" | "simple";

export interface ThemeSettings {
  mode: ThemeMode;
  accent: AccentColor;
  navigationDisplay: NavigationDisplay;
  contentMode: ContentMode;
}

const STORAGE_KEY = "ahnuhand-theme";
const DEFAULT_SETTINGS: ThemeSettings = {
  mode: "system",
  accent: "teal",
  navigationDisplay: "icon-label",
  contentMode: "normal",
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function isAccentColor(value: unknown): value is AccentColor {
  return (
    value === "teal" ||
    value === "blue" ||
    value === "violet" ||
    value === "amber" ||
    value === "rose"
  );
}

function isNavigationDisplay(value: unknown): value is NavigationDisplay {
  return value === "icon-label" || value === "icon-only";
}

function isContentMode(value: unknown): value is ContentMode {
  return value === "normal" || value === "simple";
}

export function readThemeSettings(): ThemeSettings {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as {
      mode?: unknown;
      accent?: unknown;
      navigationDisplay?: unknown;
      contentMode?: unknown;
    } | null;
    return {
      mode: isThemeMode(parsed?.mode) ? parsed.mode : DEFAULT_SETTINGS.mode,
      accent: isAccentColor(parsed?.accent)
        ? parsed.accent
        : DEFAULT_SETTINGS.accent,
      navigationDisplay: isNavigationDisplay(parsed?.navigationDisplay)
        ? parsed.navigationDisplay
        : DEFAULT_SETTINGS.navigationDisplay,
      contentMode: isContentMode(parsed?.contentMode)
        ? parsed.contentMode
        : DEFAULT_SETTINGS.contentMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function applyThemeSettings(settings: ThemeSettings): void {
  const root = document.documentElement;
  root.dataset.theme = settings.mode;
  root.dataset.accent = settings.accent;
  root.dataset.contentMode = settings.contentMode;
  const themeColor = getComputedStyle(root)
    .getPropertyValue("--color-canvas")
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeColor);
}

export function saveThemeSettings(settings: ThemeSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyThemeSettings(settings);
}

export function initializeTheme(): ThemeSettings {
  const settings = readThemeSettings();
  applyThemeSettings(settings);
  return settings;
}
