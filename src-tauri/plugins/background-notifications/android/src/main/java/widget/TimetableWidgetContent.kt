package com.plugin.background_notifications

import android.content.ComponentName
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
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

/** Glance renders at most this many children per Row/Column and drops the rest. */
private const val MAX_CONTAINER_CHILDREN = 10
private const val UPCOMING_MAX_PER_DAY = 3
private val WEEK_HEADER_HEIGHT = 31.dp
private val WEEK_TIME_COLUMN_WIDTH = 40.dp

// ---- Widgets ---------------------------------------------------------------

@Composable
internal fun TodayWidgetContent(schedule: TimetableSchedule, settings: WidgetSettings) {
  val courses = schedule.coursesOn(schedule.today)
  WidgetFrame(settings, title = "今日课程", subtitle = daySubtitle(schedule)) {
    if (courses.isEmpty()) {
      CenteredMessage("今日没有课程", settings)
    } else {
      LazyColumn(GlanceModifier.fillMaxSize().clickable(openTimetableAction())) {
        items(courses) { course -> CourseTile(course, settings) }
      }
    }
  }
}

@Composable
internal fun UpcomingWidgetContent(schedule: TimetableSchedule, settings: WidgetSettings) {
  val today = schedule.today
  val tomorrow = today.plusDays(1)
  WidgetFrame(settings, title = "近日课程", subtitle = daySubtitle(schedule)) {
    // A single lazy item keeps the two columns side by side while still
    // scrolling when the widget is resized smaller than its content.
    LazyColumn(GlanceModifier.fillMaxSize().clickable(openTimetableAction())) {
      item {
        Row(GlanceModifier.fillMaxWidth()) {
          UpcomingDay("今天 · ${today.weekdayLabel}", schedule.coursesOn(today), settings, GlanceModifier.defaultWeight())
          Spacer(GlanceModifier.width(1.dp).fillMaxHeight().background(settings.palette.divider))
          UpcomingDay("明天 · ${tomorrow.weekdayLabel}", schedule.coursesOn(tomorrow), settings, GlanceModifier.defaultWeight())
        }
      }
    }
  }
}

@Composable
internal fun WeeklyWidgetContent(schedule: TimetableSchedule, snapshot: TimetableSnapshot, settings: WidgetSettings) {
  val week = schedule.currentWeek
  val monday = schedule.dateOf(week, 1)
  WidgetFrame(settings, title = "一周课程", subtitle = "${monday.longLabel()} · 周一 · 第 $week 周") {
    WeekGrid(schedule, snapshot, settings)
  }
}

@Composable
internal fun EmptyWidget(message: String, settings: WidgetSettings) {
  Box(rootModifier(settings), contentAlignment = Alignment.Center) { CenteredMessage(message, settings) }
}

// ---- Shared chrome ---------------------------------------------------------

/**
 * 点击小组件打开应用的课程表。
 *
 * 用显式 Intent 指向 MainActivity，附带路由名；应用启动或被唤到前台时
 * 由插件把它交给前端。
 */
@Composable
private fun openTimetableAction() = actionStartActivity(
  Intent(Intent.ACTION_MAIN)
    .setComponent(ComponentName(LocalContext.current.packageName, MAIN_ACTIVITY_CLASS))
    .putExtra(LAUNCH_ROUTE_EXTRA, LAUNCH_ROUTE_TIMETABLE)
    // 不加 NEW_TASK 的话，从桌面点击无法启动 Activity。
    .addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP,
    ),
)

@Composable
private fun rootModifier(settings: WidgetSettings): GlanceModifier = GlanceModifier.fillMaxSize()
  .background(ImageProvider(settings.palette.backgroundRes))
  .clickable(openTimetableAction())
  .padding(10.dp)

private fun daySubtitle(schedule: TimetableSchedule): String =
  "${schedule.today.longLabel()} · ${schedule.today.weekdayLabel} · 第 ${schedule.currentWeek} 周"

@Composable
private fun WidgetFrame(
  settings: WidgetSettings,
  title: String,
  subtitle: String,
  content: @Composable () -> Unit,
) {
  Column(rootModifier(settings)) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Text(title, style = textStyle(16.sp, settings.palette.primaryText, bold = true), maxLines = 1)
      Spacer(GlanceModifier.defaultWeight())
      Text(subtitle, style = textStyle(10.sp, settings.palette.secondaryText), maxLines = 1)
    }
    Spacer(GlanceModifier.height(6.dp))
    Box(
      GlanceModifier.fillMaxWidth().defaultWeight().clickable(openTimetableAction()),
    ) { content() }
  }
}

@Composable
private fun CenteredMessage(text: String, settings: WidgetSettings, fontSize: TextUnit = 13.sp) {
  Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Text(text, style = textStyle(fontSize, settings.palette.secondaryText))
  }
}

private fun textStyle(fontSize: TextUnit, color: ColorProvider, bold: Boolean = false): TextStyle =
  TextStyle(color = color, fontSize = fontSize, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)

/** Same course name → same color across widgets and refreshes. */
private fun courseBackground(course: WidgetCourse): ImageProvider {
  var hash = 0
  course.name.forEach { hash = (hash * 31 + it.code) % 100_000 }
  return ImageProvider(WidgetPalette.COURSE_BACKGROUNDS[hash % WidgetPalette.COURSE_BACKGROUNDS.size])
}

private fun courseTextStyle(fontSize: TextUnit, bold: Boolean = false) =
  textStyle(fontSize, WidgetPalette.courseText, bold)

private fun joinDetails(vararg parts: String): String = parts.filter { it.isNotBlank() }.joinToString("·")

// ---- Course list (today / upcoming) ---------------------------------------

@Composable
private fun UpcomingDay(
  label: String,
  courses: List<WidgetCourse>,
  settings: WidgetSettings,
  modifier: GlanceModifier,
) {
  Column(modifier.padding(horizontal = 5.dp).clickable(openTimetableAction())) {
    Row(GlanceModifier.fillMaxWidth().padding(bottom = 5.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(label, style = textStyle(12.sp, settings.palette.primaryText, bold = true), maxLines = 1)
      Spacer(GlanceModifier.defaultWeight())
      Text("${courses.size} 门", style = textStyle(10.sp, settings.palette.secondaryText), maxLines = 1)
    }
    // 小组件只有两格高，固定留三条的位置。
    val visible = courses.take(UPCOMING_MAX_PER_DAY)
    if (visible.isEmpty()) {
      Box(GlanceModifier.fillMaxWidth().padding(vertical = 18.dp), contentAlignment = Alignment.Center) {
        Text("无课程", style = textStyle(11.sp, settings.palette.secondaryText))
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
      Text(course.displayName, style = courseTextStyle(11.sp, bold = true), maxLines = 1)
      Text(detail.ifBlank { "第 ${course.period} 节" }, style = courseTextStyle(9.sp), maxLines = 2)
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
  Column(GlanceModifier.fillMaxSize().padding(top = 2.dp).clickable(openTimetableAction())) {
    Row(GlanceModifier.fillMaxWidth().height(WEEK_HEADER_HEIGHT)) {
      Box(GlanceModifier.width(WEEK_TIME_COLUMN_WIDTH).fillMaxHeight(), contentAlignment = Alignment.Center) {
        Text("节次", style = textStyle(9.sp, settings.palette.secondaryText, bold = true))
      }
      days.forEach { day ->
        Column(
          GlanceModifier.defaultWeight().fillMaxHeight(),
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(WEEKDAY_LABELS[day - 1], style = textStyle(9.sp, settings.palette.primaryText, bold = true), maxLines = 1)
          Text(
            schedule.dateOf(week, day).shortLabel(),
            style = textStyle(8.sp, settings.palette.secondaryText),
            maxLines = 1,
          )
        }
      }
    }
    // The grid is usually taller than the widget, so it scrolls as one item.
    LazyColumn(
      GlanceModifier.fillMaxWidth().defaultWeight().clickable(openTimetableAction()),
    ) {
      item {
        Row(
          GlanceModifier.fillMaxWidth().height(rowHeight * periodCount).clickable(openTimetableAction()),
        ) {
          ChunkedColumn((1..periodCount).toList(), GlanceModifier.width(WEEK_TIME_COLUMN_WIDTH)) { period ->
            PeriodLabel(period, snapshot.periodTime(period), rowHeight, settings)
          }
          days.forEach { day ->
            val cells = weekColumnCells(coursesByDay[day].orEmpty(), periodCount)
            ChunkedColumn(cells, GlanceModifier.defaultWeight().fillMaxHeight()) { cell ->
              when (cell) {
                is CourseCell -> CourseBlock(cell.course, rowHeight * cell.span, settings)
                EmptyCell -> Spacer(GlanceModifier.fillMaxWidth().height(rowHeight))
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
private fun PeriodLabel(period: Int, time: PeriodTime?, height: Dp, settings: WidgetSettings) {
  Column(
    GlanceModifier.fillMaxWidth().height(height).padding(end = 3.dp),
    horizontalAlignment = Alignment.End,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(period.toString(), style = textStyle(10.sp, settings.palette.secondaryText, bold = true))
    if (time != null) {
      Text(time.start, style = textStyle(8.sp, settings.palette.secondaryText), maxLines = 1)
      Text(time.end, style = textStyle(8.sp, settings.palette.secondaryText), maxLines = 1)
    }
  }
}

@Composable
private fun CourseBlock(course: WidgetCourse, height: Dp, settings: WidgetSettings) {
  // The 1dp outer inset leaves the same visible gap as a free period.
  Box(
    GlanceModifier.fillMaxWidth().height(height).padding(1.dp).clickable(openTimetableAction()),
  ) {
    Column(
      GlanceModifier.fillMaxSize().background(courseBackground(course)).padding(horizontal = 4.dp, vertical = 3.dp),
    ) {
      Text(course.displayName, style = courseTextStyle(10.sp, bold = true), maxLines = 2)
      // Classroom names are often wider than a day column; Chinese text wraps
      // without spaces, so allow a second line instead of clipping.
      if (settings.showPlace && course.place.isNotBlank()) {
        Text("@ ${course.place}", style = courseTextStyle(8.sp), maxLines = 2)
      }
      if (settings.showTeacher && course.teacher.isNotBlank()) {
        Text(course.teacher, style = courseTextStyle(8.sp), maxLines = 1)
      }
    }
  }
}
