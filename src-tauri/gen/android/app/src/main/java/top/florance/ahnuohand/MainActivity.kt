package top.florance.ahnuohand

import android.graphics.Color
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
          webView.evaluateJavascript("window.dispatchEvent(new Event('app-back'))", null)
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

  private fun View.disableOverscroll() {
    overScrollMode = View.OVER_SCROLL_NEVER
    if (this is ViewGroup) {
      for (index in 0 until childCount) {
        getChildAt(index).disableOverscroll()
      }
    }
  }
}
