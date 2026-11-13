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
 * The kinds a field can be, after the HotCRP form controls they stand for
 * (`docs/prior-art/hotcrp-option-types.md`: every type, the JSON it takes, and why a type is absent):
 *
 *   checkbox         one box: `true` or `false` (HotCRP `checkbox`)
 *   choice           one of `options`, spelled as listed (`dropdown`, `radio`)
 *   checkboxes       a list of option names (`checkboxes`, and HotCRP's topics: `"Group: Topic"`)
 *   integer          a whole number, within `min` and `max` (`numeric`)
 *   number           a number, within `min` and `max` (`realnumber`)
 *   text             free text (`text`)
 *   multiline_text   free text with line breaks (`mtext`)
 *   email            an email address (a selector of authors that the API takes by email)
 *   pc_conflicts     PC member's email → conflict type (`true` or a type name the portal checks)
 *   document         a file upload (`pdf`, `slides`, `document`): DECLARED ONLY, paperlint sends none
 *   attachments      file uploads (`attachments`): DECLARED ONLY, paperlint sends none
 */
export const FIELD_KINDS = [
  "checkbox",
  "choice",
  "checkboxes",
  "integer",
  "number",
  "text",
  "multiline_text",
  "email",
  "pc_conflicts",
  "document",
  "attachments",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** The kinds a form declares and paperlint sends nothing for: the author adds them on the site. */
const FILE_KINDS: readonly FieldKind[] = ["document", "attachments"];

/**
 * The keys the submission object carries itself (`src/adapters/hotcrp/portal.io.ts`): a venue field
 * of one of these names would be spread over it — `submission` would drop the PDF's upload.
 */
export const RESERVED_FIELD_KEYS = [
  "object",
  "pid",
  "title",
  "abstract",
  "authors",
  "submission",
  "status",
] as const;

/** The first of `keys` that is reserved, or null. Pure. */
export const reservedKey = (keys: readonly string[]): string | null =>
  keys.find((k) => RESERVED_FIELD_KEYS.some((r) => r === k)) ?? null;

interface FieldBase {
  /** The form will not complete without it. */
  readonly required: boolean;
  /** The form's own label, when the API's key is not it. */
  readonly label: string | null;
}

/**
 * One field of the form, as the preset records it: what a kind holds is part of its type, so a
 * choice without options, or a checkbox with a minimum, cannot be written down.
 */
export type FieldDeclaration = FieldBase &
  (
    | {
        readonly kind: "choice" | "checkboxes";
        readonly options: readonly [string, ...string[]];
      }
    | {
        readonly kind: "integer" | "number";
        readonly min: number | null;
        readonly max: number | null;
      }
    | {
        readonly kind:
          | "checkbox"
          | "text"
          | "multiline_text"
          | "email"
          | "pc_conflicts"
          | "document"
          | "attachments";
      }
  );

/** A field as the preset's JSON holds it, after the schema accepted its shape. */
export interface FieldJson {
  readonly kind: FieldKind;
  readonly required?: boolean;
  readonly label?: string;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
}

const OPTION_KINDS: readonly FieldKind[] = ["choice", "checkboxes"];
const BOUND_KINDS: readonly FieldKind[] = ["integer", "number"];

/** The first option listed twice, or null. Pure. */
const repeated = (options: readonly string[]): string | null =>
  options.find((o, i) => options.indexOf(o) !== i) ?? null;

/** The one reason the keys a kind does not take are present, or null. Pure. */
function strayKeys(j: FieldJson): string | null {
  const stray = [
    ...(j.options !== undefined && !OPTION_KINDS.includes(j.kind)
      ? ["options"]
      : []),
    ...((j.min !== undefined || j.max !== undefined) &&
    !BOUND_KINDS.includes(j.kind)
      ? ["min/max"]
      : []),
  ];
  return stray.length === 0
    ? null
    : `${stray.join(", ")} not taken by kind "${j.kind}"`;
}

/** The options of a choice or checkboxes field, or why there are none. Pure. */
function optionsOf(
  options: readonly string[] | undefined,
): Result<readonly [string, ...string[]], string> {
  const [first, ...rest] = options ?? [];
  if (first === undefined) return err("a choice needs options");
  const twice = repeated([first, ...rest]);
  return twice === null
    ? first === "" || rest.includes("")
      ? err("an option is empty")
      : ok([first, ...rest])
    : err(`options repeat ${JSON.stringify(twice)}`);
}

/** A preset's field → the typed declaration, or the one line saying what is wrong with it. Pure. */
export function declareField(j: FieldJson): Result<FieldDeclaration, string> {
  const base = { required: j.required ?? false, label: j.label ?? null };
  const stray = strayKeys(j);
  if (stray !== null) return err(stray);
  if (j.kind === "choice" || j.kind === "checkboxes") {
    const options = optionsOf(j.options);
    return options.ok
      ? ok({ ...base, kind: j.kind, options: options.value })
      : options;
  }
  if (j.kind === "integer" || j.kind === "number") {
    const min = j.min ?? null;
    const max = j.max ?? null;
    return min !== null && max !== null && min > max
      ? err(`min ${String(min)} is above max ${String(max)}`)
      : ok({ ...base, kind: j.kind, min, max });
  }
  return ok({ ...base, kind: j.kind });
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

/** A number schema within the declaration's bounds. Pure. */
const bounded = (
  s: z.ZodNumber,
  d: { readonly min: number | null; readonly max: number | null },
): z.ZodNumber => {
  const lo = d.min === null ? s : s.min(d.min);
  return d.max === null ? lo : lo.max(d.max);
};

/** One field's value schema, from its declaration: what a paper may give for it, not whether it must. Pure. */
function valueSchema(d: FieldDeclaration): Readonly<z.ZodType> {
  switch (d.kind) {
    case "checkbox":
      return d.required
        ? z.literal(true, { error: "the form requires this box to be ticked" })
        : z.boolean();
    case "choice":
      return z.string().refine((v) => d.options.includes(v), {
        error: (i) =>
          `${JSON.stringify(i.input)} is not one of the form's options`,
      });
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
    case "integer":
      return bounded(z.number().int(), d);
    case "number":
      return bounded(z.number(), d);
    case "text":
      return z
        .string()
        .trim()
        .min(d.required ? 1 : 0);
    case "multiline_text":
      return z.string().refine((v) => !d.required || v.trim() !== "", {
        error: "the form requires an entry",
      });
    case "email":
      return z.email();
    case "pc_conflicts":
      return z.record(z.email(), CONFLICT);
    case "document":
    case "attachments":
      return z.never({
        error: "paperlint sends no file for this field — add it on the site",
      });
  }
}

/** The schema of a paper's `fields` for these venue fields: every key declared, each value of its kind. Pure. */
export const fieldValuesSchema = (
  v: VenueFields,
): Readonly<z.ZodType<FieldValues>> =>
  z.strictObject(
    Object.fromEntries(
      Object.entries(v.fields).map(([key, d]) => [
        key,
        valueSchema(d).optional(),
      ]),
    ),
  );

/** The keys of the fields paperlint sends nothing for (file uploads), in the form's order. Pure. */
export const fileFieldKeys = (venue: VenueFields | null): readonly string[] =>
  Object.entries(venue?.fields ?? {})
    .filter(([, d]) => FILE_KINDS.includes(d.kind))
    .map(([key]) => key);

/** What a kind takes, in a few words, for the line that says a field is unfilled. Pure. */
function shapeOf(d: FieldDeclaration): string {
  const list = (o: readonly string[]): string =>
    o.map((x) => JSON.stringify(x)).join(", ");
  switch (d.kind) {
    case "checkbox":
      return "checkbox: true";
    case "choice":
      return `choice: one of ${list(d.options)}`;
    case "checkboxes":
      return `checkboxes: one or more of ${list(d.options)}`;
    case "integer":
    case "number":
      return `${d.kind === "integer" ? "a whole number" : "a number"}${d.min === null ? "" : ` from ${String(d.min)}`}${d.max === null ? "" : ` up to ${String(d.max)}`}`;
    case "pc_conflicts":
      return "pc_conflicts: PC member's email → conflict type";
    default:
      return d.kind;
  }
}

/** The line naming every required field the paper left unfilled, or null when it filled them all. Pure. */
function unfilled(venue: VenueFields, values: FieldValues): string | null {
  const missing = Object.entries(venue.fields).filter(
    ([key, d]) =>
      d.required && !FILE_KINDS.includes(d.kind) && values[key] === undefined,
  );
  const n = missing.length;
  return n === 0
    ? null
    : `"fields" does not fill ${String(n)} field${n === 1 ? "" : "s"} the venue's form requires: ${missing
        .map(
          ([key, d]) =>
            `${key}${d.label === null ? "" : ` ${JSON.stringify(d.label)}`} (${shapeOf(d)})`,
        )
        .join(", ")}`;
}

const at = (path: readonly PropertyKey[]): string =>
  path
    .map((p) => (typeof p === "number" ? `[${String(p)}]` : `.${String(p)}`))
    .join("");

/** The first problem of a refused `fields`, naming the key, and what the form offers when it is a choice. */
function problemOf(issue: z.core.$ZodIssue, v: VenueFields): string {
  const key = issue.path[0];
  const declared = typeof key === "string" ? v.fields[key] : undefined;
  const offers =
    declared !== undefined &&
    (declared.kind === "checkboxes" || declared.kind === "choice")
      ? ` — the form offers: ${declared.options.map((o) => JSON.stringify(o)).join(", ")}`
      : "";
  const known = Object.keys(v.fields).join(", ");
  return issue.code === "unrecognized_keys"
    ? `"fields" has ${issue.keys.map((k) => `"${k}"`).join(", ")}, which the venue's form does not ask (it asks: ${known})`
    : `"fields"${at(issue.path)}: ${issue.message}${offers}`;
}

/**
 * A paper's `fields` key, checked against its venue's form → the values to send, or one line saying
 * what is wrong. Pure. A paper that gives none answers nothing: fine for a venue whose preset records
 * no fields, refused — naming every required field it leaves unfilled — when the venue's form requires one.
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
  if (venue === null)
    return raw === null
      ? ok({})
      : err(
          `"fields" is set, but the venue preset records no "submission_fields" (read: ${where}) — record the form's fields in the venue's preset first, or drop "fields"`,
        );
  const parsed = fieldValuesSchema(venue).safeParse(raw ?? {});
  if (!parsed.success)
    return err(parsed.error.issues.map((i) => problemOf(i, venue)).join("; "));
  const missing = unfilled(venue, parsed.data);
  return missing === null ? ok(parsed.data) : err(missing);
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
