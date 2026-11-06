import { SmsLab } from '@/components/sms-lab';
import { Screen } from '@/components/ui';

/** Developer: what the app suggests (category, tags, AI) for one pasted or picked SMS. Dev builds only (More → Developer). */
export default function SmsLabScreen() {
  return (
    <Screen>
      <SmsLab />
    </Screen>
  );
}
