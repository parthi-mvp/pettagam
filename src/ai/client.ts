import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

// The API key lives only in the device keychain; it is never synced to Neon.
const KEY = 'ai.apiKey';
const CONF = 'ai.config';

export type AiLang = 'en' | 'ta';
export type AiConfig = { enabled: boolean; sms: boolean; lang: AiLang; baseUrl: string; model: string };
// SMS off by default: bank alerts are the most personal thing the AI could see, so it's opt-in.
export const AI_DEFAULTS: AiConfig = { enabled: false, sms: false, lang: 'en', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' };

type AiState = AiConfig & { hasKey: boolean; save: (conf: AiConfig, apiKey?: string | null) => Promise<void> };

/** More → AI assistant. Any OpenAI-compatible endpoint (OpenAI, Luna, OpenRouter…). */
export const useAi = create<AiState>((set, get) => ({
  ...(() => {
    try {
      return { ...AI_DEFAULTS, ...JSON.parse(Storage.getItemSync(CONF) ?? '{}') };
    } catch {
      return AI_DEFAULTS;
    }
  })(),
  hasKey: (() => {
    try {
      return !!SecureStore.getItem(KEY);
    } catch {
      return false;
    }
  })(),
  /** apiKey: a string replaces the key, null removes it, undefined keeps it. */
  save: async (conf, apiKey) => {
    await Storage.setItem(CONF, JSON.stringify(conf));
    if (apiKey === null) await SecureStore.deleteItemAsync(KEY);
    else if (apiKey) await SecureStore.setItemAsync(KEY, apiKey);
    set({ ...conf, hasKey: apiKey === undefined ? get().hasKey : !!apiKey });
  },
}));

export const aiReady = (s: AiState = useAi.getState()) => s.enabled && s.hasKey && !!s.model;
export const aiSmsReady = (s: AiState = useAi.getState()) => aiReady(s) && s.sms;

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type Message = { role: 'system' | 'user' | 'assistant'; content: string | Part[] };

/** One chat completion. `override` lets Settings test unsaved values. */
export async function chat(messages: Message[], opts: { json?: boolean } = {}, override?: Partial<AiConfig> & { apiKey?: string }) {
  const s = { ...useAi.getState(), ...override };
  const apiKey = override?.apiKey || (await SecureStore.getItemAsync(KEY));
  if (!apiKey) throw new Error('Add an API key in More → AI assistant');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000); // photos and long summaries can be slow
  try {
    const res = await fetch(`${s.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: s.model, messages, ...(opts.json ? { response_format: { type: 'json_object' } } : {}) }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? `AI request failed (${res.status})`);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text) throw new Error('The AI returned an empty answer');
    return text;
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('The AI took too long to answer');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
