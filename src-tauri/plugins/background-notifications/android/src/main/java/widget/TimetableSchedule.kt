package com.plugin.background_notifications

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone

private const val DAY_MS = 24L * 60L * 60L * 1000L
private val UTC: TimeZone = TimeZone.getTimeZone("UTC")
private val DATE_PATTERN = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")

internal val WEEKDAY_LABELS = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")

/**
 * A timezone-free calendar date. Arithmetic happens on epoch days so DST and
 * the device timezone can never shift a course onto the wrong day.
 */
internal data class CalendarDay(val epochDay: Long) {
  private val fields: Calendar
    get() = GregorianCalendar(UTC).apply { timeInMillis = epochDay * DAY_MS }

  val month: Int get() = fields.get(Calendar.MONTH) + 1
  val dayOfMonth: Int get() = fields.get(Calendar.DAY_OF_MONTH)

  /** 1 = Monday … 7 = Sunday (1970-01-01 was a Thursday). */
  val weekday: Int get() = Math.floorMod(epochDay + 3, 7L).toInt() + 1

  val weekdayLabel: String get() = WEEKDAY_LABELS[weekday - 1]
  val monday: CalendarDay get() = plusDays(1 - weekday)

  fun plusDays(days: Int): CalendarDay = CalendarDay(epochDay + days)

  /** `11/9` */
  fun shortLabel(): String = "$month/$dayOfMonth"

  /** `11月9日` */
  fun longLabel(): String = "${month}月${dayOfMonth}日"

  companion object {
    fun today(): CalendarDay {
      val local = Calendar.getInstance()
      return of(local.get(Calendar.YEAR), local.get(Calendar.MONTH) + 1, local.get(Calendar.DAY_OF_MONTH))!!
    }

    fun of(year: Int, month: Int, dayOfMonth: Int): CalendarDay? = runCatching {
      val calendar = GregorianCalendar(UTC).apply {
        isLenient = false
        clear()
        set(year, month - 1, dayOfMonth)
      }
      // Reading the time validates the fields because the calendar is strict.
      CalendarDay(Math.floorDiv(calendar.timeInMillis, DAY_MS))
    }.getOrNull()

    /** Parses `YYYY-MM-DD`; returns null for anything else. */
    fun parse(text: String?): CalendarDay? {
      val match = text?.trim()?.let(DATE_PATTERN::matchEntire) ?: return null
      val (year, month, day) = match.destructured
      return of(year.toInt(), month.toInt(), day.toInt())
    }
  }
}

/**
 * Week and day queries over a [TimetableSnapshot]. Mirrors `src/lib/semester.ts`:
 * week 1 starts on the Monday of the start date's week, and the current week is
 * clamped to `1..maxWeek`.
 */
internal class TimetableSchedule(
  private val snapshot: TimetableSnapshot,
  val today: CalendarDay,
) {
  private val firstMonday: CalendarDay? = snapshot.startDate?.monday

  val currentWeek: Int = weekOf(today)

  fun weekOf(day: CalendarDay): Int {
    val week = if (firstMonday != null) {
      Math.floorDiv(day.epochDay - firstMonday.epochDay, 7L).toInt() + 1
    } else {
      // Without a start date only the week reported at sync time is known.
      snapshot.syncedWeek + Math.floorDiv(day.monday.epochDay - today.monday.epochDay, 7L).toInt()
    }
    val atLeastFirst = week.coerceAtLeast(1)
    return if (snapshot.maxWeek > 0) atLeastFirst.coerceAtMost(snapshot.maxWeek) else atLeastFirst
  }

  fun dateOf(week: Int, weekday: Int): CalendarDay {
    val base = firstMonday ?: today.monday.plusDays(-(currentWeek - 1) * 7)
    return base.plusDays((week - 1) * 7 + weekday - 1)
  }

  fun coursesOn(day: CalendarDay): List<WidgetCourse> {
    val week = weekOf(day)
    return snapshot.courses
      .filter { it.weekday == day.weekday && it.isActiveIn(week) }
      .sortedBy { it.period }
  }

  fun coursesInWeek(week: Int): List<WidgetCourse> =
    snapshot.courses.filter { it.isActiveIn(week) }
}

/** One vertical track in the week grid: a course spanning periods, or a free period. */
internal sealed interface WeekCell {
  val span: Int
}

internal data class CourseCell(val course: WidgetCourse, override val span: Int) : WeekCell

internal data object EmptyCell : WeekCell {
  override val span: Int = 1
}

/**
 * Lays out one day so the cell spans always add up to [periodCount]. When two
 * courses start in the same period the longer one wins; a course that starts
 * inside another course's span cannot be shown in a grid and is skipped.
 */
internal fun weekColumnCells(dayCourses: List<WidgetCourse>, periodCount: Int): List<WeekCell> {
  val byStart = dayCourses.groupBy { it.period }.mapValues { (_, starting) -> starting.maxBy { it.span } }
  return buildList {
    var period = 1
    while (period <= periodCount) {
      val course = byStart[period]
      if (course == null) {
        add(EmptyCell)
        period += 1
      } else {
        val span = course.span.coerceAtMost(periodCount - period + 1)
        add(CourseCell(course, span))
        period += span
      }
    }
  }
}
