import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, Divider, Empty, Row, Screen, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { tagTotals } from '@/db/repo';
import { dateSpan, money } from '@/lib/format';

/** Every tag with what was spent under it: a trip's total cost, office spends still to claim back. */
export default function Tags() {
  const { data: tags } = useLiveQuery(tagTotals, ['transactions']);

  return (
    <Screen>
      <Text variant="small">
        Tags group spending across categories: a trip, a wedding, office expenses to claim back. Add them to any transaction, below the note.
      </Text>
      {tags && tags.length === 0 ? (
        <Empty text="No tags yet. Open a transaction and add one, like “Goa trip”." />
      ) : (
        <Card className="gap-0 py-1">
          {(tags ?? []).map((t, i) => (
            <View key={t.tag}>
              {i > 0 ? <Divider /> : null}
              <Row
                icon="tag"
                title={t.tag}
                subtitle={`${t.count} ${t.count === 1 ? 'entry' : 'entries'} · ${dateSpan(t.first, t.last)}`}
                right={money(t.spent)}
                rightSub={t.earned > 0 ? `+${money(t.earned)} in` : null}
                onPress={() => router.push({ pathname: '/tag', params: { name: t.tag } })}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
