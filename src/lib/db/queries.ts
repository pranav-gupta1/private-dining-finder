import type { Venue } from "@/lib/types";
import { haversineMeters, type LatLon } from "@/lib/geo/distance";
import { getServerClient } from "./client";
import { allVenues, venueBySlug as snapshotVenueBySlug } from "./snapshot";

export interface CandidateSet {
  venues: Venue[];
  source: "postgres" | "snapshot";
  scanned: number;
}

interface VenueRow {
  id: string;
  slug: string;
  name: string;
  venue_type: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string;
  postal_code: string | null;
  country: string;
  neighborhood: string | null;
  lat: number;
  lon: number;
  cuisines: string[];
  price_tier: number | null;
  website: string | null;
  events_url: string | null;
  phone: string | null;
  events_email: string | null;
  summary: string | null;
  event_styles: Venue["eventStyles"];
  accepts_buyout: boolean;
  venue_spaces: {
    id: string;
    name: string;
    kind: Venue["spaces"][number]["kind"];
    seated_capacity: number | null;
    standing_capacity: number | null;
    min_guests: number | null;
    square_feet: number | null;
    min_spend_cents: number | null;
    per_person_cents: number | null;
    currency: string;
    features: string[];
    notes: string | null;
    combinable_with: string[];
  }[];
  venue_menus: {
    id: string;
    name: string;
    format: Venue["menus"][number]["format"];
    price_per_person_cents: number | null;
    currency: string;
    courses: string[];
    url: string | null;
    notes: string | null;
  }[];
  venue_dietary: { option: Venue["dietary"][number]["option"]; dedicated: boolean; notes: string | null }[];
  evidence: {
    field: string;
    space_id: string | null;
    menu_id: string | null;
    source_kind: Venue["evidence"][number]["sourceKind"];
    source_url: string | null;
    source_title: string | null;
    snippet: string | null;
    observed_at: string;
  }[];
}

const SELECT = `
  id, slug, name, venue_type, address_line1, address_line2, city, region,
  postal_code, country, neighborhood, lat, lon, cuisines, price_tier, website,
  events_url, phone, events_email, summary, event_styles, accepts_buyout,
  venue_spaces (
    id, name, kind, seated_capacity, standing_capacity, min_guests, square_feet,
    min_spend_cents, per_person_cents, currency, features, notes, combinable_with
  ),
  venue_menus (
    id, name, format, price_per_person_cents, currency, courses, url, notes
  ),
  venue_dietary ( option, dedicated, notes ),
  evidence (
    field, space_id, menu_id, source_kind, source_url, source_title, snippet, observed_at
  )
`;

function fromRow(row: VenueRow): Venue {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    venueType: row.venue_type,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    neighborhood: row.neighborhood,
    lat: row.lat,
    lon: row.lon,
    cuisines: row.cuisines ?? [],
    priceTier: row.price_tier,
    website: row.website,
    eventsUrl: row.events_url,
    phone: row.phone,
    eventsEmail: row.events_email,
    summary: row.summary,
    eventStyles: row.event_styles ?? [],
    acceptsBuyout: row.accepts_buyout,
    spaces: (row.venue_spaces ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      seatedCapacity: s.seated_capacity,
      standingCapacity: s.standing_capacity,
      minGuests: s.min_guests,
      squareFeet: s.square_feet,
      minSpendCents: s.min_spend_cents,
      perPersonCents: s.per_person_cents,
      currency: s.currency,
      features: s.features ?? [],
      notes: s.notes,
      combinableWith: s.combinable_with ?? [],
    })),
    menus: (row.venue_menus ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      format: m.format,
      pricePerPersonCents: m.price_per_person_cents,
      currency: m.currency,
      courses: m.courses ?? [],
      url: m.url,
      notes: m.notes,
    })),
    dietary: (row.venue_dietary ?? []).map((d) => ({
      option: d.option,
      dedicated: d.dedicated,
      notes: d.notes,
    })),
    evidence: (row.evidence ?? []).map((e) => ({
      field: e.field,
      spaceId: e.space_id,
      menuId: e.menu_id,
      sourceKind: e.source_kind,
      sourceUrl: e.source_url,
      sourceTitle: e.source_title,
      snippet: e.snippet,
      observedAt: e.observed_at,
    })),
  };
}

function peakCapacity(venue: Venue): number {
  return venue.spaces.reduce(
    (max, s) => Math.max(max, s.seatedCapacity ?? 0, s.standingCapacity ?? 0),
    0,
  );
}

export async function findCandidates(
  origin: LatLon,
  radiusMeters: number,
  minCapacity: number,
): Promise<CandidateSet> {
  const supabase = getServerClient();

  if (supabase) {
    const { data: ids, error } = await supabase.rpc("search_candidates", {
      origin_lat: origin.lat,
      origin_lon: origin.lon,
      radius_meters: radiusMeters,
      min_capacity: minCapacity,
      city_filter: null,
    });

    if (!error && Array.isArray(ids)) {
      const venueIds = (ids as { venue_id: string }[]).map((r) => r.venue_id);
      if (venueIds.length === 0) {
        return { venues: [], source: "postgres", scanned: 0 };
      }
      const { data, error: fetchError } = await supabase
        .from("venues")
        .select(SELECT)
        .in("id", venueIds);

      if (!fetchError && data) {
        return {
          venues: (data as unknown as VenueRow[]).map(fromRow),
          source: "postgres",
          scanned: venueIds.length,
        };
      }
    }

  }

  const all = allVenues();
  const venues = all.filter(
    (venue) =>
      haversineMeters(origin, venue) <= radiusMeters && peakCapacity(venue) >= minCapacity,
  );

  return { venues, source: "snapshot", scanned: all.length };
}

export async function getVenueBySlug(slug: string): Promise<Venue | null> {
  const supabase = getServerClient();

  if (supabase) {
    const { data, error } = await supabase.from("venues").select(SELECT).eq("slug", slug).maybeSingle();
    if (!error && data) return fromRow(data as unknown as VenueRow);
  }

  return snapshotVenueBySlug(slug);
}

export async function catalogueSize(): Promise<{ venues: number; spaces: number }> {
  const venues = allVenues();
  return {
    venues: venues.length,
    spaces: venues.reduce((sum, v) => sum + v.spaces.length, 0),
  };
}
