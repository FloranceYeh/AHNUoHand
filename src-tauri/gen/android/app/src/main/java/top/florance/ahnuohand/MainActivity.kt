package top.florance.ahnuohand

import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.WHITE)
    content.disableOverscroll()
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = findWebView(window.decorView)
        if (webView != null) {
          if (webView.isAppPage()) {
            webView.clearHistory()
            webView.evaluateJavascript("window.dispatchEvent(new Event('app-back'))", null)
          } else {
            webView.stopLoading()
            webView.clearHistory()
            webView.evaluateJavascript(
              "window.location.replace('http://tauri.localhost/')",
              null,
            )
          }
        } else {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
        }
      }
    })
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findWebView(view.getChildAt(index))?.let { return it }
      }
    }
    return null
  }

  private fun WebView.isAppPage(): Boolean {
    val host = url?.let { Uri.parse(it).host?.lowercase() } ?: return false
    return host == "tauri.localhost" ||
      host == "localhost" ||
      host == "127.0.0.1" ||
      host == "10.0.2.2"
  }

  private fun View.disableOverscroll() {
    overScrollMode = View.OVER_SCROLL_NEVER
    if (this is ViewGroup) {
      for (index in 0 until childCount) {
        getChildAt(index).disableOverscroll()
      }
    }
  }
}
