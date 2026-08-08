-- Core schema for the private dining finder.
--
-- Design notes:
--   * Every fact a planner acts on (capacity, minimum spend, dietary support)
--     is stored alongside the source it came from, in `evidence`. The trust
--     label shown in the UI is derived from that table rather than being a
--     column somebody has to remember to update.
--   * Geography is plain lat/lon + a SQL haversine function instead of PostGIS.
--     Search always runs a cheap bounding-box prefilter before the real routing
--     call, so an index on (lat, lon) is all we need and the schema stays
--     portable to any vanilla Postgres.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

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

-- Where a fact came from. Ordering here is meaningful: it drives the trust
-- label. See src/lib/trust/trust.ts for the resolution rules.
create type source_kind as enum (
  'venue_site',        -- the venue's own private-events page
  'venue_document',    -- a capacity chart / banquet PDF published by the venue
  'phone_call',        -- a planner called and wrote down what they were told
  'booking_platform',  -- Tripleseat, Cvent, OpenTable, Tagvenue, The Vendry
  'directory',         -- Yelp, Google Business, general listing sites
  'editorial',         -- a magazine or blog round-up
  'inferred'           -- estimated by us, e.g. from total restaurant seats
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

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------

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
  -- 1 = $, 4 = $$$$. Nullable because plenty of venues never publish one.
  price_tier    smallint check (price_tier between 1 and 4),
  website       text,
  events_url    text,
  phone         text,
  events_email  text,
  summary       text,
  -- Styles the venue is a credible fit for. Used as a soft ranking signal,
  -- never as a hard filter, so a planner can still see near-misses.
  event_styles  event_style[] not null default '{}',
  accepts_buyout boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index venues_lat_lon_idx on venues (lat, lon);
create index venues_city_idx on venues (city);

-- ---------------------------------------------------------------------------
-- Private spaces within a venue
-- ---------------------------------------------------------------------------

create table venue_spaces (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references venues (id) on delete cascade,
  name              text not null,
  kind              space_kind not null default 'private_room',
  -- Seated and standing are tracked separately because they rank very
  -- differently: a room that seats 60 might hold 120 for a reception.
  seated_capacity   integer check (seated_capacity >= 0),
  standing_capacity integer check (standing_capacity >= 0),
  min_guests        integer check (min_guests >= 0),
  square_feet       integer check (square_feet >= 0),
  -- Minimum food + beverage spend, in cents, for this specific space.
  min_spend_cents   bigint check (min_spend_cents >= 0),
  -- Some venues quote a per-person rate instead of a room minimum.
  per_person_cents  bigint check (per_person_cents >= 0),
  currency          char(3) not null default 'USD',
  features          text[] not null default '{}',
  notes             text,
  -- Spaces that can be combined with each other, by space name.
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

-- ---------------------------------------------------------------------------
-- Menus and dietary accommodation
-- ---------------------------------------------------------------------------

create table venue_menus (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references venues (id) on delete cascade,
  name              text not null,
  -- 'prix_fixe' | 'family_style' | 'buffet' | 'passed_canapes' | 'bar_package'
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
  -- Distinguishes "there are vegan dishes on the menu" from "the events team
  -- will build a dedicated vegan course". Planners care about the difference.
  dedicated  boolean not null default false,
  notes      text,

  unique (venue_id, option)
);

create index venue_dietary_venue_idx on venue_dietary (venue_id);

-- ---------------------------------------------------------------------------
-- Evidence
-- ---------------------------------------------------------------------------
-- One row per (thing, field, source). The UI reads these back so a planner can
-- click a trust badge and see exactly which page a number came from and when
-- it was last checked.

create table evidence (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues (id) on delete cascade,
  -- Optional narrowing to a specific space or menu.
  space_id      uuid references venue_spaces (id) on delete cascade,
  menu_id       uuid references venue_menus (id) on delete cascade,
  -- Dotted field path this evidence supports, e.g. 'space.seated_capacity',
  -- 'venue.min_spend', 'venue.phone', 'venue.dietary'.
  field         text not null,
  source_kind   source_kind not null,
  source_url    text,
  source_title  text,
  -- Verbatim quote from the source. Kept so a reviewer can audit the
  -- extraction without re-fetching the page.
  snippet       text,
  observed_at   date not null,
  created_at    timestamptz not null default now()
);

create index evidence_venue_field_idx on evidence (venue_id, field);
create index evidence_space_idx on evidence (space_id);

-- ---------------------------------------------------------------------------
-- Caches
-- ---------------------------------------------------------------------------

create table geocode_cache (
  query_hash    text primary key,
  query         text not null,
  lat           double precision not null,
  lon           double precision not null,
  display_name  text,
  provider      text not null,
  created_at    timestamptz not null default now()
);

-- Travel times are the slowest part of a search and the only part that hits a
-- third party per request, so they are cached on a rounded coordinate grid.
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

-- ---------------------------------------------------------------------------
-- Planner workspace
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Great-circle distance in metres. Immutable so it can be used in indexes and
-- inlined into the search query's prefilter.
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
