-- The Data API (PostgREST) caches each table's columns. After a migration adds one, it keeps
-- rejecting uploads that send it ("PGRST204 column … does not exist") until the cache reloads,
-- and a rejected upload stalls sync for every table. Reload the cache after any schema change.
-- Lives outside `public` so the Data API never exposes it as an RPC.
create schema if not exists internal;

create or replace function internal.reload_data_api_schema() returns event_trigger
language plpgsql as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

drop event trigger if exists reload_data_api_schema;
create event trigger reload_data_api_schema on ddl_command_end
  execute function internal.reload_data_api_schema();
