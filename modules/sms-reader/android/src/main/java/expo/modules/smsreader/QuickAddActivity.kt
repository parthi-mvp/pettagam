package expo.modules.smsreader

import android.os.Bundle
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference

/**
 * See-through screen that renders the "QuickAdd" React component (src/quick-add) over whatever app
 * is open. It shares the app's JS runtime, so it saves through the same database and code.
 */
class QuickAddActivity : ReactActivity() {
  override fun getMainComponentName() = "QuickAdd"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    object : DefaultReactActivityDelegate(this, mainComponentName, true) {
      override fun getLaunchOptions() = Bundle().apply {
        putString("address", intent.getStringExtra(SmsPopup.EXTRA_ADDRESS) ?: "")
        putString("body", intent.getStringExtra(SmsPopup.EXTRA_BODY) ?: "")
        putDouble("date", intent.getDoubleExtra(SmsPopup.EXTRA_DATE, System.currentTimeMillis().toDouble()))
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    current = WeakReference(this)
    val n = intent.getIntExtra(SmsPopup.EXTRA_NOTIFICATION, 0)
    if (n != 0) NotificationManagerCompat.from(this).cancel(n)
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  // Back closes the card (never moves Pettagam's own task to the front).
  override fun invokeDefaultOnBackPressed() = finish()

  companion object {
    private var current: WeakReference<QuickAddActivity>? = null
    val isShowing get() = current?.get()?.isFinishing == false
    fun close() = current?.get()?.let { it.runOnUiThread { it.finish() } }
  }
}
