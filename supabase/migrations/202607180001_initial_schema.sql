begin;

create extension if not exists pgcrypto;

create type public.room_status as enum ('lobby', 'playing', 'finished', 'archived');
create type public.room_visibility as enum ('public', 'private');
create type public.trade_status as enum ('open', 'accepted', 'rejected', 'cancelled', 'expired');

create table public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  color text not null check (color in ('ember', 'tide', 'moss', 'amethyst')),
  avatar text not null default 'compass',
  crest text not null default 'sun',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name text not null check (char_length(name) between 2 and 48),
  host_user_id uuid not null references auth.users(id),
  visibility public.room_visibility not null default 'private',
  status public.room_status not null default 'lobby',
  max_players smallint not null check (max_players in (3, 4)),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  color text not null check (color in ('ember', 'tide', 'moss', 'amethyst')),
  ready boolean not null default false,
  connected boolean not null default true,
  is_spectator boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat),
  unique (room_id, color)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.game_rooms(id) on delete restrict,
  seed text not null,
  target_score smallint not null default 10 check (target_score between 5 and 20),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  winner_player_id uuid,
  created_at timestamptz not null default now()
);

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  seat smallint not null check (seat between 0 and 3),
  display_name text not null,
  color text not null,
  avatar text not null,
  score smallint not null default 0,
  played_knights smallint not null default 0,
  connected boolean not null default true,
  replaced_by_bot boolean not null default false,
  unique (game_id, user_id),
  unique (game_id, seat)
);

alter table public.games
  add constraint games_winner_player_fk
  foreign key (winner_player_id) references public.game_players(id);

create table public.game_state (
  game_id uuid primary key references public.games(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  public_state jsonb not null,
  state_hash text,
  updated_at timestamptz not null default now()
);

create table public.board_tiles (
  game_id uuid not null references public.games(id) on delete cascade,
  tile_id text not null,
  q smallint not null,
  r smallint not null,
  terrain text not null,
  production_number smallint,
  has_robber boolean not null default false,
  primary key (game_id, tile_id)
);

create table public.board_vertices (
  game_id uuid not null references public.games(id) on delete cascade,
  vertex_id text not null,
  building_kind text,
  owner_player_id uuid references public.game_players(id),
  primary key (game_id, vertex_id),
  check (building_kind is null or building_kind in ('settlement', 'city'))
);

create table public.board_edges (
  game_id uuid not null references public.games(id) on delete cascade,
  edge_id text not null,
  first_vertex_id text not null,
  second_vertex_id text not null,
  owner_player_id uuid references public.game_players(id),
  primary key (game_id, edge_id)
);

create table public.player_resources (
  game_player_id uuid primary key references public.game_players(id) on delete cascade,
  wood smallint not null default 0 check (wood >= 0),
  brick smallint not null default 0 check (brick >= 0),
  wool smallint not null default 0 check (wool >= 0),
  grain smallint not null default 0 check (grain >= 0),
  ore smallint not null default 0 check (ore >= 0),
  updated_at timestamptz not null default now()
);

create table public.player_development_cards (
  id uuid primary key default gen_random_uuid(),
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  card_kind text not null check (card_kind in ('knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint')),
  purchased_turn integer not null check (purchased_turn > 0),
  played_at timestamptz,
  revealed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  proposer_player_id uuid not null references public.game_players(id),
  offered_resources jsonb not null,
  requested_resources jsonb not null,
  target_player_ids uuid[] not null default '{}',
  status public.trade_status not null default 'open',
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index one_open_trade_per_game on public.trades(game_id) where status = 'open';

create table public.trade_responses (
  trade_id uuid not null references public.trades(id) on delete cascade,
  responder_player_id uuid not null references public.game_players(id),
  response text not null check (response in ('accepted', 'rejected', 'countered')),
  counter_offer jsonb,
  created_at timestamptz not null default now(),
  primary key (trade_id, responder_player_id)
);

create table public.game_actions (
  id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  actor_player_id uuid references public.game_players(id),
  game_version bigint not null,
  action_type text not null,
  public_payload jsonb not null default '{}'::jsonb,
  state_hash text,
  created_at timestamptz not null default now(),
  unique (game_id, game_version)
);

create index game_actions_timeline_idx on public.game_actions(game_id, game_version);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index chat_messages_room_created_idx on public.chat_messages(room_id, created_at desc);

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = target_room_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_game_member(target_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_players
    where game_id = target_game_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.is_game_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_game_member(uuid) to authenticated;

alter table public.player_profiles enable row level security;
alter table public.game_rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_state enable row level security;
alter table public.board_tiles enable row level security;
alter table public.board_vertices enable row level security;
alter table public.board_edges enable row level security;
alter table public.player_resources enable row level security;
alter table public.player_development_cards enable row level security;
alter table public.trades enable row level security;
alter table public.trade_responses enable row level security;
alter table public.game_actions enable row level security;
alter table public.chat_messages enable row level security;

create policy profiles_read on public.player_profiles for select to authenticated using (true);
create policy profiles_insert_self on public.player_profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.player_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy rooms_read on public.game_rooms for select to authenticated
  using (visibility = 'public' or host_user_id = auth.uid() or public.is_room_member(id));
create policy room_players_read on public.room_players for select to authenticated using (public.is_room_member(room_id));
create policy room_players_presence on public.room_players for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy games_read on public.games for select to authenticated using (public.is_room_member(room_id));
create policy game_players_read on public.game_players for select to authenticated using (public.is_game_member(game_id));
create policy game_state_read on public.game_state for select to authenticated using (public.is_game_member(game_id));
create policy board_tiles_read on public.board_tiles for select to authenticated using (public.is_game_member(game_id));
create policy board_vertices_read on public.board_vertices for select to authenticated using (public.is_game_member(game_id));
create policy board_edges_read on public.board_edges for select to authenticated using (public.is_game_member(game_id));
create policy own_resources_read on public.player_resources for select to authenticated
  using (exists (select 1 from public.game_players gp where gp.id = game_player_id and gp.user_id = auth.uid()));
create policy own_development_cards_read on public.player_development_cards for select to authenticated
  using (exists (select 1 from public.game_players gp where gp.id = game_player_id and gp.user_id = auth.uid()));
create policy trades_read on public.trades for select to authenticated using (public.is_game_member(game_id));
create policy trade_responses_read on public.trade_responses for select to authenticated
  using (exists (select 1 from public.trades t where t.id = trade_id and public.is_game_member(t.game_id)));
create policy game_actions_read on public.game_actions for select to authenticated using (public.is_game_member(game_id));
create policy chat_read on public.chat_messages for select to authenticated using (public.is_room_member(room_id));
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_room_member(room_id));

create or replace function public.commit_game_command(
  p_game_id uuid,
  p_command_id uuid,
  p_expected_version bigint,
  p_next_public_state jsonb,
  p_private_states jsonb,
  p_action_type text,
  p_actor_player_id uuid,
  p_public_event jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version bigint;
  private_state jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'server_only';
  end if;

  update public.game_state
  set public_state = p_next_public_state,
      version = version + 1,
      state_hash = encode(digest(p_next_public_state::text, 'sha256'), 'hex'),
      updated_at = now()
  where game_id = p_game_id and version = p_expected_version
  returning version into next_version;

  if next_version is null then
    raise exception 'version_conflict';
  end if;

  for private_state in select * from jsonb_array_elements(p_private_states)
  loop
    insert into public.player_resources (game_player_id, wood, brick, wool, grain, ore, updated_at)
    values (
      (private_state->>'gamePlayerId')::uuid,
      (private_state->'resources'->>'wood')::smallint,
      (private_state->'resources'->>'brick')::smallint,
      (private_state->'resources'->>'wool')::smallint,
      (private_state->'resources'->>'grain')::smallint,
      (private_state->'resources'->>'ore')::smallint,
      now()
    )
    on conflict (game_player_id) do update set
      wood = excluded.wood,
      brick = excluded.brick,
      wool = excluded.wool,
      grain = excluded.grain,
      ore = excluded.ore,
      updated_at = now();
  end loop;

  insert into public.game_actions (
    id, game_id, actor_player_id, game_version, action_type, public_payload, state_hash
  ) values (
    p_command_id,
    p_game_id,
    p_actor_player_id,
    next_version,
    p_action_type,
    p_public_event,
    encode(digest(p_next_public_state::text, 'sha256'), 'hex')
  );

  return next_version;
end;
$$;

revoke all on function public.commit_game_command(uuid, uuid, bigint, jsonb, jsonb, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_game_command(uuid, uuid, bigint, jsonb, jsonb, text, uuid, jsonb) to service_role;

alter publication supabase_realtime add table public.game_rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.game_state;
alter publication supabase_realtime add table public.game_actions;
alter publication supabase_realtime add table public.trades;
alter publication supabase_realtime add table public.trade_responses;
alter publication supabase_realtime add table public.chat_messages;

commit;
