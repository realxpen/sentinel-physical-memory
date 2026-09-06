-- SENTINEL Phase 3 — Persistent Environmental Memory
-- Apply this file to a dedicated SENTINEL Supabase project.
-- It is intentionally not stored under supabase/migrations/ because no linked
-- SENTINEL project/migration history exists yet.

begin;

create schema if not exists sentinel_private;
revoke all on schema sentinel_private from public, anon, authenticated;

create table if not exists sentinel_private.sentinel_environments (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists sentinel_private.sentinel_environmental_memories (
  environment_id text primary key references sentinel_private.sentinel_environments(id) on delete cascade,
  memory jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists sentinel_private.sentinel_states (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  version integer not null check (version > 0),
  captured_at timestamptz not null,
  payload jsonb not null,
  snapshot jsonb,
  unique (environment_id, version)
);

create table if not exists sentinel_private.sentinel_objects (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null
);

create table if not exists sentinel_private.sentinel_observations (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  source_id text not null,
  captured_at timestamptz not null,
  payload jsonb not null
);

create table if not exists sentinel_private.sentinel_issues (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null
);

create table if not exists sentinel_private.sentinel_evidence (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  source_id text not null,
  captured_at timestamptz not null,
  payload jsonb not null
);

create table if not exists sentinel_private.sentinel_relations (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists sentinel_private.sentinel_diffs (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  from_state_id text not null,
  to_state_id text not null,
  created_at timestamptz not null,
  payload jsonb not null
);

create table if not exists sentinel_private.sentinel_sources (
  id text primary key,
  environment_id text not null references sentinel_private.sentinel_environments(id) on delete cascade,
  captured_at timestamptz not null,
  payload jsonb not null
);

create index if not exists sentinel_states_environment_idx on sentinel_private.sentinel_states(environment_id, version);
create index if not exists sentinel_objects_environment_idx on sentinel_private.sentinel_objects(environment_id);
create index if not exists sentinel_observations_environment_idx on sentinel_private.sentinel_observations(environment_id, captured_at);
create index if not exists sentinel_issues_environment_idx on sentinel_private.sentinel_issues(environment_id);
create index if not exists sentinel_evidence_environment_idx on sentinel_private.sentinel_evidence(environment_id, captured_at);
create index if not exists sentinel_relations_environment_idx on sentinel_private.sentinel_relations(environment_id);
create index if not exists sentinel_diffs_environment_idx on sentinel_private.sentinel_diffs(environment_id, created_at);
create index if not exists sentinel_sources_environment_idx on sentinel_private.sentinel_sources(environment_id, captured_at);

alter table sentinel_private.sentinel_environments enable row level security;
alter table sentinel_private.sentinel_environmental_memories enable row level security;
alter table sentinel_private.sentinel_states enable row level security;
alter table sentinel_private.sentinel_objects enable row level security;
alter table sentinel_private.sentinel_observations enable row level security;
alter table sentinel_private.sentinel_issues enable row level security;
alter table sentinel_private.sentinel_evidence enable row level security;
alter table sentinel_private.sentinel_relations enable row level security;
alter table sentinel_private.sentinel_diffs enable row level security;
alter table sentinel_private.sentinel_sources enable row level security;

revoke all on all tables in schema sentinel_private from public, anon, authenticated;

create or replace function public.sentinel_get_environmental_memory(p_environment_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select memory
  from sentinel_private.sentinel_environmental_memories
  where environment_id = p_environment_id
  limit 1;
$$;

create or replace function public.sentinel_save_environmental_memory(p_memory jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment jsonb;
  v_environment_id text;
begin
  if p_memory is null or jsonb_typeof(p_memory) <> 'object' then
    raise exception 'p_memory must be a JSON object';
  end if;

  v_environment := p_memory -> 'environment';
  v_environment_id := nullif(v_environment ->> 'id', '');

  if v_environment_id is null then
    raise exception 'p_memory.environment.id is required';
  end if;

  insert into sentinel_private.sentinel_environments (id, payload, created_at, updated_at)
  values (
    v_environment_id,
    v_environment,
    (v_environment ->> 'createdAt')::timestamptz,
    (v_environment ->> 'updatedAt')::timestamptz
  )
  on conflict (id) do update set
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  insert into sentinel_private.sentinel_states (id, environment_id, version, captured_at, payload, snapshot)
  select
    state_item ->> 'id',
    v_environment_id,
    (state_item ->> 'version')::integer,
    (state_item ->> 'capturedAt')::timestamptz,
    state_item,
    (
      select snapshot_item
      from jsonb_array_elements(coalesce(p_memory -> 'snapshots', '[]'::jsonb)) as snapshot_item
      where snapshot_item ->> 'stateId' = state_item ->> 'id'
      limit 1
    )
  from jsonb_array_elements(coalesce(p_memory -> 'states', '[]'::jsonb)) as state_item
  on conflict (id) do update set
    snapshot = coalesce(sentinel_states.snapshot, excluded.snapshot);

  insert into sentinel_private.sentinel_objects (id, environment_id, payload, updated_at)
  select
    item ->> 'id',
    v_environment_id,
    item,
    coalesce(nullif(item ->> 'lastSeenAt', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_memory -> 'objects', '[]'::jsonb)) as item
  on conflict (id) do update set
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  insert into sentinel_private.sentinel_observations (id, environment_id, source_id, captured_at, payload)
  select
    item ->> 'id',
    v_environment_id,
    item ->> 'sourceId',
    (item ->> 'capturedAt')::timestamptz,
    item
  from jsonb_array_elements(coalesce(p_memory -> 'observations', '[]'::jsonb)) as item
  on conflict (id) do nothing;

  insert into sentinel_private.sentinel_issues (id, environment_id, payload, updated_at)
  select
    item ->> 'id',
    v_environment_id,
    item,
    coalesce(nullif(item ->> 'lastObservedAt', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_memory -> 'issues', '[]'::jsonb)) as item
  on conflict (id) do update set
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  insert into sentinel_private.sentinel_evidence (id, environment_id, source_id, captured_at, payload)
  select
    item ->> 'id',
    v_environment_id,
    item ->> 'sourceId',
    (item ->> 'capturedAt')::timestamptz,
    item
  from jsonb_array_elements(coalesce(p_memory -> 'evidence', '[]'::jsonb)) as item
  on conflict (id) do nothing;

  insert into sentinel_private.sentinel_relations (id, environment_id, payload, updated_at)
  select item ->> 'id', v_environment_id, item, now()
  from jsonb_array_elements(coalesce(p_memory -> 'relations', '[]'::jsonb)) as item
  on conflict (id) do update set
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  insert into sentinel_private.sentinel_diffs (id, environment_id, from_state_id, to_state_id, created_at, payload)
  select
    item ->> 'id',
    v_environment_id,
    item ->> 'fromStateId',
    item ->> 'toStateId',
    (item ->> 'createdAt')::timestamptz,
    item
  from jsonb_array_elements(coalesce(p_memory -> 'diffs', '[]'::jsonb)) as item
  on conflict (id) do nothing;

  insert into sentinel_private.sentinel_sources (id, environment_id, captured_at, payload)
  select
    item ->> 'id',
    v_environment_id,
    (item ->> 'capturedAt')::timestamptz,
    item
  from jsonb_array_elements(coalesce(p_memory -> 'sources', '[]'::jsonb)) as item
  on conflict (id) do nothing;

  insert into sentinel_private.sentinel_environmental_memories (environment_id, memory, updated_at)
  values (v_environment_id, p_memory, now())
  on conflict (environment_id) do update set
    memory = excluded.memory,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.sentinel_get_environmental_memory(text) from public, anon, authenticated;
revoke all on function public.sentinel_save_environmental_memory(jsonb) from public, anon, authenticated;
grant execute on function public.sentinel_get_environmental_memory(text) to service_role;
grant execute on function public.sentinel_save_environmental_memory(jsonb) to service_role;

commit;
