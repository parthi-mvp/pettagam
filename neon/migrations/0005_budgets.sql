-- Monthly budgets (one per category, plus an overall one with category_id null).
-- Apply BEFORE shipping the app version that saves budgets; then refresh the Data API schema
-- cache (neonctl data-api refresh-schema), or the API won't see the new table.

create table if not exists public.budgets (
  user_id text not null default auth.user_id(),
  id text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted smallint not null default 0 check (deleted in (0, 1)),
  rev bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  category_id text,
  amount numeric(14, 2) not null check (amount > 0),
  primary key (user_id, id)
);

-- Same per-table setup as 0001: pull index, write trigger, row-level security, no DELETE.
create index if not exists budgets_user_rev_idx on public.budgets (user_id, rev);
drop trigger if exists budgets_sync_stamp on public.budgets;
create trigger budgets_sync_stamp before insert or update on public.budgets
  for each row execute function public.sync_stamp();
alter table public.budgets enable row level security;
drop policy if exists budgets_owner on public.budgets;
create policy budgets_owner on public.budgets for all to authenticated
  using (user_id = (select auth.user_id()))
  with check (user_id = (select auth.user_id()));
grant select, insert, update on public.budgets to authenticated;
revoke delete, truncate on public.budgets from authenticated, anonymous;
revoke all on public.budgets from anonymous;
