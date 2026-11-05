/**
 * 触觉反馈。
 *
 * 原生应用点按钮时有轻微的振动回执，网页没有。这里用 Vibration API 补上，
 * 让关键操作（切换标签、提交、成功、失败）有稳定的触感。
 *
 * 不支持的平台静默跳过，不影响功能。
 */

type HapticKind = "light" | "medium" | "success" | "error";

/** 各类反馈的振动时长（毫秒）。 */
const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 16,
  success: [12, 40, 12],
  error: [24, 60, 24],
};

function supported(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  );
}

export function haptic(kind: HapticKind = "light"): void {
  if (!supported()) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* 某些 WebView 会拒绝，忽略即可 */
  }
}

/** 用户在系统设置里关掉了触感时，这里也应该跟着安静。 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function hapticIfAllowed(kind: HapticKind = "light"): void {
  if (prefersReducedMotion()) return;
  haptic(kind);
}
