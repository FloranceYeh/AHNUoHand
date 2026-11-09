import type { CampusServiceId, NavigationItemId } from "../types";

export type ThemeMode = "system" | "light" | "dark";
export const ACCENT_COLORS = [
  "teal",
  "blue",
  "violet",
  "amber",
  "rose",
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];
export type NavigationDisplay = "icon-label" | "icon-only";
export type ContentMode = "normal" | "simple";

export const DEFAULT_HOME_GREETING = "你好，同学";
export const DEFAULT_HOME_EMOJI = "👋";

export interface ThemeSettings {
  mode: ThemeMode;
  accent: AccentColor;
  appIconSync: boolean;
  navigationDisplay: NavigationDisplay;
  contentMode: ContentMode;
  homeServices: CampusServiceId[];
  navigationTabs: NavigationItemId[];
  defaultNavigation: NavigationItemId;
  homeGreeting: string;
  homeEmoji: string;
}

const STORAGE_KEY = "ahnuhand-theme";
const DEFAULT_SETTINGS: ThemeSettings = {
  mode: "system",
  accent: "teal",
  appIconSync: false,
  navigationDisplay: "icon-label",
  contentMode: "normal",
  homeServices: ["schedule", "classroom", "electricity", "schoolcard"],
  navigationTabs: ["home", "services", "profile"],
  defaultNavigation: "home",
  homeGreeting: DEFAULT_HOME_GREETING,
  homeEmoji: DEFAULT_HOME_EMOJI,
};

const HOME_SERVICE_IDS: CampusServiceId[] = [
  "schedule",
  "classroom",
  "electricity",
  "schoolcard",
  "library",
  "calendar",
  "feedback",
];
const NAVIGATION_TAB_IDS: NavigationItemId[] = [
  "home",
  "services",
  "profile",
  ...HOME_SERVICE_IDS,
];

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function isAccentColor(value: unknown): value is AccentColor {
  return ACCENT_COLORS.includes(value as AccentColor);
}

function isNavigationDisplay(value: unknown): value is NavigationDisplay {
  return value === "icon-label" || value === "icon-only";
}

function isContentMode(value: unknown): value is ContentMode {
  return value === "normal" || value === "simple";
}

function readOrderedSelection<T extends string>(
  value: unknown,
  allowed: T[],
  fallback: T[],
  maximum = allowed.length,
  allowEmpty = false,
): T[] {
  if (!Array.isArray(value)) return [...fallback];
  const selected = value.filter(
    (item, index): item is T =>
      typeof item === "string" &&
      allowed.includes(item as T) &&
      value.indexOf(item) === index,
  );
  if (selected.length === 0) return allowEmpty ? [] : [...fallback];
  return selected.slice(0, maximum);
}

export function readThemeSettings(): ThemeSettings {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as {
      mode?: unknown;
      accent?: unknown;
      appIconSync?: unknown;
      navigationDisplay?: unknown;
      contentMode?: unknown;
      homeServices?: unknown;
      navigationTabs?: unknown;
      defaultNavigation?: unknown;
      homeGreeting?: unknown;
      homeEmoji?: unknown;
    } | null;
    const navigationTabs = readOrderedSelection(
      parsed?.navigationTabs,
      NAVIGATION_TAB_IDS,
      DEFAULT_SETTINGS.navigationTabs,
      5,
    );
    return {
      mode: isThemeMode(parsed?.mode) ? parsed.mode : DEFAULT_SETTINGS.mode,
      accent: isAccentColor(parsed?.accent)
        ? parsed.accent
        : DEFAULT_SETTINGS.accent,
      appIconSync:
        typeof parsed?.appIconSync === "boolean"
          ? parsed.appIconSync
          : DEFAULT_SETTINGS.appIconSync,
      navigationDisplay: isNavigationDisplay(parsed?.navigationDisplay)
        ? parsed.navigationDisplay
        : DEFAULT_SETTINGS.navigationDisplay,
      contentMode: isContentMode(parsed?.contentMode)
        ? parsed.contentMode
        : DEFAULT_SETTINGS.contentMode,
      homeServices: readOrderedSelection(
        parsed?.homeServices,
        HOME_SERVICE_IDS,
        DEFAULT_SETTINGS.homeServices,
        HOME_SERVICE_IDS.length,
        true,
      ),
      navigationTabs,
      homeGreeting:
        typeof parsed?.homeGreeting === "string" &&
        parsed.homeGreeting.length <= 32
          ? parsed.homeGreeting
          : DEFAULT_HOME_GREETING,
      homeEmoji:
        typeof parsed?.homeEmoji === "string" && parsed.homeEmoji.length <= 32
          ? parsed.homeEmoji
          : DEFAULT_HOME_EMOJI,
      defaultNavigation: navigationTabs.includes(
        parsed?.defaultNavigation as NavigationItemId,
      )
        ? (parsed!.defaultNavigation as NavigationItemId)
        : navigationTabs[0],
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
