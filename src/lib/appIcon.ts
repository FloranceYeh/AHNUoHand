import { invoke } from "@tauri-apps/api/core";
import { isMobile } from "./classroom";
import type { AccentColor } from "./theme";

/**
 * Android launcher icons are packaged resources. The native plugin switches
 * the enabled activity-alias to the selected static adaptive icon.
 */
export async function syncApplicationIcon(
  accent: AccentColor,
): Promise<boolean> {
  if (!isMobile() || !/Android/i.test(navigator.userAgent)) return false;
  await invoke("plugin:background-notifications|sync_icon", {
    payload: { accent },
  });
  return true;
}
