package com.plugin.background_notifications

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

private const val DAY_MILLIS = 24L * 60L * 60L * 1000L
private const val ACTION_WEEK_SHIFT = "com.plugin.background_notifications.WEEK_SHIFT"
private const val EXTRA_WIDGET_ID = "widgetId"
private const val EXTRA_WEEK_DELTA = "weekDelta"
private const val WEEK_OFFSET_PREFIX = "weekOffset_"

enum class TimetableWidgetMode {
  TODAY,
  UPCOMING,
  WEEK,
}

open class TimetableWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_WEEK_SHIFT) {
      val widgetId = intent.getIntExtra(EXTRA_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      val delta = intent.getIntExtra(EXTRA_WEEK_DELTA, 0)
      if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID && delta != 0) {
        val preferences = context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
        val key = "$WEEK_OFFSET_PREFIX$widgetId"
        val raw = preferences.getString(WIDGET_DATA, null)
        val nextOffset = if (raw.isNullOrBlank()) {
          preferences.getInt(key, 0) + delta
        } else {
          runCatching {
            val payload = JSONObject(raw)
            val base = currentWeek(payload)
            val max = payload.optInt("maxWeek", 0)
            val target = (base + preferences.getInt(key, 0) + delta).coerceAtLeast(1).let {
              if (max > 0) it.coerceAtMost(max) else it
            }
            target - base
          }.getOrDefault(preferences.getInt(key, 0) + delta)
        }
        preferences.edit().putInt(key, nextOffset).apply()
        update(context, AppWidgetManager.getInstance(context), intArrayOf(widgetId), TimetableWidgetMode.WEEK)
      }
      return
    }
    super.onReceive(context, intent)
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    val editor = context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).edit()
    appWidgetIds.forEach { editor.remove("$WEEK_OFFSET_PREFIX$it") }
    editor.apply()
    super.onDeleted(context, appWidgetIds)
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    update(context, appWidgetManager, appWidgetIds, TimetableWidgetMode.TODAY)
  }

  companion object {
    fun updateMode(
      context: Context,
      manager: AppWidgetManager,
      ids: IntArray,
      mode: TimetableWidgetMode,
    ) = update(context, manager, ids, mode)

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      listOf(
        TimetableWidgetProvider::class.java to TimetableWidgetMode.TODAY,
        UpcomingTimetableWidgetProvider::class.java to TimetableWidgetMode.UPCOMING,
        WeeklyTimetableWidgetProvider::class.java to TimetableWidgetMode.WEEK,
      ).forEach { (provider, mode) ->
        val component = ComponentName(context, provider)
        update(context, manager, manager.getAppWidgetIds(component), mode)
      }
    }

    private fun update(
      context: Context,
      manager: AppWidgetManager,
      ids: IntArray,
      mode: TimetableWidgetMode,
    ) {
      if (ids.isEmpty()) return
      ids.forEach { id -> manager.updateAppWidget(id, render(context, mode, id)) }
    }

    private fun render(context: Context, mode: TimetableWidgetMode, widgetId: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.timetable_widget)
      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent().setPackage(context.packageName)
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
        if (android.os.Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
      val pending = PendingIntent.getActivity(context, 0, launchIntent, pendingFlags)
      views.setOnClickPendingIntent(R.id.timetable_widget_root, pending)

      if (mode == TimetableWidgetMode.WEEK) {
        views.setViewVisibility(R.id.widget_week_controls, View.VISIBLE)
        val previous = Intent(context, WeeklyTimetableWidgetProvider::class.java).setAction(ACTION_WEEK_SHIFT)
          .putExtra(EXTRA_WIDGET_ID, widgetId).putExtra(EXTRA_WEEK_DELTA, -1)
        val next = Intent(context, WeeklyTimetableWidgetProvider::class.java).setAction(ACTION_WEEK_SHIFT)
          .putExtra(EXTRA_WIDGET_ID, widgetId).putExtra(EXTRA_WEEK_DELTA, 1)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
          if (android.os.Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
        views.setOnClickPendingIntent(R.id.widget_week_prev, PendingIntent.getBroadcast(context, widgetId * 2, previous, flags))
        views.setOnClickPendingIntent(R.id.widget_week_next, PendingIntent.getBroadcast(context, widgetId * 2 + 1, next, flags))
      } else {
        views.setViewVisibility(R.id.widget_week_controls, View.GONE)
      }

      val raw = context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
        .getString(WIDGET_DATA, null)
      if (raw.isNullOrBlank()) {
        showEmpty(views, "请先在应用内读取课表")
        return views
      }

      runCatching {
        val payload = JSONObject(raw)
        val settings = context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
          .getString(WIDGET_SETTINGS, null)
          ?.let { JSONObject(it) }
          ?: JSONObject()
        val baseWeek = currentWeek(payload)
        val offset = if (mode == TimetableWidgetMode.WEEK) {
          context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
            .getInt("$WEEK_OFFSET_PREFIX$widgetId", 0)
        } else 0
        val maxWeek = payload.optInt("maxWeek", 0)
        val week = (baseWeek + offset).coerceAtLeast(1).let {
          if (maxWeek > 0) it.coerceAtMost(maxWeek) else it
        }
        val today = Calendar.getInstance()
        val weekday = currentWeekday(today)
        val courses = when (mode) {
          TimetableWidgetMode.TODAY -> coursesForDay(payload.optJSONArray("slots"), weekday, week)
          TimetableWidgetMode.UPCOMING -> upcomingCourses(
            payload.optJSONArray("slots"),
            weekday,
            week,
            payload.optInt("maxWeek", 0),
          )
          TimetableWidgetMode.WEEK -> weeklyCourses(payload.optJSONArray("slots"), week)
        }
        views.setTextViewText(R.id.widget_week, when (mode) {
          TimetableWidgetMode.TODAY -> "今日课程"
          TimetableWidgetMode.UPCOMING -> "近日课程"
          TimetableWidgetMode.WEEK -> "一周课程"
        })
        views.setTextViewText(R.id.widget_date, when (mode) {
          TimetableWidgetMode.TODAY -> "第 ${week} 周 · ${today.get(Calendar.MONTH) + 1}月${today.get(Calendar.DAY_OF_MONTH)}日 ${WEEKDAYS[weekday]}"
          TimetableWidgetMode.UPCOMING -> "${formatDate(today)} · ${formatDate(offsetDay(today, 1))}"
          TimetableWidgetMode.WEEK -> "第 ${week} 周"
        })
        if (mode == TimetableWidgetMode.WEEK) {
          showWeeklyGrid(views, payload.optJSONArray("slots"), week, settings, courses.isEmpty())
        } else if (mode == TimetableWidgetMode.UPCOMING) {
          showUpcomingCourses(views, courses, settings)
        } else {
          showCourses(views, courses, settings, when (mode) {
          TimetableWidgetMode.TODAY -> "今日没有课程"
          TimetableWidgetMode.UPCOMING -> "今天和明天没有课程"
          TimetableWidgetMode.WEEK -> "本周没有课程"
          })
        }
      }.onFailure {
        showEmpty(views, "课表数据需要重新读取")
      }
      return views
    }

    private fun currentWeekday(calendar: Calendar = Calendar.getInstance()): Int {
      // Calendar uses Sunday=1; the timetable uses Monday=1 and Sunday=7.
      return ((calendar.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1
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
        val elapsedDays = ((today.timeInMillis - startDay.timeInMillis) / DAY_MILLIS).toInt()
        val calculated = (elapsedDays / 7) + 1
        val maxWeek = payload.optInt("maxWeek", 0)
        calculated.coerceAtLeast(1).let { if (maxWeek > 0) it.coerceAtMost(maxWeek) else it }
      }.getOrDefault(fallback)
    }

    private fun coursesForDay(slots: JSONArray?, weekday: Int, week: Int): List<JSONObject> {
      if (slots == null) return emptyList()
      val result = mutableListOf<JSONObject>()
      for (index in 0 until slots.length()) {
        val slot = slots.optJSONObject(index) ?: continue
        if (slot.optInt("weekday") != weekday) continue
        val weeks = slot.optJSONArray("weeks")
        if (weeks != null && weeks.length() > 0 && !contains(weeks, week)) continue
        result.add(slot)
      }
      return result.sortedWith(compareBy({ it.optInt("period", 0) }, { it.optString("name") }))
    }

    private fun upcomingCourses(
      slots: JSONArray?,
      weekday: Int,
      week: Int,
      maxWeek: Int,
    ): List<JSONObject> {
      return (0..1).flatMap { offset ->
        val dayIndex = weekday - 1 + offset
        val targetWeek = week + (dayIndex / 7)
        val targetDay = (dayIndex % 7) + 1
        if (maxWeek > 0 && targetWeek > maxWeek) return@flatMap emptyList()
        coursesForDay(slots, targetDay, targetWeek).map { course ->
          JSONObject(course.toString()).put("widgetDay", if (offset == 0) "今天" else "明天")
        }
      }
    }

    private fun weeklyCourses(slots: JSONArray?, week: Int): List<JSONObject> {
      return (1..7).flatMap { day ->
        coursesForDay(slots, day, week).map { course ->
          JSONObject(course.toString()).put("widgetDay", WEEKDAYS[day])
        }
      }
    }

    private fun offsetDay(value: Calendar, offset: Int): Calendar =
      (value.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, offset) }

    private fun formatDate(value: Calendar): String =
      "${value.get(Calendar.MONTH) + 1}/${value.get(Calendar.DAY_OF_MONTH)}"

    private fun contains(values: JSONArray, target: Int): Boolean {
      for (index in 0 until values.length()) if (values.optInt(index) == target) return true
      return false
    }

    private val upcomingTodayTitleIds = intArrayOf(
      R.id.widget_upcoming_today_title_1,
      R.id.widget_upcoming_today_title_2,
      R.id.widget_upcoming_today_title_3,
      R.id.widget_upcoming_today_title_4,
    )
    private val upcomingTodayDetailIds = intArrayOf(
      R.id.widget_upcoming_today_detail_1,
      R.id.widget_upcoming_today_detail_2,
      R.id.widget_upcoming_today_detail_3,
      R.id.widget_upcoming_today_detail_4,
    )
    private val upcomingTodayRowIds = intArrayOf(
      R.id.widget_upcoming_today_row_1,
      R.id.widget_upcoming_today_row_2,
      R.id.widget_upcoming_today_row_3,
      R.id.widget_upcoming_today_row_4,
    )
    private val upcomingTomorrowTitleIds = intArrayOf(
      R.id.widget_upcoming_tomorrow_title_1,
      R.id.widget_upcoming_tomorrow_title_2,
      R.id.widget_upcoming_tomorrow_title_3,
      R.id.widget_upcoming_tomorrow_title_4,
    )
    private val upcomingTomorrowDetailIds = intArrayOf(
      R.id.widget_upcoming_tomorrow_detail_1,
      R.id.widget_upcoming_tomorrow_detail_2,
      R.id.widget_upcoming_tomorrow_detail_3,
      R.id.widget_upcoming_tomorrow_detail_4,
    )
    private val upcomingTomorrowRowIds = intArrayOf(
      R.id.widget_upcoming_tomorrow_row_1,
      R.id.widget_upcoming_tomorrow_row_2,
      R.id.widget_upcoming_tomorrow_row_3,
      R.id.widget_upcoming_tomorrow_row_4,
    )
    private val weekDayIds = intArrayOf(
      R.id.widget_grid_day_1,
      R.id.widget_grid_day_2,
      R.id.widget_grid_day_3,
      R.id.widget_grid_day_4,
      R.id.widget_grid_day_5,
      R.id.widget_grid_day_6,
      R.id.widget_grid_day_7,
    )
    private val weekCellIds = arrayOf(
      intArrayOf(R.id.widget_grid_cell_1_1, R.id.widget_grid_cell_1_2, R.id.widget_grid_cell_1_3, R.id.widget_grid_cell_1_4, R.id.widget_grid_cell_1_5, R.id.widget_grid_cell_1_6, R.id.widget_grid_cell_1_7),
      intArrayOf(R.id.widget_grid_cell_2_1, R.id.widget_grid_cell_2_2, R.id.widget_grid_cell_2_3, R.id.widget_grid_cell_2_4, R.id.widget_grid_cell_2_5, R.id.widget_grid_cell_2_6, R.id.widget_grid_cell_2_7),
      intArrayOf(R.id.widget_grid_cell_3_1, R.id.widget_grid_cell_3_2, R.id.widget_grid_cell_3_3, R.id.widget_grid_cell_3_4, R.id.widget_grid_cell_3_5, R.id.widget_grid_cell_3_6, R.id.widget_grid_cell_3_7),
      intArrayOf(R.id.widget_grid_cell_4_1, R.id.widget_grid_cell_4_2, R.id.widget_grid_cell_4_3, R.id.widget_grid_cell_4_4, R.id.widget_grid_cell_4_5, R.id.widget_grid_cell_4_6, R.id.widget_grid_cell_4_7),
      intArrayOf(R.id.widget_grid_cell_5_1, R.id.widget_grid_cell_5_2, R.id.widget_grid_cell_5_3, R.id.widget_grid_cell_5_4, R.id.widget_grid_cell_5_5, R.id.widget_grid_cell_5_6, R.id.widget_grid_cell_5_7),
      intArrayOf(R.id.widget_grid_cell_6_1, R.id.widget_grid_cell_6_2, R.id.widget_grid_cell_6_3, R.id.widget_grid_cell_6_4, R.id.widget_grid_cell_6_5, R.id.widget_grid_cell_6_6, R.id.widget_grid_cell_6_7),
      intArrayOf(R.id.widget_grid_cell_7_1, R.id.widget_grid_cell_7_2, R.id.widget_grid_cell_7_3, R.id.widget_grid_cell_7_4, R.id.widget_grid_cell_7_5, R.id.widget_grid_cell_7_6, R.id.widget_grid_cell_7_7),
      intArrayOf(R.id.widget_grid_cell_8_1, R.id.widget_grid_cell_8_2, R.id.widget_grid_cell_8_3, R.id.widget_grid_cell_8_4, R.id.widget_grid_cell_8_5, R.id.widget_grid_cell_8_6, R.id.widget_grid_cell_8_7),
      intArrayOf(R.id.widget_grid_cell_9_1, R.id.widget_grid_cell_9_2, R.id.widget_grid_cell_9_3, R.id.widget_grid_cell_9_4, R.id.widget_grid_cell_9_5, R.id.widget_grid_cell_9_6, R.id.widget_grid_cell_9_7),
      intArrayOf(R.id.widget_grid_cell_10_1, R.id.widget_grid_cell_10_2, R.id.widget_grid_cell_10_3, R.id.widget_grid_cell_10_4, R.id.widget_grid_cell_10_5, R.id.widget_grid_cell_10_6, R.id.widget_grid_cell_10_7),
      intArrayOf(R.id.widget_grid_cell_11_1, R.id.widget_grid_cell_11_2, R.id.widget_grid_cell_11_3, R.id.widget_grid_cell_11_4, R.id.widget_grid_cell_11_5, R.id.widget_grid_cell_11_6, R.id.widget_grid_cell_11_7),
      intArrayOf(R.id.widget_grid_cell_12_1, R.id.widget_grid_cell_12_2, R.id.widget_grid_cell_12_3, R.id.widget_grid_cell_12_4, R.id.widget_grid_cell_12_5, R.id.widget_grid_cell_12_6, R.id.widget_grid_cell_12_7),
      intArrayOf(R.id.widget_grid_cell_13_1, R.id.widget_grid_cell_13_2, R.id.widget_grid_cell_13_3, R.id.widget_grid_cell_13_4, R.id.widget_grid_cell_13_5, R.id.widget_grid_cell_13_6, R.id.widget_grid_cell_13_7),
    )

    private fun showUpcomingCourses(
      views: RemoteViews,
      courses: List<JSONObject>,
      settings: JSONObject,
    ) {
      views.setViewVisibility(R.id.widget_empty, View.GONE)
      views.setViewVisibility(R.id.widget_course_list, View.GONE)
      views.setViewVisibility(R.id.widget_week_grid_scroll, View.GONE)
      views.setViewVisibility(R.id.widget_course_scroll, View.VISIBLE)
      views.setViewVisibility(R.id.widget_upcoming_columns, View.VISIBLE)
      views.setViewVisibility(R.id.widget_more, View.GONE)

      val today = courses.filter { it.optString("widgetDay") == "今天" }
      val tomorrow = courses.filter { it.optString("widgetDay") == "明天" }
      views.setTextViewText(R.id.widget_upcoming_today, "今天 · ${today.size}")
      views.setTextViewText(R.id.widget_upcoming_tomorrow, "明天 · ${tomorrow.size}")
      val maxCourses = settings.optInt("maxCourses", 4).coerceIn(1, 8)
      showColumnCourses(views, today, settings, true, maxCourses)
      showColumnCourses(views, tomorrow, settings, false, maxCourses)
      val empty = today.isEmpty() && tomorrow.isEmpty()
      views.setViewVisibility(R.id.widget_empty, if (empty) View.VISIBLE else View.GONE)
      if (empty) views.setTextViewText(R.id.widget_empty, "今天和明天没有课程")
    }

    private fun showColumnCourses(
      views: RemoteViews,
      courses: List<JSONObject>,
      settings: JSONObject,
      isToday: Boolean,
      maxCourses: Int,
    ) {
      val titleIds = if (isToday) upcomingTodayTitleIds else upcomingTomorrowTitleIds
      val detailIds = if (isToday) upcomingTodayDetailIds else upcomingTomorrowDetailIds
      val rowIds = if (isToday) upcomingTodayRowIds else upcomingTomorrowRowIds
      val visible = courses.take(maxCourses.coerceAtMost(4))
      val showTime = settings.optBoolean("showTime", true)
      val showPlace = settings.optBoolean("showPlace", true)
      val showTeacher = settings.optBoolean("showTeacher", true)
      visible.forEachIndexed { index, course ->
        val title = listOf(
          if (showTime) course.optString("timeRange").replace('-', '–') else "",
          course.optString("name"),
        ).filter { it.isNotBlank() }.joinToString("  ")
        val details = listOf(
          if (showPlace) course.optString("place") else "",
          if (showTeacher) course.optString("teacher") else "",
        ).filter { it.isNotBlank() }.joinToString(" · ")
          .ifBlank { "第 ${course.optInt("period", 0)} 节" }
        views.setViewVisibility(rowIds[index], View.VISIBLE)
        views.setTextViewText(titleIds[index], title)
        views.setTextViewText(detailIds[index], details)
      }
      for (index in visible.size until rowIds.size) {
        views.setViewVisibility(rowIds[index], View.GONE)
      }
    }

    private fun showWeeklyGrid(
      views: RemoteViews,
      slots: JSONArray?,
      week: Int,
      settings: JSONObject,
      empty: Boolean,
    ) {
      views.setViewVisibility(R.id.widget_course_scroll, View.GONE)
      views.setViewVisibility(R.id.widget_course_list, View.GONE)
      views.setViewVisibility(R.id.widget_upcoming_columns, View.GONE)
      views.setViewVisibility(R.id.widget_week_grid_scroll, View.VISIBLE)
      views.setViewVisibility(R.id.widget_empty, if (empty) View.VISIBLE else View.GONE)
      views.setViewVisibility(R.id.widget_more, View.GONE)
      if (empty) views.setTextViewText(R.id.widget_empty, "本周没有课程")

      for (day in 1..7) {
        views.setTextViewText(weekDayIds[day - 1], WEEKDAYS[day])
      }
      for (period in 1..13) {
        for (day in 1..7) views.setTextViewText(weekCellIds[period - 1][day - 1], "")
      }
      if (slots == null) return
      val showPlace = settings.optBoolean("showPlace", true)
      val showTeacher = settings.optBoolean("showTeacher", true)
      for (index in 0 until slots.length()) {
        val course = slots.optJSONObject(index) ?: continue
        val day = course.optInt("weekday")
        val period = course.optInt("period")
        val weeks = course.optJSONArray("weeks")
        if (day !in 1..7 || period !in 1..13 || (weeks != null && weeks.length() > 0 && !contains(weeks, week))) continue
        val label = listOf(
          course.optString("name"),
          if (showPlace) course.optString("place") else "",
          if (showTeacher) course.optString("teacher") else "",
        ).filter { it.isNotBlank() }.joinToString("\n")
        views.setTextViewText(weekCellIds[period - 1][day - 1], label)
      }
    }

    private fun showCourses(
      views: RemoteViews,
      courses: List<JSONObject>,
      settings: JSONObject,
      emptyMessage: String,
    ) {
      views.setViewVisibility(R.id.widget_course_scroll, View.VISIBLE)
      views.setViewVisibility(R.id.widget_week_grid_scroll, View.GONE)
      views.setViewVisibility(R.id.widget_upcoming_columns, View.GONE)
      views.setViewVisibility(R.id.widget_course_list, View.VISIBLE)
      val titleIds = intArrayOf(
        R.id.widget_course_title_1,
        R.id.widget_course_title_2,
        R.id.widget_course_title_3,
        R.id.widget_course_title_4,
        R.id.widget_course_title_5,
        R.id.widget_course_title_6,
        R.id.widget_course_title_7,
        R.id.widget_course_title_8,
      )
      val detailIds = intArrayOf(
        R.id.widget_course_detail_1,
        R.id.widget_course_detail_2,
        R.id.widget_course_detail_3,
        R.id.widget_course_detail_4,
        R.id.widget_course_detail_5,
        R.id.widget_course_detail_6,
        R.id.widget_course_detail_7,
        R.id.widget_course_detail_8,
      )
      val rowIds = intArrayOf(
        R.id.widget_course_row_1,
        R.id.widget_course_row_2,
        R.id.widget_course_row_3,
        R.id.widget_course_row_4,
        R.id.widget_course_row_5,
        R.id.widget_course_row_6,
        R.id.widget_course_row_7,
        R.id.widget_course_row_8,
      )
      views.setViewVisibility(R.id.widget_empty, if (courses.isEmpty()) View.VISIBLE else View.GONE)
      views.setViewVisibility(R.id.widget_course_list, if (courses.isEmpty()) View.GONE else View.VISIBLE)
      if (courses.isEmpty()) views.setTextViewText(R.id.widget_empty, emptyMessage)
      val maxCourses = settings.optInt("maxCourses", 4).coerceIn(1, rowIds.size)
      val showTime = settings.optBoolean("showTime", true)
      val showPlace = settings.optBoolean("showPlace", true)
      val showTeacher = settings.optBoolean("showTeacher", true)
      val visibleCourses = courses.take(maxCourses)
      visibleCourses.forEachIndexed { index, course ->
        val time = course.optString("timeRange").replace('-', '–')
        val period = course.optInt("period", 0)
        val title = listOf(
          course.optString("widgetDay"),
          if (showTime) time else "",
          course.optString("name"),
        )
          .filter { it.isNotBlank() }.joinToString("  ")
        val details = listOf(
          if (showPlace) course.optString("place") else "",
          if (showTeacher) course.optString("teacher") else "",
        )
          .filter { it.isNotBlank() }
          .joinToString(" · ")
          .ifBlank { "第 ${period} 节" }
        views.setViewVisibility(rowIds[index], View.VISIBLE)
        views.setTextViewText(titleIds[index], title)
        views.setTextViewText(detailIds[index], details)
      }
      for (index in visibleCourses.size until rowIds.size) views.setViewVisibility(rowIds[index], View.GONE)
      val remaining = courses.size - visibleCourses.size
      views.setViewVisibility(R.id.widget_more, if (remaining > 0) View.VISIBLE else View.GONE)
      if (remaining > 0) views.setTextViewText(R.id.widget_more, "还有 $remaining 节课")
    }

    private fun showEmpty(views: RemoteViews, message: String) {
      views.setTextViewText(R.id.widget_week, "课表")
      views.setTextViewText(R.id.widget_date, "今天")
      views.setViewVisibility(R.id.widget_course_scroll, View.GONE)
      views.setViewVisibility(R.id.widget_week_grid_scroll, View.GONE)
      views.setViewVisibility(R.id.widget_week_controls, View.GONE)
      views.setViewVisibility(R.id.widget_course_list, View.GONE)
      views.setViewVisibility(R.id.widget_upcoming_columns, View.GONE)
      views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
      views.setTextViewText(R.id.widget_empty, message)
      views.setViewVisibility(R.id.widget_more, View.GONE)
    }

    private val WEEKDAYS = arrayOf("", "周一", "周二", "周三", "周四", "周五", "周六", "周日")
  }
}

class UpcomingTimetableWidgetProvider : TimetableWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    TimetableWidgetProvider.updateMode(context, manager, ids, TimetableWidgetMode.UPCOMING)
  }
}

class WeeklyTimetableWidgetProvider : TimetableWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    TimetableWidgetProvider.updateMode(context, manager, ids, TimetableWidgetMode.WEEK)
  }
}
