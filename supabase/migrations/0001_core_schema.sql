create extension if not exists "pgcrypto";

create type trust_level as enum ('verified', 'likely', 'unverified');

create type space_kind as enum (
  'private_room',
  'semi_private',
  'full_buyout',
  'ballroom',
  'outdoor',
  'rooftop'
);

create type event_style as enum (
  'seated_dinner',
  'reception',
  'happy_hour',
  'meeting',
  'buffet'
);

create type source_kind as enum (
  'venue_site',
  'venue_document',
  'phone_call',
  'booking_platform',
  'directory',
  'editorial',
  'inferred'
);

create type dietary_option as enum (
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'nut_allergy',
  'halal',
  'kosher',
  'shellfish_allergy'
);

create table venues (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  venue_type    text not null default 'restaurant',
  address_line1 text not null,
  address_line2 text,
  city          text not null,
  region        text not null,
  postal_code   text,
  country       text not null default 'US',
  neighborhood  text,
  lat           double precision not null,
  lon           double precision not null,
  cuisines      text[] not null default '{}',

  price_tier    smallint check (price_tier between 1 and 4),
  website       text,
  events_url    text,
  phone         text,
  events_email  text,
  summary       text,

  event_styles  event_style[] not null default '{}',
  accepts_buyout boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index venues_lat_lon_idx on venues (lat, lon);
create index venues_city_idx on venues (city);

create table venue_spaces (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references venues (id) on delete cascade,
  name              text not null,
  kind              space_kind not null default 'private_room',

  seated_capacity   integer check (seated_capacity >= 0),
  standing_capacity integer check (standing_capacity >= 0),
  min_guests        integer check (min_guests >= 0),
  square_feet       integer check (square_feet >= 0),

  min_spend_cents   bigint check (min_spend_cents >= 0),

  per_person_cents  bigint check (per_person_cents >= 0),
  currency          char(3) not null default 'USD',
  features          text[] not null default '{}',
  notes             text,

  combinable_with   text[] not null default '{}',
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),

  unique (venue_id, name),
  constraint venue_spaces_has_a_capacity
    check (seated_capacity is not null or standing_capacity is not null)
);

create index venue_spaces_venue_idx on venue_spaces (venue_id);
create index venue_spaces_seated_idx on venue_spaces (seated_capacity);
create index venue_spaces_standing_idx on venue_spaces (standing_capacity);

create table venue_menus (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references venues (id) on delete cascade,
  name              text not null,

  format            text not null,
  price_per_person_cents bigint check (price_per_person_cents >= 0),
  currency          char(3) not null default 'USD',
  courses           text[] not null default '{}',
  url               text,
  notes             text,
  created_at        timestamptz not null default now(),

  unique (venue_id, name)
);

create index venue_menus_venue_idx on venue_menus (venue_id);

create table venue_dietary (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues (id) on delete cascade,
  option     dietary_option not null,

  dedicated  boolean not null default false,
  notes      text,

  unique (venue_id, option)
);

create index venue_dietary_venue_idx on venue_dietary (venue_id);

create table evidence (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues (id) on delete cascade,

  space_id      uuid references venue_spaces (id) on delete cascade,
  menu_id       uuid references venue_menus (id) on delete cascade,

  field         text not null,
  source_kind   source_kind not null,
  source_url    text,
  source_title  text,

  snippet       text,
  observed_at   date not null,
  created_at    timestamptz not null default now()
);

create index evidence_venue_field_idx on evidence (venue_id, field);
create index evidence_space_idx on evidence (space_id);

create table geocode_cache (
  query_hash    text primary key,
  query         text not null,
  lat           double precision not null,
  lon           double precision not null,
  display_name  text,
  provider      text not null,
  created_at    timestamptz not null default now()
);

create table commute_cache (
  cache_key      text primary key,
  origin_lat     double precision not null,
  origin_lon     double precision not null,
  dest_lat       double precision not null,
  dest_lon       double precision not null,
  mode           text not null,
  duration_secs  integer not null,
  distance_meters integer not null,
  provider       text not null,
  created_at     timestamptz not null default now()
);

create index commute_cache_created_idx on commute_cache (created_at);

create table saved_searches (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  origin_text   text not null,
  origin_lat    double precision not null,
  origin_lon    double precision not null,
  headcount     integer not null check (headcount > 0),
  max_commute_minutes integer not null check (max_commute_minutes > 0),
  travel_mode   text not null,
  style         event_style not null,
  filters       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create table shortlists (
  id          uuid primary key default gen_random_uuid(),
  search_id   uuid references saved_searches (id) on delete set null,
  label       text not null,
  created_at  timestamptz not null default now()
);

create table shortlist_items (
  shortlist_id uuid not null references shortlists (id) on delete cascade,
  venue_id     uuid not null references venues (id) on delete cascade,
  space_id     uuid references venue_spaces (id) on delete set null,
  note         text,
  added_at     timestamptz not null default now(),

  primary key (shortlist_id, venue_id)
);

create or replace function haversine_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
) returns double precision
language sql
immutable
parallel safe
as $$
  select 6371000 * 2 * asin(
    sqrt(
      pow(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      pow(sin(radians(lon2 - lon1) / 2), 2)
    )
  );
$$;

create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger venues_set_updated_at
  before update on venues
  for each row execute function set_updated_at();
