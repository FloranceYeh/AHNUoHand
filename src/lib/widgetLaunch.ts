import { invoke } from "@tauri-apps/api/core";
import { isMobile } from "./classroom";

/** 小组件点击后要打开的页面，目前只有课程表。 */
export type WidgetLaunchRoute = "timetable";

function supportsWidgets(): boolean {
  return isMobile() && /Android/i.test(navigator.userAgent);
}

/**
 * 取出小组件点击带来的待跳转页面，取出后即清除。
 *
 * 冷启动和从后台唤回都要调用：两种情况下 Intent 到达的时机不同，
 * 但都记在原生侧等前端来取。
 */
export async function takeWidgetLaunchRoute(): Promise<WidgetLaunchRoute | null> {
  if (!supportsWidgets()) return null;
  try {
    const result = await invoke<{ route: string }>(
      "plugin:background-notifications|take_widget_launch_route",
    );
    return result.route === "timetable" ? "timetable" : null;
  } catch {
    return null;
  }
}
