import type {
  Commute,
  DietaryOption,
  EventStyle,
  RankedVenue,
  ScoreComponent,
  SearchRequest,
  TrustLevel,
  Venue,
} from "@/lib/types";
import { formatDuration } from "@/lib/geo/distance";
import { bestCapacityFit } from "./capacity";
import { budgetFit, formatMoney, priceSignal } from "./price";

export const WEIGHTS: Record<ScoreComponent["key"], number> = {
  capacity: 0.28,
  commute: 0.22,
  trust: 0.18,
  price: 0.12,
  style: 0.1,
  dietary: 0.06,
  contact: 0.04,
};

const TRUST_SCORE: Record<TrustLevel, number> = {
  verified: 1,
  likely: 0.65,
  unverified: 0.3,
};

export const STRETCH_MULTIPLIER = 1.3;

function commuteScore(minutes: number, budgetMinutes: number): number {
  if (budgetMinutes <= 0) return 0;
  const ratio = minutes / budgetMinutes;
  if (ratio <= 0) return 1;
  if (ratio <= 1) return 1 - 0.65 * ratio ** 1.6;

  return Math.max(0, 0.35 - (ratio - 1) * 0.9);
}

const STYLE_FRIENDLY_KINDS: Record<EventStyle, string[]> = {
  reception: ["ballroom", "outdoor", "rooftop", "full_buyout"],
  happy_hour: ["rooftop", "outdoor", "semi_private", "full_buyout"],
  seated_dinner: ["private_room", "semi_private"],
  buffet: ["ballroom", "private_room", "outdoor"],
  meeting: ["private_room"],
};

function styleScore(venue: Venue, style: EventStyle, usedSpaceIds: string[]): number {
  if (venue.eventStyles.includes(style)) return 1;

  const kinds = new Set(
    venue.spaces.filter((s) => usedSpaceIds.includes(s.id)).map((s) => s.kind as string),
  );
  const friendly = STYLE_FRIENDLY_KINDS[style] ?? [];
  if (friendly.some((k) => kinds.has(k))) return 0.75;

  return 0.5;
}

function dietaryScore(
  venue: Venue,
  requested: DietaryOption[],
): { score: number; covered: DietaryOption[] } {
  const available = new Map(venue.dietary.map((d) => [d.option, d]));

  if (requested.length === 0) {
    const dedicated = venue.dietary.filter((d) => d.dedicated).length;
    if (dedicated >= 3) return { score: 1, covered: [] };
    if (venue.dietary.length >= 2) return { score: 0.75, covered: [] };
    if (venue.dietary.length >= 1) return { score: 0.6, covered: [] };
    return { score: 0.45, covered: [] };
  }

  const covered = requested.filter((option) => available.has(option));
  const dedicatedCount = covered.filter((o) => available.get(o)?.dedicated).length;

  const base = covered.length / requested.length;
  const bonus = requested.length > 0 ? (dedicatedCount / requested.length) * 0.15 : 0;
  return { score: Math.min(1, base * 0.85 + bonus + (covered.length > 0 ? 0.05 : 0)), covered };
}

function contactScore(venue: Venue): { score: number; detail: string } {
  const has = {
    email: Boolean(venue.eventsEmail),
    phone: Boolean(venue.phone),
    form: Boolean(venue.eventsUrl),
  };
  const score = (has.email ? 0.5 : 0) + (has.phone ? 0.35 : 0) + (has.form ? 0.15 : 0);
  const present = [has.email && "email", has.phone && "phone", has.form && "enquiry form"].filter(
    Boolean,
  ) as string[];

  return {
    score,
    detail: present.length > 0 ? `Reachable by ${present.join(", ")}` : "No direct contact found",
  };
}

export interface RankOptions {
  now?: Date;
}

export function rankVenue(
  venue: Venue,
  commute: Commute,
  request: SearchRequest,
  options: RankOptions = {},
): RankedVenue | null {
  const fit = bestCapacityFit(venue, request.headcount, request.style, {
    allowBuyout: request.allowBuyout ?? true,
    now: options.now,
  });
  if (fit.arrangement === "none") return null;

  const usedSpaces = venue.spaces.filter((s) => fit.spaceIds.includes(s.id));
  const price = priceSignal(venue, usedSpaces, request.headcount, options.now);

  if (request.includeUnverified === false && fit.trust === "unverified") return null;

  const capacityRatioScore = capacityComponent(fit.utilisation, fit.arrangement);
  const commuteComponent = commuteScore(commute.durationMinutes, request.maxCommuteMinutes);
  const trustComponent = TRUST_SCORE[fit.trust] * 0.7 + TRUST_SCORE[price.trust] * 0.3;
  const priceComponent = budgetFit(price, request.budgetPerPersonCents ?? null);
  const style = styleScore(venue, request.style, fit.spaceIds);
  const dietary = dietaryScore(venue, request.dietary ?? []);
  const contact = contactScore(venue);

  const components: ScoreComponent[] = [
    {
      key: "capacity",
      label: "Room fit",
      score: capacityRatioScore,
      weight: WEIGHTS.capacity,
      detail: fit.explanation,
    },
    {
      key: "commute",
      label: "Commute",
      score: commuteComponent,
      weight: WEIGHTS.commute,
      detail: `${formatDuration(commute.durationMinutes)} ${commute.mode === "walking" ? "walk" : "drive"} against a ${request.maxCommuteMinutes} min limit`,
    },
    {
      key: "trust",
      label: "Data confidence",
      score: trustComponent,
      weight: WEIGHTS.trust,
      detail: `Capacity ${fit.trust}, price ${price.trust}`,
    },
    {
      key: "price",
      label: "Budget fit",
      score: priceComponent,
      weight: WEIGHTS.price,
      detail: priceDetail(price.perPersonCents, request.budgetPerPersonCents ?? null, price.label),
    },
    {
      key: "style",
      label: "Format fit",
      score: style,
      weight: WEIGHTS.style,
      detail: styleDetail(venue, request.style, style),
    },
    {
      key: "dietary",
      label: "Dietary",
      score: dietary.score,
      weight: WEIGHTS.dietary,
      detail: dietaryDetail(venue, request.dietary ?? [], dietary.covered),
    },
    {
      key: "contact",
      label: "Contactability",
      score: contact.score,
      weight: WEIGHTS.contact,
      detail: contact.detail,
    },
  ];

  const score = components.reduce((sum, c) => sum + c.score * c.weight, 0) * 100;

  return {
    venue,
    commute,
    fit,
    price,
    trust: fit.trust,
    trustReason: trustReason(fit.trust, price.trust),
    score: Math.round(score * 10) / 10,
    components,
    withinCommute: commute.durationMinutes <= request.maxCommuteMinutes,
    highlights: buildHighlights(venue, commute, fit, price, request),
    warnings: buildWarnings(venue, commute, fit, price, request, usedSpaces),
    dietaryCoverage: { requested: request.dietary ?? [], covered: dietary.covered },
  };
}

function capacityComponent(utilisation: number, arrangement: string): number {
  const ratio = utilisation;
  let base: number;
  if (ratio < 1) base = 0;
  else if (ratio < 1.1) base = 0.72 + ((ratio - 1) / 0.1) * 0.18;
  else if (ratio <= 1.6) base = 1;
  else if (ratio <= 2.5) base = 1 - ((ratio - 1.6) / 0.9) * 0.3;
  else if (ratio <= 4) base = 0.7 - ((ratio - 2.5) / 1.5) * 0.3;
  else base = 0.35;

  if (arrangement === "combined_rooms") base -= 0.12;
  if (arrangement === "full_buyout") base -= 0.08;
  return Math.max(0, base);
}

function priceDetail(
  perPerson: number | null,
  budget: number | null,
  label: string,
): string {
  if (perPerson == null) return label;
  if (budget == null) return `${formatMoney(perPerson)} per head implied`;
  const delta = perPerson - budget;
  if (delta <= 0) return `${formatMoney(perPerson)} per head, ${formatMoney(-delta)} under budget`;
  return `${formatMoney(perPerson)} per head, ${formatMoney(delta)} over budget`;
}

function styleDetail(venue: Venue, style: EventStyle, score: number): string {
  const pretty = style.replace(/_/g, " ");
  if (score === 1) return `Venue lists ${pretty} as a format it hosts`;
  if (score > 0.5) return `Space type suits a ${pretty}, though the venue does not advertise it`;
  return `No published ${pretty} programme — confirm the format works`;
}

function dietaryDetail(
  venue: Venue,
  requested: DietaryOption[],
  covered: DietaryOption[],
): string {
  if (requested.length === 0) {
    if (venue.dietary.length === 0) return "No dietary information published";
    const dedicated = venue.dietary.filter((d) => d.dedicated).length;
    return `${venue.dietary.length} accommodations documented${dedicated ? `, ${dedicated} with dedicated menus` : ""}`;
  }
  if (covered.length === requested.length) return "Covers every requested dietary need";
  if (covered.length === 0) return "None of the requested dietary needs are documented";
  const missing = requested.filter((r) => !covered.includes(r)).map((r) => r.replace(/_/g, " "));
  return `Missing: ${missing.join(", ")}`;
}

function trustReason(capacity: TrustLevel, price: TrustLevel): string {
  if (capacity === "verified" && price === "verified") {
    return "Capacity and pricing both come from the venue.";
  }
  if (capacity === "verified") return "Capacity confirmed by the venue; pricing needs checking.";
  if (capacity === "likely") return "Capacity from a third-party listing — worth confirming.";
  return "Capacity is not published anywhere we can see. Call before shortlisting.";
}

function buildHighlights(
  venue: Venue,
  commute: Commute,
  fit: ReturnType<typeof bestCapacityFit>,
  price: ReturnType<typeof priceSignal>,
  request: SearchRequest,
): string[] {
  const out: string[] = [];
  const verb = commute.mode === "walking" ? "walk" : "drive";

  if (commute.durationMinutes <= request.maxCommuteMinutes * 0.5) {
    out.push(`${formatDuration(commute.durationMinutes)} ${verb} — well inside the limit`);
  }
  if (fit.arrangement === "single_room" && fit.utilisation >= 1.1 && fit.utilisation <= 1.6) {
    out.push(`${fit.label} is sized right for ${request.headcount}`);
  }
  if (fit.trust === "verified") out.push("Capacity published by the venue");
  if (price.kind === "min_spend" || price.kind === "per_person") {
    out.push(price.label);
  }
  if (venue.eventsEmail) out.push(`Direct events contact: ${venue.eventsEmail}`);
  if (venue.menus.length > 0) out.push(`${venue.menus.length} group menu${venue.menus.length === 1 ? "" : "s"} published`);

  return out.slice(0, 4);
}

function buildWarnings(
  venue: Venue,
  commute: Commute,
  fit: ReturnType<typeof bestCapacityFit>,
  price: ReturnType<typeof priceSignal>,
  request: SearchRequest,
  usedSpaces: Venue["spaces"],
): string[] {
  const out: string[] = [];

  if (commute.durationMinutes > request.maxCommuteMinutes) {
    out.push(
      `${formatDuration(commute.durationMinutes)} is over the ${request.maxCommuteMinutes} minute limit`,
    );
  }
  if (commute.estimated) {
    out.push("Commute is a straight-line estimate — the routing service did not respond");
  }
  if (fit.arrangement === "combined_rooms") {
    out.push("Requires combining rooms — confirm the wall actually opens");
  }
  if (fit.arrangement === "full_buyout") {
    out.push("Only works as a full buyout");
  }
  if (fit.utilisation < 1.1) {
    out.push("Room is at near-capacity for this group — tight with AV or a bar");
  }
  if (fit.utilisation > 3) {
    out.push(`Space holds ${fit.capacity} — will feel empty with ${request.headcount}`);
  }
  if (fit.trust !== "verified") {
    out.push("Capacity is not first-party — confirm before it goes in a deck");
  }
  if (price.kind === "unknown" || price.kind === "price_tier") {
    out.push("No published minimum spend");
  }
  const minGuests = usedSpaces
    .map((s) => s.minGuests)
    .filter((n): n is number => n != null);
  if (minGuests.length > 0 && request.headcount < Math.max(...minGuests)) {
    out.push(`Room has a ${Math.max(...minGuests)} guest minimum`);
  }
  if (!venue.phone && !venue.eventsEmail) {
    out.push("No direct contact published — enquiry form only");
  }

  return out;
}
