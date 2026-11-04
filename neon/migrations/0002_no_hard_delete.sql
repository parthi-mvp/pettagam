-- Enabling Neon's Data API grants ALL privileges (including DELETE) on public tables to the API roles.
-- Pettagam relies on soft deletes (deleted = 1) so a deletion syncs to every device; a hard DELETE
-- from one phone would leave the row alive on the others. Take DELETE (and TRUNCATE) away again.
revoke delete, truncate on public.accounts, public.categories, public.transactions,
  public.investments, public.investment_entries from authenticated, anonymous;

-- Anonymous (no-JWT) requests get nothing at all; RLS would hide rows anyway, this is belt and braces.
revoke all on public.accounts, public.categories, public.transactions,
  public.investments, public.investment_entries, public.account_balances from anonymous;
