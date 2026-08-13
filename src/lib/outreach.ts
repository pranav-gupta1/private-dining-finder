import type { RankedVenue, SearchRequest } from "@/lib/types";
import { formatDuration } from "@/lib/geo/distance";
import { titleise } from "@/lib/utils";

const STYLE_PHRASE: Record<SearchRequest["style"], string> = {
  seated_dinner: "a seated dinner",
  reception: "a standing reception",
  happy_hour: "a happy hour",
  buffet: "a buffet dinner",
  meeting: "a working meeting with catering",
};

export function buildOutreachDraft(
  result: RankedVenue,
  request: SearchRequest,
): { subject: string; body: string } {
  const { venue, fit, price, commute } = result;
  const questions: string[] = [];

  questions.push(
    `Availability for ${request.headcount} guests. We are looking at ${STYLE_PHRASE[request.style]}.`,
  );

  if (fit.trust === "verified") {
    questions.push(
      `Can you confirm ${fit.label} still holds ${fit.capacity} for this format?`,
    );
  } else {
    questions.push(
      `We have ${fit.label} listed at ${fit.capacity} for this format, but not from your own site. Could you confirm the correct capacity?`,
    );
  }

  if (fit.arrangement === "combined_rooms") {
    questions.push("Can those rooms be opened into one space, and is there a charge for doing so?");
  }
  if (fit.arrangement === "full_buyout") {
    questions.push("Is a partial buyout possible, or is it whole-venue only?");
  }

  if (price.kind === "min_spend" || price.kind === "per_person") {
    questions.push(
      `We have ${price.label.toLowerCase()} on file. Is that current, and does it include tax and service?`,
    );
  } else {
    questions.push(
      "What is the food and beverage minimum for this space, and does it change by day of week?",
    );
  }

  if (venue.menus.length === 0) {
    questions.push("Could you send group menus with per-person pricing?");
  }

  const dietary = request.dietary ?? [];
  const uncovered = dietary.filter(
    (option) => !venue.dietary.some((d) => d.option === option && d.dedicated),
  );
  if (uncovered.length > 0) {
    questions.push(
      `We will need ${uncovered.map((o) => titleise(o).toLowerCase()).join(", ")} covered. How do you usually handle that at this headcount?`,
    );
  } else if (dietary.length === 0) {
    questions.push("How do you handle dietary restrictions for a group this size?");
  }

  questions.push("What are the AV options in the room, and is there a dedicated bar?");
  questions.push("What is the hold and cancellation policy?");

  const subject = `Private dining enquiry for ${request.headcount} guests, ${venue.name}`;

  const body = [
    "Hi,",
    "",
    `I am putting together ${STYLE_PHRASE[request.style]} for ${request.headcount} people and ${venue.name} is on our shortlist. It is roughly ${formatDuration(commute.durationMinutes)} ${commute.mode === "walking" ? "on foot" : "by car"} from where the group will be coming from.`,
    "",
    "A few things I need before we can put it forward:",
    "",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "If it is easier to talk it through, happy to jump on a call.",
    "",
    "Thanks,",
  ].join("\n");

  return { subject, body };
}

export function toCsv(results: RankedVenue[], request: SearchRequest): string {
  const headers = [
    "Rank",
    "Venue",
    "Address",
    "City",
    "Recommended space",
    "Capacity",
    "Arrangement",
    `Commute (${request.travelMode})`,
    "Distance (mi)",
    "Trust",
    "Price signal",
    "Per head",
    "Price trust",
    "Fit score",
    "Phone",
    "Events email",
    "Events page",
    "Warnings",
  ];

  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const rows = results.map((result, index) => {
    const { venue, commute, fit, price } = result;
    return [
      index + 1,
      venue.name,
      venue.addressLine1,
      `${venue.city}, ${venue.region}`,
      fit.label,
      fit.capacity,
      fit.arrangement.replace(/_/g, " "),
      `${Math.round(commute.durationMinutes)} min${commute.estimated ? " (est)" : ""}`,
      (commute.distanceMeters / 1609.344).toFixed(2),
      result.trust,
      price.label,
      price.perPersonCents != null ? (price.perPersonCents / 100).toFixed(2) : "",
      price.trust,
      result.score.toFixed(1),
      venue.phone ?? "",
      venue.eventsEmail ?? "",
      venue.eventsUrl ?? venue.website ?? "",
      result.warnings.join("; "),
    ]
      .map(escape)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
