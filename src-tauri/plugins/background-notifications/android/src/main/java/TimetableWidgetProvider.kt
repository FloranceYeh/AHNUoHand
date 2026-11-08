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

enum class TimetableWidgetMode {
  TODAY,
  UPCOMING,
  WEEK,
}

class TimetableWidgetProvider : AppWidgetProvider() {
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
      val views = render(context, mode)
      ids.forEach { id -> manager.updateAppWidget(id, views) }
    }

    private fun render(context: Context, mode: TimetableWidgetMode): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.timetable_widget)
      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent().setPackage(context.packageName)
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
        if (android.os.Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
      val pending = PendingIntent.getActivity(context, 0, launchIntent, pendingFlags)
      views.setOnClickPendingIntent(R.id.timetable_widget_root, pending)

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
        val week = currentWeek(payload)
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
          TimetableWidgetMode.TODAY -> "第 ${week} 周"
          TimetableWidgetMode.UPCOMING -> "近日课程"
          TimetableWidgetMode.WEEK -> "第 ${week} 周课程"
        })
        views.setTextViewText(R.id.widget_date, when (mode) {
          TimetableWidgetMode.TODAY -> "${today.get(Calendar.MONTH) + 1}月${today.get(Calendar.DAY_OF_MONTH)}日 ${WEEKDAYS[weekday]}"
          TimetableWidgetMode.UPCOMING -> "${formatDate(today)} · ${formatDate(offsetDay(today, 1))}"
          TimetableWidgetMode.WEEK -> "${WEEKDAYS[1]}至${WEEKDAYS[7]}"
        })
        showCourses(views, courses, settings, when (mode) {
          TimetableWidgetMode.TODAY -> "今日没有课程"
          TimetableWidgetMode.UPCOMING -> "今天和明天没有课程"
          TimetableWidgetMode.WEEK -> "本周没有课程"
        })
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
          JSONObject(course.toString()).put("widgetDay", WEEKDAYS[targetDay])
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

    private fun showCourses(
      views: RemoteViews,
      courses: List<JSONObject>,
      settings: JSONObject,
      emptyMessage: String,
    ) {
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
      views.setViewVisibility(R.id.widget_course_list, View.GONE)
      views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
      views.setTextViewText(R.id.widget_empty, message)
      views.setViewVisibility(R.id.widget_more, View.GONE)
    }

    private val WEEKDAYS = arrayOf("", "周一", "周二", "周三", "周四", "周五", "周六", "周日")
  }
}

class UpcomingTimetableWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    TimetableWidgetProvider.updateMode(context, manager, ids, TimetableWidgetMode.UPCOMING)
  }
}

class WeeklyTimetableWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    TimetableWidgetProvider.updateMode(context, manager, ids, TimetableWidgetMode.WEEK)
  }
}
