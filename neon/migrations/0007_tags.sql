-- Tags on transactions: a JSON array of labels that cut across categories ("Goa trip", "Reimbursable").
-- Text, like the phone's column, so the app uploads it as is. Apply BEFORE shipping the app version
-- that has tags: the phone uploads every column, and the Data API rejects a column it doesn't know.
alter table public.transactions add column if not exists tags text;
