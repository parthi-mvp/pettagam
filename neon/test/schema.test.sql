-- Runs against a throwaway local database (see neon/test/run.sh). Any failed check raises an error.
set role authenticated;

-- 1. user A writes; user_id comes from the JWT, rev is stamped
set test.user_id = 'user-a';
insert into accounts (id, created_at, updated_at, name, type, opening_balance)
values ('acc-1', 1, 100, 'SBI Savings', 'bank', 1000);
insert into categories (id, created_at, updated_at, name, kind, color)
values ('cat-food', 1, 0, 'Food', 'expense', '#f00');
insert into transactions (id, created_at, updated_at, account_id, type, amount, date)
values ('t-1', 1, 100, 'acc-1', 'expense', 250.50, 1000), ('t-2', 1, 100, 'acc-1', 'income', 500, 1000);
do $$ begin
  assert (select user_id from accounts where id = 'acc-1') = 'user-a', 'user_id from JWT';
  assert (select rev from accounts where id = 'acc-1') > 0, 'rev stamped';
  assert (select balance from account_balances where id = 'acc-1') = 1249.50, 'balance view';
end $$;

-- 2. user B sees nothing of A and can reuse the same ids (seeded categories)
set test.user_id = 'user-b';
do $$ begin
  assert (select count(*) from accounts) = 0, 'B cannot read A rows';
  assert (select count(*) from account_balances) = 0, 'B cannot read A balances';
end $$;
insert into categories (id, created_at, updated_at, name, kind, color)
values ('cat-food', 1, 0, 'Food', 'expense', '#0f0');

-- 3. B cannot write into A's account space
do $$ begin
  begin
    insert into accounts (user_id, id, created_at, updated_at, name, type) values ('user-a', 'x', 1, 1, 'hack', 'bank');
    raise exception 'FAIL: spoofed user_id accepted';
  exception when insufficient_privilege then null; -- RLS with-check violation
  end;
  update accounts set name = 'hacked' where id = 'acc-1';
end $$;
set test.user_id = 'user-a';
do $$ begin
  assert (select name from accounts where id = 'acc-1') = 'SBI Savings', 'B update did not touch A';
end $$;

-- 4. last write wins on upsert (what the Data API does with on_conflict=user_id,id)
do $$
declare r0 bigint;
begin
  r0 := (select rev from accounts where id = 'acc-1');
  insert into accounts (id, created_at, updated_at, name, type) values ('acc-1', 1, 50, 'stale offline edit', 'bank')
  on conflict (user_id, id) do update set name = excluded.name, updated_at = excluded.updated_at;
  assert (select name from accounts where id = 'acc-1') = 'SBI Savings', 'stale write ignored';
  assert (select rev from accounts where id = 'acc-1') = r0, 'stale write does not bump rev';

  insert into accounts (id, created_at, updated_at, name, type) values ('acc-1', 1, 200, 'SBI Salary', 'bank')
  on conflict (user_id, id) do update set name = excluded.name, updated_at = excluded.updated_at;
  assert (select name from accounts where id = 'acc-1') = 'SBI Salary', 'newer write applied';
  assert (select rev from accounts where id = 'acc-1') > r0, 'newer write bumps rev';
end $$;

-- 5. soft delete syncs, hard delete is not allowed, user_id is immutable
update transactions set deleted = 1, updated_at = 300 where id = 't-2';
do $$ begin
  assert (select balance from account_balances where id = 'acc-1') = 749.50, 'soft-deleted txn excluded';
  begin
    delete from transactions where id = 't-1';
    raise exception 'FAIL: delete allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update accounts set user_id = 'user-b', updated_at = 999 where id = 'acc-1';
    raise exception 'FAIL: user_id changed';
  exception when insufficient_privilege or raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- 5b. catalogue types (0003): new account / investment types are accepted, liabilities sign correctly
set test.user_id = 'user-a';
insert into accounts (id, created_at, updated_at, name, type, opening_balance) values
  ('acc-lent', 1, 100, 'Ravi', 'lent', 500), ('acc-bnpl', 1, 100, 'Simpl', 'pay_later', 300);
insert into transactions (id, created_at, updated_at, account_id, type, amount, date)
values ('t-bnpl', 1, 100, 'acc-bnpl', 'expense', 200, 1000);
insert into investments (id, created_at, updated_at, type, name) values ('inv-ssy', 1, 100, 'ssy', 'Sukanya');
insert into categories (id, created_at, updated_at, name, kind, color, icon)
values ('cat-pets', 1, 100, 'Pets', 'expense', '#abc', 'heart');
do $$ begin
  assert (select balance from account_balances where id = 'acc-bnpl') = 500, 'pay later spend raises what is owed';
  assert (select balance from account_balances where id = 'acc-lent') = 500, 'lent is an asset';
end $$;
do $$ begin
  begin
    insert into accounts (id, created_at, updated_at, name, type) values ('acc-bad', 1, 1, 'x', 'not_a_type');
    raise exception 'FAIL: unknown account type accepted';
  exception when check_violation then null;
  end;
end $$;

-- 5c. budgets (0005): owner-scoped like every synced table, amount must be positive
set test.user_id = 'user-a';
insert into budgets (id, created_at, updated_at, category_id, amount) values ('b-all', 1, 100, null, 40000), ('b-food', 1, 100, 'cat-food', 8000);
set test.user_id = 'user-b';
do $$ begin
  assert (select count(*) from budgets) = 0, 'B cannot read A budgets';
end $$;
do $$ begin
  begin
    insert into budgets (id, created_at, updated_at, category_id, amount) values ('b-bad', 1, 1, null, 0);
    raise exception 'FAIL: zero budget accepted';
  exception when check_violation then null;
  end;
end $$;

-- 6. no JWT, no data
reset test.user_id;
do $$ begin
  assert (select count(*) from transactions) = 0, 'anonymous sees nothing';
end $$;

reset role;
\echo 'ALL SCHEMA CHECKS PASSED'
