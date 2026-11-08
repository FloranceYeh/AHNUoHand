package com.plugin.background_notifications

import android.app.Activity
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
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

@TauriPlugin
class BackgroundNotificationsPlugin(private val activity: Activity) : Plugin(activity) {
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
      val aliases = mapOf(
        "teal" to "ThemeIconTeal",
        "blue" to "ThemeIconBlue",
        "violet" to "ThemeIconViolet",
        "amber" to "ThemeIconAmber",
        "rose" to "ThemeIconRose",
      )
      val selected = aliases[args.accent]
        ?: throw IllegalArgumentException("不支持的应用主题色")
      val packageManager = activity.packageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        // Android 13+ supports one transaction, avoiding a launcher frame with
        // both aliases enabled (or with no launcher icon enabled).
        val settings = aliases.values.map { alias ->
          PackageManager.ComponentEnabledSetting(
            ComponentName(activity.packageName, "${activity.packageName}.$alias"),
            if (alias == selected) {
              PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            } else {
              PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            },
            PackageManager.DONT_KILL_APP,
          )
        }
        packageManager.setComponentEnabledSettings(settings)
      } else {
        // This API was added in Android 13. Keep the same behavior on older
        // releases with the legacy per-component API.
        aliases.values.forEach { alias ->
          packageManager.setComponentEnabledSetting(
            ComponentName(activity.packageName, "${activity.packageName}.$alias"),
            if (alias == selected) {
              PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            } else {
              PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            },
            PackageManager.DONT_KILL_APP,
          )
        }
      }
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "应用图标同步失败")
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
