package expo.modules.smsreader

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * Home-screen widget. It never reads the database itself: the app writes the figures it shows
 * (SpendWidget.save) whenever data changes, and the widget redraws from those.
 */
class SpendWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, views(context))
  }

  companion object {
    private const val PREFS = "pettagam_widget"

    fun save(context: Context, label: String, today: String, month: String, scheme: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString("label", label).putString("today", today).putString("month", month).putString("scheme", scheme)
        .apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, SpendWidget::class.java))
      for (id in ids) manager.updateAppWidget(id, views(context))
    }

    private fun views(context: Context): RemoteViews {
      val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val v = RemoteViews(context.packageName, R.layout.pettagam_widget)
      p.getString("label", null)?.let { v.setTextViewText(R.id.widget_label, it) }
      p.getString("today", null)?.let { v.setTextViewText(R.id.widget_today, it) }
      p.getString("month", null)?.let { v.setTextViewText(R.id.widget_month, it) }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, it, flags))
      }
      // "+" opens the new-entry screen through the app's own link scheme (differs per build variant).
      val scheme = p.getString("scheme", null)
      val add = if (scheme != null) {
        Intent(Intent.ACTION_VIEW, Uri.parse("$scheme://transaction-form")).setPackage(context.packageName)
      } else context.packageManager.getLaunchIntentForPackage(context.packageName)
      add?.let { v.setOnClickPendingIntent(R.id.widget_add, PendingIntent.getActivity(context, 1, it, flags)) }
      return v
    }
  }
}
