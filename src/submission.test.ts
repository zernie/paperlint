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
import { absolutePath } from "./domain/paths.ts";
import { latexReader } from "./adapters/latex/index.ts";
import type {
  CreateOutcome,
  NewSubmission,
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
  deadlineLine,
  submissionTarget,
  titleOf,
  tokenProblemLines,
  tokenRefusedLines,
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

/** A venue over aidc's format with a portal of its own — so none of aidc's deadline readings. */
const venue = (portal: unknown): string =>
  JSON.stringify(
    venuePreset("venue", { extends: "paperlint:aidc", portal, deadlines: [] }),
  );
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
  readonly create?: Result<CreateOutcome, PortalFailure>;
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
      create: (paper: NewSubmission, o) => {
        r.calls.push(["create", paper, o]);
        return Promise.resolve(
          answers.create ??
            ok({
              httpStatus: 200,
              valid: true,
              changes: ["new", "title", "abstract", "authors", "submission"],
              messages: [],
              dryRun: !o.save,
              id: o.save ? 42 : null,
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
    readonly cwd?: string;
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
      cwd: o.cwd ?? "/w",
      env: (n) => (o.env ?? { HOTCRP_TOKEN_127: "hct_secret" })[n],
      portalFor: portal.portalFor,
      latex: latexReader,
      log: (l) => out.push(l),
      err: (l) => errs.push(l),
    },
  );
  return { code, out, errs, seen: portal.seen };
}

test("show: the portal from the preset, the id from the paper, the token from the site's variable", async () => {
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
    "HOTCRP_TOKEN_127 was used; it may belong to another hotcrp site (tokens are per site), or be revoked or expired",
    ...STEPS,
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

/** The steps every token message ends with, for the test site. */
const STEPS = [
  `  1. create a token on this site: ${SITE}/profile?t=developer (Account settings → Developer → API tokens), with the scopes submeta:read and document:read (show), submeta:write and document:write (update, new) — tick all four to use every subcommand`,
  "  2. set it in your environment — never paste it into a chat: export HOTCRP_TOKEN_127=<the token>",
  "  tokens are per hotcrp site: HOTCRP_TOKEN_127 is read for 127.0.0.1 alone, so two venues take two variables",
];

test("🔴 no token: the site's variable is named, with this site's token page, the scopes and the export — and nothing is called", async () => {
  const r = await run({}, { env: {} });
  assert.equal(r.code, 2);
  assert.deepEqual(r.seen, []);
  assert.deepEqual(r.errs, [
    `no hotcrp token for ${SITE}: HOTCRP_TOKEN_127 is not set`,
    ...STEPS,
  ]);
});

test("🔴 only the site-less HOTCRP_TOKEN set: the rename instruction, and nothing is sent with it", async () => {
  const r = await run(
    { sub: "update", save: true },
    { env: { HOTCRP_TOKEN: "hct_old" } },
  );
  assert.equal(r.code, 2);
  assert.deepEqual(r.seen, []);
  assert.deepEqual(r.errs, [
    "HOTCRP_TOKEN is no longer read: tokens are per hotcrp site. If it was made on 127.0.0.1, rename it to HOTCRP_TOKEN_127; if it was made on another site, rename it to that site's variable (HOTCRP_TOKEN_<LABEL>) and create a token here:",
    ...STEPS,
  ]);
  assert.doesNotMatch(r.errs.join("\n"), /hct_old/);
});

test("the site's variable set beside a site-less one: the site's token is the one used", async () => {
  const r = await run(
    {},
    { env: { HOTCRP_TOKEN_127: "hct_site", HOTCRP_TOKEN: "hct_old" } },
  );
  assert.equal(r.code, 0);
  assert.equal(r.seen[0]?.token, "hct_site");
});

test("🔴 a 401 from the portal: the portal's words, which variable was used, and how to make this site's token", async () => {
  const refused = err({
    kind: "refused" as const,
    httpStatus: 401,
    messages: [{ message: "Unauthorized", field: null, status: 2 }],
  });
  for (const sub of ["show", "update", "new"] as const) {
    const r = await run(
      { sub },
      {
        portal: fakePortal({ show: refused, update: refused, create: refused }),
        files: sub === "new" ? newFiles({}) : files({}),
      },
    );
    assert.equal(r.code, 1, sub);
    assert.deepEqual(r.errs, [
      "the portal refused (HTTP 401): Unauthorized",
      "HOTCRP_TOKEN_127 was used; it may belong to another hotcrp site (tokens are per site), or be revoked or expired",
      ...STEPS,
    ]);
  }
});

test("a 403 names a missing scope; any other failure says nothing about the token", () => {
  const portal = { kind: "hotcrp", url: SITE } as const;
  const f = (httpStatus: number) =>
    ({ kind: "refused", httpStatus, messages: [] }) as const;
  assert.deepEqual(tokenRefusedLines(portal, "HOTCRP_TOKEN_127", f(403)), [
    "HOTCRP_TOKEN_127 was used; the site turned the request away — the token may lack a scope this subcommand needs",
    ...STEPS,
  ]);
  assert.deepEqual(tokenRefusedLines(portal, "HOTCRP_TOKEN_127", f(500)), []);
  assert.deepEqual(
    tokenRefusedLines(portal, "HOTCRP_TOKEN_127", {
      kind: "unreachable",
      detail: "x",
    }),
    [],
  );
  assert.deepEqual(
    tokenProblemLines(portal, {
      kind: "missing",
      variable: "HOTCRP_TOKEN_127",
    }),
    [`no hotcrp token for ${SITE}: HOTCRP_TOKEN_127 is not set`, ...STEPS],
  );
});

test("🔴 the file and key to set: no portal in the preset, no submission in the paper, no preset", async () => {
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
  for (const sub of ["show", "update"] as const) {
    const r = await run({ sub }, { files: noId });
    assert.equal(r.code, 2);
    assert.deepEqual(r.seen, []);
    assert.deepEqual(r.errs, [
      `${PAPER}/paperlint.json: no "submission" — add "submission": { "id": <the submission number on ${SITE}> }, or create the submission with \`paperlint submission new\``,
    ]);
  }
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
    /needs a subcommand: new or show or update — got ``/,
  );
  assert.match(usageProblem({ ...ARGS, sub: "upload" }) ?? "", /got `upload`/);
  assert.equal(
    usageProblem({ ...ARGS, extra: ["x"] }),
    "`submission show` takes one paper folder — got also `x`",
  );
  assert.equal(
    usageProblem({ ...ARGS, save: true, submit: true, abstract: "a" }),
    "--abstract, --submit, --save: only `submission new` and `submission update` change anything; `show` reads",
  );
  assert.equal(usageProblem({ ...ARGS, sub: "update", save: true }), null);
  assert.equal(
    usageProblem({ ...ARGS, sub: "new", save: true, abstract: "a" }),
    null,
  );
  assert.equal(
    usageProblem({ ...ARGS, sub: "new", submit: true }),
    "--submit: `submission new` creates the submission; mark it submitted with `submission update --submit` once `show` says the portal holds this build",
  );
});

test("show prints the current attempt's deadlines in force: the preset's portal readings, the paper's call readings and override over them", () => {
  const fs = memoryFiles({
    "/w/package.json": "{}",
    [`${PAPER}/paperlint.json`]: JSON.stringify({
      cycles: [
        {
          id: "msr-2027",
          venue: { kind: "preset", extends: "paperlint:msr" },
          kind: "technical",
          opened: "2026-10-05",
          submission: { id: 7 },
          deadlines: [
            {
              what: "registration",
              observed: [
                {
                  at: "2026-10-20 AoE",
                  source: "call",
                  url: "https://2027.msrconf.org/cfp",
                  read: "2026-10-05",
                },
              ],
            },
            {
              what: "submission",
              observed: [
                {
                  at: "2026-10-23 AoE",
                  source: "call",
                  url: "https://2027.msrconf.org/cfp",
                  read: "2026-10-05",
                },
              ],
            },
            {
              what: "resubmission",
              override: {
                at: "2026-10-27T04:00:00Z",
                reason: "the chairs extended updates by mail",
                evidence: "mail/extension.eml",
              },
            },
          ],
        },
      ],
    }),
  });
  const t = submissionTarget(PAPER, {
    files: withPresets(fs),
    venuesDir: presetsDir(),
  });
  assert.ok(t.ok, JSON.stringify(t));
  assert.deepEqual(t.value.deadlines.map(deadlineLine), [
    "deadline      registration 2026-10-21T11:59:59Z, the call's reading on 2026-10-05 from https://2027.msrconf.org/cfp",
    "deadline      submission 2026-10-21T11:59:59Z, the portal's reading on 2026-10-19 from https://msr2027.hotcrp.com/deadlines — venues move dates: re-check there before relying on it; also 2026-10-24T11:59:59Z, the call's reading on 2026-10-05 from https://2027.msrconf.org/cfp",
    "deadline      resubmission 2026-10-27T04:00:00Z — override: the chairs extended updates by mail (mail/extension.eml); also 2026-10-24T11:59:59Z, the portal's reading on 2026-10-19 from https://msr2027.hotcrp.com/deadlines — venues move dates: re-check there before relying on it",
  ]);
});

test("show, in the flat form: the deadlines in force are the preset's readings alone", () => {
  const flat = memoryFiles({
    "/w/package.json": "{}",
    [`${PAPER}/paperlint.json`]: JSON.stringify({
      extends: "paperlint:msr",
      kind: "technical",
      submission: { id: 7 },
    }),
  });
  const f = submissionTarget(PAPER, {
    files: withPresets(flat),
    venuesDir: presetsDir(),
  });
  assert.deepEqual(f.ok ? f.value.deadlines.map((d) => [d.what, d.at]) : f, [
    ["submission", "2026-10-21T11:59:59Z"],
    ["resubmission", "2026-10-24T11:59:59Z"],
  ]);
});

// ── new ───────────────────────────────────────────────────────────────────────────────

const AUTHORS = [
  { name: "Ada Lovelace", email: "ada@example.org", affiliation: "Analytical" },
  { name: "Bob Bobson", email: "bob@example.org" },
];

/** The page text an IEEEtran build gives pdf.js, as the facts file holds it. */
const PAGE_1 = [
  "Agents That Lie",
  "Anonymous Author(s)",
  "Abstract—Coding agents report green builds that never ran. We mea-",
  "sure how often, with \\ours resolved to TestLie.",
  "Index Terms—agents",
  "I. INTRODUCTION",
].join("\n");

const facts = (o: { readonly sha?: string; readonly title?: string } = {}) =>
  JSON.stringify({
    schema: 3,
    pdf: "paper.pdf",
    pdf_sha256: o.sha ?? HEX,
    fonts: [],
    geometry_source: null,
    pages_text: [PAGE_1],
    metadata: o.title === undefined ? {} : { Title: o.title },
    links: [],
    bib_anchor_page: null,
    appendix_anchor_page: null,
  });

const DEFAULT_TEX =
  "\\documentclass{article}\n\\title{Agents That\\\\ Lie}\n\\begin{document}\\maketitle\\end{document}\n";

/** A paper ready for `new`: authors declared, no submission yet, a build with its facts. */
const newFiles = (o: {
  readonly paper?: Readonly<Record<string, unknown>>;
  readonly tex?: string | null;
  readonly facts?: string | null;
}) =>
  files({
    paper: o.paper ?? { extends: "../../venue.jsonc", authors: AUTHORS },
    extra: {
      ...(o.tex === null
        ? {}
        : { [`${PAPER}/paper.tex`]: o.tex ?? DEFAULT_TEX }),
      ...(o.facts === null
        ? {}
        : { [`${PAPER}/_build/paper.facts.json`]: o.facts ?? facts() }),
    },
  });

const WANT: NewSubmission = {
  title: "Agents That Lie",
  abstract:
    "Coding agents report green builds that never ran. We measure how often, with \\ours resolved to TestLie.",
  authors: [
    {
      name: "Ada Lovelace",
      email: "ada@example.org",
      affiliation: "Analytical",
    },
    { name: "Bob Bobson", email: "bob@example.org", affiliation: null },
  ],
  pdf: { name: "paper.pdf", bytes: PDF },
};

test("new: a dry run by default — title from \\title, abstract from the build's page text, the declared authors, the PDF", async () => {
  const fs = newFiles({});
  const r = await run({ sub: "new" }, { files: fs });
  assert.equal(r.code, 0, r.errs.join("\n"));
  assert.deepEqual(r.errs, []);
  assert.deepEqual(r.seen[0]?.calls, [["create", WANT, { save: false }]]);
  assert.deepEqual(r.out, [
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
    "title         Agents That Lie",
    "author 1      Ada Lovelace <ada@example.org>, Analytical",
    "author 2      Bob Bobson <bob@example.org>",
    "abstract      17 words:",
    `  ${WANT.abstract}`,
    "dry run — the portal checked the new submission and kept nothing; --save creates it for real",
    "HTTP          200",
    "valid         yes",
    "changes       new, title, abstract, authors, submission",
    `do on the site, ${SITE}/paper/<its number> — paperlint sends only the title, the abstract, the authors and the PDF:`,
    "  - PC conflicts (HotCRP's API takes them as pc_conflicts; paperlint does not send them)",
    "  - topics, and every field the venue adds (paper type, artifact, consent boxes …)",
    "  - then mark it submitted: npx paperlint submission update papers/p --submit (a dry run; --save after your yes)",
  ]);
  // A dry run writes nothing.
  assert.deepEqual(
    JSON.parse(
      new TextDecoder().decode(
        fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ??
          new Uint8Array(),
      ),
    ),
    { extends: "../../venue.jsonc", authors: AUTHORS },
  );
});

test("🔴 new --save: the id the portal chose is written into paperlint.json, and `show` is the next command", async () => {
  const fs = newFiles({});
  const r = await run({ sub: "new", save: true }, { files: fs });
  assert.equal(r.code, 0, r.errs.join("\n"));
  assert.deepEqual(r.seen[0]?.calls, [["create", WANT, { save: true }]]);
  assert.deepEqual(r.out.slice(6, 7), ["created submission 42"]);
  assert.deepEqual(r.out.slice(-2), [
    `recorded      "submission": { "id": 42 } in papers/p/paperlint.json`,
    `next          npx paperlint submission show papers/p — it should say "match yes"`,
  ]);
  assert.ok(
    r.out.includes(
      `do on the site, ${SITE}/paper/42 — paperlint sends only the title, the abstract, the authors and the PDF:`,
    ),
  );
  const written = new TextDecoder().decode(
    fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ?? new Uint8Array(),
  );
  assert.deepEqual(JSON.parse(written), {
    extends: "../../venue.jsonc",
    authors: AUTHORS,
    submission: { id: 42 },
  });
  // And the next run reads it: `new` again is refused, `show` asks for 42.
  const again = await run({ sub: "new" }, { files: fs });
  assert.equal(again.code, 2);
  assert.deepEqual(again.errs, [
    `${PAPER}/paperlint.json: the paper already has submission 42 on ${SITE} — \`paperlint submission show\` reads it, \`paperlint submission update\` changes it`,
  ]);
  const show = await run({ sub: "show" }, { files: fs });
  assert.deepEqual(show.seen[0]?.calls, [["show", 42]]);
});

test("new --save in the cycles form: the id goes into the open attempt, the last cycle", async () => {
  const cycle = (id: string, outcome: unknown) => ({
    id,
    venue: { kind: "preset", extends: "../../venue.jsonc" },
    opened: "2026-10-01",
    ...(outcome === null ? {} : { outcome }),
  });
  const closed = cycle("first", {
    kind: "rejected",
    date: "2026-10-05",
    evidence: "mail.eml",
  });
  const fs = newFiles({
    paper: { authors: AUTHORS, cycles: [closed, cycle("second", null)] },
  });
  const r = await run({ sub: "new", save: true }, { files: fs });
  assert.equal(r.code, 0, r.errs.join("\n"));
  const written: unknown = JSON.parse(
    new TextDecoder().decode(
      fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ?? new Uint8Array(),
    ),
  );
  assert.deepEqual(written, {
    authors: AUTHORS,
    cycles: [closed, { ...cycle("second", null), submission: { id: 42 } }],
  });
});

test('🔴 new without "authors": refused with the key to fill — never guessed, nothing sent', async () => {
  const r = await run(
    { sub: "new" },
    { files: newFiles({ paper: { extends: "../../venue.jsonc" } }) },
  );
  assert.equal(r.code, 2);
  assert.deepEqual(r.seen[0]?.calls, []);
  assert.deepEqual(r.errs, [
    `${PAPER}/paperlint.json: no "authors" — add "authors": [{ "name": "…", "email": "…", "affiliation": "…" }], every author in the paper's order, as 127.0.0.1 should record them; paperlint never guesses them`,
  ]);
});

test("🔴 new: no facts, or facts about another PDF — refused, with the build or --abstract as the way out", async () => {
  const none = await run({ sub: "new" }, { files: newFiles({ facts: null }) });
  assert.equal(none.code, 2);
  assert.deepEqual(none.errs, [
    "the abstract: no papers/p/_build/paper.facts.json — run `npx paperlint build` on the paper first, or give the abstract with --abstract <file> — give it with --abstract <file>, a plain-text file",
  ]);
  const stale = await run(
    { sub: "new" },
    { files: newFiles({ facts: facts({ sha: "0".repeat(64) }) }) },
  );
  assert.match(stale.errs[0] ?? "", /describes another PDF than the one sent/);
  const broken = await run({ sub: "new" }, { files: newFiles({ facts: "{" }) });
  assert.match(broken.errs[0] ?? "", /paper\.facts\.json cannot be read/);
  assert.deepEqual(
    [none, stale, broken].map((r) => r.seen[0]?.calls),
    [[], [], []],
  );
});

test("new --abstract <file>: its text is sent instead of the build's, whitespace as one space", async () => {
  const fs = newFiles({
    facts: null,
    paper: { extends: "../../venue.jsonc", authors: AUTHORS },
  });
  const r = await run(
    { sub: "new", abstract: "abs.txt" },
    {
      files: {
        ...fs,
        readBytes: (p) =>
          p === "/w/abs.txt"
            ? new TextEncoder().encode(" Line one.\n\nLine two. \n")
            : fs.readBytes(p),
      },
    },
  );
  assert.equal(r.code, 0, r.errs.join("\n"));
  assert.deepEqual(r.seen[0]?.calls, [
    ["create", { ...WANT, abstract: "Line one. Line two." }, { save: false }],
  ]);
});

test("new: the paper already accepted in its current cycle — refused; a new submission is a new cycle", async () => {
  const r = await run(
    { sub: "new" },
    {
      files: newFiles({
        paper: {
          authors: AUTHORS,
          cycles: [
            {
              id: "one",
              venue: { kind: "preset", extends: "../../venue.jsonc" },
              opened: "2026-10-01",
              outcome: {
                kind: "accepted",
                date: "2026-10-09",
                evidence: "m.eml",
              },
            },
          ],
        },
      }),
    },
  );
  assert.equal(r.code, 2);
  assert.deepEqual(r.errs, [
    `${PAPER}/paperlint.json: the current attempt is accepted — a new submission belongs to a new cycle`,
  ]);
});

test("new: no PDF, a portal that says invalid, a save the portal did not make — each exits non-zero", async () => {
  const noPdf = await run(
    { sub: "new", pdf: "nope.pdf" },
    { files: newFiles({}) },
  );
  assert.equal(noPdf.code, 2);
  assert.deepEqual(noPdf.errs, [
    "no PDF at nope.pdf — build the paper, or name one with --pdf",
  ]);
  const invalid = await run(
    { sub: "new" },
    {
      files: newFiles({}),
      portal: fakePortal({
        create: ok({
          httpStatus: 200,
          valid: false,
          changes: ["new"],
          messages: [
            { message: "Entry required.", field: "topics", status: 2 },
          ],
          dryRun: true,
          id: null,
        }),
      }),
    },
  );
  assert.equal(invalid.code, 1);
  assert.deepEqual(invalid.out.slice(-2), [
    "changes       new",
    "  portal says: topics: Entry required.",
  ]);
  const withheld = await run(
    { sub: "new", save: true },
    {
      files: newFiles({}),
      portal: fakePortal({
        create: ok({
          httpStatus: 200,
          valid: true,
          changes: ["new"],
          messages: [],
          dryRun: true,
          id: null,
        }),
      }),
    },
  );
  assert.equal(withheld.code, 1);
  assert.ok(
    withheld.out.includes("NOTHING CREATED — the portal did not save it"),
  );
});

test("new: the abstract the PDF does not delimit — refused with --abstract as the way out", async () => {
  const r = await run(
    { sub: "new" },
    {
      files: newFiles({
        facts: JSON.stringify({
          ...JSON.parse(facts()),
          pages_text: ["Title\nBody"],
        }),
      }),
    },
  );
  assert.equal(r.code, 2);
  assert.deepEqual(r.errs, [
    "the abstract: the PDF's first two pages have no line beginning with «Abstract» — give it with --abstract <file>, a plain-text file",
  ]);
});

test("titleOf: \\title as text; an author's macro in it → the PDF's Title; neither → the fix", () => {
  const src = (t: string) =>
    `\\documentclass{article}\\title{${t}}\\begin{document}\\end{document}`;
  assert.deepEqual(titleOf(src("Plain  Title"), latexReader, null), {
    ok: true,
    value: "Plain Title",
  });
  assert.deepEqual(
    titleOf(src("\\ours{}: Lies"), latexReader, { Title: "TestLie: Lies" }),
    { ok: true, value: "TestLie: Lies" },
  );
  assert.deepEqual(titleOf(src("\\ours{}: Lies"), latexReader, {}), {
    ok: false,
    error:
      "the \\title in paper.tex uses a command paperlint does not read («…: Lies»), and the PDF names no Title — set \\hypersetup{pdftitle={<the title as plain text>}} and rebuild",
  });
  assert.deepEqual(titleOf(null, latexReader, null), {
    ok: false,
    error:
      "no \\title in paper.tex, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild",
  });
});

test("🔴 new --save, but paperlint.json changed under it: the id is printed with the line to add by hand, exit 1", async () => {
  const config = absolutePath(`${PAPER}/paperlint.json`);
  for (const [swap, why] of [
    [null, "the file is gone"],
    ["{", "not JSON: "],
    ["[1]", "must be a JSON object"],
  ] as const) {
    const fs = newFiles({});
    const created = { now: false };
    const portal = fakePortal({});
    const r = await run(
      { sub: "new", save: true },
      {
        files: {
          ...fs,
          readBytes: (p) =>
            created.now && p === config
              ? swap === null
                ? null
                : new TextEncoder().encode(swap)
              : fs.readBytes(p),
        },
        portal: {
          ...portal,
          portalFor: (site, token) => {
            const inner = portal.portalFor(site, token);
            return {
              ...inner,
              create: async (paper, o) => {
                const a = await inner.create(paper, o);
                created.now = true;
                return a;
              },
            };
          },
        },
      },
    );
    assert.equal(r.code, 1, why);
    assert.equal(r.errs.length, 1);
    const line = r.errs[0] ?? "";
    assert.ok(
      line.startsWith(
        "submission 42 was created, but papers/p/paperlint.json was not changed (",
      ),
      line,
    );
    assert.ok(line.includes(why), line);
    assert.ok(
      (r.errs[0] ?? "").endsWith(
        `) — add "submission": { "id": 42 } to the current attempt by hand`,
      ),
    );
  }
});

test("new: no paper.tex — the PDF's Title stands in; without one either, the fix is named", async () => {
  const titled = await run(
    { sub: "new" },
    { files: newFiles({ tex: null, facts: facts({ title: "From The PDF" }) }) },
  );
  assert.equal(titled.code, 0, titled.errs.join("\n"));
  assert.equal(titled.out[1], "title         From The PDF");
  const untitled = await run(
    { sub: "new" },
    { files: newFiles({ tex: null }) },
  );
  assert.equal(untitled.code, 2);
  assert.deepEqual(untitled.errs, [
    "no \\title in paper.tex, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild",
  ]);
});

test("new: --abstract naming no file is refused before anything is sent; run from the paper folder, the next command says `.`", async () => {
  const missing = await run(
    { sub: "new", abstract: "nope.txt" },
    { files: newFiles({}) },
  );
  assert.equal(missing.code, 2);
  assert.deepEqual(missing.errs, ["--abstract: no file at nope.txt"]);
  assert.deepEqual(missing.seen[0]?.calls, []);
  const here = await run(
    { sub: "new", paperDir: "." },
    {
      files: newFiles({}),
      cwd: PAPER,
      portal: fakePortal({
        create: ok({
          httpStatus: 200,
          valid: true,
          changes: [],
          messages: [],
          dryRun: true,
          id: null,
        }),
      }),
    },
  );
  assert.equal(here.code, 0, here.errs.join("\n"));
  assert.ok(here.out.includes("changes       —"));
  assert.ok(
    here.out.includes(
      "  - then mark it submitted: npx paperlint submission update . --submit (a dry run; --save after your yes)",
    ),
  );
});
