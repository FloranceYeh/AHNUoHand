package com.plugin.background_notifications

import androidx.compose.ui.graphics.Color
import androidx.glance.unit.ColorProvider

/** 与应用外观设置里的主题色一一对应。 */
internal enum class WidgetAccent(val id: String) {
  TEAL("teal"),
  BLUE("blue"),
  VIOLET("violet"),
  AMBER("amber"),
  ROSE("rose"),
  ;

  companion object {
    val DEFAULT = TEAL

    fun fromId(id: String?): WidgetAccent = entries.firstOrNull { it.id == id } ?: DEFAULT
  }
}

/**
 * 小组件的配色。
 *
 * 小组件只有深色一套配色：桌面壁纸深浅不定，固定的深色底比跟随系统更稳妥，
 * 取的是应用深色模式下同名主题色的颜色。
 *
 * 背景用 drawable 而不是颜色，这样圆角在所有系统版本上都有效
 * （Glance 的 `cornerRadius` 需要 Android 12）。
 */
internal class WidgetPalette private constructor(
  /** 圆角背景 drawable。 */
  val backgroundRes: Int,
  primaryText: Long,
  secondaryText: Long,
  divider: Long,
) {
  val primaryText = provider(primaryText)
  val secondaryText = provider(secondaryText)
  val divider = provider(divider)

  companion object {
    /**
     * 课程卡片的配色，所有主题共用。
     *
     * 它的作用是区分不同课程，跟着主题色变会让相邻课程难以分辨。
     */
    val COURSE_BACKGROUNDS = listOf(
      R.drawable.timetable_widget_course_blue,
      R.drawable.timetable_widget_course_pink,
      R.drawable.timetable_widget_course_orange,
      R.drawable.timetable_widget_course_navy,
      R.drawable.timetable_widget_course_green,
      R.drawable.timetable_widget_course_yellow,
      R.drawable.timetable_widget_course_purple,
      R.drawable.timetable_widget_course_cyan,
    )

    /** 课程卡片的底色较深，卡片上的文字固定用接近白色的字。 */
    val courseText = provider(0xFFFFFFFF)

    private val PALETTES = mapOf(
      WidgetAccent.TEAL to WidgetPalette(
        R.drawable.timetable_widget_background_teal, 0xFFF5FFFC, 0xFFB7D8D0, 0xFF49756B,
      ),
      WidgetAccent.BLUE to WidgetPalette(
        R.drawable.timetable_widget_background_blue, 0xFFF3F8FF, 0xFFB9CCEC, 0xFF4B6694,
      ),
      WidgetAccent.VIOLET to WidgetPalette(
        R.drawable.timetable_widget_background_violet, 0xFFF7F3FF, 0xFFC9BCEA, 0xFF5C4E8C,
      ),
      WidgetAccent.AMBER to WidgetPalette(
        R.drawable.timetable_widget_background_amber, 0xFFFFF8EC, 0xFFE6CFA6, 0xFF8A6A33,
      ),
      WidgetAccent.ROSE to WidgetPalette(
        R.drawable.timetable_widget_background_rose, 0xFFFFF2F7, 0xFFEBBFD2, 0xFF8A4A68,
      ),
    )

    fun of(accent: WidgetAccent): WidgetPalette = PALETTES.getValue(accent)

    private fun provider(argb: Long) = ColorProvider(Color(argb))
  }
}
