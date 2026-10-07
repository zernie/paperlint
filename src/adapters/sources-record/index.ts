/**
 * The schema of `_build/sources.json` — the one place its shape is checked (docs/design/paper-sources.md
 * §1). The text is parsed once, here, into the domain's `SourcesRecord`; whatever reads a record after
 * it never re-validates. A record of another schema number is refused by name, not read as this one.
 */
import { z } from "zod";
import {
  SOURCES_FILE,
  SOURCES_SCHEMA,
  type ParsedRecord,
} from "../../domain/sources-record.ts";
import type { SourcesCodec } from "../../ports/sources-codec.ts";

const SHA256 = /^[0-9a-f]{64}$/;

const bibtexError = z.object({
  message: z.string(),
  file: z.string(),
  line: z.number().int().nullable(),
});

const recordSchema = z.object({
  schema: z.literal(SOURCES_SCHEMA),
  inputs: z.array(
    z.object({ path: z.string(), role: z.enum(["preamble", "body"]) }),
  ),
  written: z.array(z.string()),
  bibdata: z.array(z.string()),
  bibtex: z.discriminatedUnion("ran", [
    z.object({ ran: z.literal(false) }),
    z.object({
      ran: z.literal(true),
      databases: z.array(z.string()),
      keys: z.array(z.string()),
      exit: z.number().int(),
      errors: z.array(bibtexError),
    }),
  ]),
  sha256: z.record(z.string(), z.string().regex(SHA256).nullable()),
});

/** The JSON `text` holds, or undefined when it is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The `schema` field of a parsed file, whatever it holds, or undefined when there is none. */
const schemaOf = (json: unknown): unknown =>
  typeof json === "object" && json !== null && "schema" in json
    ? json.schema
    : undefined;

/**
 * A `sources.json`'s text, parsed once at the boundary: the record, or the one reason it is not one.
 * A record of another schema number is refused by name, not read as this one.
 */
export function parseSourcesRecord(text: string): ParsedRecord {
  const json = jsonOf(text);
  if (json === undefined)
    return { ok: false, why: `${SOURCES_FILE} is not JSON` };
  const schema = schemaOf(json);
  if (schema !== SOURCES_SCHEMA)
    return {
      ok: false,
      why: `${SOURCES_FILE} is schema ${typeof schema === "number" ? String(schema) : "unknown"}, this paperlint reads schema ${String(SOURCES_SCHEMA)}`,
    };
  const parsed = recordSchema.safeParse(json);
  if (parsed.success) return { ok: true, record: parsed.data };
  const issues = parsed.error.issues.map(
    (i) => `${i.path.join(".")} ${i.message}`,
  );
  return {
    ok: false,
    why: `${SOURCES_FILE} does not match schema ${String(SOURCES_SCHEMA)}: ${issues.join("; ")}`,
  };
}

export const sourcesCodec: SourcesCodec = { parse: parseSourcesRecord };
