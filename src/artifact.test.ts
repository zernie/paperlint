/**
 * `paperlint artifact record|upload|show` (`src/artifact.ts`) over files in memory and a fake host:
 * what each prints, what lands on disk, what the host is asked. The OSF adapter itself is tested
 * against its cassette (`src/adapters/osf/host.test.ts`).
 */
import { omit } from "remeda";
import { expect, test } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { callerPath } from "./caller-path.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { neverSiteOnly, runArtifact, type ArtifactInput } from "./artifact.ts";
import {
  md5Hex,
  uploadRecordText,
  type UploadRecord,
} from "./domain/artifact-upload.ts";
import { isRecord } from "./domain/record.ts";
import { err, ok } from "./domain/result.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { ArtifactHost, HostedFile } from "./ports/artifact-host.ts";

const CWD = "/work/papers/p";
const ZIP = new TextEncoder().encode("artifact bytes\n");
const SHA = sha256Hex(ZIP);
const MD5 = md5Hex(ZIP);
const NOW = "2026-11-21T10:00:00.000Z";
const ON = JSON.stringify({
  rules: { "artifact/upload-current": ["warn", { numbers: "numbersdef.tex" }] },
});
const PAPER: Readonly<Record<string, string | Uint8Array>> = {
  [`${CWD}/artifact.zip`]: ZIP,
  [`${CWD}/numbersdef.tex`]: "\\newcommand{\\nRepos}{64}\n",
  [`${CWD}/paperlint.json`]: ON,
};
const RECORD_AT = `${CWD}/submission/artifact-upload.json`;
const HOSTED: HostedFile = {
  id: "f1",
  url: "https://h.example/f1",
  sha256: SHA,
  md5: MD5,
};

/** A host that holds `held`, recording what it was asked. */
function fakeHost(
  held: Result,
  asked: string[],
  can: ArtifactHost["can"] = { upload: true, hashes: ["sha256", "md5"] },
): ArtifactHost {
  return {
    can,
    token: {
      variable: "H_TOKEN_H",
      siteLess: "H_TOKEN",
      help: "h.example/tokens",
    },
    targetOf: (url) => (url.startsWith("https://h.example/") ? "proj" : null),
    read: (where, token) => {
      asked.push(`read ${where.file} ${String(where.id)} ${String(token)}`);
      return Promise.resolve(held);
    },
    upload: (u, token) => {
      asked.push(
        `upload ${u.target} ${u.name} ${String(u.bytes.length)} ${token}`,
      );
      return Promise.resolve(held);
    },
  };
}
type Result = Awaited<ReturnType<ArtifactHost["read"]>>;

const input = (i: Partial<ArtifactInput>): ArtifactInput => ({
  sub: undefined,
  operands: [],
  url: null,
  host: null,
  to: null,
  node: null,
  numbers: null,
  save: false,
  ...i,
});

/** `artifact/upload-current` in a paperlint.json's `rules` object; undefined for anything else. */
const entryIn = (text: string | Uint8Array | undefined): unknown => {
  const json = typeof text === "string" ? jsonOrText(text) : undefined;
  const rules = isRecord(json) ? json["rules"] : undefined;
  return isRecord(rules) ? rules["artifact/upload-current"] : undefined;
};

/** The record file as JSON, or its text when it is not JSON (a broken record planted by a test). */
const jsonOrText = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

async function run(
  i: Partial<ArtifactInput>,
  tree: Readonly<Record<string, string | Uint8Array>> = PAPER,
  o: {
    readonly held?: Result;
    readonly env?: Readonly<Record<string, string>>;
    readonly can?: Parameters<typeof fakeHost>[2];
  } = {},
) {
  const files = memoryFiles(tree);
  const out: string[] = [];
  const asked: string[] = [];
  const code = await runArtifact(input(i), {
    files,
    codec: sourcesCodec,
    latex: latexReader,
    hosts: { h: fakeHost(o.held ?? ok(HOSTED), asked, o.can) },
    // The rule's entry as lint's config would give it: here, from the paper's own `rules` object.
    ruleEntry: (dir) => Promise.resolve(entryIn(tree[`${dir}/paperlint.json`])),
    env: (n) => o.env?.[n],
    now: () => NOW,
    cwd: CWD,
    log: (l) => out.push(l),
    err: (l) => out.push(`ERR ${l}`),
  });
  const written = files.readBytes(callerPath(RECORD_AT));
  return {
    code,
    out,
    asked,
    record:
      written === null ? null : jsonOrText(new TextDecoder().decode(written)),
  };
}

const RECORD: UploadRecord = {
  version: 1,
  host: "other",
  url: "https://example.org/a.zip",
  file: "artifact.zip",
  sha256: SHA,
  md5: MD5,
  uploadedAt: NOW,
  numbers: { nRepos: "64" },
};

test("record: hashes the zip, snapshots the numbers, writes the record; the rule's options name the file", async () => {
  const r = await run({
    sub: "record",
    operands: ["artifact.zip"],
    url: RECORD.url,
  });
  // Guards: the whole record on disk, and what is printed about it.
  expect(r).toEqual({
    code: 0,
    asked: [],
    record: RECORD,
    out: [
      `wrote ${RECORD_AT}`,
      "  other https://example.org/a.zip",
      `  artifact.zip sha256 ${SHA} md5 ${MD5}`,
      "  1 numbers from the numbers file, as they are now",
    ],
  });
  // Guards: a url the host's adapter knows names that host; --host and --numbers win.
  const h = await run({
    sub: "record",
    operands: ["artifact.zip", "."],
    url: "https://h.example/x",
  });
  expect(h.record).toEqual({
    ...RECORD,
    host: "h",
    url: "https://h.example/x",
  });
  const own = await run(
    {
      sub: "record",
      operands: ["artifact.zip"],
      url: RECORD.url,
      host: "zenodo",
      numbers: "n2.tex",
    },
    {
      ...PAPER,
      [`${CWD}/n2.tex`]: "\\def\\k{1}",
      [`${CWD}/paperlint.json`]: "{}",
    },
  );
  expect(own.record).toEqual({
    ...RECORD,
    host: "zenodo",
    numbers: { k: "1" },
  });
});

test("record: refuses, saying why, and writes nothing", async () => {
  const why = async (i: Partial<ArtifactInput>, tree = PAPER) => {
    const r = await run({ sub: "record", url: RECORD.url, ...i }, tree);
    return [r.code, r.record, r.out];
  };
  // Guards: each missing input is named, exit 2, no record.
  expect(await why({})).toEqual([
    2,
    null,
    [
      "ERR paperlint artifact: name the uploaded file: paperlint artifact record <zip> …",
    ],
  ]);
  expect(await why({ operands: ["gone.zip"] })).toEqual([
    2,
    null,
    ["ERR paperlint artifact: no file gone.zip"],
  ]);
  expect(await why({ operands: ["artifact.zip"], url: null })).toEqual([
    2,
    null,
    ["ERR paperlint artifact: where is it? pass --url <url>"],
  ]);
  expect(await why({ operands: ["artifact.zip"], url: "not a url" })).toEqual([
    2,
    null,
    ["ERR paperlint artifact: not written — url: Invalid URL"],
  ]);
  const noRule = {
    ...PAPER,
    [`${CWD}/paperlint.json`]: JSON.stringify({ rules: [] }),
  };
  expect(await why({ operands: ["artifact.zip"] }, noRule)).toEqual([
    2,
    null,
    [
      `ERR paperlint artifact: which file holds the paper's numbers? pass --numbers <file> (relative to the paper), or turn artifact/upload-current on with its "numbers" option`,
    ],
  ]);
  expect(
    await why({ operands: ["artifact.zip"], numbers: "gone.tex" }),
  ).toEqual([
    2,
    null,
    [`ERR paperlint artifact: no numbers file gone.tex in ${CWD}`],
  ]);
  expect(
    await why(
      { operands: ["artifact.zip"] },
      { ...PAPER, [`${CWD}/numbersdef.tex`]: "" },
    ),
  ).toEqual([
    2,
    null,
    [
      "ERR paperlint artifact: the numbers file numbersdef.tex defines no macro without arguments (\\newcommand{\\key}{value})",
    ],
  ]);
});

const UPLOAD = {
  sub: "upload",
  operands: ["artifact.zip"],
  to: "h",
  node: "proj",
} as const;
const PLAN = [
  `upload artifact.zip (15 bytes, sha256 ${SHA}) to h project proj`,
  `then write ${RECORD_AT} with the host's hashes and 1 numbers`,
];

test("upload: a dry run by default — it says what it would do and touches nothing", async () => {
  // Guards: no request, no record; the token's presence is said, never its value.
  expect(await run(UPLOAD, PAPER, { env: { H_TOKEN_H: "secret" } })).toEqual({
    code: 0,
    asked: [],
    record: null,
    out: [
      ...PLAN,
      "token: H_TOKEN_H is set",
      "DRY RUN: nothing uploaded, nothing written. Run again with --save to upload.",
    ],
  });
  const none = await run(UPLOAD, PAPER, { env: { H_TOKEN: "old" } });
  // Guards: without its variable, the dry run says how to make one, and names the site-less one as unread.
  expect(none.out.slice(2)).toEqual([
    "H_TOKEN is set but not read: set H_TOKEN_H instead\n  1. make one: h.example/tokens\n  2. set it in your environment — never paste it into a chat: export H_TOKEN_H=<the token>",
    "DRY RUN: nothing uploaded, nothing written. Run again with --save to upload.",
  ]);
});

test("upload --save: uploads, then writes the record with the host's id, url and hashes", async () => {
  const r = await run({ ...UPLOAD, save: true }, PAPER, {
    env: { H_TOKEN_H: "secret" },
  });
  // Guards: one upload with the token, the record holding what the host said; the token printed nowhere.
  expect(r.asked).toEqual(["upload proj artifact.zip 15 secret"]);
  expect(r.record).toEqual({ ...RECORD, host: "h", url: HOSTED.url, id: "f1" });
  expect(r.out.join("\n")).not.toContain("secret");
  const noHash = await run({ ...UPLOAD, save: true }, PAPER, {
    env: { H_TOKEN_H: "t" },
    held: ok({ ...HOSTED, sha256: null, md5: null }),
  });
  // Guards: a host that gives no hash back leaves them out rather than inventing them.
  expect(noHash.record).toEqual({
    ...RECORD,
    host: "h",
    url: HOSTED.url,
    id: "f1",
    sha256: undefined,
    md5: undefined,
  });
});

/** An upload's exit code, how many requests, whether no record was written, and its last line. */
const code = async (
  i: Partial<ArtifactInput>,
  o: Parameters<typeof run>[2] = {},
  tree = PAPER,
) => {
  const r = await run({ ...UPLOAD, ...i }, tree, o);
  return [r.code, r.asked.length, r.record === null, r.out.at(-1)];
};

test("upload: what stops it before the host", async () => {
  // Guards: an unknown host, one that cannot upload, no project — refused before anything.
  expect(await code({ to: "zenodo" })).toEqual([
    2,
    0,
    true,
    "ERR paperlint artifact: name a host paperlint uploads to: --to h (for any other host, upload it yourself and run `paperlint artifact record <zip> --url <url>`)",
  ]);
  expect(await code({}, { can: { upload: false, hashes: [] } })).toEqual([
    2,
    0,
    true,
    expect.stringContaining("name a host"),
  ]);
  expect(await code({ node: null })).toEqual([
    2,
    0,
    true,
    "ERR paperlint artifact: which project? pass --node <id> (the project's id in its url)",
  ]);
  expect(await code({ operands: [] })).toEqual([
    2,
    0,
    true,
    "ERR paperlint artifact: name the uploaded file: paperlint artifact upload <zip> …",
  ]);
  // Guards: the project comes from an earlier record's url when --node is not given.
  const before = {
    ...PAPER,
    [RECORD_AT]: uploadRecordText({ ...RECORD, url: "https://h.example/f0" }),
  };
  expect((await code({ node: null }, {}, before))[0]).toBe(0);
});

test("upload: what stops it at the host", async () => {
  // Guards: --save without a token, a failed upload, other bytes on the host.
  expect(await code({ save: true })).toEqual([
    2,
    0,
    true,
    expect.stringContaining("no token: H_TOKEN_H is not set"),
  ]);
  const env = { H_TOKEN_H: "t" };
  expect(
    await code(
      { save: true },
      { env, held: err({ kind: "refused", detail: "HTTP 403" }) },
    ),
  ).toEqual([
    2,
    1,
    true,
    "ERR paperlint artifact: upload failed (refused): HTTP 403",
  ]);
  expect(
    await code(
      { save: true },
      { env, held: ok({ ...HOSTED, sha256: "0".repeat(64) }) },
    ),
  ).toEqual([
    1,
    1,
    true,
    `ERR paperlint artifact: h holds sha256 ${"0".repeat(64)}, not the ${SHA} sent; no record written`,
  ]);
});

const WITH_RECORD = (r: Partial<UploadRecord>) => ({
  ...PAPER,
  [RECORD_AT]: uploadRecordText({ ...RECORD, ...r }),
});

test("show: the record, and match yes or no against the host's hashes", async () => {
  const tree = WITH_RECORD({ host: "h", url: HOSTED.url, id: "f1" });
  const yes = await run({ sub: "show" }, tree, { env: { H_TOKEN_H: "t" } });
  // Guards: the record, the host's hashes, `match yes`, exit 0; the token handed to the read.
  expect(yes).toEqual({
    code: 0,
    asked: ["read artifact.zip f1 t"],
    record: { ...RECORD, host: "h", url: HOSTED.url, id: "f1" },
    out: [
      `h ${HOSTED.url}`,
      `  artifact.zip, uploaded ${NOW}, 1 numbers`,
      `  record: sha256 ${SHA} md5 ${MD5}`,
      `  host:   sha256 ${SHA}`,
      `  host:   md5 ${MD5}`,
      "match yes",
    ],
  });
  const no = await run({ sub: "show", operands: ["."] }, tree, {
    held: ok({ ...HOSTED, md5: "1".repeat(32) }),
  });
  // Guards: one differing hash is `match no`, exit 1; without a token the read gets none.
  expect([no.code, no.asked, no.out.at(-1)]).toEqual([
    1,
    ["read artifact.zip f1 null"],
    "match no",
  ]);
  const unknown = await run({ sub: "show" }, tree, {
    held: ok({ ...HOSTED, sha256: null, md5: null }),
  });
  // Guards: nothing to compare is said, not called a match.
  expect(unknown.out.at(-1)).toBe(
    "match unknown: the record holds no hash the host gives",
  );
});

test("show: a host paperlint cannot check, and what stops it", async () => {
  const other = await run({ sub: "show" }, WITH_RECORD({}));
  // Guards: a host with no adapter says so, prints the record's own hashes, and asks nothing.
  expect([other.code, other.asked, other.out.at(-1)]).toEqual([
    0,
    [],
    "paperlint cannot read hashes from other: the record's own are above; compare them on the host's page",
  ]);
  const blind = await run({ sub: "show" }, WITH_RECORD({ host: "h" }), {
    can: { upload: true, hashes: [] },
  });
  // Guards: an adapter that reads no hash is the same.
  expect(blind.asked).toEqual([]);
  // Guards: no record, a broken one, a failed read.
  expect((await run({ sub: "show" })).out).toEqual([
    `ERR paperlint artifact: no upload record ${RECORD_AT}: write one with \`paperlint artifact record <zip> --url <url>\``,
  ]);
  expect(
    (await run({ sub: "show" }, { ...PAPER, [RECORD_AT]: "{" })).out,
  ).toEqual([
    `ERR paperlint artifact: the upload record ${RECORD_AT} cannot be read: it is not JSON`,
  ]);
  const down = await run({ sub: "show" }, WITH_RECORD({ host: "h" }), {
    held: err({ kind: "unreachable", detail: "ECONNREFUSED" }),
  });
  expect([down.code, down.out.at(-1)]).toEqual([
    2,
    "ERR paperlint artifact: could not read the file on h (unreachable): ECONNREFUSED",
  ]);
});

test("no subcommand, or an unknown one, names the three", async () => {
  // Guards: exit 2 and the list.
  expect((await run({})).out).toEqual([
    "ERR paperlint artifact: no subcommand: record | upload | show",
  ]);
  expect((await run({ sub: "pack" })).code).toBe(2);
});

test("a host's token is never one site's only: the shared-variable policy of portal-token.ts does not apply", () => {
  // Guards: the one answer lookUpToken could ask of it.
  expect(neverSiteOnly()).toBe(false);
});

test("the paper's settings: none, or broken — the numbers come from --numbers alone; no --to names the hosts", async () => {
  const bare = omit(PAPER, [`${CWD}/paperlint.json`]);
  const opts = {
    sub: "record",
    operands: ["artifact.zip"],
    url: RECORD.url,
    numbers: "numbersdef.tex",
  };
  // Guards: no paperlint.json, and one that does not parse, still record with --numbers.
  expect((await run(opts, bare)).record).toEqual(RECORD);
  expect(
    (await run(opts, { ...PAPER, [`${CWD}/paperlint.json`]: "{" })).record,
  ).toEqual(RECORD);
  // Guards: an upload without --to is refused naming the hosts.
  expect((await code({ to: null }))[3]).toEqual(
    expect.stringContaining("--to h"),
  );
  const bareRecord = omit(RECORD, ["sha256", "md5"]);
  const shown = await run(
    { sub: "show" },
    { ...PAPER, [RECORD_AT]: uploadRecordText(bareRecord) },
  );
  // Guards: a record without hashes shows dashes for them.
  expect(shown.out[2]).toBe("  record: sha256 — md5 —");
});
