import type { Evidence, SourceKind, TrustLevel } from "@/lib/types";

/**
 * Trust labels.
 *
 * A planner is going to put one of these venues in front of an executive, so
 * "the internet says 60 people fit" is not good enough on its own. Every label
 * answers two questions: who said this, and how long ago.
 *
 *   verified   — the venue itself published it (private-events page, capacity
 *                chart, banquet PDF) or a planner confirmed it by phone.
 *   likely     — a booking platform or reputable directory carries it. Usually
 *                right, occasionally out of date, worth confirming.
 *   unverified — we inferred it, or nobody published it at all. Needs a call.
 */

const BASE_TRUST: Record<SourceKind, TrustLevel> = {
  venue_site: "verified",
  venue_document: "verified",
  phone_call: "verified",
  booking_platform: "likely",
  directory: "likely",
  editorial: "likely",
  inferred: "unverified",
};

/**
 * Restaurants reconfigure rooms, raise minimums and close. A capacity sourced
 * from the venue two years ago is not the same claim as one sourced last month,
 * so age costs a level. These thresholds are intentionally generous: private
 * dining pages change far more slowly than menus do.
 */
const STALE_AFTER_DAYS = 550; // ~18 months
const VERY_STALE_AFTER_DAYS = 1100; // ~3 years

const RANK: Record<TrustLevel, number> = { verified: 3, likely: 2, unverified: 1 };
const BY_RANK: TrustLevel[] = ["unverified", "unverified", "likely", "verified"];

const SOURCE_LABEL: Record<SourceKind, string> = {
  venue_site: "the venue's own events page",
  venue_document: "a capacity sheet published by the venue",
  phone_call: "a call with the venue",
  booking_platform: "a booking platform listing",
  directory: "a business directory",
  editorial: "an editorial round-up",
  inferred: "an estimate from the venue's overall size",
};

export function daysSince(isoDate: string, now = new Date()): number {
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function downgrade(level: TrustLevel, steps: number): TrustLevel {
  return BY_RANK[Math.max(1, RANK[level] - steps)];
}

/** Trust for a single piece of evidence, after applying the staleness penalty. */
export function trustForEvidence(evidence: Evidence, now = new Date()): TrustLevel {
  const base = BASE_TRUST[evidence.sourceKind];
  const age = daysSince(evidence.observedAt, now);

  if (age >= VERY_STALE_AFTER_DAYS) return downgrade(base, 2);
  if (age >= STALE_AFTER_DAYS) return downgrade(base, 1);
  return base;
}

export interface FieldTrust {
  level: TrustLevel;
  reason: string;
  best: Evidence | null;
  supporting: Evidence[];
}

/**
 * Resolve the trust label for one field.
 *
 * Multiple sources are common — a venue's own page plus a Tripleseat listing.
 * We take the strongest rather than averaging, because a first-party number is
 * not made less true by a directory disagreeing with it. Two independent
 * `likely` sources do promote to `verified`: independent agreement is the whole
 * reason corroboration is worth anything.
 */
export function resolveFieldTrust(
  evidence: Evidence[],
  field: string,
  now = new Date(),
): FieldTrust {
  const relevant = evidence.filter((e) => e.field === field);

  if (relevant.length === 0) {
    return {
      level: "unverified",
      reason: "No published source found — confirm with the venue.",
      best: null,
      supporting: [],
    };
  }

  const scored = relevant
    .map((e) => ({ evidence: e, level: trustForEvidence(e, now) }))
    .sort((a, b) => RANK[b.level] - RANK[a.level]);

  const top = scored[0];
  let level = top.level;

  const independentLikely = scored.filter(
    (s) => s.level === "likely" && s.evidence.sourceKind !== "inferred",
  );
  const distinctHosts = new Set(
    independentLikely.map((s) => {
      try {
        return s.evidence.sourceUrl ? new URL(s.evidence.sourceUrl).host : s.evidence.sourceKind;
      } catch {
        return s.evidence.sourceKind;
      }
    }),
  );

  let corroborated = false;
  if (level === "likely" && distinctHosts.size >= 2) {
    level = "verified";
    corroborated = true;
  }

  const age = daysSince(top.evidence.observedAt, now);
  const staleNote =
    age >= VERY_STALE_AFTER_DAYS
      ? " Source is over three years old, so the label is reduced."
      : age >= STALE_AFTER_DAYS
        ? " Source is over 18 months old, so the label is reduced."
        : "";

  const reason = corroborated
    ? `Two independent listings agree, checked ${formatAge(age)}.`
    : `From ${SOURCE_LABEL[top.evidence.sourceKind]}, checked ${formatAge(age)}.${staleNote}`;

  return { level, reason, best: top.evidence, supporting: relevant };
}

function formatAge(days: number): string {
  if (!Number.isFinite(days)) return "at an unknown date";
  if (days <= 1) return "today";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.round(months / 12)} years ago`;
}

/** Weakest of several labels — used when a recommendation depends on all of them. */
export function weakest(...levels: TrustLevel[]): TrustLevel {
  if (levels.length === 0) return "unverified";
  return levels.reduce((acc, l) => (RANK[l] < RANK[acc] ? l : acc));
}

export function trustRank(level: TrustLevel): number {
  return RANK[level];
}

export const TRUST_DISPLAY: Record<TrustLevel, { label: string; short: string }> = {
  verified: { label: "Verified", short: "Verified" },
  likely: { label: "Likely", short: "Likely" },
  unverified: { label: "Unverified — needs a call", short: "Needs a call" },
};
