/**
 * A preset's `submission_fields` block, after the schema accepted it, as the typed preset holds it
 * (`src/tex-requirements.ts` parses the rest of the file).
 */
import {
  declareField,
  RESERVED_FIELD_KEYS,
  reservedKey,
  type FieldDeclaration,
  type FieldJson,
  type VenueFields,
} from "./submission-fields.ts";

/** A preset's `submission_fields` after the schema accepted it. */
export interface SubmissionFieldsJson {
  readonly source: VenueFields["source"];
  readonly url: string;
  readonly read: string;
  readonly fields: Readonly<Record<string, FieldJson>>;
}

/** A preset's `submission_fields`, or null when it records none; a reserved field name, or a field that contradicts its kind, is refused. */
export function submissionFieldsOf(
  j: SubmissionFieldsJson | undefined,
  file: string,
): VenueFields | null {
  if (j === undefined) return null;
  const reserved = reservedKey(Object.keys(j.fields));
  if (reserved !== null)
    throw new Error(
      `${file}: "submission_fields" names "${reserved}", which paperlint sends itself (${RESERVED_FIELD_KEYS.join(", ")}) — a field of that name would overwrite it`,
    );
  const declared = Object.entries(j.fields).map(
    ([key, f]) => [key, declareField(f)] as const,
  );
  const fields: readonly (readonly [string, FieldDeclaration])[] =
    declared.flatMap(([key, d]) => (d.ok ? [[key, d.value] as const] : []));
  const errors = declared.flatMap(([key, d]) =>
    d.ok ? [] : [`field "${key}": ${d.error}`],
  );
  if (errors.length > 0)
    throw new Error(`${file}: "submission_fields" ${errors.join("; ")}`);
  return {
    source: j.source,
    url: j.url,
    read: j.read,
    fields: Object.fromEntries(fields),
  };
}
