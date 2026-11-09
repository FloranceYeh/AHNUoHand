package com.plugin.background_notifications

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

private object WidgetColors {
  val primary = ColorProvider(R.color.widget_primary_text)
  val secondary = ColorProvider(R.color.widget_secondary_text)
  val divider = ColorProvider(R.color.widget_divider)
}

/** Glance renders at most this many children per Row/Column and drops the rest. */
private const val MAX_CONTAINER_CHILDREN = 10
private const val UPCOMING_MAX_PER_DAY = 3
private val WEEK_HEADER_HEIGHT = 31.dp
private val WEEK_TIME_COLUMN_WIDTH = 40.dp

private val COURSE_BACKGROUNDS = listOf(
  R.drawable.timetable_widget_course_blue,
  R.drawable.timetable_widget_course_pink,
  R.drawable.timetable_widget_course_orange,
  R.drawable.timetable_widget_course_navy,
  R.drawable.timetable_widget_course_green,
  R.drawable.timetable_widget_course_yellow,
  R.drawable.timetable_widget_course_purple,
  R.drawable.timetable_widget_course_cyan,
)

// ---- Widgets ---------------------------------------------------------------

@Composable
internal fun TodayWidgetContent(schedule: TimetableSchedule, settings: WidgetSettings) {
  val courses = schedule.coursesOn(schedule.today)
  WidgetFrame(title = "今日课程", subtitle = daySubtitle(schedule)) {
    if (courses.isEmpty()) {
      CenteredMessage("今日没有课程")
    } else {
      LazyColumn(GlanceModifier.fillMaxSize()) {
        items(courses) { course -> CourseTile(course, settings) }
      }
    }
  }
}

@Composable
internal fun UpcomingWidgetContent(schedule: TimetableSchedule, settings: WidgetSettings) {
  // The widget is a fixed 4 x 2 layout with room for three tiles per day.
  val perDay = UPCOMING_MAX_PER_DAY
  val today = schedule.today
  val tomorrow = today.plusDays(1)
  WidgetFrame(title = "近日课程", subtitle = daySubtitle(schedule)) {
    // A single lazy item keeps the two columns side by side while still
    // scrolling when the widget is resized smaller than its content.
    LazyColumn(GlanceModifier.fillMaxSize()) {
      item {
        Row(GlanceModifier.fillMaxWidth()) {
          UpcomingDay("今天 · ${today.weekdayLabel}", schedule.coursesOn(today), perDay, settings, GlanceModifier.defaultWeight())
          Spacer(GlanceModifier.width(1.dp).fillMaxHeight().background(WidgetColors.divider))
          UpcomingDay("明天 · ${tomorrow.weekdayLabel}", schedule.coursesOn(tomorrow), perDay, settings, GlanceModifier.defaultWeight())
        }
      }
    }
  }
}

@Composable
internal fun WeeklyWidgetContent(schedule: TimetableSchedule, snapshot: TimetableSnapshot, settings: WidgetSettings) {
  val week = schedule.currentWeek
  WidgetFrame(title = "一周课程", subtitle = daySubtitle(schedule)) {
    WeekGrid(schedule, snapshot, settings)
  }
}

@Composable
internal fun EmptyWidget(message: String) {
  Box(rootModifier(), contentAlignment = Alignment.Center) { CenteredMessage(message) }
}

// ---- Shared chrome ---------------------------------------------------------

private fun rootModifier(): GlanceModifier = GlanceModifier.fillMaxSize()
  .background(ImageProvider(R.drawable.timetable_widget_background))
  .padding(10.dp)

private fun daySubtitle(schedule: TimetableSchedule): String =
  "${schedule.today.longLabel()} · ${schedule.today.weekdayLabel} · 第 ${schedule.currentWeek} 周"

@Composable
private fun WidgetFrame(title: String, subtitle: String, content: @Composable () -> Unit) {
  Column(rootModifier()) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Text(title, style = textStyle(16.sp, bold = true), maxLines = 1)
      Spacer(GlanceModifier.defaultWeight())
      Text(subtitle, style = textStyle(10.sp, WidgetColors.secondary), maxLines = 1)
    }
    Spacer(GlanceModifier.height(6.dp))
    Box(GlanceModifier.fillMaxWidth().defaultWeight()) { content() }
  }
}

@Composable
private fun CenteredMessage(text: String, fontSize: TextUnit = 13.sp) {
  Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Text(text, style = textStyle(fontSize, WidgetColors.secondary))
  }
}

private fun textStyle(
  fontSize: TextUnit,
  color: ColorProvider = WidgetColors.primary,
  bold: Boolean = false,
): TextStyle = TextStyle(color = color, fontSize = fontSize, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)

/** Same course name → same color across widgets and refreshes. */
private fun courseBackground(course: WidgetCourse): ImageProvider {
  var hash = 0
  course.name.forEach { hash = (hash * 31 + it.code) % 100_000 }
  return ImageProvider(COURSE_BACKGROUNDS[hash % COURSE_BACKGROUNDS.size])
}

private fun joinDetails(vararg parts: String): String = parts.filter { it.isNotBlank() }.joinToString("·")

// ---- Course list (today / upcoming) ---------------------------------------

@Composable
private fun UpcomingDay(
  label: String,
  courses: List<WidgetCourse>,
  limit: Int,
  settings: WidgetSettings,
  modifier: GlanceModifier,
) {
  Column(modifier.padding(horizontal = 5.dp)) {
    Row(GlanceModifier.fillMaxWidth().padding(bottom = 5.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(label, style = textStyle(12.sp, bold = true), maxLines = 1)
      Spacer(GlanceModifier.defaultWeight())
      Text("${courses.size} 门", style = textStyle(10.sp, WidgetColors.secondary), maxLines = 1)
    }
    val visible = courses.take(limit)
    if (visible.isEmpty()) {
      Box(GlanceModifier.fillMaxWidth().padding(vertical = 18.dp), contentAlignment = Alignment.Center) {
        Text("无课程", style = textStyle(11.sp, WidgetColors.secondary))
      }
    } else {
      visible.forEach { course -> CourseTile(course, settings) }
    }
  }
}

@Composable
private fun CourseTile(course: WidgetCourse, settings: WidgetSettings) {
  val detail = joinDetails(
    if (settings.showTime) course.displayTime else "",
    if (settings.showPlace) course.place else "",
    if (settings.showTeacher) course.teacher else "",
  )
  Box(GlanceModifier.fillMaxWidth().padding(bottom = 6.dp)) {
    Column(
      GlanceModifier.fillMaxWidth().background(courseBackground(course)).padding(horizontal = 7.dp, vertical = 6.dp),
    ) {
      Text(course.displayName, style = textStyle(11.sp, bold = true), maxLines = 1)
      Text(detail.ifBlank { "第 ${course.period} 节" }, style = textStyle(9.sp), maxLines = 2)
    }
  }
}

// ---- Week grid -------------------------------------------------------------

@Composable
private fun WeekGrid(schedule: TimetableSchedule, snapshot: TimetableSnapshot, settings: WidgetSettings) {
  val week = schedule.currentWeek
  val days = if (settings.showWeekend) 1..7 else 1..5
  val periodCount = snapshot.periodCount
  val rowHeight = settings.weekCellHeight.dp
  val coursesByDay = schedule.coursesInWeek(week).groupBy { it.weekday }
  Column(GlanceModifier.fillMaxSize().padding(top = 2.dp)) {
    Row(GlanceModifier.fillMaxWidth().height(WEEK_HEADER_HEIGHT)) {
      Box(GlanceModifier.width(WEEK_TIME_COLUMN_WIDTH).fillMaxHeight(), contentAlignment = Alignment.Center) {
        Text("节次", style = textStyle(9.sp, WidgetColors.secondary, bold = true))
      }
      days.forEach { day ->
        Column(
          GlanceModifier.defaultWeight().fillMaxHeight(),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(WEEKDAY_LABELS[day - 1], style = textStyle(9.sp, bold = true), maxLines = 1)
          Text(schedule.dateOf(week, day).shortLabel(), style = textStyle(8.sp, WidgetColors.secondary), maxLines = 1)
        }
      }
    }
    // The grid is usually taller than the widget, so it scrolls as one item.
    LazyColumn(GlanceModifier.fillMaxWidth().defaultWeight()) {
      item {
        Row(GlanceModifier.fillMaxWidth().height(rowHeight * periodCount)) {
          ChunkedColumn((1..periodCount).toList(), GlanceModifier.width(WEEK_TIME_COLUMN_WIDTH)) { period ->
            PeriodLabel(period, snapshot.periodTime(period), rowHeight)
          }
          days.forEach { day ->
            val cells = weekColumnCells(coursesByDay[day].orEmpty(), periodCount)
            ChunkedColumn(cells, GlanceModifier.defaultWeight().fillMaxHeight()) { cell ->
              when (cell) {
                is CourseCell -> CourseBlock(cell.course, rowHeight * cell.span, settings)
                EmptyCell -> GridSlot(rowHeight)
              }
            }
          }
        }
      }
    }
  }
}

/**
 * A Column that nests its children in groups so none of the containers exceeds
 * Glance's child limit. Every child has a fixed height, so the extra nesting
 * does not change the layout.
 */
@Composable
private fun <T> ChunkedColumn(items: List<T>, modifier: GlanceModifier, content: @Composable (T) -> Unit) {
  Column(modifier) {
    items.chunked(MAX_CONTAINER_CHILDREN).forEach { chunk ->
      Column(GlanceModifier.fillMaxWidth()) { chunk.forEach { content(it) } }
    }
  }
}

@Composable
private fun PeriodLabel(period: Int, time: PeriodTime?, height: Dp) {
  Column(
    GlanceModifier.fillMaxWidth().height(height).padding(end = 3.dp),
    horizontalAlignment = Alignment.End,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(period.toString(), style = textStyle(10.sp, WidgetColors.secondary, bold = true))
    if (time != null) {
      Text(time.start, style = textStyle(8.sp, WidgetColors.secondary), maxLines = 1)
      Text(time.end, style = textStyle(8.sp, WidgetColors.secondary), maxLines = 1)
    }
  }
}

@Composable
private fun GridSlot(height: Dp) {
  Spacer(GlanceModifier.fillMaxWidth().height(height))
}

@Composable
private fun CourseBlock(course: WidgetCourse, height: Dp, settings: WidgetSettings) {
  // The 1dp outer inset matches GridSlot so courses and free periods line up.
  Box(GlanceModifier.fillMaxWidth().height(height).padding(1.dp)) {
    Column(
      GlanceModifier.fillMaxSize().background(courseBackground(course)).padding(horizontal = 4.dp, vertical = 3.dp),
    ) {
      Text(course.displayName, style = textStyle(10.sp, bold = true), maxLines = 2)
      // Classroom names are often wider than a day column; Chinese text wraps
      // without spaces, so allow a second line instead of clipping.
      if (settings.showPlace && course.place.isNotBlank()) {
        Text("@ ${course.place}", style = textStyle(8.sp), maxLines = 2)
      }
      if (settings.showTeacher && course.teacher.isNotBlank()) {
        Text(course.teacher, style = textStyle(8.sp), maxLines = 1)
      }
    }
  }
}
