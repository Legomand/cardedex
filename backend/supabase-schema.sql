-- Cardedex managed-backend draft. Review in a development Supabase project first.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Card collector' check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_cards (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  card_id text not null check (char_length(card_id) between 1 and 100),
  status text not null check (status in ('owned', 'wanted')),
  quantity integer not null default 1 check (quantity between 1 and 999),
  printings text[] not null default '{}',
  revision bigint not null default 0 check (revision >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, card_id)
);

create index if not exists collection_cards_collection_status_idx
  on public.collection_cards (collection_id, status) where deleted_at is null;
create index if not exists collection_cards_card_idx
  on public.collection_cards (card_id) where deleted_at is null;

create table if not exists public.completion_goals (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  goal_type text not null check (goal_type in ('set', 'series')),
  catalog_id text not null check (char_length(catalog_id) between 1 and 100),
  completion_mode text not null default 'set' check (completion_mode in ('set', 'master')),
  created_at timestamptz not null default now(),
  unique (collection_id, goal_type, catalog_id)
);

create table if not exists public.sync_operations (
  operation_id text primary key check (char_length(operation_id) between 1 and 120),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 120),
  operation_type text not null,
  payload jsonb not null default '{}',
  applied_revision bigint,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists sync_operations_owner_created_idx
  on public.sync_operations (owner_id, created_at desc);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token_hash bytea not null unique,
  scope text not null check (scope in ('all', 'duplicates', 'selected')),
  include_wishlist boolean not null default true,
  selected_card_ids text[] not null default '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists share_links_owner_idx on public.share_links (owner_id, created_at desc);

create table if not exists public.trade_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  source_share_id uuid references public.share_links(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'cancelled', 'completed')),
  offered_cards jsonb not null default '[]',
  requested_cards jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.collection_cards enable row level security;
alter table public.completion_goals enable row level security;
alter table public.sync_operations enable row level security;
alter table public.share_links enable row level security;
alter table public.trade_proposals enable row level security;

revoke all on public.profiles, public.collections, public.collection_cards,
  public.completion_goals, public.sync_operations, public.share_links,
  public.trade_proposals from anon, authenticated;

grant select, insert, update, delete on public.profiles, public.collections,
  public.collection_cards, public.completion_goals, public.sync_operations,
  public.share_links, public.trade_proposals to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (auth.uid() is not null and auth.uid() = id);
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (auth.uid() is not null and auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using (auth.uid() is not null and auth.uid() = id)
  with check (auth.uid() is not null and auth.uid() = id);
create policy profiles_delete_own on public.profiles for delete to authenticated
  using (auth.uid() is not null and auth.uid() = id);

create policy collections_select_own on public.collections for select to authenticated
  using (auth.uid() is not null and auth.uid() = owner_id);
create policy collections_insert_own on public.collections for insert to authenticated
  with check (auth.uid() is not null and auth.uid() = owner_id);
create policy collections_update_own on public.collections for update to authenticated
  using (auth.uid() is not null and auth.uid() = owner_id)
  with check (auth.uid() is not null and auth.uid() = owner_id);
create policy collections_delete_own on public.collections for delete to authenticated
  using (auth.uid() is not null and auth.uid() = owner_id);

create policy cards_select_own on public.collection_cards for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));
create policy cards_insert_own on public.collection_cards for insert to authenticated
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));
create policy cards_update_own on public.collection_cards for update to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));
create policy cards_delete_own on public.collection_cards for delete to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));

create policy goals_all_own on public.completion_goals for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));
create policy operations_all_own on public.sync_operations for all to authenticated
  using (auth.uid() is not null and auth.uid() = owner_id)
  with check (auth.uid() is not null and auth.uid() = owner_id);
create policy shares_all_own on public.share_links for all to authenticated
  using (auth.uid() is not null and auth.uid() = owner_id)
  with check (auth.uid() is not null and auth.uid() = owner_id);
create policy proposals_select_party on public.trade_proposals for select to authenticated
  using (auth.uid() is not null and auth.uid() in (proposer_id, recipient_id));
create policy proposals_insert_proposer on public.trade_proposals for insert to authenticated
  with check (auth.uid() is not null and auth.uid() = proposer_id);
create policy proposals_update_party on public.trade_proposals for update to authenticated
  using (auth.uid() is not null and auth.uid() in (proposer_id, recipient_id))
  with check (auth.uid() is not null and auth.uid() in (proposer_id, recipient_id));
create policy proposals_delete_proposer on public.trade_proposals for delete to authenticated
  using (auth.uid() is not null and auth.uid() = proposer_id);

-- Public share access must go through a reviewed security-definer function.
-- Never expose collection_cards to the anon role directly.
create or replace function public.read_trade_binder(raw_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'schema', 'cardedex-trade-binder/v1',
    'shareId', s.id,
    'createdAt', s.created_at,
    'expiresAt', s.expires_at,
    'owner', jsonb_build_object('displayName', p.display_name),
    'scope', s.scope,
    'collection', jsonb_build_object(
      'owned', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', cc.card_id,
          'quantity', cc.quantity,
          'printings', cc.printings
        ) order by cc.card_id)
        from public.collection_cards cc
        where cc.collection_id = s.collection_id
          and cc.status = 'owned'
          and cc.deleted_at is null
          and (s.scope = 'all'
            or (s.scope = 'duplicates' and cc.quantity > 1)
            or (s.scope = 'selected' and cc.card_id = any(s.selected_card_ids)))
      ), '[]'::jsonb),
      'wanted', case when s.include_wishlist then coalesce((
        select jsonb_agg(jsonb_build_object('id', cc.card_id) order by cc.card_id)
        from public.collection_cards cc
        where cc.collection_id = s.collection_id
          and cc.status = 'wanted'
          and cc.deleted_at is null
      ), '[]'::jsonb) else '[]'::jsonb end
    )
  )
  from public.share_links s
  join public.profiles p on p.id = s.owner_id
  where s.token_hash = digest(raw_token, 'sha256')
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

revoke all on function public.read_trade_binder(text) from public;
grant execute on function public.read_trade_binder(text) to anon, authenticated;
