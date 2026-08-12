import type { Venue } from "@/lib/types";
import { seedFileSchema, type SeedFile, type SeedVenue } from "@/data/schema";
import { menuId, spaceId, venueId } from "./ids";

import manhattan from "@/data/venues/manhattan.json";
import sanFrancisco from "@/data/venues/san-francisco.json";
import waikiki from "@/data/venues/waikiki.json";

/**
 * The committed venue catalogue, in memory.
 *
 * This is the same data `npm run db:seed` pushes to Postgres, loaded straight
 * from the JSON so the app is runnable the moment the repo is cloned. When
 * Supabase is configured the query layer prefers the database; this stays as
 * the fallback and as the source of truth for the seed.
 */

const FILES: unknown[] = [manhattan, sanFrancisco, waikiki];

let cache: Venue[] | null = null;
let markets: SeedFile[] | null = null;

function parseAll(): SeedFile[] {
  if (markets) return markets;
  markets = FILES.map((file) => seedFileSchema.parse(file));
  return markets;
}

export function toVenue(seed: SeedVenue): Venue {
  const id = venueId(seed.slug);

  const spaces = seed.spaces.map((space) => ({
    id: spaceId(seed.slug, space.name),
    name: space.name,
    kind: space.kind,
    seatedCapacity: space.seatedCapacity ?? null,
    standingCapacity: space.standingCapacity ?? null,
    minGuests: space.minGuests ?? null,
    squareFeet: space.squareFeet ?? null,
    minSpendCents: space.minSpendCents ?? null,
    perPersonCents: space.perPersonCents ?? null,
    currency: "USD",
    features: space.features,
    notes: space.notes ?? null,
    combinableWith: space.combinableWith,
  }));

  const menus = seed.menus.map((menu) => ({
    id: menuId(seed.slug, menu.name),
    name: menu.name,
    format: menu.format,
    pricePerPersonCents: menu.pricePerPersonCents ?? null,
    currency: "USD",
    courses: menu.courses,
    url: menu.url ?? null,
    notes: menu.notes ?? null,
  }));

  const evidence = seed.evidence.map((item) => ({
    field: item.field,
    spaceId: item.space ? spaceId(seed.slug, item.space) : null,
    menuId: item.menu ? menuId(seed.slug, item.menu) : null,
    sourceKind: item.sourceKind,
    sourceUrl: item.sourceUrl ?? null,
    sourceTitle: item.sourceTitle ?? null,
    snippet: item.snippet ?? null,
    observedAt: item.observedAt,
  }));

  return {
    id,
    slug: seed.slug,
    name: seed.name,
    venueType: seed.venueType,
    addressLine1: seed.addressLine1,
    addressLine2: seed.addressLine2 ?? null,
    city: seed.city,
    region: seed.region,
    postalCode: seed.postalCode ?? null,
    country: seed.country,
    neighborhood: seed.neighborhood ?? null,
    lat: seed.lat,
    lon: seed.lon,
    cuisines: seed.cuisines,
    priceTier: seed.priceTier ?? null,
    website: seed.website ?? null,
    eventsUrl: seed.eventsUrl ?? null,
    phone: seed.phone ?? null,
    eventsEmail: seed.eventsEmail ?? null,
    summary: seed.summary ?? null,
    eventStyles: seed.eventStyles,
    acceptsBuyout: seed.acceptsBuyout,
    spaces,
    menus,
    dietary: seed.dietary.map((d) => ({
      option: d.option,
      dedicated: d.dedicated,
      notes: d.notes ?? null,
    })),
    evidence,
  };
}

export function allVenues(): Venue[] {
  if (cache) return cache;
  cache = parseAll().flatMap((file) => file.venues.map(toVenue));
  return cache;
}

export function seedFiles(): SeedFile[] {
  return parseAll();
}

export function venueBySlug(slug: string): Venue | null {
  return allVenues().find((v) => v.slug === slug) ?? null;
}
