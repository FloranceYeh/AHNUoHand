package com.plugin.background_notifications

import android.app.Activity
import android.app.Application
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import org.json.JSONObject

private const val JOB_ID = 84321
private const val PREFS = "ahnu_notification_poll"
private const val ICON_PREFS = "ahnu_application_icon"
private const val ICON_ACCENT = "accent"
private const val ICON_CLEANUP_PENDING = "cleanupPending"
const val WIDGET_PREFS = "ahnu_timetable_widget"
const val WIDGET_DATA = "data"
const val WIDGET_SETTINGS = "settings"

@InvokeArg
class ConfigureArgs {
  lateinit var settings: String
  var operatorNo: String = ""
}

@InvokeArg
class NotifyArgs {
  lateinit var title: String
  lateinit var body: String
  lateinit var imageBase64: String
}

@InvokeArg
class ScheduleArgs {
  lateinit var jobs: String
}

@InvokeArg
class SyncIconArgs {
  lateinit var accent: String
}

@InvokeArg
class SyncWidgetArgs {
  var data: String = ""
  var settings: String = ""
}

@TauriPlugin
class BackgroundNotificationsPlugin(private val activity: Activity) : Plugin(activity) {
  private val iconAliases = linkedMapOf(
    "teal" to "ThemeIconTeal",
    "blue" to "ThemeIconBlue",
    "violet" to "ThemeIconViolet",
    "amber" to "ThemeIconAmber",
    "rose" to "ThemeIconRose",
  )

  private val activityLifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityStopped(stoppedActivity: Activity) {
      if (stoppedActivity === activity) cleanupPendingIcon()
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
  }

  init {
    activity.application.registerActivityLifecycleCallbacks(activityLifecycleCallbacks)
  }

  @Command
  fun notify(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(NotifyArgs::class.java)
      if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        throw IllegalStateException("系统通知权限未开启")
      }
      val manager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("default", "通知", NotificationManager.IMPORTANCE_DEFAULT))
      val image = decodeImage(args.imageBase64)
      val appIcon = activity.resources.getIdentifier("ic_launcher", "mipmap", activity.packageName)
      val notification = NotificationCompat.Builder(activity, "default")
        .setSmallIcon(appIcon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info)
        .setLargeIcon(image)
        .setContentTitle(args.title)
        .setContentText(args.body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(args.body))
        .setAutoCancel(true)
        .build()
      NotificationManagerCompat.from(activity).notify(System.currentTimeMillis().toInt(), notification)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "通知发送失败")
    }
  }

  @Command
  fun schedule(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(ScheduleArgs::class.java)
      val manager = activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val preferences = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      for (storedId in preferences.getStringSet("courseNotificationIds", emptySet()).orEmpty()) {
        val id = storedId.toIntOrNull() ?: continue
        val old = PendingIntent.getBroadcast(activity, id, Intent(activity, ScheduledNotificationReceiver::class.java), PendingIntent.FLAG_NO_CREATE or if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        old?.let(manager::cancel)
        old?.cancel()
      }
      val ids = mutableSetOf<String>()
      val jobs = org.json.JSONArray(args.jobs)
      for (index in 0 until jobs.length()) {
        val job = jobs.getJSONObject(index)
        val id = job.getInt("id")
        val intent = Intent(activity, ScheduledNotificationReceiver::class.java)
          .putExtra("id", id)
          .putExtra("title", job.optString("title"))
          .putExtra("body", job.optString("body"))
          .putExtra("imageBase64", job.optString("imageBase64"))
        val pending = PendingIntent.getBroadcast(activity, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, job.getLong("at"), pending)
        ids.add(id.toString())
      }
      preferences.edit().putStringSet("courseNotificationIds", ids).apply()
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "课前提醒计划失败")
    }
  }

  @Command
  fun configure(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(ConfigureArgs::class.java)
      val settings = JSONObject(args.settings)
      val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit()
        .putString("settings", settings.toString())
        .putString("operatorNo", args.operatorNo)
        .apply()

      val enabled = settings.optBoolean("electricityAlert") || settings.optBoolean("schoolCardAlert")
      val scheduler = activity.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
      if (!enabled) {
        scheduler.cancel(JOB_ID)
      } else {
        val component = ComponentName(activity, BackgroundNotificationJob::class.java)
        val job = JobInfo.Builder(JOB_ID, component)
          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
          .setPersisted(true)
          .setPeriodic(15 * 60 * 1000L)
          .build()
        scheduler.schedule(job)
      }
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "无法配置通知后台任务")
    }
  }

  @Command
  fun syncIcon(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SyncIconArgs::class.java)
      val selected = iconAliases[args.accent]
        ?: throw IllegalArgumentException("不支持的应用主题色")
      // Disabling any launcher alias while the installed app is in the
      // foreground can terminate its task. Keep every currently enabled alias
      // for now and remove stale aliases after the activity stops.
      val keepEnabled = currentlyEnabledAliases() + selected
      applyIconState(keepEnabled)
      activity.getSharedPreferences(ICON_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(ICON_ACCENT, selected)
        .putBoolean(ICON_CLEANUP_PENDING, keepEnabled.any { it != selected })
        .apply()
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "应用图标同步失败")
    }
  }

  @Command
  fun syncWidget(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SyncWidgetArgs::class.java)
      val editor = activity.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).edit()
      if (args.data.isNotBlank()) {
        org.json.JSONObject(args.data)
        editor.putString(WIDGET_DATA, args.data)
      }
      if (args.settings.isNotBlank()) {
        val settings = org.json.JSONObject(args.settings)
        val maxCourses = settings.optInt("maxCourses", 4).coerceIn(1, 8)
        settings.put("maxCourses", maxCourses)
        editor.putString(WIDGET_SETTINGS, settings.toString())
      }
      editor.apply()
      TimetableWidgetProvider.updateAll(activity)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "课表小组件同步失败")
    }
  }

  private fun currentlyEnabledAliases(): Set<String> {
    val packageManager = activity.packageManager
    return iconAliases.values.filterTo(mutableSetOf()) { alias ->
      val component = ComponentName(activity.packageName, "${activity.packageName}.$alias")
      when (packageManager.getComponentEnabledSetting(component)) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED -> false
        else -> runCatching { packageManager.getActivityInfo(component, 0).enabled }
          .getOrDefault(false)
      }
    }
  }

  private fun cleanupPendingIcon() {
    val preferences = activity.getSharedPreferences(ICON_PREFS, Context.MODE_PRIVATE)
    if (!preferences.getBoolean(ICON_CLEANUP_PENDING, false)) return
    val selected = preferences.getString(ICON_ACCENT, null) ?: return
    runCatching { applyIconState(setOf(selected)) }
      .onSuccess {
        preferences.edit().putBoolean(ICON_CLEANUP_PENDING, false).apply()
      }
  }

  private fun applyIconState(enabledAliases: Set<String>) {
    val packageManager = activity.packageManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val settings = iconAliases.values.map { alias ->
        PackageManager.ComponentEnabledSetting(
          ComponentName(activity.packageName, "${activity.packageName}.$alias"),
          if (alias in enabledAliases) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
          } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
          },
          PackageManager.DONT_KILL_APP,
        )
      }
      packageManager.setComponentEnabledSettings(settings)
    } else {
      iconAliases.values.forEach { alias ->
        packageManager.setComponentEnabledSetting(
          ComponentName(activity.packageName, "${activity.packageName}.$alias"),
          if (alias in enabledAliases) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
          } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
          },
          PackageManager.DONT_KILL_APP,
        )
      }
    }
  }

  private fun decodeImage(value: String): android.graphics.Bitmap {
    val bytes = Base64.decode(value.substringAfter(","), Base64.DEFAULT)
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      ?: throw IllegalArgumentException("通知配图数据无效")
  }
}

class ScheduledNotificationReceiver : android.content.BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    runCatching {
      if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
      val channelId = "default"
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(channelId, "通知", NotificationManager.IMPORTANCE_DEFAULT))
      val appIcon = context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName)
      val encoded = intent.getStringExtra("imageBase64").orEmpty()
      val imageBytes = Base64.decode(encoded.substringAfter(","), Base64.DEFAULT)
      val image = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
      val title = intent.getStringExtra("title").orEmpty()
      val body = intent.getStringExtra("body").orEmpty()
      val notification = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(appIcon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info)
        .setLargeIcon(image)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .build()
      NotificationManagerCompat.from(context).notify(intent.getIntExtra("id", 0), notification)
    }
  }
}
