package com.plugin.background_notifications

import android.content.Intent

/** 小组件点击时启动的 Activity，与 `gen/android` 里生成的清单一致。 */
internal const val MAIN_ACTIVITY_CLASS = "top.florance.ahnuohand.MainActivity"

internal const val LAUNCH_ROUTE_EXTRA = "ahnu.launchRoute"
internal const val LAUNCH_ROUTE_TIMETABLE = "timetable"

/**
 * 小组件点击后要打开的页面。
 *
 * 冷启动时 Intent 在 Activity 上，热启动时走 `onNewIntent`，两种情况都记在这里，
 * 由前端取走一次。只保留最后一次点击：中途的点击已经被新的覆盖了。
 */
internal object WidgetLaunchRoute {
  private var pending: String? = null

  @Synchronized
  fun remember(intent: Intent?) {
    if (intent?.getStringExtra(LAUNCH_ROUTE_EXTRA) == LAUNCH_ROUTE_TIMETABLE) {
      pending = LAUNCH_ROUTE_TIMETABLE
    }
  }

  /** 读取并清除，避免返回桌面再回来时又跳一次。 */
  @Synchronized
  fun take(): String? = pending.also { pending = null }
}
