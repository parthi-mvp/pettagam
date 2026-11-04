import { isSmsReadingAvailable } from '@modules/sms-reader';
import { router, type Href } from 'expo-router';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';

import { aiReady, useAi } from '@/ai/client';
import { useThemeColor } from '@/theme/useThemeColor';

import { Icon, type IconName } from './icons';
import { PressableScale, Sheet, Text, type SheetRef } from './ui';

type Action = { icon: IconName; title: string; subtitle: string; href: Href; tone?: 'brass' };

const ACTIONS: Action[] = [
  { icon: 'bag', title: 'Expense', subtitle: 'Money you spent', href: { pathname: '/transaction-form', params: { type: 'expense' } } },
  { icon: 'bank', title: 'Income', subtitle: 'Salary, interest, refunds', href: { pathname: '/transaction-form', params: { type: 'income' } } },
  { icon: 'transfer', title: 'Transfer or card payment', subtitle: 'Between your own accounts', href: { pathname: '/transaction-form', params: { type: 'transfer' } } },
  { icon: 'trend', title: 'Investment', subtitle: 'FD, chit, SIP, gold, stocks…', href: '/investment-form' },
  { icon: 'card', title: 'Account or card', subtitle: 'Bank, credit card, wallet, loan', href: '/account-form' },
];

const DESCRIBE: Action = {
  icon: 'bulb',
  title: 'Describe it',
  subtitle: 'Type it in your words or snap a bill; AI fills the form',
  href: { pathname: '/transaction-form', params: { describe: '1' } },
  tone: 'brass',
};

const SMS: Action = { icon: 'sms', title: 'Import bank SMS', subtitle: 'Turn alerts into entries', href: '/sms-import', tone: 'brass' };

/** The "+" sheet on Home: everything you can add, one tap away. */
export const QuickAddSheet = forwardRef<SheetRef>(function QuickAddSheet(_, ref) {
  const sheet = useRef<SheetRef>(null);
  const [vault, brass] = [useThemeColor('primary'), useThemeColor('brass-fg')];
  useImperativeHandle(ref, () => ({ present: () => sheet.current?.present(), dismiss: () => sheet.current?.dismiss() }));

  const go = (href: Href) => {
    sheet.current?.dismiss();
    router.push(href);
  };

  const ai = useAi(aiReady);
  const actions = [...(ai ? [DESCRIBE] : []), ...ACTIONS.slice(0, 3), ...(isSmsReadingAvailable ? [SMS] : []), ...ACTIONS.slice(3)];

  return (
    <Sheet ref={sheet} title="Add" subtitle="Saved on this phone first, synced when online">
      <View className="gap-1">
        {actions.map((a) => (
          <PressableScale
            key={a.title}
            onPress={() => go(a.href)}
            className="flex-row items-center gap-3 rounded-input px-1 py-2.5 active:bg-fill">
            <View className={a.tone === 'brass' ? 'h-11 w-11 items-center justify-center rounded-input bg-brass-soft' : 'h-11 w-11 items-center justify-center rounded-input bg-primary-soft'}>
              <Icon name={a.icon} color={a.tone === 'brass' ? brass : vault} />
            </View>
            <View className="min-w-0 flex-1">
              <Text weight="medium" className="text-lg">
                {a.title}
              </Text>
              <Text variant="small">{a.subtitle}</Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
});
