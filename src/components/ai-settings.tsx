import { useState } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { AI_DEFAULTS, chat, useAi, type AiLang } from '@/ai/client';
import { Button, Card, Chips, Field, SwitchRow, Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';

/** More → AI assistant: key, endpoint and model for any OpenAI-compatible API. */
export function AiSettings() {
  const ai = useAi();
  const [enabled, setEnabled] = useState(ai.enabled);
  const [sms, setSms] = useState(ai.sms);
  const [lang, setLang] = useState<AiLang>(ai.lang);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const [model, setModel] = useState(ai.model);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  const draft = () => ({ enabled, sms, lang, baseUrl: baseUrl.trim() || AI_DEFAULTS.baseUrl, model: model.trim() });
  // The key is a bearer token: never send it over plain http.
  const invalid = () =>
    !/^https:\/\/\S+$/i.test(draft().baseUrl) ? 'Base URL must start with https://' : !draft().model ? 'Enter a model name' : null;

  const run = async (kind: 'save' | 'test', fn: () => Promise<void>) => {
    const err = invalid();
    if (err) return toast.error(err);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      haptic.error();
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      if (enabled && !apiKey.trim() && !ai.hasKey) throw new Error('Add an API key to turn AI on');
      await ai.save(draft(), apiKey.trim() || undefined);
      setApiKey('');
      haptic.success();
      toast.success('AI settings saved');
    });

  const test = () =>
    run('test', async () => {
      await chat([{ role: 'user', content: 'Reply with the word OK.' }], {}, { ...draft(), apiKey: apiKey.trim() || undefined });
      haptic.success();
      toast.success('Connected. The AI answered.');
    });

  const removeKey = () =>
    run('save', async () => {
      await ai.save({ ...draft(), enabled: false }, null);
      setEnabled(false);
      setApiKey('');
      toast.info('API key removed');
    });

  return (
    <Card className="gap-3">
      <SwitchRow title="Use AI" description="SMS reading, categories, summaries and Q&A" value={enabled} onValueChange={setEnabled} />
      {enabled ? (
        <SwitchRow
          title="Read bank SMS with AI"
          description="Sends alerts the app can’t read, with names, account digits, UPI IDs and balances masked"
          value={sms}
          onValueChange={setSms}
        />
      ) : null}
      {enabled ? (
        <Chips<AiLang>
          label="Answer language"
          options={[
            { value: 'en', label: 'English' },
            { value: 'ta', label: 'தமிழ்' },
          ]}
          value={lang}
          onChange={setLang}
        />
      ) : null}
      <Field
        label="API key"
        value={apiKey}
        onChangeText={setApiKey}
        placeholder={ai.hasKey ? 'Saved. Type to replace' : 'sk-…'}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field label="Base URL" value={baseUrl} onChangeText={setBaseUrl} placeholder={AI_DEFAULTS.baseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="Any OpenAI-compatible API" />
      <Field label="Model" value={model} onChangeText={setModel} placeholder={AI_DEFAULTS.model} autoCapitalize="none" autoCorrect={false} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button size="sm" title="Save" loading={busy === 'save'} disabled={!!busy} onPress={save} />
        </View>
        <View className="flex-1">
          <Button size="sm" variant="secondary" title="Test connection" loading={busy === 'test'} disabled={!!busy} onPress={test} />
        </View>
      </View>
      {ai.hasKey ? <Button size="sm" variant="link" title="Remove API key" disabled={!!busy} onPress={removeKey} /> : null}
      <Text variant="small">
        The key stays in this phone’s keychain and is never synced. Only what a feature needs is sent to your provider: SMS
        (only if you turn that on, with personal details masked), text you type or bill photos you pick, merchant names when tidying,
        and totals, balances or investment details for summaries and questions. Each request is billed to your key.
      </Text>
    </Card>
  );
}
