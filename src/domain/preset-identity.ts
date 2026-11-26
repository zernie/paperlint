// What a preset file IS, as its `type` declares it, and how its JSON becomes that identity. Pure.

import type { VenueField } from "./venue-field.ts";

/**
 * What a preset file IS, as its `type` declares it. A venue names itself and its call for papers; a
 * template family and the base set name no venue, so they cannot carry either — the union has no
 * field to put them in, the way the schema refuses them.
 */
export type PresetIdentity =
  | {
      readonly type: "venue";
      readonly name: string;
      readonly url: string;
      /** A conference's field of research; null on a workshop (it takes its parent's) and where unset. */
      readonly field: VenueField | null;
    }
  | {
      readonly type: "family";
      /** The template as a reader names it; null where unset. */
      readonly templateLabel: string | null;
      /** The organisation any of whose conferences may use this family; null for one venue's own. */
      readonly anyConferenceOf: string | null;
    }
  | { readonly type: "base" };

/** The identity keys of a preset file, as the profile schema accepts them. */
export type IdentityJson =
  | {
      readonly type: "venue";
      readonly name: string;
      readonly url: string;
      readonly field?: VenueField;
    }
  | {
      readonly type: "family";
      readonly template_label?: string;
      readonly any_conference_of?: string;
    }
  | { readonly type: "base" };

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/** The identity a preset's `type` declares. */
export const identityOf = (j: IdentityJson): PresetIdentity => {
  switch (j.type) {
    case "venue":
      return {
        type: "venue",
        name: j.name,
        url: j.url,
        field: orNull(j.field),
      };
    case "family":
      return {
        type: "family",
        templateLabel: orNull(j.template_label),
        anyConferenceOf: orNull(j.any_conference_of),
      };
    case "base":
      return { type: "base" };
  }
};
