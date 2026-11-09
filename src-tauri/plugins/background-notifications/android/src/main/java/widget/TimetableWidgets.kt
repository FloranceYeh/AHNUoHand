package com.plugin.background_notifications

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Base class for the timetable widgets. Content is driven by
 * [TimetableWidgetStore.state] collected inside the composition, so a widget
 * session that is already running recomposes as soon as the app saves new
 * settings; [refreshTimetableWidgets] only needs to wake up idle widgets.
 */
internal abstract class TimetableWidget : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val store = TimetableWidgetStore(context)
    // Read the first value up front so the widget never flashes an empty state.
    val initial = store.state.first()
    provideContent {
      val state by store.state.collectAsState(initial)
      val snapshot = state.snapshot
      if (snapshot == null) {
        EmptyWidget("请先在应用内读取课表", state.settings)
      } else {
        Content(TimetableSchedule(snapshot, CalendarDay.today()), snapshot, state.settings)
      }
    }
  }

  @Composable
  protected abstract fun Content(schedule: TimetableSchedule, snapshot: TimetableSnapshot, settings: WidgetSettings)
}

internal class GlanceTodayTimetableWidget : TimetableWidget() {
  @Composable
  override fun Content(schedule: TimetableSchedule, snapshot: TimetableSnapshot, settings: WidgetSettings) =
    TodayWidgetContent(schedule, settings)
}

internal class GlanceUpcomingTimetableWidget : TimetableWidget() {
  @Composable
  override fun Content(schedule: TimetableSchedule, snapshot: TimetableSnapshot, settings: WidgetSettings) =
    UpcomingWidgetContent(schedule, settings)
}

internal class GlanceWeeklyTimetableWidget : TimetableWidget() {
  @Composable
  override fun Content(schedule: TimetableSchedule, snapshot: TimetableSnapshot, settings: WidgetSettings) =
    WeeklyWidgetContent(schedule, snapshot, settings)
}

/** Re-renders every pinned timetable widget from the current store state. */
internal suspend fun refreshTimetableWidgets(context: Context) = coroutineScope {
  listOf(GlanceTodayTimetableWidget(), GlanceUpcomingTimetableWidget(), GlanceWeeklyTimetableWidget())
    .forEach { widget -> launch { widget.updateAll(context) } }
}

/**
 * Receivers and widget classes keep their original names: launchers persist
 * the provider component and Glance maps receivers to widget classes by name,
 * so renaming them would break widgets users already placed.
 */
abstract class TimetableWidgetReceiver : GlanceAppWidgetReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    // "Today" and the current week depend on the clock; redraw immediately
    // instead of waiting for the next periodic update.
    if (intent.action in CLOCK_CHANGE_ACTIONS) {
      val pending = goAsync()
      CoroutineScope(Dispatchers.Default).launch {
        try {
          glanceAppWidget.updateAll(context)
        } finally {
          pending.finish()
        }
      }
    }
  }

  private companion object {
    val CLOCK_CHANGE_ACTIONS = setOf(Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)
  }
}

class GlanceTodayTimetableWidgetReceiver : TimetableWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = GlanceTodayTimetableWidget()
}

class GlanceUpcomingTimetableWidgetReceiver : TimetableWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = GlanceUpcomingTimetableWidget()
}

class GlanceWeeklyTimetableWidgetReceiver : TimetableWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = GlanceWeeklyTimetableWidget()
}
