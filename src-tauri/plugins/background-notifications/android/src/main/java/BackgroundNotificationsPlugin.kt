package com.plugin.background_notifications

import android.app.Activity
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
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

@TauriPlugin
class BackgroundNotificationsPlugin(private val activity: Activity) : Plugin(activity) {
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
}
