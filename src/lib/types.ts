export type TrustLevel = "verified" | "likely" | "unverified";

export type SpaceKind =
  | "private_room"
  | "semi_private"
  | "full_buyout"
  | "ballroom"
  | "outdoor"
  | "rooftop";

export type EventStyle =
  | "seated_dinner"
  | "reception"
  | "happy_hour"
  | "meeting"
  | "buffet";

export type TravelMode = "walking" | "driving";

export type SourceKind =
  | "venue_site"
  | "venue_document"
  | "phone_call"
  | "booking_platform"
  | "directory"
  | "editorial"
  | "inferred";

export type DietaryOption =
  | "vegetarian"
  | "vegan"
  | "gluten_free"
  | "dairy_free"
  | "nut_allergy"
  | "halal"
  | "kosher"
  | "shellfish_allergy";

export interface Evidence {
  field: string;

  spaceId: string | null;
  menuId: string | null;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  sourceTitle: string | null;
  snippet: string | null;
  observedAt: string;
}

export interface VenueSpace {
  id: string;
  name: string;
  kind: SpaceKind;
  seatedCapacity: number | null;
  standingCapacity: number | null;
  minGuests: number | null;
  squareFeet: number | null;
  minSpendCents: number | null;
  perPersonCents: number | null;
  currency: string;
  features: string[];
  notes: string | null;
  combinableWith: string[];
}

export interface VenueMenu {
  id: string;
  name: string;
  format: "prix_fixe" | "family_style" | "buffet" | "passed_canapes" | "bar_package";
  pricePerPersonCents: number | null;
  currency: string;
  courses: string[];
  url: string | null;
  notes: string | null;
}

export interface VenueDietary {
  option: DietaryOption;
  dedicated: boolean;
  notes: string | null;
}

export interface Venue {
  id: string;
  slug: string;
  name: string;
  venueType: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  country: string;
  neighborhood: string | null;
  lat: number;
  lon: number;
  cuisines: string[];
  priceTier: number | null;
  website: string | null;
  eventsUrl: string | null;
  phone: string | null;
  eventsEmail: string | null;
  summary: string | null;
  eventStyles: EventStyle[];
  acceptsBuyout: boolean;
  spaces: VenueSpace[];
  menus: VenueMenu[];
  dietary: VenueDietary[];
  evidence: Evidence[];
}

export function formatAddress(venue: Venue): string {
  const parts = [venue.addressLine1, venue.addressLine2, venue.city].filter(Boolean);
  return `${parts.join(", ")}, ${venue.region}${venue.postalCode ? ` ${venue.postalCode}` : ""}`;
}

export interface SearchRequest {
  address: string;
  headcount: number;
  maxCommuteMinutes: number;
  travelMode: TravelMode;
  style: EventStyle;

  budgetPerPersonCents?: number | null;
  dietary?: DietaryOption[];

  allowBuyout?: boolean;

  includeUnverified?: boolean;
}

export interface Origin {
  query: string;
  displayName: string | null;
  lat: number;
  lon: number;
  provider: string;
  cached: boolean;
}

export interface Commute {
  mode: TravelMode;
  durationMinutes: number;
  distanceMeters: number;
  provider: string;

  estimated: boolean;
}

export interface CapacityFit {
  spaceIds: string[];
  label: string;
  arrangement: "single_room" | "combined_rooms" | "full_buyout" | "none";

  capacity: number;
  headcount: number;

  utilisation: number;
  trust: TrustLevel;

  explanation: string;
}

export interface PriceSignal {
  kind: "min_spend" | "per_person" | "price_tier" | "unknown";

  amountCents: number | null;

  perPersonCents: number | null;
  tier: number | null;
  currency: string;
  trust: TrustLevel;
  label: string;
}

export interface ScoreComponent {
  key: "capacity" | "commute" | "trust" | "price" | "style" | "dietary" | "contact";
  label: string;

  score: number;
  weight: number;
  detail: string;
}

export interface RankedVenue {
  venue: Venue;
  commute: Commute;
  fit: CapacityFit;
  price: PriceSignal;

  trust: TrustLevel;
  trustReason: string;

  score: number;
  components: ScoreComponent[];

  withinCommute: boolean;

  highlights: string[];
  warnings: string[];
  dietaryCoverage: { requested: DietaryOption[]; covered: DietaryOption[] };
}

export interface SearchResponse {
  origin: Origin;
  request: SearchRequest;
  results: RankedVenue[];
  meta: {
    candidatesConsidered: number;
    withinCommute: number;
    routedWith: string;

    prefilterRadiusMeters: number;
    elapsedMs: number;
    notes: string[];
  };
}
