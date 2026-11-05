package top.florance.ahnuohand

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.WHITE)
    content.disableOverscroll()
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
