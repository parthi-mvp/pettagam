package expo.modules.smsreader

import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Shows a new bank SMS as the quick-add card (over other apps) or, failing that, as a notification. */
object SmsPopup {
  private const val PREFS = "pettagam_sms_popup"
  private const val KEY_ENABLED = "enabled"
  private const val CHANNEL = "bank_sms"
  const val EXTRA_ADDRESS = "address"
  const val EXTRA_BODY = "body"
  const val EXTRA_DATE = "date"
  const val EXTRA_NOTIFICATION = "notificationId"

  fun isEnabled(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

  fun setEnabled(ctx: Context, on: Boolean) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, on).apply()
  }

  // Cheap first pass so OTPs, offers and chats never wake the app; JS does the real parsing.
  private val amount = Regex("""(?:rs\.?|inr|₹)\s*[0-9][0-9,]*""", RegexOption.IGNORE_CASE)
  private val money = Regex("""debit|credit|spent|paid|withdrawn|received|sent|purchase|txn|transaction|transferred""", RegexOption.IGNORE_CASE)
  private val skip = Regex(
    """\botp\b|one[\s-]?time[\s-]?password|verification code|will be (?:debited|charged|credited)|\bis due\b|due date|declined|failed|unsuccessful|offer|eligible for|apply now|pre-?approved""",
    RegexOption.IGNORE_CASE
  )

  fun looksLikeBankTxn(body: String) = amount.containsMatchIn(body) && money.containsMatchIn(body) && !skip.containsMatchIn(body)

  /**
   * Developer test: behave as if `body` arrived from `address` after `delayMs`, so there's time to
   * switch to another app. Skips the on/off switch and the bank-SMS filter.
   */
  fun test(ctx: Context, address: String, body: String, delayMs: Long, notificationOnly: Boolean) {
    val app = ctx.applicationContext
    Handler(Looper.getMainLooper()).postDelayed({
      val now = System.currentTimeMillis()
      if (notificationOnly) notify(app, address, body, now) else show(app, address, body, now)
    }, delayMs)
  }

  fun show(ctx: Context, address: String, body: String, date: Long) {
    val locked = (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
    // "Display over other apps" lets us open the card from the background; one card at a time.
    if (Settings.canDrawOverlays(ctx) && !locked && !QuickAddActivity.isShowing) {
      openCard(ctx.applicationContext, address, body, date)
    } else {
      notify(ctx, address, body, date)
    }
  }

  /**
   * Some phones (seen on ColorOS 16 / Android 16) block the "Display over other apps" exemption
   * for opening a screen from the background ("BAL_BLOCK"), but still allow it while the app has a
   * visible window. So: show a 1×1 invisible overlay window, open the card, then remove the window.
   * If the card still didn't open, fall back to the notification.
   */
  private fun openCard(ctx: Context, address: String, body: String, date: Long) {
    val main = Handler(Looper.getMainLooper())
    val wm = ctx.getSystemService(WindowManager::class.java)
    val pixel = View(ctx)
    val params = WindowManager.LayoutParams(
      1, 1,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT
    ).apply { gravity = Gravity.TOP or Gravity.START }
    val added = try {
      wm.addView(pixel, params)
      true
    } catch (_: Exception) {
      false // overlay refused: try the plain launch below anyway
    }
    // Give the window a frame to become visible before launching.
    main.postDelayed({
      try {
        ctx.startActivity(intent(ctx, address, body, date, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: Exception) {
        // handled by the check below
      }
      main.postDelayed({
        if (added) runCatching { wm.removeView(pixel) }
        if (!QuickAddActivity.isShowing) notify(ctx, address, body, date)
      }, 2000)
    }, 150)
  }

  private fun intent(ctx: Context, address: String, body: String, date: Long, notificationId: Int?) =
    Intent(ctx, QuickAddActivity::class.java)
      .putExtra(EXTRA_ADDRESS, address)
      .putExtra(EXTRA_BODY, body)
      .putExtra(EXTRA_DATE, date.toDouble())
      .apply { if (notificationId != null) putExtra(EXTRA_NOTIFICATION, notificationId) }

  private fun notify(ctx: Context, address: String, body: String, date: Long) {
    val nm = NotificationManagerCompat.from(ctx)
    if (!nm.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL, "New bank SMS", NotificationManager.IMPORTANCE_HIGH)
      channel.description = "Add a transaction from a bank or card alert"
      ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val id = (address + body + date).hashCode()
    val tap = PendingIntent.getActivity(
      ctx, id, intent(ctx, address, body, date, id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val n = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_pettagam)
      .setContentTitle("New bank SMS · tap to add")
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build()
    try {
      nm.notify(id, n)
    } catch (_: SecurityException) {
      // notification permission revoked between the check and now
    }
  }
}
