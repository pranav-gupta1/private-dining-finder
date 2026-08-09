import { z } from "zod";

/**
 * Shape of the committed venue dataset.
 *
 * The seed files are JSON rather than TypeScript so that the research pipeline
 * in `scripts/research` can write them directly, and so a non-engineer can edit
 * a capacity without touching application code. This schema is the contract
 * between the two: `npm run db:seed` refuses to load anything that fails it.
 */

export const sourceKindSchema = z.enum([
  "venue_site",
  "venue_document",
  "phone_call",
  "booking_platform",
  "directory",
  "editorial",
  "inferred",
]);

export const seedEvidenceSchema = z.object({
  field: z.string(),
  /** Space name this evidence is about, if it is space-specific. */
  space: z.string().optional(),
  menu: z.string().optional(),
  sourceKind: sourceKindSchema,
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().optional(),
  snippet: z.string().optional(),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const seedSpaceSchema = z.object({
  name: z.string(),
  kind: z.enum(["private_room", "semi_private", "full_buyout", "ballroom", "outdoor", "rooftop"]),
  seatedCapacity: z.number().int().positive().nullable().optional(),
  standingCapacity: z.number().int().positive().nullable().optional(),
  minGuests: z.number().int().positive().nullable().optional(),
  squareFeet: z.number().int().positive().nullable().optional(),
  minSpendCents: z.number().int().nonnegative().nullable().optional(),
  perPersonCents: z.number().int().nonnegative().nullable().optional(),
  features: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
  combinableWith: z.array(z.string()).default([]),
});

export const seedMenuSchema = z.object({
  name: z.string(),
  format: z.enum(["prix_fixe", "family_style", "buffet", "passed_canapes", "bar_package"]),
  pricePerPersonCents: z.number().int().nonnegative().nullable().optional(),
  courses: z.array(z.string()).default([]),
  url: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const seedDietarySchema = z.object({
  option: z.enum([
    "vegetarian",
    "vegan",
    "gluten_free",
    "dairy_free",
    "nut_allergy",
    "halal",
    "kosher",
    "shellfish_allergy",
  ]),
  dedicated: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

export const seedVenueSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  venueType: z.string().default("restaurant"),
  addressLine1: z.string(),
  addressLine2: z.string().nullable().optional(),
  city: z.string(),
  region: z.string(),
  postalCode: z.string().nullable().optional(),
  country: z.string().default("US"),
  neighborhood: z.string().nullable().optional(),
  lat: z.number(),
  lon: z.number(),
  cuisines: z.array(z.string()).default([]),
  priceTier: z.number().int().min(1).max(4).nullable().optional(),
  website: z.string().url().nullable().optional(),
  eventsUrl: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  eventsEmail: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  eventStyles: z
    .array(z.enum(["seated_dinner", "reception", "happy_hour", "meeting", "buffet"]))
    .default([]),
  acceptsBuyout: z.boolean().default(false),
  spaces: z.array(seedSpaceSchema).min(1),
  menus: z.array(seedMenuSchema).default([]),
  dietary: z.array(seedDietarySchema).default([]),
  evidence: z.array(seedEvidenceSchema).default([]),
});

export const seedFileSchema = z.object({
  market: z.string(),
  /** Free text describing how this market's venues were collected. */
  methodology: z.string(),
  venues: z.array(seedVenueSchema),
});

export type SeedVenue = z.infer<typeof seedVenueSchema>;
export type SeedSpace = z.infer<typeof seedSpaceSchema>;
export type SeedEvidence = z.infer<typeof seedEvidenceSchema>;
export type SeedFile = z.infer<typeof seedFileSchema>;
