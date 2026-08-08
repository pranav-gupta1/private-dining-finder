/** Domain types shared by the API, the ranking engine and the UI. */

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

/**
 * Only door-to-door modes we can actually measure are offered. Transit would
 * need a GTFS feed or a paid API per metro, and a wrong transit number is worse
 * than no transit number, so it is deliberately absent.
 */
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
  /** Dotted field path, e.g. "space.capacity", "venue.min_spend". */
  field: string;
  /** Set when the evidence is about one specific space rather than the venue. */
  spaceId: string | null;
  menuId: string | null;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  sourceTitle: string | null;
  snippet: string | null;
  observedAt: string; // ISO date
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

/** The full formatted address, for display and for copy-to-clipboard. */
export function formatAddress(venue: Venue): string {
  const parts = [venue.addressLine1, venue.addressLine2, venue.city].filter(Boolean);
  return `${parts.join(", ")}, ${venue.region}${venue.postalCode ? ` ${venue.postalCode}` : ""}`;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchRequest {
  address: string;
  headcount: number;
  maxCommuteMinutes: number;
  travelMode: TravelMode;
  style: EventStyle;
  /** Optional ceiling on per-person spend, in cents. */
  budgetPerPersonCents?: number | null;
  dietary?: DietaryOption[];
  /** Include venues that only work as a full buyout. */
  allowBuyout?: boolean;
  /** Include venues whose capacity is unverified. Defaults to true. */
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
  /** True when the number is a straight-line estimate rather than a real route. */
  estimated: boolean;
}

/** How a venue's rooms can be arranged to hold the requested headcount. */
export interface CapacityFit {
  /** The space (or combination) we recommend. */
  spaceIds: string[];
  label: string;
  arrangement: "single_room" | "combined_rooms" | "full_buyout" | "none";
  /** Capacity actually available for the requested style. */
  capacity: number;
  headcount: number;
  /** capacity / headcount. 1.0 is an exact fit. */
  utilisation: number;
  trust: TrustLevel;
  /** Human-readable explanation shown on the result card. */
  explanation: string;
}

export interface PriceSignal {
  kind: "min_spend" | "per_person" | "price_tier" | "unknown";
  /** Cents. Null when we only have a tier. */
  amountCents: number | null;
  /** Derived per-head figure used for budget comparison and sorting. */
  perPersonCents: number | null;
  tier: number | null;
  currency: string;
  trust: TrustLevel;
  label: string;
}

export interface ScoreComponent {
  key: "capacity" | "commute" | "trust" | "price" | "style" | "dietary" | "contact";
  label: string;
  /** 0..1 */
  score: number;
  weight: number;
  detail: string;
}

export interface RankedVenue {
  venue: Venue;
  commute: Commute;
  fit: CapacityFit;
  price: PriceSignal;
  /** Overall trust label for the recommendation as a whole. */
  trust: TrustLevel;
  trustReason: string;
  /** 0..100 */
  score: number;
  components: ScoreComponent[];
  /**
   * False for venues just outside the commute budget. They are returned rather
   * than dropped so the UI can offer them as "stretch" options — a planner who
   * gets zero results wants to know that two minutes of slack would fix it.
   */
  withinCommute: boolean;
  /** Short bullets explaining why this ranked where it did. */
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
    /** Radius used for the straight-line prefilter, in metres. */
    prefilterRadiusMeters: number;
    elapsedMs: number;
    notes: string[];
  };
}
