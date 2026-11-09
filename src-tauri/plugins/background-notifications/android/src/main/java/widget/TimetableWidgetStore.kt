package com.plugin.background_notifications

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.SharedPreferencesMigration
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.io.IOException

/** SharedPreferences file used before the widgets moved to DataStore. */
private const val LEGACY_WIDGET_PREFS = "ahnu_timetable_widget"

private val DATA_KEY = stringPreferencesKey("data")
private val SETTINGS_KEY = stringPreferencesKey("settings")

// The delegate guarantees a single DataStore instance per process, which
// DataStore requires. The legacy keys use the same names, so the default
// migration copies them over unchanged.
private val Context.timetableWidgetDataStore: DataStore<Preferences> by preferencesDataStore(
  name = "timetable_widget",
  produceMigrations = { context -> listOf(SharedPreferencesMigration(context, LEGACY_WIDGET_PREFS)) },
)

/**
 * Single source of truth for widget content. The app writes here and every
 * running widget session observes [state], so a change shows up without the
 * widget having to re-read storage.
 */
internal class TimetableWidgetStore(context: Context) {
  private val dataStore = context.applicationContext.timetableWidgetDataStore

  val state: Flow<WidgetState> = dataStore.data
    .catch { error -> if (error is IOException) emit(emptyPreferences()) else throw error }
    .map { preferences ->
      WidgetState(
        snapshot = TimetableSnapshot.fromJson(preferences[DATA_KEY]),
        settings = WidgetSettings.fromJson(preferences[SETTINGS_KEY]),
      )
    }
    .distinctUntilChanged()

  /** Writes whichever parts are provided in one atomic transaction. */
  suspend fun save(data: String?, settings: WidgetSettings?) {
    if (data == null && settings == null) return
    dataStore.edit { preferences ->
      data?.let { preferences[DATA_KEY] = it }
      settings?.let { preferences[SETTINGS_KEY] = it.sanitized().toJson() }
    }
  }
}
