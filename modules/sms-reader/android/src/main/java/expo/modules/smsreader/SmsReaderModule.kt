package expo.modules.smsreader

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsPermissionException : CodedException("READ_SMS permission not granted")

/**
 * Reads the device SMS inbox (Android only). Messages never leave the device:
 * JS parses them locally and stores only the extracted transaction.
 */
class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    // "Pop up new bank SMS": read by SmsReceiver, which runs even when the app is closed.
    Function("setPopupEnabled") { on: Boolean ->
      appContext.reactContext?.let { SmsPopup.setEnabled(it, on) }
    }
    Function("isPopupEnabled") {
      appContext.reactContext?.let { SmsPopup.isEnabled(it) } ?: false
    }
    Function("canDrawOverlays") {
      appContext.reactContext?.let { Settings.canDrawOverlays(it) } ?: false
    }
    Function("openOverlaySettings") {
      appContext.reactContext?.let { ctx ->
        ctx.startActivity(
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
      null
    }
    Function("testPopup") { address: String, body: String, delayMs: Double, notificationOnly: Boolean ->
      appContext.reactContext?.let { SmsPopup.test(it, address, body, delayMs.toLong(), notificationOnly) }
      null
    }
    Function("updateWidget") { label: String, today: String, month: String, scheme: String ->
      appContext.reactContext?.let { SpendWidget.save(it, label, today, month, scheme) }
      null
    }
    Function("closeQuickAdd") {
      QuickAddActivity.close()
      null
    }

    Function("hasPermission") {
      val ctx = appContext.reactContext ?: return@Function false
      ctx.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    }

    // Returns inbox messages received after `sinceMs` (and up to `untilMs`, if given), newest first, at most `limit`.
    AsyncFunction("readInbox") { sinceMs: Double, limit: Int, untilMs: Double? ->
      val ctx = appContext.reactContext ?: throw SmsPermissionException()
      if (ctx.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SmsPermissionException()
      }
      val out = mutableListOf<Map<String, Any?>>()
      val cursor = ctx.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        "date > ? AND date <= ?",
        arrayOf(sinceMs.toLong().toString(), (untilMs?.toLong() ?: Long.MAX_VALUE).toString()),
        "date DESC"
      )
      cursor?.use {
        val idIdx = it.getColumnIndexOrThrow("_id")
        val addrIdx = it.getColumnIndexOrThrow("address")
        val bodyIdx = it.getColumnIndexOrThrow("body")
        val dateIdx = it.getColumnIndexOrThrow("date")
        while (it.moveToNext() && out.size < limit) {
          out.add(
            mapOf(
              "id" to it.getString(idIdx),
              "address" to (it.getString(addrIdx) ?: ""),
              "body" to (it.getString(bodyIdx) ?: ""),
              "date" to it.getLong(dateIdx).toDouble()
            )
          )
        }
      }
      out
    }
  }
}
