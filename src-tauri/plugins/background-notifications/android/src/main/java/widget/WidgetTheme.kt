package com.plugin.background_notifications

import androidx.compose.ui.graphics.Color
import androidx.glance.color.ColorProvider as dayNightColorProvider
import androidx.glance.unit.ColorProvider

/** 与应用外观设置里的主题色一一对应。 */
internal enum class WidgetThemeMode(val id: String) {
  SYSTEM("system"),
  LIGHT("light"),
  DARK("dark"),
  ;

  companion object {
    val DEFAULT = SYSTEM

    fun fromId(id: String?): WidgetThemeMode = entries.firstOrNull { it.id == id } ?: DEFAULT
  }
}

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
 * 小组件的颜色取自应用 tokens.css 中对应主题色的亮色和暗色语义值，
 * 再根据设置选择跟随系统、固定亮色或固定暗色。
 *
 * 背景用 drawable 而不是颜色，这样圆角在所有系统版本上都有效
 * （Glance 的 `cornerRadius` 需要 Android 12）。
 */
internal class WidgetPalette private constructor(
  private val backgroundLightRes: Int,
  private val backgroundDarkRes: Int,
  private val primaryTextDay: Long,
  private val primaryTextNight: Long,
  private val secondaryTextDay: Long,
  private val secondaryTextNight: Long,
  private val dividerDay: Long,
  private val dividerNight: Long,
  themeMode: WidgetThemeMode,
) {
  val primaryText = provider(primaryTextDay, primaryTextNight, themeMode)
  val secondaryText = provider(secondaryTextDay, secondaryTextNight, themeMode)
  val divider = provider(dividerDay, dividerNight, themeMode)
  val backgroundRes = when (themeMode) {
    // The base drawable has a drawable-night counterpart, so this follows the
    // system theme while keeping the rounded shape.
    WidgetThemeMode.SYSTEM -> backgroundLightRes
    WidgetThemeMode.LIGHT -> backgroundLightRes
    WidgetThemeMode.DARK -> backgroundDarkRes
  }

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
    val courseText = provider(0xFFFFFFFF, 0xFFFFFFFF, WidgetThemeMode.DARK)

    private val PALETTES = mapOf(
      WidgetAccent.TEAL to WidgetPalette(
        backgroundLightRes = R.drawable.timetable_widget_background_teal,
        backgroundDarkRes = R.drawable.timetable_widget_background_teal_dark,
        primaryTextDay = 0xFF172A23,
        primaryTextNight = 0xFFEDF7F2,
        secondaryTextDay = 0xFF50675C,
        secondaryTextNight = 0xFFBED0C8,
        dividerDay = 0xFFDFE9E3,
        dividerNight = 0xFF304139,
        themeMode = WidgetThemeMode.SYSTEM,
      ),
      WidgetAccent.BLUE to WidgetPalette(
        backgroundLightRes = R.drawable.timetable_widget_background_blue,
        backgroundDarkRes = R.drawable.timetable_widget_background_blue_dark,
        primaryTextDay = 0xFF1B283D,
        primaryTextNight = 0xFFEDF3FC,
        secondaryTextDay = 0xFF53657F,
        secondaryTextNight = 0xFFC1CCDC,
        dividerDay = 0xFFDFE6F1,
        dividerNight = 0xFF344256,
        themeMode = WidgetThemeMode.SYSTEM,
      ),
      WidgetAccent.VIOLET to WidgetPalette(
        backgroundLightRes = R.drawable.timetable_widget_background_violet,
        backgroundDarkRes = R.drawable.timetable_widget_background_violet_dark,
        primaryTextDay = 0xFF2B233C,
        primaryTextNight = 0xFFF2EFFB,
        secondaryTextDay = 0xFF685C7D,
        secondaryTextNight = 0xFFD0C9E2,
        dividerDay = 0xFFE7E1F0,
        dividerNight = 0xFF403B54,
        themeMode = WidgetThemeMode.SYSTEM,
      ),
      WidgetAccent.AMBER to WidgetPalette(
        backgroundLightRes = R.drawable.timetable_widget_background_amber,
        backgroundDarkRes = R.drawable.timetable_widget_background_amber_dark,
        primaryTextDay = 0xFF33291B,
        primaryTextNight = 0xFFFAF3E7,
        secondaryTextDay = 0xFF75634A,
        secondaryTextNight = 0xFFD8CBB5,
        dividerDay = 0xFFECE3D4,
        dividerNight = 0xFF49402F,
        themeMode = WidgetThemeMode.SYSTEM,
      ),
      WidgetAccent.ROSE to WidgetPalette(
        backgroundLightRes = R.drawable.timetable_widget_background_rose,
        backgroundDarkRes = R.drawable.timetable_widget_background_rose_dark,
        primaryTextDay = 0xFF38212D,
        primaryTextNight = 0xFFFBF0F5,
        secondaryTextDay = 0xFF7A5969,
        secondaryTextNight = 0xFFDEC5D1,
        dividerDay = 0xFFF0DFE7,
        dividerNight = 0xFF4C3745,
        themeMode = WidgetThemeMode.SYSTEM,
      ),
    )

    fun of(accent: WidgetAccent, themeMode: WidgetThemeMode): WidgetPalette {
      val base = PALETTES.getValue(accent)
      return base.copyFor(themeMode)
    }

    private fun provider(day: Long, night: Long, mode: WidgetThemeMode): ColorProvider =
      when (mode) {
        WidgetThemeMode.SYSTEM -> dayNightColorProvider(Color(day), Color(night))
        WidgetThemeMode.LIGHT -> ColorProvider(Color(day))
        WidgetThemeMode.DARK -> ColorProvider(Color(night))
      }
  }

  private fun copyFor(mode: WidgetThemeMode) = WidgetPalette(
    backgroundLightRes,
    backgroundDarkRes,
    primaryTextDay,
    primaryTextNight,
    secondaryTextDay,
    secondaryTextNight,
    dividerDay,
    dividerNight,
    mode,
  )
}
