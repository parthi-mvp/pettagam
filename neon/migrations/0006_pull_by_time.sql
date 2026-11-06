-- Phones now also re-read rows written in the last few minutes (server_updated_at), not only rev > cursor,
-- so an upload that commits late is never skipped (src/sync/neon-sync.ts, pull). Index that filter.
-- Optional for correctness, so it can be applied before or after the app update.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'investments', 'investment_entries', 'budgets'] loop
    execute format('create index if not exists %1$s_user_updated_idx on public.%1$I (user_id, server_updated_at)', t);
  end loop;
end;
$$;
