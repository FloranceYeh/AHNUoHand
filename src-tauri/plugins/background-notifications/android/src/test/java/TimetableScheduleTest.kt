package com.plugin.background_notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TimetableScheduleTest {
  private fun day(text: String) = CalendarDay.parse(text)!!

  private fun course(weekday: Int, period: Int, span: Int = 1, weeks: Set<Int> = emptySet(), name: String = "课程") =
    WidgetCourse(weekday, period, span, name, "", "", "", weeks)

  private fun snapshot(startDate: String?, courses: List<WidgetCourse> = emptyList(), maxWeek: Int = 18, syncedWeek: Int = 1) =
    TimetableSnapshot(CalendarDay.parse(startDate), maxWeek, syncedWeek, courses, emptyList())

  @Test
  fun unknownAccentFallsBackToDefault() {
    assertEquals(WidgetAccent.ROSE, WidgetSettings.fromJson("""{"accent":"rose"}""").accent)
    assertEquals(WidgetAccent.DEFAULT, WidgetSettings.fromJson("""{"accent":"chartreuse"}""").accent)
    assertEquals(WidgetAccent.DEFAULT, WidgetSettings.fromJson("{}").accent)
    // Round-tripping keeps every field, including the accent.
    val settings = WidgetSettings(showTime = false, weekCellHeight = 52, accent = WidgetAccent.AMBER)
    assertEquals(settings, WidgetSettings.fromJson(settings.toJson()))
  }

  @Test
  fun parsesAndRejectsDates() {
    assertEquals(1, day("2026-11-09").weekday)
    assertEquals(7, day("2026-11-15").weekday)
    assertEquals("11/9", day("2026-11-09").shortLabel())
    assertNull(CalendarDay.parse("2026-02-30"))
    assertNull(CalendarDay.parse("2026-2-3"))
    assertNull(CalendarDay.parse(""))
  }

  @Test
  fun weekStartsOnMondayOfStartDate() {
    // Start date on a Wednesday: week 1 still begins that Monday, like semester.ts.
    val schedule = TimetableSchedule(snapshot("2026-09-02"), day("2026-09-07"))
    assertEquals(2, schedule.currentWeek)
    assertEquals(day("2026-08-31"), schedule.dateOf(1, 1))
    assertEquals(day("2026-09-13"), schedule.dateOf(2, 7))
  }

  @Test
  fun clampsWeekToSemester() {
    assertEquals(1, TimetableSchedule(snapshot("2026-09-07"), day("2026-08-01")).currentWeek)
    assertEquals(18, TimetableSchedule(snapshot("2026-09-07"), day("2027-06-01")).currentWeek)
  }

  @Test
  fun withoutStartDateUsesSyncedWeek() {
    val schedule = TimetableSchedule(snapshot(null, syncedWeek = 5), day("2026-11-15"))
    assertEquals(5, schedule.currentWeek)
    assertEquals(6, schedule.weekOf(day("2026-11-16")))
    assertEquals(day("2026-11-09"), schedule.dateOf(5, 1))
  }

  @Test
  fun tomorrowCrossesIntoNextWeek() {
    val courses = listOf(course(1, 3, weeks = setOf(2)), course(1, 1, weeks = setOf(1)))
    val schedule = TimetableSchedule(snapshot("2026-09-07", courses), day("2026-09-13"))
    assertEquals(listOf(3), schedule.coursesOn(day("2026-09-14")).map { it.period })
  }

  @Test
  fun weekCellsAlwaysFillEveryPeriod() {
    val cells = weekColumnCells(
      listOf(course(1, 1), course(1, 1, span = 3, name = "长"), course(1, 2), course(1, 12, span = 4)),
      periodCount = 13,
    )
    assertEquals(13, cells.sumOf { it.span })
    assertEquals("长", (cells.first() as CourseCell).course.name)
    assertEquals(2, (cells.last() as CourseCell).span)
  }
}
