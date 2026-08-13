import "dotenv/config";

import { seedFiles } from "../../src/lib/db/snapshot";
import { haversineMeters } from "../../src/lib/geo/distance";

interface Problem {
  level: "error" | "warning";
  venue: string;
  message: string;
}

const MARKET_CENTRES: Record<string, { lat: number; lon: number; radiusKm: number }> = {
  "Manhattan, NY": { lat: 40.7589, lon: -73.9851, radiusKm: 12 },
  "San Francisco, CA": { lat: 37.7897, lon: -122.3967, radiusKm: 12 },
  "Waikiki, HI": { lat: 21.2819, lon: -157.8372, radiusKm: 12 },
};

function main() {
  const problems: Problem[] = [];
  const slugs = new Set<string>();
  let venueCount = 0;
  let spaceCount = 0;
  let evidenceCount = 0;

  for (const file of seedFiles()) {
    const centre = MARKET_CENTRES[file.market];

    for (const venue of file.venues) {
      venueCount += 1;
      spaceCount += venue.spaces.length;
      evidenceCount += venue.evidence.length;

      const add = (level: Problem["level"], message: string) =>
        problems.push({ level, venue: venue.slug, message });

      if (slugs.has(venue.slug)) add("error", "duplicate slug");
      slugs.add(venue.slug);

      if (centre) {
        const km = haversineMeters(centre, venue) / 1000;
        if (km > centre.radiusKm) {
          add("error", `is ${km.toFixed(1)} km from the ${file.market} centre, so check the coordinates`);
        }
      }

      const spaceNames = new Set(venue.spaces.map((s) => s.name));

      for (const space of venue.spaces) {
        if (space.seatedCapacity == null && space.standingCapacity == null) {
          add("error", `space "${space.name}" has no capacity at all`);
        }
        const peak = Math.max(space.seatedCapacity ?? 0, space.standingCapacity ?? 0);
        if (peak > 5000) {
          add("warning", `space "${space.name}" holds ${peak}, which is stadium scale, so verify it`);
        }
        if (space.minGuests && peak && space.minGuests > peak) {
          add("error", `space "${space.name}" has a minimum above its own capacity`);
        }
        for (const other of space.combinableWith) {
          if (!spaceNames.has(other)) {
            add("error", `space "${space.name}" combines with "${other}", which does not exist`);
          }
        }

        if (space.minSpendCents && space.minSpendCents > 50_000_000) {
          add("warning", `space "${space.name}" has a minimum spend over $500,000`);
        }
      }

      for (const item of venue.evidence) {
        if (item.space && !spaceNames.has(item.space)) {
          add("error", `evidence references space "${item.space}", which does not exist`);
        }
        if (item.sourceKind !== "inferred" && !item.sourceUrl) {
          add("warning", `evidence for "${item.field}" has no source URL`);
        }
        if (item.sourceKind === "inferred" && !item.snippet) {
          add("error", `inferred evidence for "${item.field}" must explain how it was derived`);
        }
      }

      const capacityEvidence = venue.evidence.filter((e) => e.field === "space.capacity");
      for (const space of venue.spaces) {
        const covered = capacityEvidence.some((e) => e.space === space.name || !e.space);
        if (!covered) {
          add("warning", `space "${space.name}" has no capacity evidence, so it will rank as unverified`);
        }
      }

      if (!venue.phone && !venue.eventsEmail && !venue.eventsUrl) {
        add("warning", "no phone, email or enquiry URL, so a planner cannot act on this");
      }
    }
  }

  const errors = problems.filter((p) => p.level === "error");
  const warnings = problems.filter((p) => p.level === "warning");

  console.log(
    `Checked ${venueCount} venues, ${spaceCount} spaces, ${evidenceCount} evidence rows.\n`,
  );

  for (const problem of [...errors, ...warnings]) {
    const tag = problem.level === "error" ? "ERROR  " : "warning";
    console.log(`${tag}  ${problem.venue.padEnd(32)} ${problem.message}`);
  }

  console.log(
    `\n${errors.length} error${errors.length === 1 ? "" : "s"}, ` +
      `${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`,
  );

  if (errors.length > 0) process.exit(1);
}

main();
