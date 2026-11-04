-- Pettagam: Neon Postgres schema (server = source of truth, phones keep an offline cache).
--
-- Relies on what Neon provides when Neon Auth + Data API are enabled:
--   * role `authenticated` (requests carrying a valid Neon Auth JWT)
--   * function auth.user_id() (pg_session_jwt) returning the JWT `sub`
--
-- Sync contract (see src/sync/neon-sync.ts):
--   * the app upserts rows by (user_id, id); user_id is filled from the JWT, never trusted from the client
--   * `updated_at` is the client edit time (epoch ms). A write older than what is stored is ignored
--     (last write wins), so a phone coming back online can't clobber a newer edit from another phone
--   * `rev` comes from a global sequence on every accepted write; phones pull "rev > my cursor"
--   * deletes are soft (deleted = 1) so they reach every device; the API role has no DELETE grant

create sequence if not exists public.sync_rev;

create or replace function public.sync_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id cannot change';
    end if;
    if new.updated_at < old.updated_at then
      return null; -- stale offline write: keep the newer row, silently skip
    end if;
  end if;
  new.rev := nextval('public.sync_rev');
  new.server_updated_at := now();
  return new;
end;
$$;

-- Columns every synced table shares. Kept identical to the phone's SQLite schema (src/db/schema.ts).
create table public.accounts (
  user_id text not null default auth.user_id(),
  id text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted smallint not null default 0 check (deleted in (0, 1)),
  rev bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  name text not null,
  type text not null check (type in ('bank', 'credit_card', 'cash', 'wallet', 'loan')),
  institution text,
  last4 text,
  opening_balance numeric(14, 2) not null default 0,
  credit_limit numeric(14, 2),
  billing_day smallint check (billing_day between 1 and 31),
  notes text,
  primary key (user_id, id)
);

create table public.categories (
  user_id text not null default auth.user_id(),
  id text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted smallint not null default 0 check (deleted in (0, 1)),
  rev bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  color text not null,
  primary key (user_id, id)
);

create table public.transactions (
  user_id text not null default auth.user_id(),
  id text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted smallint not null default 0 check (deleted in (0, 1)),
  rev bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  account_id text not null,
  to_account_id text,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount numeric(14, 2) not null check (amount >= 0),
  category_id text,
  date bigint not null,
  merchant text,
  note text,
  source text not null default 'manual' check (source in ('manual', 'sms', 'investment')),
  sms_hash text,
  primary key (user_id, id)
);

create table public.investments (
  user_id text not null default auth.user_id(),
  id text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted smallint not null default 0 check (deleted in (0, 1)),
  rev bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  type text not null check (type in ('fd', 'rd', 'chit', 'stock', 'mutual_fund', 'gold', 'ppf', 'epf', 'nps',
                                     'bond', 'real_estate', 'crypto', 'other')),
  name text not null,
  institution text,
  invested_amount numeric(16, 2) not null default 0,
  current_value numeric(16, 2) not null default 0,
  quantity numeric(20, 6),
  interest_rate numeric(6, 3),
  start_date bigint,
  maturity_date bigint,
  details jsonb,
  notes text,
  primary key (user_id, id)
);

create table public.investment_entries (
  user_id text not null default auth.user_id(),
  id text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted smallint not null default 0 check (deleted in (0, 1)),
  rev bigint not null default 0,
  server_updated_at timestamptz not null default now(),
  investment_id text not null,
  kind text not null check (kind in ('buy', 'sell', 'contribution', 'dividend', 'interest', 'payout', 'valuation')),
  date bigint not null,
  amount numeric(16, 2) not null,
  units numeric(20, 6),
  note text,
  primary key (user_id, id)
);

-- Per-table setup: pull index, write trigger, row-level security, grants.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'investments', 'investment_entries'] loop
    execute format('create index %1$s_user_rev_idx on public.%1$I (user_id, rev)', t);
    execute format(
      'create trigger %1$s_sync_stamp before insert or update on public.%1$I
         for each row execute function public.sync_stamp()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %1$s_owner on public.%1$I for all to authenticated
         using (user_id = (select auth.user_id()))
         with check (user_id = (select auth.user_id()))', t);
    -- No DELETE: rows are soft-deleted so the deletion syncs to every device.
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;

create index transactions_user_date_idx on public.transactions (user_id, date) where deleted = 0;

grant usage on schema public to authenticated;
grant usage on sequence public.sync_rev to authenticated;

-- Server-side balances (same rules as the app): assets = opening + inflow − outflow,
-- credit cards / loans = outstanding = opening + spend − payments.
-- security_invoker makes the view apply the caller's row-level security.
create view public.account_balances with (security_invoker = true) as
select
  a.user_id,
  a.id,
  a.name,
  a.type,
  case when a.type in ('credit_card', 'loan')
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

grant select on public.account_balances to authenticated;
