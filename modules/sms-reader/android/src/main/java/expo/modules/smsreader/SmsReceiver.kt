package expo.modules.smsreader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Called by Android for every incoming SMS, even when Pettagam is closed. Does nothing unless the
 * user turned on "Pop up new bank SMS"; otherwise shows the quick-add card for bank alerts.
 */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    if (!SmsPopup.isEnabled(context)) return
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    // A long SMS arrives in parts; join them per sender.
    parts.groupBy { it.originatingAddress ?: "" }.forEach { (address, msgs) ->
      val body = msgs.joinToString("") { it.messageBody ?: "" }
      if (SmsPopup.looksLikeBankTxn(body)) {
        SmsPopup.show(context, address, body, msgs.first().timestampMillis)
      }
    }
  }
}
