/**
 * THE UPLOAD RECORD — what an artifact host holds, written down once at upload time, so a lint rule
 * can say later whether the paper still prints what that upload was built for. Pure.
 *
 * The record is a JSON file (default `<paper>/submission/artifact-upload.json`, docs/artifact-upload.md)
 * that anyone may write: `paperlint artifact record`, `paperlint artifact upload --save`, the author's
 * own script, or a hand. It is parsed here, once, into `UploadRecord`; nothing after reads the raw
 * JSON. `numbers` is the paper's printed key → value map at upload time: every argument-less macro
 * of the paper's numbers file, as written in its definition.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { err, ok, type Result } from "./result.ts";

/** The record's version: a reader refuses one it does not know rather than misread it. */
export const RECORD_VERSION = 1;

/** Where the record is, relative to the paper, unless the rule's `record` option names another. */
export const DEFAULT_RECORD = "submission/artifact-upload.json";

const Hex = (n: number) =>
  z.string().regex(new RegExp(`^[0-9a-f]{${String(n)}}$`));

const Record = z.strictObject({
  version: z.literal(RECORD_VERSION),
  /** The host's name: `osf`, `zenodo`, `other`, … — a host paperlint has no adapter for is fine. */
  host: z.string().min(1),
  url: z.url(),
  /** The uploaded file's name. */
  file: z.string().min(1),
  /** The host's own id of the file, when it has one (OSF: the file's id); lets `show` find it. */
  id: z.string().min(1).optional(),
  sha256: Hex(64).optional(),
  md5: Hex(32).optional(),
  uploadedAt: z.iso.datetime({ offset: true }),
  numbers: z.record(z.string(), z.string()),
});

export type UploadRecord = Readonly<z.infer<typeof Record>>;

/** `json` as a record, or why it is not one, in words: which field and what is wrong with it. */
export function recordOf(json: unknown): Result<UploadRecord, string> {
  const r = Record.safeParse(json);
  return r.success
    ? ok(r.data)
    : err(
        r.error.issues
          .map((i) => `${i.path.join(".") || "the record"}: ${i.message}`)
          .join("; "),
      );
}

/** The record in `text`, or why it is not one, in words. */
export function parseUploadRecord(text: string): Result<UploadRecord, string> {
  try {
    return recordOf(JSON.parse(text));
  } catch {
    return err("it is not JSON");
  }
}

/** The record as its file holds it: two-space JSON, keys in the order given, a final newline. */
export const uploadRecordText = (r: UploadRecord): string =>
  `${JSON.stringify(r, null, 2)}\n`;

/** The md5 of `bytes`, as hosts print it: 32 lowercase hex digits. */
export const md5Hex = (bytes: Uint8Array): string =>
  createHash("md5").update(bytes).digest("hex");

/** What the paper prints now that the upload was not built for: keys it lacked, keys with another value. */
export interface Drift {
  readonly added: readonly string[];
  readonly changed: readonly string[];
}

/**
 * The drift between the numbers recorded at upload and the paper's `current` ones, counting only the
 * keys the paper uses: a macro defined and never printed never fires. Keys in source order.
 */
export const drift = (
  recorded: Readonly<Record<string, string>>,
  current: ReadonlyMap<string, string>,
  used: ReadonlySet<string>,
): Drift => {
  const printed = [...current].filter(([k]) => used.has(k));
  return {
    added: printed.filter(([k]) => !Object.hasOwn(recorded, k)).map(([k]) => k),
    changed: printed
      .filter(([k, v]) => Object.hasOwn(recorded, k) && recorded[k] !== v)
      .map(([k]) => k),
  };
};
