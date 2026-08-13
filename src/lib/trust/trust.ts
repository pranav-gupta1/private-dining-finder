import type { Evidence, SourceKind, TrustLevel } from "@/lib/types";

const BASE_TRUST: Record<SourceKind, TrustLevel> = {
  venue_site: "verified",
  venue_document: "verified",
  phone_call: "verified",
  booking_platform: "likely",
  directory: "likely",
  editorial: "likely",
  inferred: "unverified",
};

const STALE_AFTER_DAYS = 550;
const VERY_STALE_AFTER_DAYS = 1100;

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
