-- 1. How a transaction's money moved (UPI, card, NEFT, ATM…), read from the bank SMS.
-- 2. A card's network (visa, mastercard, rupay, amex…), shown on the card in Accounts.
-- Free text, like the phone. Apply BEFORE shipping the app version that sends them, then refresh the
-- Data API schema cache (Neon Console → Data API → Refresh schema cache), or uploads fail with PGRST204.
alter table public.transactions add column if not exists via text;
alter table public.accounts add column if not exists network text;
