// Tags: optional labels that cut across categories ("Goa trip", "Reimbursable").
// A transaction has one category but any number of tags, stored as a JSON array in transactions.tags.
// Pure (no imports) so tests/tags.test.ts runs it in Node.

/** Offered before the user has tags of their own: the common cross-category questions. */
export const STARTER_TAGS = ['Reimbursable', 'Business', 'Tax saving', 'Shared'];

const MAX_LEN = 30;

/** "  goa   trip " → "goa trip"; null when nothing is left. */
export function cleanTag(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '').slice(0, MAX_LEN).trim();
  return t || null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Column text → tags. Tolerates null and garbage (a bad row must not break a screen). */
export function parseTags(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  } catch {
    return [];
  }
}

/** Tags → column text, cleaned and without case-insensitive duplicates; null when empty. */
export function tagsColumn(tags: string[]): string | null {
  const out: string[] = [];
  for (const raw of tags) {
    const t = cleanTag(raw);
    if (t && !out.some((o) => same(o, t))) out.push(t);
  }
  return out.length ? JSON.stringify(out) : null;
}

export const hasTag = (tags: string[], tag: string) => tags.some((t) => same(t, tag));

/** Add if missing, remove if present (the chip toggle). */
export const toggleTag = (tags: string[], tag: string) => (hasTag(tags, tag) ? tags.filter((t) => !same(t, tag)) : [...tags, tag]);

/** Rename (to = new name) or remove (to = null) one tag in a list; merges if the new name is already there. */
export function replaceTag(tags: string[], from: string, to: string | null): string[] {
  const kept = tags.filter((t) => !same(t, from));
  return to && kept.length < tags.length && !hasTag(kept, to) ? [...kept, to] : kept;
}

// Message wording → a starter tag. Checked against the SMS body, merchant, note and category name.
const RULES: [RegExp, string][] = [
  [/\b(?:lic|life insurance|term (?:plan|insurance)|health insurance|mediclaim|ppf|elss|nps|sukanya|ssy|80c|80d|tax ?saver)\b/i, 'Tax saving'],
  [/reimburs|expense claim/i, 'Reimbursable'],
  [/\bgst(?:in)?\b|tax invoice/i, 'Business'],
  [/splitwise|\bsplit\b/i, 'Shared'],
];

/** Starter tags the wording of a message or entry points to ("LIC premium" → Tax saving). */
export const ruleTags = (text: string) => RULES.filter(([re]) => re.test(text)).map(([, tag]) => tag);

/** History first (it knows your own tags), then wording rules; no duplicates, nothing already picked. */
export function mergeHints(history: string[], rules: string[], picked: string[], max = 4): string[] {
  const out: string[] = [];
  for (const t of [...history, ...rules]) if (!hasTag(out, t) && !hasTag(picked, t)) out.push(t);
  return out.slice(0, max);
}
