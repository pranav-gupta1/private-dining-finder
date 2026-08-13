import "dotenv/config";

import { runSearch } from "../src/lib/search/search";
import { formatDistance, formatDuration } from "../src/lib/geo/distance";
import { formatMoney } from "../src/lib/rank/price";
import type { SearchRequest } from "../src/lib/types";

const SCENARIOS: { label: string; request: SearchRequest }[] = [
  {
    label: "50 people near Times Square, under a 20 minute walk",
    request: {
      address: "Times Square, New York, NY",
      headcount: 50,
      maxCommuteMinutes: 20,
      travelMode: "walking",
      style: "seated_dinner",
      dietary: [],
      allowBuyout: true,
      includeUnverified: true,
    },
  },
  {
    label: "30 people near Salesforce Tower, under a 15 minute walk",
    request: {
      address: "415 Mission St, San Francisco, CA 94105",
      headcount: 30,
      maxCommuteMinutes: 15,
      travelMode: "walking",
      style: "seated_dinner",
      dietary: [],
      allowBuyout: true,
      includeUnverified: true,
    },
  },
  {
    label: "200 people, reception format, under a 15 minute walk from Hilton Hawaiian Village",
    request: {
      address: "Hilton Hawaiian Village Waikiki Beach Resort, Waikiki, HI",
      headcount: 200,
      maxCommuteMinutes: 15,
      travelMode: "walking",
      style: "reception",
      dietary: [],
      allowBuyout: true,
      includeUnverified: true,
    },
  },
];

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const TRUST_MARK = { verified: "[verified]", likely: "[likely]", unverified: "[needs a call]" };

async function main() {
  const only = arg("scenario");
  const limit = Number(arg("limit") ?? 6);

  const selected = only ? [SCENARIOS[Number(only) - 1]] : SCENARIOS;

  for (const [index, scenario] of selected.entries()) {
    console.log(`\n${"=".repeat(78)}`);
    console.log(`Scenario ${only ?? index + 1}: ${scenario.label}`);
    console.log("=".repeat(78));

    const response = await runSearch(scenario.request);

    console.log(`Origin      ${response.origin.displayName ?? response.origin.query}`);
    console.log(`            ${response.origin.lat.toFixed(5)}, ${response.origin.lon.toFixed(5)} (${response.origin.provider})`);
    console.log(
      `Search      ${response.results.length} results, ${response.meta.withinCommute} inside the limit, ` +
        `routed with ${response.meta.routedWith} in ${response.meta.elapsedMs}ms`,
    );
    for (const note of response.meta.notes) console.log(`Note        ${note}`);
    console.log("");

    response.results.slice(0, limit).forEach((result, i) => {
      const { venue, commute, fit, price } = result;
      const flag = result.withinCommute ? "" : "  << outside the commute limit";
      console.log(
        `${String(i + 1).padStart(2)}. ${venue.name}  —  ${result.score.toFixed(1)} ${TRUST_MARK[result.trust]}${flag}`,
      );
      console.log(`    ${venue.addressLine1}, ${venue.city}, ${venue.region}`);
      console.log(
        `    ${formatDuration(commute.durationMinutes)} ${commute.mode === "walking" ? "walk" : "drive"} ` +
          `(${formatDistance(commute.distanceMeters)})${commute.estimated ? " estimated" : ""}`,
      );
      console.log(`    ${fit.explanation}`);
      console.log(
        `    ${price.label}` +
          (price.perPersonCents ? ` (${formatMoney(price.perPersonCents)}/head)` : "") +
          ` [${price.trust}]`,
      );
      if (venue.eventsEmail || venue.phone) {
        console.log(`    ${[venue.eventsEmail, venue.phone].filter(Boolean).join("  ·  ")}`);
      }
      if (result.warnings.length > 0) console.log(`    ! ${result.warnings[0]}`);
      console.log("");
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
