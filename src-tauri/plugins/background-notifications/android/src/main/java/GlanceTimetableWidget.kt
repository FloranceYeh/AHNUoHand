package com.plugin.background_notifications

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.AndroidResourceImageProvider
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

internal enum class GlanceTimetableMode { TODAY, UPCOMING, WEEK }

private data class GlanceCourse(
  val day: Int,
  val period: Int,
  val span: Int,
  val name: String,
  val place: String,
  val teacher: String,
  val time: String,
  val weeks: List<Int>,
)

internal open class GlanceTimetableWidget(private val mode: GlanceTimetableMode) : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val payload = context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
      .getString(WIDGET_DATA, null)
      ?.let { runCatching { JSONObject(it) }.getOrNull() }
    val settings = context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
      .getString(WIDGET_SETTINGS, null)
      ?.let { runCatching { JSONObject(it) }.getOrNull() }
      ?: JSONObject()
    val week = resolveWeek(payload)
    val courses = payload?.optJSONArray("slots")?.let { slots ->
      when (mode) {
        GlanceTimetableMode.TODAY -> parseCourses(slots, week, currentWeekday())
        GlanceTimetableMode.UPCOMING -> upcomingCourses(slots, week)
        GlanceTimetableMode.WEEK -> parseCourses(slots, week)
      }
    } ?: emptyList()
    provideContent {
      GlanceTimetableContent(
        context = context,
        mode = mode,
        week = week,
        courses = courses,
        settings = settings,
        emptyPayload = payload == null,
        startDate = payload?.optString("startDate")?.takeIf { it.isNotBlank() },
        times = payload?.optJSONArray("times")?.let { array -> (0 until array.length()).map { array.optString(it) } },
      )
    }
  }

  private fun resolveWeek(payload: JSONObject?): Int =
    payload?.let(::currentWeek)?.coerceAtLeast(1) ?: 1
}

internal class GlanceTodayTimetableWidget : GlanceTimetableWidget(GlanceTimetableMode.TODAY)
internal class GlanceUpcomingTimetableWidget : GlanceTimetableWidget(GlanceTimetableMode.UPCOMING)
internal class GlanceWeeklyTimetableWidget : GlanceTimetableWidget(GlanceTimetableMode.WEEK)

class GlanceTodayTimetableWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = GlanceTodayTimetableWidget()
}

class GlanceUpcomingTimetableWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = GlanceUpcomingTimetableWidget()
}

class GlanceWeeklyTimetableWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = GlanceWeeklyTimetableWidget()
}

@Composable
private fun GlanceTimetableContent(
  context: Context,
  mode: GlanceTimetableMode,
  week: Int,
  courses: List<GlanceCourse>,
  settings: JSONObject,
  emptyPayload: Boolean,
  startDate: String?,
  times: List<String>?,
) {
  val primary = ColorProvider(androidx.compose.ui.graphics.Color(0xFFF5FFFC))
  val secondary = ColorProvider(androidx.compose.ui.graphics.Color(0xFFB7D8D0))
  val surface = ColorProvider(androidx.compose.ui.graphics.Color(0xFF17332F))
  val card = ColorProvider(androidx.compose.ui.graphics.Color(0xFF244941))
  val root = GlanceModifier.fillMaxSize()
    .background(AndroidResourceImageProvider(R.drawable.timetable_widget_background))
    .padding(10.dp)
  if (emptyPayload) {
    Box(root, contentAlignment = Alignment.Center) { Text("请先在应用内读取课表", style = TextStyle(color = secondary, fontSize = 13.sp)) }
    return
  }
  Column(root) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Text(
        when (mode) { GlanceTimetableMode.TODAY -> "今日课程"; GlanceTimetableMode.UPCOMING -> "近日课程"; GlanceTimetableMode.WEEK -> "一周课程" },
        style = TextStyle(color = primary, fontSize = 16.sp, fontWeight = FontWeight.Bold),
      )
      Spacer(GlanceModifier.defaultWeight())
      Text(
        if (mode == GlanceTimetableMode.WEEK) weekSummary(startDate, week) else dateSummary(week, 0),
        style = TextStyle(color = secondary, fontSize = 10.sp),
        maxLines = 1,
      )
    }
    Spacer(GlanceModifier.height(6.dp))
    when (mode) {
      GlanceTimetableMode.WEEK -> WeekGrid(
        courses = courses,
        week = week,
        startDate = startDate,
        times = times,
        showWeekend = settings.optBoolean("showWeekend", true),
        cellHeight = settings.optInt("weekCellHeight", 39).coerceIn(28, 64),
        primary = primary,
        secondary = secondary,
      )
      GlanceTimetableMode.UPCOMING -> UpcomingColumns(courses, settings, primary, secondary, card)
      GlanceTimetableMode.TODAY -> CourseList(courses, settings, primary, secondary, card, "今日没有课程")
    }
  }
}

@Composable
private fun CourseList(courses: List<GlanceCourse>, settings: JSONObject, primary: ColorProvider, secondary: ColorProvider, card: ColorProvider, empty: String) {
  val visible = courses.take(settings.optInt("maxCourses", 4).coerceIn(1, 8))
  LazyColumn(GlanceModifier.fillMaxSize()) {
    if (visible.isEmpty()) item { Box(GlanceModifier.fillMaxWidth().padding(14.dp), contentAlignment = Alignment.Center) { Text(empty, style = TextStyle(color = secondary, fontSize = 13.sp)) } }
    items(visible) { course -> CourseCard(course, settings, primary, secondary, card) }
  }
}

@Composable
private fun UpcomingColumns(courses: List<GlanceCourse>, settings: JSONObject, primary: ColorProvider, secondary: ColorProvider, card: ColorProvider) {
  val today = courses.filter { it.day == 0 }
  val tomorrow = courses.filter { it.day == 1 }
  // The upcoming widget is intentionally a 3 x 2 layout: three compact rows
  // for each day, with the user's limit only reducing that count.
  val visiblePerDay = settings.optInt("maxCourses", 3).coerceIn(1, 3)
  LazyColumn(GlanceModifier.fillMaxSize()) {
    item {
      Row(GlanceModifier.fillMaxWidth()) {
        UpcomingDayColumn("今天 · ${weekdayLabel(0)}", today, visiblePerDay, settings, primary, secondary, card, GlanceModifier.defaultWeight())
        Spacer(GlanceModifier.width(1.dp).fillMaxHeight().background(secondary))
        UpcomingDayColumn("明天 · ${weekdayLabel(1)}", tomorrow, visiblePerDay, settings, primary, secondary, card, GlanceModifier.defaultWeight())
      }
    }
  }
}

@Composable
private fun UpcomingDayColumn(
  label: String,
  courses: List<GlanceCourse>,
  maxCourses: Int,
  settings: JSONObject,
  primary: ColorProvider,
  secondary: ColorProvider,
  card: ColorProvider,
  modifier: GlanceModifier,
) {
  Column(modifier.padding(horizontal = 5.dp)) {
    Row(GlanceModifier.fillMaxWidth().padding(bottom = 5.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(label, style = TextStyle(color = primary, fontSize = 12.sp, fontWeight = FontWeight.Bold))
      Spacer(GlanceModifier.defaultWeight())
      Text("${courses.size} 门", style = TextStyle(color = secondary, fontSize = 10.sp))
    }
    val visible = courses.take(maxCourses)
    if (visible.isEmpty()) {
      Box(GlanceModifier.fillMaxWidth().padding(vertical = 18.dp), contentAlignment = Alignment.Center) {
        Text("无课程", style = TextStyle(color = secondary, fontSize = 11.sp))
      }
    } else {
      visible.forEachIndexed { index, course ->
        UpcomingCourseTile(course, settings, primary, secondary, card)
        if (index < visible.lastIndex) Spacer(GlanceModifier.height(6.dp))
      }
    }
  }
}

@Composable
private fun UpcomingCourseTile(course: GlanceCourse, settings: JSONObject, primary: ColorProvider, secondary: ColorProvider, card: ColorProvider) {
  val detail = listOf(
    if (settings.optBoolean("showTime", true)) course.time else "",
    if (settings.optBoolean("showPlace", true)) course.place else "",
    if (settings.optBoolean("showTeacher", true)) course.teacher else "",
  ).filter { it.isNotBlank() }.joinToString(" · ")
  Column(
    GlanceModifier.fillMaxWidth()
      .background(AndroidResourceImageProvider(courseBackground(course.name)))
      .padding(horizontal = 7.dp, vertical = 6.dp),
  ) {
    Text(course.name.ifBlank { "未命名课程" }, style = TextStyle(color = primary, fontSize = 11.sp, fontWeight = FontWeight.Bold))
    Text(detail.ifBlank { "第 ${course.period} 节" }, style = TextStyle(color = primary, fontSize = 9.sp))
  }
}

@Composable
private fun CourseCard(course: GlanceCourse, settings: JSONObject, primary: ColorProvider, secondary: ColorProvider, card: ColorProvider) {
  val title = listOf(if (settings.optBoolean("showTime", true)) course.time else "", course.name).filter { it.isNotBlank() }.joinToString("  ")
  val detail = listOf(if (settings.optBoolean("showPlace", true)) course.place else "", if (settings.optBoolean("showTeacher", true)) course.teacher else "").filter { it.isNotBlank() }.joinToString(" · ")
  Column(
    GlanceModifier.fillMaxWidth().padding(bottom = 5.dp)
      .background(AndroidResourceImageProvider(courseBackground(course.name)))
      .padding(7.dp),
  ) {
    Text(title, style = TextStyle(color = primary, fontSize = 12.sp, fontWeight = FontWeight.Bold))
    if (detail.isNotBlank()) Text(detail, style = TextStyle(color = primary, fontSize = 10.sp))
  }
}

private const val WEEK_HEADER_HEIGHT = 31
private val WEEK_TIME_COLUMN_WIDTH = 40.dp

@Composable
private fun WeekGrid(
  courses: List<GlanceCourse>,
  week: Int,
  startDate: String?,
  times: List<String>?,
  showWeekend: Boolean,
  cellHeight: Int,
  primary: ColorProvider,
  secondary: ColorProvider,
) {
  val periods = (1..13).toList()
  val days = if (showWeekend) (1..7).toList() else (1..5).toList()
  val rowHeight = cellHeight.dp
  Column(GlanceModifier.fillMaxSize().padding(top = 2.dp)) {
    Row(GlanceModifier.fillMaxWidth().height(WEEK_HEADER_HEIGHT.dp)) {
      Box(GlanceModifier.width(WEEK_TIME_COLUMN_WIDTH), contentAlignment = Alignment.Center) {
        Text("节次", style = TextStyle(color = secondary, fontSize = 9.sp, fontWeight = FontWeight.Bold))
      }
      days.forEach { day ->
        val date = weekDate(startDate, week, day)
        Column(GlanceModifier.defaultWeight().height(WEEK_HEADER_HEIGHT.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
          Text(WEEKDAY_LABELS[day - 1], style = TextStyle(color = primary, fontSize = 9.sp, fontWeight = FontWeight.Bold), maxLines = 1)
          Text(date, style = TextStyle(color = secondary, fontSize = 8.sp), maxLines = 1)
        }
      }
    }
    LazyColumn(GlanceModifier.fillMaxWidth().defaultWeight()) {
      item {
        Row(GlanceModifier.fillMaxWidth().height(rowHeight * periods.size)) {
          Column(GlanceModifier.width(WEEK_TIME_COLUMN_WIDTH)) {
            periods.forEach { period ->
              PeriodLabel(period, rowHeight, secondary, times)
            }
          }
          days.forEach { day ->
            WeekDayColumn(day, periods, courses, rowHeight, primary, secondary, GlanceModifier.defaultWeight())
          }
        }
      }
    }
  }
}

@Composable
private fun PeriodLabel(period: Int, rowHeight: androidx.compose.ui.unit.Dp, secondary: ColorProvider, times: List<String>?) {
  val label = periodTime(period, times)
  Column(
    GlanceModifier.width(WEEK_TIME_COLUMN_WIDTH).height(rowHeight).padding(end = 3.dp),
    horizontalAlignment = Alignment.End,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(period.toString(), style = TextStyle(color = secondary, fontSize = 10.sp, fontWeight = FontWeight.Bold))
    Text(label.first, style = TextStyle(color = secondary, fontSize = 8.sp), maxLines = 1)
    Text(label.second, style = TextStyle(color = secondary, fontSize = 8.sp), maxLines = 1)
  }
}

@Composable
private fun WeekDayColumn(
  day: Int,
  periods: List<Int>,
  courses: List<GlanceCourse>,
  rowHeight: androidx.compose.ui.unit.Dp,
  primary: ColorProvider,
  secondary: ColorProvider,
  modifier: GlanceModifier,
) {
  val dayCourses = courses.filter { it.day == day }.sortedBy { it.period }
  Column(modifier.height(rowHeight * periods.size)) {
    var period = 1
    while (period <= periods.last()) {
      val course = dayCourses.firstOrNull { it.period == period }
      if (course != null) {
        val span = course.span.coerceIn(1, periods.last() - period + 1)
        // Every course occupies exactly its period tracks. The card's 1dp
        // inset creates the same visible gap as an empty grid slot.
        CourseBlock(course, rowHeight * span, primary, secondary)
        period += span
      } else {
        val covered = dayCourses.any { period > it.period && period < it.period + it.span }
        if (!covered) GridSlot(rowHeight)
        period += 1
      }
    }
  }
}

@Composable
private fun GridSlot(height: androidx.compose.ui.unit.Dp) {
  Box(
    GlanceModifier.fillMaxWidth().height(height).padding(1.dp)
      .background(AndroidResourceImageProvider(R.drawable.timetable_widget_grid_background)),
  ) {}
}

@Composable
private fun CourseBlock(
  course: GlanceCourse,
  height: androidx.compose.ui.unit.Dp,
  primary: ColorProvider,
  secondary: ColorProvider,
) {
  Column(
    GlanceModifier.fillMaxWidth().height(height).padding(1.dp)
      .background(AndroidResourceImageProvider(courseBackground(course.name)))
      .padding(horizontal = 4.dp, vertical = 3.dp),
  ) {
    Text(course.name.ifBlank { "未命名课程" }, style = TextStyle(color = primary, fontSize = 10.sp, fontWeight = FontWeight.Bold), maxLines = 2)
    // Classroom names are often longer than the narrow day column. Let the
    // label wrap inside the card instead of forcing it into a single clipped
    // line (Chinese text can wrap without inserting spaces).
    if (course.place.isNotBlank()) Text("@ ${course.place}", style = TextStyle(color = primary, fontSize = 8.sp), maxLines = 2)
    if (course.teacher.isNotBlank()) Text(course.teacher, style = TextStyle(color = primary, fontSize = 8.sp), maxLines = 1)
  }
}

private fun courseBackground(name: String): Int {
  var hash = 0
  name.forEach { hash = (hash * 31 + it.code) % 100000 }
  return when (hash % 8) {
    0 -> R.drawable.timetable_widget_course_blue
    1 -> R.drawable.timetable_widget_course_pink
    2 -> R.drawable.timetable_widget_course_orange
    3 -> R.drawable.timetable_widget_course_navy
    4 -> R.drawable.timetable_widget_course_green
    5 -> R.drawable.timetable_widget_course_yellow
    6 -> R.drawable.timetable_widget_course_purple
    else -> R.drawable.timetable_widget_course_cyan
  }
}

private fun currentWeekday(calendar: Calendar = Calendar.getInstance()): Int =
  ((calendar.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1

private fun parseCourses(slots: JSONArray, week: Int, weekday: Int? = null): List<GlanceCourse> = buildList {
  for (index in 0 until slots.length()) {
    val item = slots.optJSONObject(index) ?: continue
    val weeks = item.optJSONArray("weeks")?.let { array -> (0 until array.length()).map { array.optInt(it) } } ?: emptyList()
    if (weeks.isNotEmpty() && week !in weeks) continue
    if (weekday != null && item.optInt("weekday") != weekday) continue
    add(GlanceCourse(item.optInt("weekday"), item.optInt("period"), item.optInt("span", 1).coerceAtLeast(1), item.optString("name"), item.optString("place"), item.optString("teacher"), item.optString("timeRange").replace('-', '–'), weeks))
  }
  sortBy { it.period }
}

private fun currentWeek(payload: JSONObject): Int {
  val fallback = payload.optInt("week", 1).coerceAtLeast(1)
  val startDate = payload.optString("startDate").takeIf { it.isNotBlank() } ?: return fallback
  return runCatching {
    val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
    val start = parser.parse(startDate) ?: return fallback
    val startDay = Calendar.getInstance().apply {
      time = start
      set(Calendar.HOUR_OF_DAY, 12)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val today = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 12)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val elapsedDays = ((today.timeInMillis - startDay.timeInMillis) / (24L * 60L * 60L * 1000L)).toInt()
    val calculated = (elapsedDays / 7) + 1
    val maxWeek = payload.optInt("maxWeek", 0)
    calculated.coerceAtLeast(1).let { if (maxWeek > 0) it.coerceAtMost(maxWeek) else it }
  }.getOrDefault(fallback)
}

private fun upcomingCourses(slots: JSONArray, week: Int): List<GlanceCourse> {
  val currentDay = currentWeekday()
  return (0..1).flatMap { offset ->
    val dayIndex = currentDay - 1 + offset
    val targetWeek = week + dayIndex / 7
    val targetDay = dayIndex % 7 + 1
    parseCourses(slots, targetWeek, targetDay).map { it.copy(day = offset) }
  }.sortedBy { it.period }
}

private val WEEKDAY_LABELS = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")

private fun daySummary(weekOffset: Int): String {
  val date = Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, weekOffset) }
  val weekday = ((date.get(Calendar.DAY_OF_WEEK) + 5) % 7)
  return "${date.get(Calendar.MONTH) + 1}月${date.get(Calendar.DAY_OF_MONTH)}日 · ${WEEKDAY_LABELS[weekday]}"
}

private fun weekdayLabel(dayOffset: Int): String {
  val date = Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, dayOffset) }
  val weekday = ((date.get(Calendar.DAY_OF_WEEK) + 5) % 7)
  return WEEKDAY_LABELS[weekday]
}

private fun dateSummary(week: Int, weekOffset: Int): String =
  "${daySummary(weekOffset)} · 第 ${week} 周"

private fun weekSummary(startDate: String?, week: Int): String =
  "${weekDate(startDate, week, 1)} · 周一 · 第 ${week} 周"

private fun periodTime(period: Int, times: List<String>?): Pair<String, String> {
  val index = (period - 1) * 2
  if (times != null && index + 1 < times.size) {
    return times[index] to times[index + 1]
  }
  return DEFAULT_PERIOD_TIMES.getOrElse(period - 1) { "" to "" }
}

private fun weekDate(startDate: String?, week: Int, day: Int): String {
  val calendar = Calendar.getInstance()
  val parsed = startDate?.let {
    runCatching {
      SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }.parse(it)
    }.getOrNull()
  }
  if (parsed != null) {
    calendar.time = parsed
  } else {
    calendar.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
  }
  calendar.add(Calendar.DAY_OF_MONTH, ((week - 1) * 7) + day - 1)
  return "${calendar.get(Calendar.MONTH) + 1}/${calendar.get(Calendar.DAY_OF_MONTH)}"
}

private val DEFAULT_PERIOD_TIMES = listOf(
  "08:00" to "08:45", "08:50" to "09:35", "09:50" to "10:35",
  "10:40" to "11:25", "11:30" to "12:15", "14:00" to "14:45",
  "14:50" to "15:35", "15:40" to "16:25", "16:30" to "17:15",
  "17:20" to "18:05", "19:00" to "19:45", "19:50" to "20:35",
  "20:40" to "21:25",
)
