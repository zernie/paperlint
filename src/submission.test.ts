/**
 * `paperlint submission` over in-memory files and a recording portal: where the portal and the
 * submission id come from, the refusals that name the file and key to set, the token rule, and what
 * `show` and `update` print and exit with. The HotCRP wire format is tested in the adapter.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { nodeFiles } from "./adapters/node/index.ts";
import type { Files } from "./ports/files.ts";
import { ok, err, type Result } from "./domain/result.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type {
  PortalFailure,
  SubmissionChange,
  SubmissionView,
  SupportedPortal,
  UpdateOutcome,
} from "./domain/submission.ts";
import { presetsDir } from "./package-dirs.ts";
import type { SubmissionPortal } from "./ports/submission-portal.ts";
import {
  failureText,
  runSubmission,
  submissionTarget,
  tokenFor,
  usageProblem,
  type SubmissionArgs,
} from "./submission.ts";
import { venuePreset } from "../test/support.ts";

const PAPER = "/w/papers/p";
const SITE = "http://127.0.0.1:9";
const PDF = new TextEncoder().encode("%PDF fake");
const HEX = sha256Hex(PDF);

/** The test's files, over the disk for what they do not hold: the shipped presets and their schema. */
const withPresets = (fs: Files): Files => ({
  ...fs,
  isFile: (p) => fs.isFile(p) || nodeFiles.isFile(p),
  readBytes: (p) => fs.readBytes(p) ?? nodeFiles.readBytes(p),
});

const venue = (portal: unknown): string =>
  JSON.stringify(venuePreset("venue", { extends: "paperlint:aidc", portal }));
const files = (o: {
  readonly portal?: unknown;
  readonly paper?: Readonly<Record<string, unknown>>;
  readonly extra?: Readonly<Record<string, string | Uint8Array>>;
}) =>
  memoryFiles({
    "/w/package.json": "{}",
    "/w/venue.jsonc": venue(o.portal ?? { kind: "hotcrp", url: `${SITE}/` }),
    [`${PAPER}/paperlint.json`]: JSON.stringify(
      o.paper ?? { extends: "../../venue.jsonc", submission: { id: 7 } },
    ),
    [`${PAPER}/paper.pdf`]: PDF,
    ...o.extra,
  });

const VIEW: SubmissionView = {
  id: 7,
  status: "submitted",
  title: "A Fake Title",
  paperType: "Regular",
  topics: ["A", "B"],
  abstract: "one two  three\nfour",
  pdf: {
    sha256: HEX,
    hash: `sha2-${HEX}`,
    size: PDF.length,
    mimetype: "application/pdf",
    uploadedAt: 0,
  },
  submittedAt: 60,
  modifiedAt: 120,
  messages: [],
};

interface Recorded {
  readonly portal: SupportedPortal;
  readonly token: string;
  readonly calls: unknown[];
}

const fakePortal = (answers: {
  readonly show?: Result<SubmissionView, PortalFailure>;
  readonly update?: Result<UpdateOutcome, PortalFailure>;
}) => {
  const seen: Recorded[] = [];
  const portalFor = (
    portal: SupportedPortal,
    token: string,
  ): SubmissionPortal => {
    const r: Recorded = { portal, token, calls: [] };
    seen.push(r);
    return {
      show: (id) => {
        r.calls.push(["show", id]);
        return Promise.resolve(answers.show ?? ok(VIEW));
      },
      update: (id, change: SubmissionChange, o) => {
        r.calls.push(["update", id, change, o]);
        return Promise.resolve(
          answers.update ??
            ok({
              httpStatus: 200,
              valid: true,
              changes: ["submission"],
              messages: [],
              dryRun: !o.save,
            }),
        );
      },
    };
  };
  return { seen, portalFor };
};

/** The line `update` prints before it sends `pdf`, naming `call`. */
const CHECK = (pdf: string, call: string): string =>
  `before you rely on it, open ${pdf} yourself and check it against ${call}: the page count and what counts toward the limit, the template and its class options, anonymity, and that every figure, table and reference renders — paperlint passing is not the venue accepting the format`;

const ARGS: SubmissionArgs = {
  sub: "show",
  paperDir: "papers/p",
  extra: [],
  pdf: null,
  abstract: null,
  submit: false,
  save: false,
};

async function run(
  a: Partial<SubmissionArgs>,
  o: {
    readonly files?: Files;
    readonly env?: Readonly<Record<string, string>>;
    readonly portal?: ReturnType<typeof fakePortal>;
  } = {},
) {
  const out: string[] = [];
  const errs: string[] = [];
  const portal = o.portal ?? fakePortal({});
  const fs = withPresets(o.files ?? files({}));
  const code = await runSubmission(
    { ...ARGS, ...a },
    {
      files: fs,
      presets: { files: fs, venuesDir: presetsDir() },
      cwd: "/w",
      env: (n) => (o.env ?? { HOTCRP_TOKEN: "hct_secret" })[n],
      portalFor: portal.portalFor,
      log: (l) => out.push(l),
      err: (l) => errs.push(l),
    },
  );
  return { code, out, errs, seen: portal.seen };
}

test("show: the portal from the preset, the id from the paper, the token from HOTCRP_TOKEN", async () => {
  const r = await run({});
  assert.equal(r.code, 0);
  assert.deepEqual(r.errs, []);
  assert.deepEqual(r.seen, [
    {
      portal: { kind: "hotcrp", url: SITE },
      token: "hct_secret",
      calls: [["show", 7]],
    },
  ]);
  assert.deepEqual(r.out, [
    `submission 7 on ${SITE} (hotcrp)`,
    "status        submitted, submitted 1970-01-01T00:01:00.000Z",
    "title         A Fake Title",
    "paper type    Regular",
    "topics        A; B",
    "abstract      4 words",
    `portal PDF    sha2-${HEX}, ${String(PDF.length)} bytes, uploaded 1970-01-01T00:00:00.000Z`,
    `local PDF     papers/p/paper.pdf sha2-${HEX}`,
    "match         yes — the portal holds this build",
  ]);
  // Guards: the token is an input to the adapter and nothing printed carries it.
  assert.doesNotMatch([...r.out, ...r.errs].join("\n"), /hct_secret/);
});

test("show: a different PDF on the portal is reported as NO, and still exits 0", async () => {
  const other = {
    ...VIEW,
    pdf: VIEW.pdf && { ...VIEW.pdf, sha256: sha256Hex(new Uint8Array([1])) },
  };
  const r = await run({}, { portal: fakePortal({ show: ok(other) }) });
  assert.equal(r.code, 0);
  assert.equal(
    r.out.at(-1),
    "match         NO — the portal holds a different PDF than the local one",
  );
});

test("show: no PDF on the portal, a hash that is not sha256, no local PDF, portal messages", async () => {
  const bare: SubmissionView = {
    ...VIEW,
    title: null,
    paperType: null,
    topics: [],
    abstract: null,
    pdf: null,
    submittedAt: null,
    messages: [
      { message: "Not yet submitted", field: "status", status: 1 },
      { message: "Draft", field: null, status: null },
    ],
  };
  const r1 = await run({}, { portal: fakePortal({ show: ok(bare) }) });
  assert.deepEqual(r1.out.slice(1), [
    "status        submitted",
    "title         —",
    "paper type    —",
    "topics        —",
    "abstract      —",
    "portal PDF    none",
    `local PDF     papers/p/paper.pdf sha2-${HEX}`,
    "match         NO — the portal holds no PDF",
    "  portal says: status: Not yet submitted",
    "  portal says: Draft",
  ]);
  const sha1 = {
    ...VIEW,
    pdf: {
      hash: "sha1-abc",
      sha256: null,
      size: null,
      mimetype: null,
      uploadedAt: null,
    },
  };
  const r2 = await run({}, { portal: fakePortal({ show: ok(sha1) }) });
  assert.equal(r2.out[6], "portal PDF    sha1-abc, ? bytes, uploaded —");
  assert.equal(
    r2.out[8],
    "match         unknown — the portal names a sha1 hash, not a sha256",
  );
  const r4 = await run({ pdf: "/elsewhere/x.pdf" });
  assert.equal(r4.out[7], "local PDF     /elsewhere/x.pdf (missing)");
  const r3 = await run({ pdf: "missing.pdf" });
  assert.equal(r3.out[7], "local PDF     missing.pdf (missing)");
  assert.equal(r3.out[8], "match         unknown — no local PDF to compare");
});

test("🔴 the portal's refusal is printed with its own message, exit 1", async () => {
  const refused = err<PortalFailure>({
    kind: "refused",
    httpStatus: 401,
    messages: [{ message: "Missing credentials", field: null, status: 2 }],
  });
  const r = await run({}, { portal: fakePortal({ show: refused }) });
  assert.equal(r.code, 1);
  assert.deepEqual(r.errs, [
    "the portal refused (HTTP 401): Missing credentials",
  ]);
});

test("failureText: each failure in words", () => {
  assert.equal(
    failureText({ kind: "refused", httpStatus: 500, messages: [] }),
    "the portal refused (HTTP 500)",
  );
  assert.equal(
    failureText({ kind: "unreachable", detail: "fetch failed" }),
    "the portal cannot be reached: fetch failed",
  );
  assert.equal(
    failureText({
      kind: "malformed",
      httpStatus: 200,
      detail: "the answer is not JSON (text/html)",
    }),
    "the portal answered HTTP 200, but not as its API does: the answer is not JSON (text/html)",
  );
});

test("update: a dry run by default — the paper's PDF sent, nothing saved, exit 0", async () => {
  const r = await run({ sub: "update" });
  assert.equal(r.code, 0);
  assert.deepEqual(r.seen[0]?.calls, [
    [
      "update",
      7,
      { pdf: { name: "paper.pdf", bytes: PDF }, abstract: null, submit: false },
      { save: false },
    ],
  ]);
  assert.deepEqual(r.out, [
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
    "dry run — the portal checked the change and kept nothing; --save sends it for real",
    "HTTP          200",
    "valid         yes",
    "changes       submission",
    `local PDF     papers/p/paper.pdf sha2-${HEX}`,
  ]);
});

test("update --save --submit --abstract --pdf: all of it sent, and said to be saved", async () => {
  const fs = files({
    extra: { "/w/abs.txt": "  The abstract.\n", "/w/other.pdf": PDF },
  });
  const r = await run(
    {
      sub: "update",
      save: true,
      submit: true,
      abstract: "abs.txt",
      pdf: "other.pdf",
    },
    { files: fs },
  );
  assert.equal(r.code, 0);
  assert.deepEqual(r.seen[0]?.calls, [
    [
      "update",
      7,
      {
        pdf: { name: "other.pdf", bytes: PDF },
        abstract: "The abstract.",
        submit: true,
      },
      { save: true },
    ],
  ]);
  // Guards: the PDF that is sent is the one named, and --save is told to check it too.
  assert.deepEqual(r.out.slice(0, 2), [
    CHECK("other.pdf", "the call for papers, https://example.org/cfp"),
    "saved",
  ]);
});

test("🔴 update: the check line names the venue's call from the preset's `url`; a preset that names no venue gets the generic line", async () => {
  const family = memoryFiles({
    "/w/package.json": "{}",
    "/w/house.jsonc": JSON.stringify({
      type: "family",
      extends: "paperlint:ieee-conference",
      portal: { kind: "hotcrp", url: `${SITE}/` },
    }),
    [`${PAPER}/paperlint.json`]: JSON.stringify({
      extends: "../../house.jsonc",
      submission: { id: 7 },
    }),
    [`${PAPER}/paper.pdf`]: PDF,
  });
  const r = await run({ sub: "update" }, { files: family });
  assert.equal(r.code, 0);
  assert.equal(
    r.out[0],
    CHECK("papers/p/paper.pdf", "the venue's call for papers"),
  );
});

test("show sends nothing, so it asks for no check", async () => {
  const r = await run({});
  assert.equal(
    r.out.some((l) => l.includes("call for papers")),
    false,
  );
});

test("update: valid:false, or a non-2xx status, exits 1 with the portal's messages", async () => {
  const invalid = ok<UpdateOutcome>({
    httpStatus: 200,
    valid: false,
    changes: [],
    messages: [{ message: "Bad PDF", field: "submission", status: 2 }],
    dryRun: true,
  });
  const r1 = await run(
    { sub: "update" },
    { portal: fakePortal({ update: invalid }) },
  );
  assert.equal(r1.code, 1);
  assert.deepEqual(r1.out.slice(3), [
    "valid         NO",
    "changes       —",
    `local PDF     papers/p/paper.pdf sha2-${HEX}`,
    "  portal says: submission: Bad PDF",
  ]);
  const status = ok<UpdateOutcome>({
    httpStatus: 400,
    valid: true,
    changes: [],
    messages: [],
    dryRun: false,
  });
  assert.equal(
    (await run({ sub: "update" }, { portal: fakePortal({ update: status }) }))
      .code,
    1,
  );
  const unreachable = err<PortalFailure>({
    kind: "unreachable",
    detail: "down",
  });
  const r3 = await run(
    { sub: "update" },
    { portal: fakePortal({ update: unreachable }) },
  );
  assert.equal(r3.code, 1);
  assert.deepEqual(r3.errs, ["the portal cannot be reached: down"]);
});

test("update --save that the portal withheld says so", async () => {
  const withheld = ok<UpdateOutcome>({
    httpStatus: 200,
    valid: true,
    changes: [],
    messages: [],
    dryRun: true,
  });
  const r = await run(
    { sub: "update", save: true },
    { portal: fakePortal({ update: withheld }) },
  );
  assert.equal(r.out[1], "SAVE WITHHELD by the portal — nothing changed");
});

test("update: no PDF to send, or no abstract file, is refused before the portal is asked", async () => {
  const r1 = await run({ sub: "update", pdf: "nope.pdf" });
  assert.equal(r1.code, 2);
  assert.deepEqual(r1.errs, [
    "no PDF at nope.pdf — build the paper, or name one with --pdf",
  ]);
  assert.deepEqual(r1.seen[0]?.calls, []);
  const r2 = await run({ sub: "update", abstract: "nope.txt" });
  assert.equal(r2.code, 2);
  assert.deepEqual(r2.errs, ["--abstract: no file at nope.txt"]);
});

test("🔴 no token: the variable is named, with where to make one — and nothing is called", async () => {
  const r = await run({}, { env: {} });
  assert.equal(r.code, 2);
  assert.deepEqual(r.seen, []);
  assert.match(
    r.errs[0] ?? "",
    /^HOTCRP_TOKEN is not set — .*Account settings → Developer/,
  );
  assert.deepEqual(
    tokenFor({ kind: "hotcrp", url: SITE }, () => "  "),
    {
      ok: false,
      error: r.errs[0],
    },
  );
});

test("🔴 the file and key to set: no portal in the preset, no submission in the paper, no preset", () => {
  const deps = (fs: Files) => ({
    files: withPresets(fs),
    venuesDir: presetsDir(),
  });
  const noPortal = memoryFiles({
    "/w/package.json": "{}",
    [`${PAPER}/paperlint.json`]: JSON.stringify({
      extends: "paperlint:ieee-conference",
      submission: { id: 7 },
    }),
  });
  const t1 = submissionTarget(PAPER, deps(noPortal));
  assert.match(
    !t1.ok ? t1.error : "",
    /^the venue preset declares no "portal" \(read: .*ieee-conference\.jsonc\) — add "portal": \{ "kind": "hotcrp"/,
  );
  const noId = files({ paper: { extends: "../../venue.jsonc" } });
  assert.deepEqual(submissionTarget(PAPER, deps(noId)), {
    ok: false,
    error: `${PAPER}/paperlint.json: no "submission" — add "submission": { "id": <the submission number on ${SITE}/> }`,
  });
  const noExtends = files({ paper: { submission: { id: 7 } } });
  const t3 = submissionTarget(PAPER, deps(noExtends));
  assert.match(!t3.ok ? t3.error : "", /paperlint\.json: no "extends"/);
  // With cycles, `extends` beside them is refused: the message names the cycle, not the key.
  const named = files({
    paper: {
      cycles: [
        {
          id: "secdev-2027",
          venue: {
            kind: "named",
            name: "SecDev 2027",
            url: "https://x.example",
          },
          opened: "2027-01-10",
          submission: { id: 3 },
        },
      ],
    },
  });
  const t5 = submissionTarget(PAPER, deps(named));
  assert.equal(
    !t5.ok ? t5.error : "",
    `${PAPER}/paperlint.json: the current cycle names no venue preset, and the preset is what declares the portal — set the venue in the current cycle ("venue": { "kind": "preset", "extends": "paperlint:…" }), or upload by hand`,
  );
  const broken = files({
    paper: { extends: "../../venue.jsonc", submission: { id: "7" } },
  });
  const t4 = submissionTarget(PAPER, deps(broken));
  assert.match(!t4.ok ? t4.error : "", /"submission" must be \{ "id"/);
});

test("🔴 an unknown portal kind is refused: upload by hand", async () => {
  const r = await run(
    {},
    { files: files({ portal: { kind: "easychair", url: "https://x.test" } }) },
  );
  assert.equal(r.code, 2);
  assert.deepEqual(r.errs, [
    `portal kind "easychair" is not supported; upload by hand`,
  ]);
  assert.deepEqual(r.seen, []);
});

test("the shipped aidc preset declares its HotCRP portal", () => {
  const fs = memoryFiles({
    "/w/package.json": "{}",
    [`${PAPER}/paperlint.json`]: JSON.stringify({
      extends: "paperlint:aidc",
      submission: { id: 7 },
    }),
  });
  const t = submissionTarget(PAPER, {
    files: withPresets(fs),
    venuesDir: presetsDir(),
  });
  assert.equal(t.ok && t.value.portal.kind, "hotcrp");
  assert.match(t.ok ? t.value.portal.url : "", /^https:\/\//);
});

test("usage: refused before anything is read, exit 2", async () => {
  const r = await run({ sub: "upload" });
  assert.equal(r.code, 2);
  assert.deepEqual(r.seen, []);
  assert.match(r.errs[0] ?? "", /got `upload`/);
});

test("usage: a subcommand is required, one paper folder, update-only flags refused on show", () => {
  assert.match(
    usageProblem({ ...ARGS, sub: undefined }) ?? "",
    /needs a subcommand: show or update — got ``/,
  );
  assert.match(usageProblem({ ...ARGS, sub: "upload" }) ?? "", /got `upload`/);
  assert.equal(
    usageProblem({ ...ARGS, extra: ["x"] }),
    "`submission show` takes one paper folder — got also `x`",
  );
  assert.equal(
    usageProblem({ ...ARGS, save: true, submit: true, abstract: "a" }),
    "--abstract, --submit, --save: only `submission update` changes anything; `show` reads",
  );
  assert.equal(usageProblem({ ...ARGS, sub: "update", save: true }), null);
});
