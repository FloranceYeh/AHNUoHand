# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# The Rust plugin bridge loads BackgroundNotificationsPlugin by its fully
# qualified class name. Widget providers and the scheduled job are also
# instantiated from AndroidManifest.xml, so none of these classes may be
# removed or renamed in release builds.
-keep class com.plugin.background_notifications.** { *; }

-keep class app.tauri.** { *; }
-keep interface app.tauri.** { *; }

# WorkManager creates its Room database through generated and reflective
# initialization paths during AndroidX Startup.
-keep class androidx.work.** { *; }
-keep class androidx.room.** { *; }
-keep class androidx.sqlite.** { *; }

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile