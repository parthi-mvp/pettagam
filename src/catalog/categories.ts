// Default categories (docs/money-catalog.md §5). No imports: the SMS parser and its Node tests use it too.

export type CategorySeed = { name: string; kind: 'expense' | 'income'; color: string; icon: string };

export const CATEGORY_CATALOG: CategorySeed[] = [
  // Expense
  { name: 'Food & Dining', kind: 'expense', color: '#E4572E', icon: 'ms:restaurant' },
  { name: 'Groceries', kind: 'expense', color: '#F3A712', icon: 'ms:shopping_cart' },
  { name: 'Shopping', kind: 'expense', color: '#A846A0', icon: 'ms:shopping_bag' },
  { name: 'Fuel & Transport', kind: 'expense', color: '#2E86AB', icon: 'ms:local_gas_station' },
  { name: 'Bills & Utilities', kind: 'expense', color: '#3D5A80', icon: 'ms:receipt_long' },
  { name: 'Mobile & Internet', kind: 'expense', color: '#2A9D8F', icon: 'ms:mobile' },
  { name: 'Subscriptions', kind: 'expense', color: '#6D5DD3', icon: 'ms:subscriptions' },
  { name: 'Rent & Housing', kind: 'expense', color: '#6C584C', icon: 'ms:home' },
  { name: 'Health', kind: 'expense', color: '#29BF12', icon: 'ms:medical_services' },
  { name: 'Insurance', kind: 'expense', color: '#1D6FA3', icon: 'ms:health_and_safety' },
  { name: 'Personal Care', kind: 'expense', color: '#E76F9A', icon: 'ms:spa' },
  { name: 'Entertainment', kind: 'expense', color: '#FF5D8F', icon: 'ms:movie' },
  { name: 'Education', kind: 'expense', color: '#00A6A6', icon: 'ms:school' },
  { name: 'Family & Kids', kind: 'expense', color: '#F08A4B', icon: 'ms:family_restroom' },
  { name: 'Domestic Help', kind: 'expense', color: '#8A6F4D', icon: 'ms:cleaning_services' },
  { name: 'Gifts & Festivals', kind: 'expense', color: '#D1495B', icon: 'ms:celebration' },
  { name: 'Religious & Charity', kind: 'expense', color: '#C9962F', icon: 'ms:temple_hindu' },
  { name: 'Travel', kind: 'expense', color: '#4ECDC4', icon: 'ms:flight' },
  { name: 'EMI & Loans', kind: 'expense', color: '#8D0801', icon: 'ms:payment' },
  { name: 'Taxes', kind: 'expense', color: '#5E548E', icon: 'ms:account_balance' },
  { name: 'Fees & Charges', kind: 'expense', color: '#9A8C98', icon: 'ms:request_quote' },
  { name: 'Pets', kind: 'expense', color: '#B5838D', icon: 'ms:pets' },
  { name: 'Others', kind: 'expense', color: '#8E8E93', icon: 'ms:category' },
  // Income
  { name: 'Salary', kind: 'income', color: '#2A9D8F', icon: 'ms:payments' },
  { name: 'Bonus & Incentives', kind: 'income', color: '#43AA8B', icon: 'ms:workspace_premium' },
  { name: 'Business & Freelance', kind: 'income', color: '#277DA1', icon: 'ms:work' },
  { name: 'Rent Received', kind: 'income', color: '#6C584C', icon: 'ms:real_estate_agent' },
  { name: 'Interest & Dividends', kind: 'income', color: '#264653', icon: 'ms:savings' },
  { name: 'Investment Returns', kind: 'income', color: '#577590', icon: 'ms:trending_up' },
  { name: 'Refund / Cashback', kind: 'income', color: '#7CB518', icon: 'ms:currency_exchange' },
  { name: 'Reimbursements', kind: 'income', color: '#4D908E', icon: 'ms:price_check' },
  { name: 'Gifts Received', kind: 'income', color: '#D1495B', icon: 'ms:redeem' },
  { name: 'Pension', kind: 'income', color: '#3D5A80', icon: 'ms:elderly' },
  { name: 'Tax Refund', kind: 'income', color: '#5E548E', icon: 'ms:account_balance_wallet' },
  { name: 'Other Income', kind: 'income', color: '#5E6472', icon: 'ms:attach_money' },
];

export const INCOME_CATEGORY_NAMES = CATEGORY_CATALOG.filter((c) => c.kind === 'income').map((c) => c.name);

/** Colours offered for categories you create (Category form, and quick-add from the category sheet). */
export const CATEGORY_COLORS = ['#E4572E', '#F3A712', '#7CB518', '#29BF12', '#2A9D8F', '#00A6A6', '#2E86AB', '#3D5A80', '#A846A0', '#FF5D8F', '#8D0801', '#6C584C'];

/**
 * The drawn icons categories used before Material Symbols, mapped to their closest symbol. Stored values
 * stay as they are (no data change); src/components/icons.tsx categoryIcon() translates when drawing.
 */
export const LEGACY_CATEGORY_ICONS: Record<string, string> = {
  bag: 'shopping_bag', receipt: 'receipt_long', fuel: 'local_gas_station', house: 'home', home: 'home', heart: 'favorite',
  film: 'movie', book: 'menu_book', plane: 'flight', card: 'payment', bank: 'account_balance', coin: 'payments',
  refund: 'currency_exchange', repeat: 'loop', chit: 'groups', bulb: 'lightbulb', mail: 'mail', sms: 'sms',
  phone: 'mobile', gift: 'redeem', cart: 'shopping_cart', coffee: 'local_cafe', pie: 'pie_chart', trend: 'trending_up',
  lock: 'lock',
};
