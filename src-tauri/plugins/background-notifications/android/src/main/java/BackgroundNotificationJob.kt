package com.plugin.background_notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Context
import android.os.Build
import android.util.Base64
import android.webkit.CookieManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val POLL_PREFS = "ahnu_notification_poll"
private const val ELECTRICITY_URL = "https://zongwu.ahnu.edu.cn/gateway/sso/bbs/"
private const val APP_SECRET = "abcdefg"
private const val BODY_KEY = "12345678cgg54321"
private const val ORG_NO = "00110001"
private const val SCHOOLCARD_API = "https://ecardh5.17wanxiao.com/ecardh5/bootcallback"
private const val ALERT_CHANNEL = "campus-alerts"

class BackgroundNotificationJob : JobService() {
  override fun onStartJob(parameters: JobParameters): Boolean {
    Thread {
      try {
        performPolls()
      } finally {
        jobFinished(parameters, false)
      }
    }.start()
    return true
  }

  override fun onStopJob(parameters: JobParameters): Boolean {
    return true
  }

  private fun performPolls() {
    val prefs = getSharedPreferences(POLL_PREFS, Context.MODE_PRIVATE)
    val settings = runCatching { JSONObject(prefs.getString("settings", "{}") ?: "{}") }.getOrNull() ?: return
    if (settings.optBoolean("electricityAlert")) pollElectricity(prefs, settings)
    if (settings.optBoolean("schoolCardAlert")) pollSchoolCard(prefs, settings)
  }

  private fun pollElectricity(prefs: android.content.SharedPreferences, settings: JSONObject) {
    val operator = prefs.getString("operatorNo", "").orEmpty()
    if (!operator.matches(Regex("[0-9]{8,20}"))) return
    val interval = settings.optLong("electricityPollMinutes", 360).coerceAtLeast(15) * 60_000L
    val now = System.currentTimeMillis()
    if (now - prefs.getLong("electricityLastPoll", 0) < interval) return
    prefs.edit().putLong("electricityLastPoll", now).apply()
    try {
      val room = electricityPost("Org/SchoolRoom/ClientSchoolRoom", JSONObject()
        .put("Opt", "DetailByOperatorNo").put("OrgNo", ORG_NO).put("OptNo", operator).put("pageIndex", 0))
        .optJSONObject("Model") ?: return
      val roomNo = room.optString("No")
      if (roomNo.isBlank()) return
      val detail = electricityPost("Org/SchoolRoom/ClientSchoolRoom", JSONObject()
        .put("Opt", "Detail").put("OrgNo", ORG_NO).put("No", roomNo))
        .optJSONObject("Model") ?: return
      val remaining = detail.optDouble("NumDianShengYuALL", Double.NaN)
      if (!remaining.isNaN() && remaining <= settings.optDouble("electricityBalance", 10.0)) {
        val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        sendAlert(prefs, "electricityAlerted.$day", "宿舍剩余电量提醒", "宿舍剩余电量 ${"%.1f".format(Locale.US, remaining)} 度，已低于设定阈值。")
      }
    } catch (error: Exception) {
      android.util.Log.w("AHNUNotification", "Background electricity poll failed", error)
    }
  }

  private fun electricityPost(path: String, extra: JSONObject): JSONObject {
    val payload = JSONObject()
      .put("TimeStamp", "").put("iPageSize", 20).put("pageIndex", 1)
      .put("bIsPage", true).put("DBSrc", "10")
    val keys = extra.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      payload.put(key, extra.get(key))
    }
    val encrypted = saltedEncrypt(payload.toString(), BODY_KEY)
    val code = SimpleDateFormat("yyyyMMddHHmmss", Locale.US).format(Date())
    val sign = md5Hex(code + APP_SECRET).map { if (it.isLowerCase()) it.uppercaseChar() else it.lowercaseChar() }.joinToString("")
    val response = postForm(ELECTRICITY_URL + path, "json=" + urlEncode("PWDDATA_$encrypted"), mapOf(
      "HeadJson" to JSONObject().put("AppID", "00000001").put("Code", code).put("Sign", sign).toString()
    ))
    val result = JSONObject(response)
    if (result.optString("State") != "1") throw IllegalStateException(result.optString("Msg", "宿舍电费接口查询失败"))
    val model = result.opt("Model")
    return if (model is String && model.startsWith("PWDDATA_")) JSONObject(saltedDecrypt(model.removePrefix("PWDDATA_"), BODY_KEY)) else model as? JSONObject ?: JSONObject()
  }

  private fun pollSchoolCard(prefs: android.content.SharedPreferences, settings: JSONObject) {
    val interval = settings.optLong("schoolCardPollMinutes", 360).coerceAtLeast(15) * 60_000L
    val now = System.currentTimeMillis()
    if (now - prefs.getLong("schoolCardLastPoll", 0) < interval) return
    prefs.edit().putLong("schoolCardLastPoll", now).apply()
    try {
      val cookie = CookieManager.getInstance().getCookie(SCHOOLCARD_API).orEmpty()
      if (cookie.isBlank()) return
      val response = postForm(SCHOOLCARD_API, "gotowhere=XYK_BASE_INFO", mapOf(
        "Cookie" to cookie,
        "Origin" to "https://ecardh5.17wanxiao.com",
        "Referer" to "https://ecardh5.17wanxiao.com/ecardh5/ecard_t/",
        "Content-Type" to "application/x-www-form-urlencoded;charset=UTF-8",
      ))
      val root = JSONObject(response)
      if (!root.optBoolean("result_")) return
      val data = root.optJSONObject("data") ?: return
      val main = data.optDouble("main_fare", 0.0)
      val balance = if (main != 0.0) main else data.optDouble("my_fare", 0.0)
      if (balance <= settings.optDouble("schoolCardBalance", 20.0)) {
        val month = SimpleDateFormat("yyyy-MM", Locale.US).format(Date())
        sendAlert(prefs, "schoolCardAlerted.$month", "一卡通余额提醒", "当前余额 ¥${"%.2f".format(Locale.US, balance)}，已低于设定阈值。")
      }
    } catch (error: Exception) {
      android.util.Log.w("AHNUNotification", "Background school card poll failed", error)
    }
  }

  private fun postForm(url: String, body: String, headers: Map<String, String> = emptyMap()): String {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 20_000
      readTimeout = 20_000
      doOutput = true
      setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
      setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36")
      headers.forEach { (key, value) -> setRequestProperty(key, value) }
    }
    connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
    val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    if (connection.responseCode !in 200..299) throw IllegalStateException("HTTP ${connection.responseCode}")
    connection.disconnect()
    return text
  }

  private fun sendAlert(prefs: android.content.SharedPreferences, key: String, title: String, body: String) {
    if (prefs.getBoolean(key, false)) return
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(ALERT_CHANNEL, "账户预警", NotificationManager.IMPORTANCE_DEFAULT))
    val notification = NotificationCompat.Builder(this, ALERT_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .build()
    manager.notify(key.hashCode(), notification)
    prefs.edit().putBoolean(key, true).apply()
  }

  private fun saltedEncrypt(value: String, passphrase: String): String {
    val salt = ByteArray(8).also { java.security.SecureRandom().nextBytes(it) }
    val (key, iv) = evpBytesToKey(passphrase.toByteArray(Charsets.UTF_8), salt)
    val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
    val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString("Salted__".toByteArray() + salt + encrypted, Base64.NO_WRAP)
  }

  private fun saltedDecrypt(value: String, passphrase: String): String {
    val bytes = Base64.decode(value, Base64.DEFAULT)
    if (bytes.size < 32 || String(bytes, 0, 8, Charsets.UTF_8) != "Salted__") throw IllegalStateException("电费数据解密失败")
    val salt = bytes.copyOfRange(8, 16)
    val (key, iv) = evpBytesToKey(passphrase.toByteArray(Charsets.UTF_8), salt)
    val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
    return String(cipher.doFinal(bytes.copyOfRange(16, bytes.size)), Charsets.UTF_8)
  }

  private fun evpBytesToKey(pass: ByteArray, salt: ByteArray): Pair<ByteArray, ByteArray> {
    val stream = ArrayList<Byte>()
    var previous = ByteArray(0)
    while (stream.size < 48) {
      val digest = MessageDigest.getInstance("MD5").digest(previous + pass + salt)
      stream.addAll(digest.toList())
      previous = digest
    }
    val bytes = stream.toByteArray()
    return Pair(bytes.copyOfRange(0, 32), bytes.copyOfRange(32, 48))
  }

  private fun md5Hex(value: String): String = MessageDigest.getInstance("MD5")
    .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  private fun urlEncode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
