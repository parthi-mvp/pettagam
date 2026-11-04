// Default categories (docs/money-catalog.md §5). No imports: the SMS parser and its Node tests use it too.

export type CategorySeed = { name: string; kind: 'expense' | 'income'; color: string; icon: string };

export const CATEGORY_CATALOG: CategorySeed[] = [
  // Expense
  { name: 'Food & Dining', kind: 'expense', color: '#E4572E', icon: 'coffee' },
  { name: 'Groceries', kind: 'expense', color: '#F3A712', icon: 'cart' },
  { name: 'Shopping', kind: 'expense', color: '#A846A0', icon: 'bag' },
  { name: 'Fuel & Transport', kind: 'expense', color: '#2E86AB', icon: 'fuel' },
  { name: 'Bills & Utilities', kind: 'expense', color: '#3D5A80', icon: 'receipt' },
  { name: 'Mobile & Internet', kind: 'expense', color: '#2A9D8F', icon: 'phone' },
  { name: 'Subscriptions', kind: 'expense', color: '#6D5DD3', icon: 'repeat' },
  { name: 'Rent & Housing', kind: 'expense', color: '#6C584C', icon: 'house' },
  { name: 'Health', kind: 'expense', color: '#29BF12', icon: 'heart' },
  { name: 'Insurance', kind: 'expense', color: '#1D6FA3', icon: 'lock' },
  { name: 'Personal Care', kind: 'expense', color: '#E76F9A', icon: 'heart' },
  { name: 'Entertainment', kind: 'expense', color: '#FF5D8F', icon: 'film' },
  { name: 'Education', kind: 'expense', color: '#00A6A6', icon: 'book' },
  { name: 'Family & Kids', kind: 'expense', color: '#F08A4B', icon: 'home' },
  { name: 'Domestic Help', kind: 'expense', color: '#8A6F4D', icon: 'home' },
  { name: 'Gifts & Festivals', kind: 'expense', color: '#D1495B', icon: 'gift' },
  { name: 'Religious & Charity', kind: 'expense', color: '#C9962F', icon: 'heart' },
  { name: 'Travel', kind: 'expense', color: '#4ECDC4', icon: 'plane' },
  { name: 'EMI & Loans', kind: 'expense', color: '#8D0801', icon: 'card' },
  { name: 'Taxes', kind: 'expense', color: '#5E548E', icon: 'bank' },
  { name: 'Fees & Charges', kind: 'expense', color: '#9A8C98', icon: 'receipt' },
  { name: 'Pets', kind: 'expense', color: '#B5838D', icon: 'heart' },
  { name: 'Others', kind: 'expense', color: '#8E8E93', icon: 'bag' },
  // Income
  { name: 'Salary', kind: 'income', color: '#2A9D8F', icon: 'bank' },
  { name: 'Bonus & Incentives', kind: 'income', color: '#43AA8B', icon: 'gift' },
  { name: 'Business & Freelance', kind: 'income', color: '#277DA1', icon: 'trend' },
  { name: 'Rent Received', kind: 'income', color: '#6C584C', icon: 'house' },
  { name: 'Interest & Dividends', kind: 'income', color: '#264653', icon: 'coin' },
  { name: 'Investment Returns', kind: 'income', color: '#577590', icon: 'trend' },
  { name: 'Refund / Cashback', kind: 'income', color: '#7CB518', icon: 'refund' },
  { name: 'Reimbursements', kind: 'income', color: '#4D908E', icon: 'receipt' },
  { name: 'Gifts Received', kind: 'income', color: '#D1495B', icon: 'gift' },
  { name: 'Pension', kind: 'income', color: '#3D5A80', icon: 'bank' },
  { name: 'Tax Refund', kind: 'income', color: '#5E548E', icon: 'bank' },
  { name: 'Other Income', kind: 'income', color: '#5E6472', icon: 'coin' },
];

export const INCOME_CATEGORY_NAMES = CATEGORY_CATALOG.filter((c) => c.kind === 'income').map((c) => c.name);
