-- Catalogue expansion (docs/money-catalog.md). Apply BEFORE shipping the app version that uses it:
-- the phone uploads every column and any new type, and the Data API rejects the whole push otherwise
-- (which stops sync for every table, not just these rows).

-- Categories can carry a user-chosen icon (an IconName from the app); null = the app guesses from the name.
alter table public.categories add column if not exists icon text;

-- A bank account's debit card digits (ATM and card alerts quote the card, not the account).
alter table public.accounts add column if not exists card_last4 text;

-- New account types: overdraft, Pay Later, meal card, FASTag, money lent / borrowed.
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check check (type in (
  'bank', 'overdraft', 'credit_card', 'pay_later', 'wallet', 'meal_card', 'fastag', 'cash', 'loan', 'lent', 'borrowed'));

-- New investment types: post-office schemes, ETF / REIT / InvIT, digital gold, SGB, silver, LIC, ULIP and more.
alter table public.investments drop constraint if exists investments_type_check;
alter table public.investments add constraint investments_type_check check (type in (
  'fd', 'rd', 'chit', 'stock', 'mutual_fund', 'gold', 'ppf', 'epf', 'nps', 'bond', 'real_estate', 'crypto', 'other',
  'corporate_fd', 'po_td', 'po_mis', 'nsc', 'kvp', 'scss', 'ssy', 'apy', 'etf', 'reit', 'invit', 'us_stock', 'esop',
  'digital_gold', 'sgb', 'silver', 'lic', 'ulip'));

-- Liabilities now include Pay Later and money borrowed (matches isLiability in src/db/types.ts).
create or replace view public.account_balances with (security_invoker = true) as
select
  a.user_id,
  a.id,
  a.name,
  a.type,
  case when a.type in ('credit_card', 'pay_later', 'loan', 'borrowed')
    then a.opening_balance - coalesce(f.flow, 0)
    else a.opening_balance + coalesce(f.flow, 0)
  end as balance
from public.accounts a
left join lateral (
  select sum(case
      when t.type = 'income' and t.account_id = a.id then t.amount
      when t.type in ('expense', 'transfer') and t.account_id = a.id then -t.amount
      when t.type = 'transfer' and t.to_account_id = a.id then t.amount
      else 0 end) as flow
  from public.transactions t
  where t.user_id = a.user_id and t.deleted = 0 and (t.account_id = a.id or t.to_account_id = a.id)
) f on true
where a.deleted = 0;
