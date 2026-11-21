import { omit } from "remeda";
import { expect, test } from "vitest";
import {
  drift,
  md5Hex,
  parseUploadRecord,
  uploadRecordText,
  type UploadRecord,
} from "./artifact-upload.ts";

const RECORD: UploadRecord = {
  version: 1,
  host: "osf",
  url: "https://osf.io/abcde/",
  file: "artifact.zip",
  id: "0123456789abcdef01234567",
  sha256: "a".repeat(64),
  md5: "b".repeat(32),
  uploadedAt: "2026-11-01T10:00:00Z",
  numbers: { nRepos: "63", pctPass: "41.2\\%" },
};

test("a record survives its own text: written, then read back whole", () => {
  // Guards: the writer and the reader agree on every field.
  expect(parseUploadRecord(uploadRecordText(RECORD))).toEqual({
    ok: true,
    value: RECORD,
  });
});

test("a hand-written record without the optional fields is a record", () => {
  const bare = omit(RECORD, ["id", "sha256", "md5"]);
  // Guards: id and the hashes are optional; a host that gives none still has a record.
  expect(parseUploadRecord(JSON.stringify(bare))).toEqual({
    ok: true,
    value: bare,
  });
});

test("what is not a record is refused, saying which field and why", () => {
  // Guards: text that is not JSON is named as such.
  expect(parseUploadRecord("{")).toEqual({
    ok: false,
    error: "it is not JSON",
  });
  // Guards: an unknown version, an unknown key and a bad hash each name their path.
  expect(
    parseUploadRecord(
      JSON.stringify({ ...RECORD, version: 2, sha256: "x", extra: 1 }),
    ),
  ).toEqual({
    ok: false,
    error:
      'version: Invalid input: expected 1; sha256: Invalid string: must match pattern /^[0-9a-f]{64}$/; the record: Unrecognized key: "extra"',
  });
});

test("md5 as hosts print it", () => {
  // Guards: the digest of the empty input, the one every md5 implementation agrees on.
  expect(md5Hex(new Uint8Array())).toBe("d41d8cd98f00b204e9800998ecf8427e");
});

test("drift: keys the paper prints that the upload lacked or held with another value, used keys only", () => {
  const current = new Map([
    ["nRepos", "64"],
    ["pctPass", "41.2\\%"],
    ["nNew", "7"],
    ["nUnused", "9"],
  ]);
  const used = new Set(["nRepos", "pctPass", "nNew"]);
  // Guards: a changed value, a new key, and an unused new key that does not count.
  expect(drift(RECORD.numbers, current, used)).toEqual({
    added: ["nNew"],
    changed: ["nRepos"],
  });
  // Guards: the paper as uploaded drifts nowhere.
  expect(
    drift(RECORD.numbers, new Map(Object.entries(RECORD.numbers)), used),
  ).toEqual({ added: [], changed: [] });
});
