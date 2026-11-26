// The fields of research a shipped conference belongs to (`field` in a venue preset). The schema's
// enum is this list; `src/venue-catalog.test.ts` fails when the two differ.

/** Every field, in the order a reader meets them on paperlint.dev and in docs/venues.md. */
export const VENUE_FIELDS = [
  "software-engineering",
  "security",
  "nlp",
  "ml-ai",
] as const;

export type VenueField = (typeof VENUE_FIELDS)[number];

/** A field as a heading names it. */
export const FIELD_TITLES: Readonly<Record<VenueField, string>> = {
  "software-engineering": "Software engineering",
  security: "Security",
  nlp: "Natural language processing",
  "ml-ai": "Machine learning and AI",
};
