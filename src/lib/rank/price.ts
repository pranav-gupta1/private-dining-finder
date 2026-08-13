import type { PriceSignal, TrustLevel, Venue, VenueSpace } from "@/lib/types";
import { resolveFieldTrust } from "@/lib/trust/trust";

const TIER_PER_PERSON_CENTS: Record<number, number> = {
  1: 3_000,
  2: 6_500,
  3: 12_000,
  4: 22_000,
};

const TIER_LABEL: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

export function formatMoney(cents: number, currency = "USD"): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
}

export function priceSignal(
  venue: Venue,
  spaces: VenueSpace[],
  headcount: number,
  now?: Date,
): PriceSignal {
  const trustFor = (field: string, spaceId: string | null): TrustLevel => {
    const scoped = venue.evidence.filter(
      (e) => e.field === field && (spaceId === null || e.spaceId === spaceId || e.spaceId === null),
    );
    return resolveFieldTrust(scoped, field, now).level;
  };

  const withMinimum = spaces.filter((s) => s.minSpendCents != null);
  if (withMinimum.length > 0) {
    const total = withMinimum.reduce((sum, s) => sum + (s.minSpendCents ?? 0), 0);
    return {
      kind: "min_spend",
      amountCents: total,
      perPersonCents: Math.round(total / headcount),
      tier: venue.priceTier,
      currency: withMinimum[0].currency,
      trust: trustFor("space.min_spend", withMinimum[0].id),
      label: `${formatMoney(total)} minimum spend`,
    };
  }

  const withPerPerson = spaces.find((s) => s.perPersonCents != null);
  if (withPerPerson?.perPersonCents != null) {
    return {
      kind: "per_person",
      amountCents: withPerPerson.perPersonCents * headcount,
      perPersonCents: withPerPerson.perPersonCents,
      tier: venue.priceTier,
      currency: withPerPerson.currency,
      trust: trustFor("space.per_person", withPerPerson.id),
      label: `${formatMoney(withPerPerson.perPersonCents)} per person`,
    };
  }

  const menuPrices = venue.menus
    .map((m) => m.pricePerPersonCents)
    .filter((c): c is number => c != null);
  if (menuPrices.length > 0) {
    const cheapest = Math.min(...menuPrices);
    return {
      kind: "per_person",
      amountCents: cheapest * headcount,
      perPersonCents: cheapest,
      tier: venue.priceTier,
      currency: "USD",
      trust: trustFor("menu.price", null),
      label: `Menus from ${formatMoney(cheapest)} per person`,
    };
  }

  if (venue.priceTier != null) {
    return {
      kind: "price_tier",
      amountCents: null,
      perPersonCents: TIER_PER_PERSON_CENTS[venue.priceTier] ?? null,
      tier: venue.priceTier,
      currency: "USD",

      trust: "unverified",
      label: `${TIER_LABEL[venue.priceTier]} · no published minimum`,
    };
  }

  return {
    kind: "unknown",
    amountCents: null,
    perPersonCents: null,
    tier: null,
    currency: "USD",
    trust: "unverified",
    label: "No price published. Ask on the call",
  };
}

export function budgetFit(signal: PriceSignal, budgetPerPersonCents: number | null): number {
  if (budgetPerPersonCents == null) {
    if (signal.kind === "min_spend" || signal.kind === "per_person") return 1;
    if (signal.kind === "price_tier") return 0.6;
    return 0.4;
  }
  if (signal.perPersonCents == null) return 0.45;

  const ratio = signal.perPersonCents / budgetPerPersonCents;
  if (ratio <= 0.5) return 0.85;
  if (ratio <= 1) return 1;
  if (ratio <= 1.25) return 1 - (ratio - 1) * 2;
  if (ratio <= 2) return Math.max(0.1, 0.5 - (ratio - 1.25) * 0.53);
  return 0.05;
}
