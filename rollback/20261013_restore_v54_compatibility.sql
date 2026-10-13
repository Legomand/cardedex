-- Cardedex emergency compatibility rollback for frontend commit:
-- 97dd0343e0f7dc8513ac60d2bc4deb553565443b (cardedex-shell-v54)
--
-- Run only after exporting the database and deploying the pinned frontend.
-- This rollback is deliberately non-destructive: it does not drop operation
-- history, profiles, users, collections, or other application tables.

begin;

-- Keep an in-database recovery copy as a second line of defence. This is not a
-- replacement for an external pg_dump because it shares the same database.
create schema if not exists cardedex_rollback;

create table if not exists cardedex_rollback.collections_before_v54_rollback
as table public.collections with no data;

insert into cardedex_rollback.collections_before_v54_rollback
select c.*
from public.collections c
where not exists (
  select 1
  from cardedex_rollback.collections_before_v54_rollback b
  where b.id = c.id
);

comment on table cardedex_rollback.collections_before_v54_rollback is
  'Collection rows captured immediately before the 2026-10-13 v54 compatibility rollback.';

-- The v54 client sends version-6 snapshots. Keep the hardened security-definer
-- boundary and revision checks, but accept both v6 and v7 during rollback so
-- an installed v57 PWA cannot be stranded mid-transition.
create or replace function public.sync_collection_snapshot(
  p_operation_id text,
  p_device_id text,
  p_base_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
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
  if coalesce(p_snapshot ->> 'version', '') not in ('6', '7') then
    raise exception 'Unsupported snapshot version' using errcode = '22023';
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
    return jsonb_build_object('status', 'duplicate', 'revision', v_applied_revision);
  end if;

  select c.id, c.revision, c.snapshot
    into v_collection_id, v_current_revision, v_current_snapshot
    from public.collections c
   where c.owner_id = v_user_id
   for update;

  if not found then
    raise exception 'Collection not found' using errcode = 'P0002';
  end if;

  select so.applied_revision
    into v_applied_revision
    from public.sync_operations so
   where so.operation_id = p_operation_id
     and so.owner_id = v_user_id;

  if found then
    return jsonb_build_object('status', 'duplicate', 'revision', v_applied_revision);
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
    operation_id, owner_id, device_id, operation_type, payload,
    applied_revision, applied_at
  ) values (
    p_operation_id, v_user_id, p_device_id, 'replace-collection-snapshot',
    jsonb_build_object('snapshotVersion', p_snapshot -> 'version'),
    v_current_revision + 1, now()
  );

  return jsonb_build_object('status', 'applied', 'revision', v_current_revision + 1);
end;
$$;

revoke all on function public.sync_collection_snapshot(text, text, bigint, jsonb)
  from public, anon;
grant execute on function public.sync_collection_snapshot(text, text, bigint, jsonb)
  to authenticated;

-- v54 works through the RPC and does not require direct table writes. Retain
-- the hardened grants instead of reopening browser INSERT/UPDATE/DELETE access.
revoke insert, update, delete on public.collections from authenticated;
revoke all on public.sync_operations from authenticated;

commit;
