package top.florance.ahnuohand

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.WHITE)
    content.disableOverscroll()
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
      insets
    }
    ViewCompat.requestApplyInsets(content)
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
