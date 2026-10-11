-- Apply after supabase-schema.sql. This migration adds private snapshot sync.

alter table public.collections
  add column if not exists snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'collections_snapshot_object'
      and conrelid = 'public.collections'::regclass
  ) then
    alter table public.collections
      add constraint collections_snapshot_object
      check (jsonb_typeof(snapshot) = 'object');
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), ''),
      'Card collector'
    )
  )
  on conflict (id) do nothing;

  insert into public.collections (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_collection_snapshot(
  p_operation_id text,
  p_device_id text,
  p_base_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_collection_id uuid;
  v_current_revision bigint;
  v_current_snapshot jsonb;
  v_applied_revision bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_operation_id is null or char_length(p_operation_id) not between 1 and 120 then
    raise exception 'Invalid operation id' using errcode = '22023';
  end if;
  if p_device_id is null or char_length(p_device_id) not between 1 and 120 then
    raise exception 'Invalid device id' using errcode = '22023';
  end if;
  if p_base_revision is null or p_base_revision < 0 then
    raise exception 'Invalid base revision' using errcode = '22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Snapshot must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(p_snapshot::text) > 5242880 then
    raise exception 'Snapshot exceeds 5 MiB' using errcode = '22023';
  end if;

  select so.applied_revision
    into v_applied_revision
    from public.sync_operations so
   where so.operation_id = p_operation_id
     and so.owner_id = v_user_id;

  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'revision', v_applied_revision
    );
  end if;

  select c.id, c.revision, c.snapshot
    into v_collection_id, v_current_revision, v_current_snapshot
    from public.collections c
   where c.owner_id = v_user_id
   for update;

  if not found then
    raise exception 'Collection not found' using errcode = 'P0002';
  end if;

  -- Recheck after taking the collection lock so concurrent retries remain
  -- idempotent even when the first request was still committing above.
  select so.applied_revision
    into v_applied_revision
    from public.sync_operations so
   where so.operation_id = p_operation_id
     and so.owner_id = v_user_id;

  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'revision', v_applied_revision
    );
  end if;

  if v_current_revision <> p_base_revision then
    return jsonb_build_object(
      'status', 'conflict',
      'revision', v_current_revision,
      'snapshot', v_current_snapshot
    );
  end if;

  update public.collections
     set snapshot = p_snapshot,
         revision = v_current_revision + 1,
         updated_at = now()
   where id = v_collection_id;

  insert into public.sync_operations (
    operation_id,
    owner_id,
    device_id,
    operation_type,
    payload,
    applied_revision,
    applied_at
  ) values (
    p_operation_id,
    v_user_id,
    p_device_id,
    'replace-collection-snapshot',
    jsonb_build_object('snapshotVersion', p_snapshot -> 'version'),
    v_current_revision + 1,
    now()
  );

  return jsonb_build_object(
    'status', 'applied',
    'revision', v_current_revision + 1
  );
end;
$$;

revoke all on function public.sync_collection_snapshot(text, text, bigint, jsonb)
  from public, anon;
grant execute on function public.sync_collection_snapshot(text, text, bigint, jsonb)
  to authenticated;
