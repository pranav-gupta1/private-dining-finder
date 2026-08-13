create or replace function search_candidates(
  origin_lat double precision,
  origin_lon double precision,
  radius_meters double precision,
  min_capacity integer,
  city_filter text default null
)
returns table (
  venue_id uuid,
  straight_line_meters double precision
)
language sql
stable
as $$
  with bbox as (
    select
      origin_lat - (radius_meters / 111320.0) as min_lat,
      origin_lat + (radius_meters / 111320.0) as max_lat,
      origin_lon - (radius_meters / (111320.0 * greatest(cos(radians(origin_lat)), 0.01))) as min_lon,
      origin_lon + (radius_meters / (111320.0 * greatest(cos(radians(origin_lat)), 0.01))) as max_lon
  )
  select
    v.id,
    haversine_meters(origin_lat, origin_lon, v.lat, v.lon) as straight_line_meters
  from venues v, bbox b
  where v.lat between b.min_lat and b.max_lat
    and v.lon between b.min_lon and b.max_lon
    and haversine_meters(origin_lat, origin_lon, v.lat, v.lon) <= radius_meters
    and (city_filter is null or v.city = city_filter)
    and exists (
      select 1
      from venue_spaces s
      where s.venue_id = v.id
        and greatest(
              coalesce(s.seated_capacity, 0),
              coalesce(s.standing_capacity, 0)
            ) >= min_capacity
    )
  order by straight_line_meters asc;
$$;

alter table venues          enable row level security;
alter table venue_spaces    enable row level security;
alter table venue_menus     enable row level security;
alter table venue_dietary   enable row level security;
alter table evidence        enable row level security;
alter table geocode_cache   enable row level security;
alter table commute_cache   enable row level security;
alter table saved_searches  enable row level security;
alter table shortlists      enable row level security;
alter table shortlist_items enable row level security;

create policy "catalogue is publicly readable"
  on venues for select using (true);
create policy "spaces are publicly readable"
  on venue_spaces for select using (true);
create policy "menus are publicly readable"
  on venue_menus for select using (true);
create policy "dietary is publicly readable"
  on venue_dietary for select using (true);
create policy "evidence is publicly readable"
  on evidence for select using (true);
