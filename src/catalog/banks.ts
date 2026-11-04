// Banks, card issuers, wallets and lenders (docs/money-catalog.md §3). Bundled logos live in
// assets/banks/<id>.png and are registered in src/catalog/bank-logos.ts; others show a monogram.

export type BankKind = 'public' | 'private' | 'small_finance' | 'payments' | 'foreign' | 'card' | 'wallet' | 'lender';

export type Bank = {
  id: string;
  name: string;
  /** Monogram text and the short label in lists. */
  short: string;
  kind: BankKind;
  /** Brand colour for the monogram tile. */
  color: string;
  domain: string;
  /** Lower-case names people type or SMS use; the full name and short are always matched too. */
  aliases?: string[];
  /** Headquartered in Tamil Nadu: listed first for Pettagam's users. */
  tn?: boolean;
};

export const BANK_KIND_LABEL: Record<BankKind, string> = {
  public: 'Public sector banks',
  private: 'Private banks',
  small_finance: 'Small finance banks',
  payments: 'Payments banks',
  foreign: 'Foreign banks',
  card: 'Card issuers',
  wallet: 'Wallets',
  lender: 'Lenders (NBFC)',
};

export const BANKS: Bank[] = [
  // Public sector (12)
  { id: 'sbi', name: 'State Bank of India', short: 'SBI', kind: 'public', color: '#22409A', domain: 'sbi.co.in', aliases: ['state bank', 'sbi bank'] },
  { id: 'bob', name: 'Bank of Baroda', short: 'BOB', kind: 'public', color: '#F05A28', domain: 'bankofbaroda.in', aliases: ['baroda'] },
  { id: 'boi', name: 'Bank of India', short: 'BOI', kind: 'public', color: '#0B3D91', domain: 'bankofindia.co.in' },
  { id: 'bom', name: 'Bank of Maharashtra', short: 'BOM', kind: 'public', color: '#1B4F9C', domain: 'bankofmaharashtra.in', aliases: ['mahabank'] },
  { id: 'canara', name: 'Canara Bank', short: 'CNB', kind: 'public', color: '#0072BC', domain: 'canarabank.com', aliases: ['canara'] },
  { id: 'central', name: 'Central Bank of India', short: 'CBI', kind: 'public', color: '#E31E24', domain: 'centralbankofindia.co.in', aliases: ['central bank'] },
  { id: 'indian', name: 'Indian Bank', short: 'IB', kind: 'public', color: '#0A4A8A', domain: 'indianbank.in', tn: true },
  { id: 'iob', name: 'Indian Overseas Bank', short: 'IOB', kind: 'public', color: '#1D3E8F', domain: 'iob.in', tn: true },
  { id: 'psb', name: 'Punjab and Sind Bank', short: 'PSB', kind: 'public', color: '#2E7D32', domain: 'punjabandsindbank.co.in', aliases: ['punjab & sind'] },
  { id: 'pnb', name: 'Punjab National Bank', short: 'PNB', kind: 'public', color: '#A4123F', domain: 'pnbindia.in', aliases: ['punjab national'] },
  { id: 'uco', name: 'UCO Bank', short: 'UCO', kind: 'public', color: '#1A4C9C', domain: 'ucobank.com' },
  { id: 'union', name: 'Union Bank of India', short: 'UBI', kind: 'public', color: '#E2231A', domain: 'unionbankofindia.co.in', aliases: ['union bank'] },
  // Private (21)
  { id: 'hdfc', name: 'HDFC Bank', short: 'HDFC', kind: 'private', color: '#004C8F', domain: 'hdfcbank.com', aliases: ['hdfc'] },
  { id: 'icici', name: 'ICICI Bank', short: 'ICICI', kind: 'private', color: '#B02A30', domain: 'icicibank.com', aliases: ['icici'] },
  { id: 'axis', name: 'Axis Bank', short: 'AXIS', kind: 'private', color: '#97144D', domain: 'axisbank.com', aliases: ['axis', 'citi', 'citibank'] },
  { id: 'kotak', name: 'Kotak Mahindra Bank', short: 'KMB', kind: 'private', color: '#ED1C24', domain: 'kotak.com', aliases: ['kotak'] },
  { id: 'indusind', name: 'IndusInd Bank', short: 'IIB', kind: 'private', color: '#8B1D1D', domain: 'indusind.com', aliases: ['indusind'] },
  { id: 'yes', name: 'Yes Bank', short: 'YES', kind: 'private', color: '#00518F', domain: 'yesbank.in' },
  { id: 'idfc', name: 'IDFC First Bank', short: 'IDFC', kind: 'private', color: '#9C1D26', domain: 'idfcfirstbank.com', aliases: ['idfc', 'idfc first'] },
  { id: 'federal', name: 'Federal Bank', short: 'FED', kind: 'private', color: '#1F4E9E', domain: 'federalbank.co.in', aliases: ['federal'] },
  { id: 'idbi', name: 'IDBI Bank', short: 'IDBI', kind: 'private', color: '#00836C', domain: 'idbibank.in', aliases: ['idbi'] },
  { id: 'cub', name: 'City Union Bank', short: 'CUB', kind: 'private', color: '#1B3F8B', domain: 'cityunionbank.com', aliases: ['city union'], tn: true },
  { id: 'kvb', name: 'Karur Vysya Bank', short: 'KVB', kind: 'private', color: '#0F7A3D', domain: 'kvb.co.in', aliases: ['karur vysya'], tn: true },
  { id: 'tmb', name: 'Tamilnad Mercantile Bank', short: 'TMB', kind: 'private', color: '#1C3F94', domain: 'tmb.in', aliases: ['tamilnad mercantile', 'tamil nadu mercantile'], tn: true },
  { id: 'sib', name: 'South Indian Bank', short: 'SIB', kind: 'private', color: '#ED1C24', domain: 'southindianbank.com', aliases: ['south indian'] },
  { id: 'rbl', name: 'RBL Bank', short: 'RBL', kind: 'private', color: '#21409A', domain: 'rblbank.com', aliases: ['ratnakar'] },
  { id: 'bandhan', name: 'Bandhan Bank', short: 'BAN', kind: 'private', color: '#E2231A', domain: 'bandhanbank.com', aliases: ['bandhan'] },
  { id: 'dcb', name: 'DCB Bank', short: 'DCB', kind: 'private', color: '#2D2A6E', domain: 'dcbbank.com' },
  { id: 'csb', name: 'CSB Bank', short: 'CSB', kind: 'private', color: '#00703C', domain: 'csb.co.in', aliases: ['catholic syrian'] },
  { id: 'dhanlaxmi', name: 'Dhanlaxmi Bank', short: 'DLB', kind: 'private', color: '#E31B23', domain: 'dhanbank.com', aliases: ['dhanlaxmi', 'dhanlakshmi'] },
  { id: 'jk', name: 'Jammu & Kashmir Bank', short: 'J&K', kind: 'private', color: '#0E6E3A', domain: 'jkbank.com', aliases: ['j&k bank', 'jk bank', 'jammu and kashmir'] },
  { id: 'karnataka', name: 'Karnataka Bank', short: 'KBL', kind: 'private', color: '#A7192E', domain: 'karnatakabank.com' },
  { id: 'nainital', name: 'Nainital Bank', short: 'NTB', kind: 'private', color: '#0D4C92', domain: 'nainitalbank.co.in' },
  // Small finance (11)
  { id: 'au', name: 'AU Small Finance Bank', short: 'AU', kind: 'small_finance', color: '#6D2077', domain: 'aubank.in', aliases: ['au bank', 'au sfb'] },
  { id: 'equitas', name: 'Equitas Small Finance Bank', short: 'EQ', kind: 'small_finance', color: '#F58220', domain: 'equitasbank.com', aliases: ['equitas'], tn: true },
  { id: 'ujjivan', name: 'Ujjivan Small Finance Bank', short: 'UJ', kind: 'small_finance', color: '#00A0E3', domain: 'ujjivansfb.in', aliases: ['ujjivan'] },
  { id: 'jana', name: 'Jana Small Finance Bank', short: 'JANA', kind: 'small_finance', color: '#00A651', domain: 'janabank.com', aliases: ['jana'] },
  { id: 'esaf', name: 'ESAF Small Finance Bank', short: 'ESAF', kind: 'small_finance', color: '#F7941D', domain: 'esafbank.com', aliases: ['esaf'] },
  { id: 'suryoday', name: 'Suryoday Small Finance Bank', short: 'SUR', kind: 'small_finance', color: '#F15A22', domain: 'suryodaybank.com', aliases: ['suryoday'] },
  { id: 'utkarsh', name: 'Utkarsh Small Finance Bank', short: 'UTK', kind: 'small_finance', color: '#7A2A90', domain: 'utkarsh.bank', aliases: ['utkarsh'] },
  { id: 'capital', name: 'Capital Small Finance Bank', short: 'CAP', kind: 'small_finance', color: '#0B5394', domain: 'capitalbank.co.in' },
  { id: 'shivalik', name: 'Shivalik Small Finance Bank', short: 'SHV', kind: 'small_finance', color: '#C8102E', domain: 'shivalikbank.com', aliases: ['shivalik'] },
  { id: 'unity', name: 'Unity Small Finance Bank', short: 'UNI', kind: 'small_finance', color: '#1E3A8A', domain: 'theunitybank.com', aliases: ['unity bank'] },
  { id: 'slice', name: 'Slice Small Finance Bank', short: 'SLC', kind: 'small_finance', color: '#5B2EFF', domain: 'sliceit.com', aliases: ['slice'] },
  // Payments banks (5)
  { id: 'airtel', name: 'Airtel Payments Bank', short: 'APB', kind: 'payments', color: '#E40000', domain: 'airtel.in', aliases: ['airtel bank'] },
  { id: 'ippb', name: 'India Post Payments Bank', short: 'IPPB', kind: 'payments', color: '#D0021B', domain: 'ippbonline.com', aliases: ['india post', 'post office', 'ippb'] },
  { id: 'fino', name: 'Fino Payments Bank', short: 'FINO', kind: 'payments', color: '#5A2D82', domain: 'finobank.com', aliases: ['fino'] },
  { id: 'jiopb', name: 'Jio Payments Bank', short: 'JPB', kind: 'payments', color: '#0F3CC9', domain: 'jiopaymentsbank.com', aliases: ['jio bank'] },
  { id: 'nsdlpb', name: 'NSDL Payments Bank', short: 'NSDL', kind: 'payments', color: '#00539B', domain: 'nsdlbank.com' },
  // Foreign banks with retail customers
  { id: 'hsbc', name: 'HSBC India', short: 'HSBC', kind: 'foreign', color: '#DB0011', domain: 'hsbc.co.in', aliases: ['hsbc'] },
  { id: 'sc', name: 'Standard Chartered', short: 'SC', kind: 'foreign', color: '#0473EA', domain: 'sc.com', aliases: ['stanchart', 'standard chartered'] },
  { id: 'dbs', name: 'DBS Bank India', short: 'DBS', kind: 'foreign', color: '#E2001A', domain: 'dbs.com', aliases: ['dbs', 'digibank', 'lakshmi vilas'] },
  { id: 'deutsche', name: 'Deutsche Bank', short: 'DB', kind: 'foreign', color: '#0018A8', domain: 'db.com' },
  // Card issuers that aren't banks
  { id: 'sbicard', name: 'SBI Card', short: 'SBIC', kind: 'card', color: '#22409A', domain: 'sbicard.com', aliases: ['sbi credit card'] },
  { id: 'amex', name: 'American Express', short: 'AMEX', kind: 'card', color: '#016FD0', domain: 'americanexpress.com', aliases: ['amex'] },
  { id: 'onecard', name: 'OneCard', short: '1C', kind: 'card', color: '#111111', domain: 'getonecard.app', aliases: ['one card'] },
  { id: 'scapia', name: 'Scapia', short: 'SCP', kind: 'card', color: '#5B3DF5', domain: 'scapia.cards' },
  // Wallets
  { id: 'paytm', name: 'Paytm', short: 'PTM', kind: 'wallet', color: '#00BAF2', domain: 'paytm.com' },
  { id: 'phonepe', name: 'PhonePe', short: 'PPE', kind: 'wallet', color: '#5F259F', domain: 'phonepe.com' },
  { id: 'amazonpay', name: 'Amazon Pay', short: 'APAY', kind: 'wallet', color: '#232F3E', domain: 'amazon.in', aliases: ['amazon pay later'] },
  { id: 'gpay', name: 'Google Pay', short: 'GPAY', kind: 'wallet', color: '#4285F4', domain: 'pay.google.com', aliases: ['gpay'] },
  { id: 'mobikwik', name: 'MobiKwik', short: 'MBK', kind: 'wallet', color: '#1F4FD9', domain: 'mobikwik.com' },
  { id: 'freecharge', name: 'Freecharge', short: 'FC', kind: 'wallet', color: '#F26722', domain: 'freecharge.in' },
  { id: 'pluxee', name: 'Pluxee', short: 'PLX', kind: 'wallet', color: '#1D1D1B', domain: 'pluxee.in', aliases: ['sodexo'] },
  // Lenders
  { id: 'bajaj', name: 'Bajaj Finance', short: 'BAF', kind: 'lender', color: '#0A5BA8', domain: 'bajajfinserv.in', aliases: ['bajaj finserv', 'bajaj'] },
  { id: 'tatacap', name: 'Tata Capital', short: 'TC', kind: 'lender', color: '#1B5FAA', domain: 'tatacapital.com' },
  { id: 'hdbfs', name: 'HDB Financial Services', short: 'HDB', kind: 'lender', color: '#004C8F', domain: 'hdbfs.com', aliases: ['hdb'] },
  { id: 'shriram', name: 'Shriram Finance', short: 'SFL', kind: 'lender', color: '#EE3124', domain: 'shriramfinance.in', aliases: ['shriram'], tn: true },
  { id: 'muthoot', name: 'Muthoot Finance', short: 'MF', kind: 'lender', color: '#C8102E', domain: 'muthootfinance.com', aliases: ['muthoot'] },
  { id: 'manappuram', name: 'Manappuram Finance', short: 'MAN', kind: 'lender', color: '#0C6B37', domain: 'manappuram.com', aliases: ['manappuram'] },
  { id: 'lic', name: 'LIC', short: 'LIC', kind: 'lender', color: '#0055A5', domain: 'licindia.in', aliases: ['life insurance corporation', 'lic housing'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim();

/** Find the catalogue bank for free text ("hdfc", "State Bank", "KVB savings"). Longest match wins. */
export function matchBank(text: string | null | undefined): Bank | null {
  if (!text) return null;
  const t = ` ${norm(text)} `;
  let best: Bank | null = null;
  let bestLen = 0;
  for (const b of BANKS) {
    for (const key of [b.name, b.short, ...(b.aliases ?? [])]) {
      const k = norm(key);
      if (k.length >= 2 && k.length > bestLen && t.includes(` ${k} `)) {
        best = b;
        bestLen = k.length;
      }
    }
  }
  return best;
}
