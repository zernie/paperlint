/**
 * What every `paperlint submission` subcommand shares: the command line, where the portal and the
 * submission id come from, the token rule and its messages, a failure in words. Each subcommand's
 * own behaviour is in submission-new, submission-show and submission-update. The HotCRP wire format
 * is tested in the adapter.
 */
import assert from "node:assert/strict";
import { map } from "remeda";
import { test } from "vitest";
import { hotcrpSite } from "./adapters/hotcrp/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { err } from "./domain/result.ts";
import { presetsDir } from "./package-dirs.ts";
import { type Files } from "./ports/files.ts";
import {
  failureText,
  submissionTarget,
  tokenProblemLines,
  tokenRefusedLines,
  usageProblem,
} from "./submission.ts";
import {
  PAPER,
  SITE,
  withPresets,
  files,
  fakePortal,
  ARGS,
  run,
  STEPS,
  newFiles,
} from "../test/submission-fixtures.ts";

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

test("🔴 no token: the site's variable is named, with this site's token page, the scopes and the export — and nothing is called", async () => {
  const r = await run({}, { env: {} });
  assert.equal(r.code, 2);
  assert.deepEqual(r.seen, []);
  assert.deepEqual(r.errs, [
    `no hotcrp token for ${SITE}: HOTCRP_TOKEN_127_0_0_1 is not set`,
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
    "HOTCRP_TOKEN is no longer read: tokens are per hotcrp site. If it was made on 127.0.0.1, rename it to HOTCRP_TOKEN_127_0_0_1; if it was made on another site, rename it to that site's variable (HOTCRP_TOKEN_<LABEL>) and create a token here:",
    ...STEPS,
  ]);
  assert.doesNotMatch(r.errs.join("\n"), /hct_old/);
});

test("the site's variable set beside a site-less one: the site's token is the one used", async () => {
  const r = await run(
    {},
    { env: { HOTCRP_TOKEN_127_0_0_1: "hct_site", HOTCRP_TOKEN: "hct_old" } },
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
  const subs = ["show", "update", "new"] as const;
  const runs = await Promise.all(
    map(subs, (sub) =>
      run(
        { sub },
        {
          portal: fakePortal({
            show: refused,
            update: refused,
            create: refused,
          }),
          files: sub === "new" ? newFiles({}) : files({}),
        },
      ),
    ),
  );
  const said = [
    "the portal refused (HTTP 401): Unauthorized",
    "HOTCRP_TOKEN_127_0_0_1 was used; it may belong to another hotcrp site (tokens are per site), or be revoked or expired",
    ...STEPS,
  ];
  assert.deepEqual(
    map(runs, (r) => [r.code, r.errs]),
    map(subs, () => [1, said]),
  );
});

test("a 403 names a missing scope; any other failure says nothing about the token", () => {
  const portal = { kind: "hotcrp", url: SITE } as const;
  const f = (httpStatus: number) =>
    ({ kind: "refused", httpStatus, messages: [] }) as const;
  assert.deepEqual(tokenRefusedLines(portal, hotcrpSite(SITE), f(403)), [
    "HOTCRP_TOKEN_127_0_0_1 was used; the site turned the request away — the token may lack a scope this subcommand needs",
    ...STEPS,
  ]);
  assert.deepEqual(tokenRefusedLines(portal, hotcrpSite(SITE), f(500)), []);
  assert.deepEqual(
    tokenRefusedLines(portal, hotcrpSite(SITE), {
      kind: "unreachable",
      detail: "x",
    }),
    [],
  );
  assert.deepEqual(
    tokenProblemLines(portal, hotcrpSite(SITE), {
      kind: "missing",
      variable: "HOTCRP_TOKEN_127_0_0_1",
    }),
    [
      `no hotcrp token for ${SITE}: HOTCRP_TOKEN_127_0_0_1 is not set`,
      ...STEPS,
    ],
  );
});

test("🔴 show and update without a submission id: the key to set, or `new` — nothing sent", async () => {
  const noId = files({ paper: { extends: "../../venue.jsonc" } });
  const noIdRuns = await Promise.all(
    map(["show", "update"] as const, (sub) => run({ sub }, { files: noId })),
  );
  assert.deepEqual(
    map(noIdRuns, (r) => [r.code, r.seen, r.errs]),
    map(noIdRuns, () => [
      2,
      [],
      [
        `${PAPER}/paperlint.json: no "submission" — add "submission": { "id": <the submission number on ${SITE}> }, or create the submission with \`paperlint submission new\``,
      ],
    ]),
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
