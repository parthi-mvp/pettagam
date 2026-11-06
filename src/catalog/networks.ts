// Card networks (accounts.network). Pure data, so tests can import it in Node.

export type CardNetwork = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'diners' | 'discover' | 'maestro' | 'unionpay';

export const NETWORKS: { id: CardNetwork; name: string }[] = [
  { id: 'visa', name: 'Visa' },
  { id: 'mastercard', name: 'Mastercard' },
  { id: 'rupay', name: 'RuPay' },
  { id: 'amex', name: 'American Express' },
  { id: 'diners', name: 'Diners Club' },
  { id: 'discover', name: 'Discover' },
  { id: 'maestro', name: 'Maestro' },
  { id: 'unionpay', name: 'UnionPay' },
];

export const networkById = (id: string | null | undefined) => NETWORKS.find((n) => n.id === id) ?? null;

/** The network an SMS names ("…VISA Card XX8013…", "RuPay Credit Card"), to fill it in when it's not set. */
export function networkFromText(text: string): CardNetwork | null {
  const t = text.toLowerCase();
  if (/\brupay\b/.test(t)) return 'rupay';
  if (/\bvisa\b/.test(t)) return 'visa';
  if (/\bmaster ?card\b/.test(t)) return 'mastercard';
  if (/\bamex\b|american express/.test(t)) return 'amex';
  if (/\bdiners\b/.test(t)) return 'diners';
  if (/\bmaestro\b/.test(t)) return 'maestro';
  if (/\bdiscover\b/.test(t)) return 'discover';
  if (/\bunion ?pay\b/.test(t)) return 'unionpay';
  return null;
}
