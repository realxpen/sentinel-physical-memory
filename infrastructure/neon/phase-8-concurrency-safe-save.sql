-- SENTINEL concurrency-safe environmental memory save.
-- Apply after phase-3-environmental-memory.sql. Serializes writers per environment
-- and rejects stale aggregate saves before any durable row is changed.
create or replace function sentinel_private.sentinel_save_environmental_memory_if_current(
  p_memory jsonb,
  p_expected_current_state_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment_id text;
  v_actual_current_state_id text;
begin
  if p_memory is null or jsonb_typeof(p_memory) <> 'object' then
    raise exception 'p_memory must be a JSON object';
  end if;
  v_environment_id := nullif(p_memory -> 'environment' ->> 'id', '');
  if v_environment_id is null then
    raise exception 'p_memory.environment.id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_environment_id, 0));

  select payload ->> 'currentStateId'
    into v_actual_current_state_id
  from sentinel_private.sentinel_environments
  where id = v_environment_id;

  if v_actual_current_state_id is distinct from p_expected_current_state_id then
    return false;
  end if;

  perform sentinel_private.sentinel_save_environmental_memory(p_memory);
  return true;
end;
$$;

revoke all on function sentinel_private.sentinel_save_environmental_memory_if_current(jsonb, text) from public;
grant execute on function sentinel_private.sentinel_save_environmental_memory_if_current(jsonb, text) to sentinel_app;
