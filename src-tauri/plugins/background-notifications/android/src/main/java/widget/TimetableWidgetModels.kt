package com.plugin.background_notifications

import org.json.JSONArray
import org.json.JSONObject

/** User-facing display options shared by every timetable widget. */
internal data class WidgetSettings(
  val showTime: Boolean = true,
  val showPlace: Boolean = true,
  val showTeacher: Boolean = true,
  val showWeekend: Boolean = true,
  val weekCellHeight: Int = DEFAULT_WEEK_CELL_HEIGHT,
  val themeMode: WidgetThemeMode = WidgetThemeMode.DEFAULT,
  val accent: WidgetAccent = WidgetAccent.DEFAULT,
) {
  val palette: WidgetPalette get() = WidgetPalette.of(accent, themeMode)

  /** Clamps values so a malformed payload can never break the layout. */
  fun sanitized(): WidgetSettings = copy(
    weekCellHeight = weekCellHeight.coerceIn(WEEK_CELL_HEIGHT_RANGE),
  )

  fun toJson(): String = JSONObject()
    .put("showTime", showTime)
    .put("showPlace", showPlace)
    .put("showTeacher", showTeacher)
    .put("showWeekend", showWeekend)
    .put("weekCellHeight", weekCellHeight)
    .put("themeMode", themeMode.id)
    .put("accent", accent.id)
    .toString()

  companion object {
    const val DEFAULT_WEEK_CELL_HEIGHT = 40
    val WEEK_CELL_HEIGHT_RANGE = 28..64

    fun fromJson(raw: String?): WidgetSettings {
      val json = raw?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return WidgetSettings()
      val defaults = WidgetSettings()
      return WidgetSettings(
        showTime = json.optBoolean("showTime", defaults.showTime),
        showPlace = json.optBoolean("showPlace", defaults.showPlace),
        showTeacher = json.optBoolean("showTeacher", defaults.showTeacher),
        showWeekend = json.optBoolean("showWeekend", defaults.showWeekend),
        weekCellHeight = json.optInt("weekCellHeight", defaults.weekCellHeight),
        themeMode = WidgetThemeMode.fromId(json.optString("themeMode")),
        accent = WidgetAccent.fromId(json.optString("accent")),
      ).sanitized()
    }
  }
}

internal data class WidgetCourse(
  /** 1 = Monday. */
  val weekday: Int,
  val period: Int,
  val span: Int,
  val name: String,
  val place: String,
  val teacher: String,
  /** Raw school time range such as `800-935`; may be blank. */
  val timeRange: String,
  /** Empty means the course runs every week. */
  val weeks: Set<Int>,
) {
  val lastPeriod: Int get() = period + span - 1
  val displayName: String get() = name.ifBlank { "未命名课程" }

  /** `800-935` → `08:00-09:35`, matching the in-app timetable. */
  val displayTime: String
    get() {
      val parts = timeRange.split(TIME_RANGE_SEPARATOR)
      if (parts.size != 2) return ""
      val start = formatClock(parts[0]) ?: return ""
      val end = formatClock(parts[1]) ?: return ""
      return "$start-$end"
    }

  fun isActiveIn(week: Int): Boolean = weeks.isEmpty() || week in weeks
}

internal data class PeriodTime(val start: String, val end: String)

/** The last timetable pushed by the app, parsed once per DataStore emission. */
internal data class TimetableSnapshot(
  val startDate: CalendarDay?,
  val maxWeek: Int,
  /** Week reported by the app at sync time; used when no start date is known. */
  val syncedWeek: Int,
  val courses: List<WidgetCourse>,
  val periodTimes: List<PeriodTime>,
) {
  val periodCount: Int
    get() = maxOf(periodTimes.size, courses.maxOfOrNull { it.lastPeriod } ?: 0).coerceAtLeast(1)

  fun periodTime(period: Int): PeriodTime? = periodTimes.getOrNull(period - 1)

  companion object {
    /** Returns null when [raw] is not a timetable payload. */
    fun fromJson(raw: String?): TimetableSnapshot? {
      val json = raw?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
      val slots = json.optJSONArray("slots") ?: return null
      return TimetableSnapshot(
        startDate = CalendarDay.parse(json.optString("startDate")),
        maxWeek = json.optInt("maxWeek", 0),
        syncedWeek = json.optInt("week", 1).coerceAtLeast(1),
        courses = slots.objects().mapNotNull(::parseCourse),
        periodTimes = parsePeriodTimes(json.optJSONArray("times")),
      )
    }

    private fun parseCourse(item: JSONObject): WidgetCourse? {
      val weekday = item.optInt("weekday")
      val period = item.optInt("period")
      if (weekday !in 1..7 || period < 1) return null
      return WidgetCourse(
        weekday = weekday,
        period = period,
        span = item.optInt("span", 1).coerceAtLeast(1),
        name = item.optString("name").trim(),
        place = item.optString("place").trim(),
        teacher = item.optString("teacher").trim(),
        timeRange = item.optString("timeRange").trim(),
        weeks = item.optJSONArray("weeks")?.ints()?.toSet().orEmpty(),
      )
    }

    /** `times` is a flat list: start1, end1, start2, end2, ... */
    private fun parsePeriodTimes(times: JSONArray?): List<PeriodTime> {
      val values = times?.strings().orEmpty()
      if (values.size < 2) return DEFAULT_PERIOD_TIMES
      return values.chunked(2).filter { it.size == 2 }.map { (start, end) -> PeriodTime(start, end) }
    }
  }
}

/** Everything a widget needs to render. */
internal data class WidgetState(
  val snapshot: TimetableSnapshot?,
  val settings: WidgetSettings,
)

private val TIME_RANGE_SEPARATOR = Regex("""\s*[-–~]\s*""")

private fun formatClock(part: String): String? {
  val digits = part.filter(Char::isDigit)
  if (digits.length !in 3..4) return null
  return "${digits.dropLast(2).padStart(2, '0')}:${digits.takeLast(2)}"
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull(::optJSONObject)
private fun JSONArray.ints(): List<Int> = (0 until length()).map(::optInt)
private fun JSONArray.strings(): List<String> = (0 until length()).map(::optString)

private val DEFAULT_PERIOD_TIMES = listOf(
  "08:00" to "08:45", "08:50" to "09:35", "09:50" to "10:35",
  "10:40" to "11:25", "11:30" to "12:15", "14:00" to "14:45",
  "14:50" to "15:35", "15:40" to "16:25", "16:30" to "17:15",
  "17:20" to "18:05", "19:00" to "19:45", "19:50" to "20:35",
  "20:40" to "21:25",
).map { (start, end) -> PeriodTime(start, end) }
