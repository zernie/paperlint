/**
 * A VENUE'S OWN SUBMISSION FIELDS — what its portal's form asks beyond the title, the abstract, the
 * authors and the PDF: topics, PC conflicts, a corresponding author …
 *
 * Two declarations, each in the file that owns the fact:
 *
 *   venue preset `submission_fields`   what the edition's form asks, as read: a kind per field
 *   paper `fields`                      what this paper answers
 *
 * The preset is DATA: it names a kind from the fixed set below, never a schema. The one schema of a
 * paper's answers is built here from those kinds, so an unknown topic is refused before anything is
 * sent — the portal itself would drop it without a word (HotCRP: measured 2026-10-20, a topic it
 * does not know leaves `change_list` without `topics` and the submission with none).
 */
import { z } from "zod";
import { err, ok, type Result } from "./result.ts";

/**
 * The kinds a field can be, after the HotCRP form controls they stand for:
 *
 *   checkboxes     a list of option names (HotCRP's topics: `"Group: Topic"`, the group and the topic)
 *   text           free text
 *   email          an email address (a selector of authors that the API takes by email)
 *   pc_conflicts   PC member's email → conflict type (`true` or a type name the portal checks)
 */
export const FIELD_KINDS = [
  "checkboxes",
  "text",
  "email",
  "pc_conflicts",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** One field of the form, as the preset records it. */
export interface FieldDeclaration {
  readonly kind: FieldKind;
  /** The form will not complete without it. */
  readonly required: boolean;
  /** The form's own label, when the API's key is not it. */
  readonly label: string | null;
  /** The choices, for `checkboxes`; empty for every other kind. */
  readonly options: readonly string[];
}

/** A venue preset's `submission_fields`: the form's fields, and where and when they were read. */
export interface VenueFields {
  /** `portal`: read through the portal's API; `form`: copied from its submission form. */
  readonly source: "portal" | "form";
  readonly url: string;
  /** The day it was read, YYYY-MM-DD. */
  readonly read: string;
  /** The API's key → the field. */
  readonly fields: Readonly<Record<string, FieldDeclaration>>;
}

/** A paper's answers, checked against its venue's fields: the API's key → the value to send. */
export type FieldValues = Readonly<Record<string, unknown>>;

const CONFLICT = z.union([z.literal(true), z.string().trim().min(1)]);

/** One field's value schema, from its kind. Pure. */
function valueSchema(d: FieldDeclaration): z.ZodType {
  switch (d.kind) {
    case "checkboxes":
      return z
        .array(
          z.string().refine((v) => d.options.includes(v), {
            error: (i) =>
              `${JSON.stringify(i.input)} is not one of the form's options`,
          }),
        )
        .min(d.required ? 1 : 0, {
          error: "the form requires at least one",
        })
        .refine((l) => new Set(l).size === l.length, {
          error: "an option is given twice",
        });
    case "text":
      return z.string().trim().min(d.required ? 1 : 0);
    case "email":
      return z.email();
    case "pc_conflicts":
      return z.record(z.email(), CONFLICT);
  }
}

/** The schema of a paper's `fields` for these venue fields: every key declared, the required ones present. Pure. */
export const fieldValuesSchema = (v: VenueFields): z.ZodType<FieldValues> =>
  z.strictObject(
    Object.fromEntries(
      Object.entries(v.fields).map(([key, d]) => {
        const s = valueSchema(d);
        return [key, d.required ? s : s.optional()];
      }),
    ),
  );

const at = (path: readonly PropertyKey[]): string =>
  path.map((p) => (typeof p === "number" ? `[${String(p)}]` : `.${String(p)}`)).join("");

/** The first problem of a refused `fields`, naming the key, and what the form offers when it is a choice. */
function problemOf(issue: z.core.$ZodIssue, v: VenueFields): string {
  const key = issue.path[0];
  const declared = typeof key === "string" ? v.fields[key] : undefined;
  const offers =
    declared !== undefined && declared.kind === "checkboxes"
      ? ` — the form offers: ${declared.options.map((o) => JSON.stringify(o)).join(", ")}`
      : "";
  const known = Object.keys(v.fields).join(", ");
  return issue.code === "unrecognized_keys"
    ? `"fields" has ${issue.keys.map((k) => `"${k}"`).join(", ")}, which the venue's form does not ask (it asks: ${known})`
    : `"fields"${at(issue.path)}: ${issue.message}${offers}`;
}

/**
 * A paper's `fields` key, checked against its venue's form → the values to send (empty when the
 * paper gives none), or one line saying what is wrong. Pure.
 *
 * @param raw    the paper's `fields`, null when absent
 * @param venue  the venue preset's `submission_fields`; null when it records none
 * @param where  where the venue's fields were read from, for the message (the preset chain)
 */
export function parsePaperFields(
  raw: unknown,
  venue: VenueFields | null,
  where: string,
): Result<FieldValues, string> {
  if (raw === null) return ok({});
  if (venue === null)
    return err(
      `"fields" is set, but the venue preset records no "submission_fields" (read: ${where}) — record the form's fields in the venue's preset first, or drop "fields"`,
    );
  const parsed = fieldValuesSchema(venue).safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  const [first] = parsed.error.issues;
  return err(
    first === undefined
      ? `"fields" does not match the venue's form`
      : problemOf(first, venue),
  );
}

/**
 * The checkbox fields the paper sent that the portal did not take: sent non-empty, absent from the
 * answer's changes, and named in a message of the portal's. That is a silent drop — the portal keeps
 * an option it does not know as nothing. Pure.
 */
export function droppedFields(
  sent: FieldValues,
  venue: VenueFields | null,
  answer: {
    readonly changes: readonly string[];
    readonly messageFields: readonly (string | null)[];
  },
): readonly string[] {
  if (venue === null) return [];
  return Object.entries(sent)
    .filter(
      ([key, value]) =>
        venue.fields[key]?.kind === "checkboxes" &&
        Array.isArray(value) &&
        value.length > 0 &&
        !answer.changes.includes(key) &&
        answer.messageFields.includes(key),
    )
    .map(([key]) => key);
}
