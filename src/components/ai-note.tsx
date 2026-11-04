import { useState } from 'react';

import { aiReady, useAi } from '@/ai/client';
import { haptic } from '@/lib/haptics';

import { Button, Card, Text } from './ui';

/** A button that asks the AI for a short written take, shown in a brass card. Hidden when AI is off. */
export function AiNote({ label, run }: { label: string; run: () => Promise<string> }) {
  const ai = useAi(aiReady);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ai) return null;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      setText((await run()).trim());
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant={text ? 'brass' : 'surface'} className="gap-2">
      {text ? (
        <>
          <Text variant="eyebrow" tone="brass">AI summary</Text>
          <Text variant="muted" weight="regular" className="text-brass-deep" selectable>{text}</Text>
        </>
      ) : null}
      {error ? <Text variant="small" tone="danger">{error}</Text> : null}
      <Button size="sm" variant="tinted" icon="bulb" title={text ? 'Ask again' : label} loading={busy} onPress={go} />
    </Card>
  );
}
