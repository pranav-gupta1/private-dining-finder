import type {
  CapacityFit,
  EventStyle,
  Evidence,
  TrustLevel,
  Venue,
  VenueSpace,
} from "@/lib/types";
import { resolveFieldTrust, weakest } from "@/lib/trust/trust";

/**
 * Which capacity number matters depends on what the planner is running.
 * A room that seats 60 at rounds will comfortably hold 100 for a reception,
 * and a 200-person happy hour ranked on seated covers would find nothing.
 */
const STYLE_USES_STANDING: Record<EventStyle, boolean> = {
  seated_dinner: false,
  buffet: false,
  meeting: false,
  reception: true,
  happy_hour: true,
};

/**
 * Conversion factors used only when a venue publishes one number and not the
 * other. Both directions are conservative, and any capacity derived this way is
 * capped at `likely` so it never presents as a published figure.
 */
const SEATED_TO_STANDING = 1.4;
const STANDING_TO_SEATED = 0.6;

export interface UsableCapacity {
  value: number;
  derived: boolean;
  basis: "seated" | "standing";
}

/** The capacity of a single space for a given event style. */
export function usableCapacity(space: VenueSpace, style: EventStyle): UsableCapacity | null {
  const wantsStanding = STYLE_USES_STANDING[style];
  const seated = space.seatedCapacity;
  const standing = space.standingCapacity;

  if (wantsStanding) {
    if (standing != null) return { value: standing, derived: false, basis: "standing" };
    if (seated != null) {
      return { value: Math.floor(seated * SEATED_TO_STANDING), derived: true, basis: "seated" };
    }
    return null;
  }

  if (seated != null) return { value: seated, derived: false, basis: "seated" };
  if (standing != null) {
    return { value: Math.floor(standing * STANDING_TO_SEATED), derived: true, basis: "standing" };
  }
  return null;
}

/**
 * A room that holds exactly the headcount is a worse recommendation than one
 * with a little slack: you need room for a bar, a screen, servers and the two
 * people who were not on the list. Too much slack is also bad — a 200-cap
 * ballroom for 30 feels empty and you pay for the space regardless.
 *
 * The sweet spot is 1.1x to 1.6x the headcount.
 */
export function fitQuality(capacity: number, headcount: number): number {
  if (capacity < headcount) return 0;
  const ratio = capacity / headcount;

  if (ratio < 1.1) return 0.72 + ((ratio - 1) / 0.1) * 0.18; // 0.72 -> 0.90, tight
  if (ratio <= 1.6) return 1;
  if (ratio <= 2.5) return 1 - ((ratio - 1.6) / 0.9) * 0.3; // 1.00 -> 0.70
  if (ratio <= 4) return 0.7 - ((ratio - 2.5) / 1.5) * 0.3; // 0.70 -> 0.40
  return 0.35;
}

interface Candidate {
  spaces: VenueSpace[];
  capacity: number;
  derived: boolean;
  arrangement: CapacityFit["arrangement"];
}

/**
 * Spaces a venue advertises as combinable form a group; the group's capacity is
 * the sum of its members. Union-find keeps this correct when a chain of rooms
 * only declares its immediate neighbour.
 */
function combinableGroups(spaces: VenueSpace[]): VenueSpace[][] {
  const byName = new Map(spaces.map((s) => [s.name, s]));
  const parent = new Map<string, string>(spaces.map((s) => [s.name, s.name]));

  const find = (name: string): string => {
    let current = name;
    while (parent.get(current) !== current) current = parent.get(current)!;
    return current;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const space of spaces) {
    for (const other of space.combinableWith) {
      if (byName.has(other)) union(space.name, other);
    }
  }

  const groups = new Map<string, VenueSpace[]>();
  for (const space of spaces) {
    const root = find(space.name);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(space);
  }

  return [...groups.values()].filter((g) => g.length > 1);
}

function buildCandidates(
  venue: Venue,
  headcount: number,
  style: EventStyle,
  allowBuyout: boolean,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const space of venue.spaces) {
    const isBuyout = space.kind === "full_buyout";
    if (isBuyout && !allowBuyout) continue;

    const capacity = usableCapacity(space, style);
    if (!capacity || capacity.value < headcount) continue;

    candidates.push({
      spaces: [space],
      capacity: capacity.value,
      derived: capacity.derived,
      arrangement: isBuyout ? "full_buyout" : "single_room",
    });
  }

  for (const group of combinableGroups(venue.spaces)) {
    // Largest rooms first so we combine as few as possible.
    const sorted = [...group].sort((a, b) => {
      const ca = usableCapacity(a, style)?.value ?? 0;
      const cb = usableCapacity(b, style)?.value ?? 0;
      return cb - ca;
    });

    const used: VenueSpace[] = [];
    let total = 0;
    let derived = false;

    for (const space of sorted) {
      if (total >= headcount) break;
      const capacity = usableCapacity(space, style);
      if (!capacity) continue;
      used.push(space);
      total += capacity.value;
      derived = derived || capacity.derived;
    }

    if (used.length > 1 && total >= headcount) {
      candidates.push({ spaces: used, capacity: total, derived, arrangement: "combined_rooms" });
    }
  }

  return candidates;
}

/**
 * A combination is only worth recommending if no single room already works;
 * splitting a group across two rooms is a real cost to the event.
 */
const ARRANGEMENT_PENALTY: Record<CapacityFit["arrangement"], number> = {
  single_room: 0,
  combined_rooms: 0.12,
  full_buyout: 0.08,
  none: 1,
};

function describe(candidate: Candidate, headcount: number, style: EventStyle): string {
  const noun = STYLE_USES_STANDING[style] ? "standing" : "seated";
  const names = candidate.spaces.map((s) => s.name);

  if (candidate.arrangement === "full_buyout") {
    return `Full buyout holds ${candidate.capacity} ${noun} — fits ${headcount}.`;
  }
  if (candidate.arrangement === "combined_rooms") {
    return `${names.join(" + ")} combine for ${candidate.capacity} ${noun} — fits ${headcount}.`;
  }
  return `${names[0]} holds ${candidate.capacity} ${noun} — fits ${headcount}.`;
}

/**
 * Best way to seat `headcount` at this venue, or an explicit "none" result the
 * caller can filter on.
 */
export function bestCapacityFit(
  venue: Venue,
  headcount: number,
  style: EventStyle,
  options: { allowBuyout?: boolean; now?: Date } = {},
): CapacityFit {
  const allowBuyout = options.allowBuyout ?? true;
  const candidates = buildCandidates(venue, headcount, style, allowBuyout);

  if (candidates.length === 0) {
    return {
      spaceIds: [],
      label: "No space large enough",
      arrangement: "none",
      capacity: 0,
      headcount,
      utilisation: 0,
      trust: "unverified",
      explanation: `No listed space holds ${headcount} for this format.`,
    };
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score:
        fitQuality(candidate.capacity, headcount) - ARRANGEMENT_PENALTY[candidate.arrangement],
    }))
    .sort((a, b) => b.score - a.score);

  const winner = scored[0].candidate;
  const trust = capacityTrust(winner.spaces, venue.evidence, winner.derived, options.now);

  return {
    spaceIds: winner.spaces.map((s) => s.id),
    label: winner.spaces.map((s) => s.name).join(" + "),
    arrangement: winner.arrangement,
    capacity: winner.capacity,
    headcount,
    utilisation: winner.capacity / headcount,
    trust,
    explanation: describe(winner, headcount, style),
  };
}

/**
 * The trust of a fit is the weakest of the rooms it depends on. Capacity we
 * converted between seated and standing ourselves is capped at `likely`,
 * because the venue never actually published that number.
 */
function capacityTrust(
  spaces: VenueSpace[],
  evidence: Evidence[],
  derived: boolean,
  now?: Date,
): TrustLevel {
  const levels = spaces.map((space) => {
    const forSpace = evidence.filter((e) => e.spaceId === space.id && e.field === "space.capacity");
    // Venue-wide capacity evidence covers a room with none of its own.
    const scope = forSpace.length > 0 ? forSpace : evidence.filter((e) => e.spaceId === null);
    return resolveFieldTrust(scope, "space.capacity", now).level;
  });

  const level = weakest(...levels);
  return derived && level === "verified" ? "likely" : level;
}
