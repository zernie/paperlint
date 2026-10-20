/**
 * What every `paperlint submission` subcommand shares: the command line, where the portal and the
 * submission id come from, the token rule and its messages, a failure in words. Each subcommand's
 * own behaviour is in submission-new, submission-show and submission-update. The HotCRP wire format
 * is tested in the adapter.
 */
import { map } from "remeda";
import { expect, test } from "vitest";
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
  expect(failureText({ kind: "refused", httpStatus: 500, messages: [] })).toBe(
    "the portal refused (HTTP 500)",
  );
  expect(failureText({ kind: "unreachable", detail: "fetch failed" })).toBe(
    "the portal cannot be reached: fetch failed",
  );
  expect(
    failureText({
      kind: "malformed",
      httpStatus: 200,
      detail: "the answer is not JSON (text/html)",
    }),
  ).toBe(
    "the portal answered HTTP 200, but not as its API does: the answer is not JSON (text/html)",
  );
});

test("no token: the site's variable is named, with this site's token page, the scopes and the export — and nothing is called", async () => {
  const r = await run({}, { env: {} });
  expect(r.code).toBe(2);
  expect(r.seen).toStrictEqual([]);
  expect(r.errs).toStrictEqual([
    `no hotcrp token for ${SITE}: HOTCRP_TOKEN_127_0_0_1_9 is not set`,
    ...STEPS,
  ]);
});

test("only the site-less HOTCRP_TOKEN set: the rename instruction, and nothing is sent with it", async () => {
  const r = await run(
    { sub: "update", save: true },
    { env: { HOTCRP_TOKEN: "hct_old" } },
  );
  expect(r.code).toBe(2);
  expect(r.seen).toStrictEqual([]);
  expect(r.errs).toStrictEqual([
    "HOTCRP_TOKEN is no longer read: tokens are per hotcrp site. If it was made on 127.0.0.1:9, rename it to HOTCRP_TOKEN_127_0_0_1_9; if it was made on another site, rename it to that site's variable (HOTCRP_TOKEN_<LABEL>) and create a token here:",
    ...STEPS,
  ]);
  expect(r.errs.join("\n")).not.toMatch(/hct_old/);
});

test("the site's variable set beside a site-less one: the site's token is the one used", async () => {
  const r = await run(
    {},
    { env: { HOTCRP_TOKEN_127_0_0_1_9: "hct_site", HOTCRP_TOKEN: "hct_old" } },
  );
  expect(r.code).toBe(0);
  expect(r.seen[0]?.token).toBe("hct_site");
});

test("a 401 from the portal: the portal's words, which variable was used, and how to make this site's token", async () => {
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
    "HOTCRP_TOKEN_127_0_0_1_9 was used; it may belong to another hotcrp site (tokens are per site), or be revoked or expired",
    ...STEPS,
  ];
  expect(map(runs, (r) => [r.code, r.errs])).toStrictEqual(
    map(subs, () => [1, said]),
  );
});

test("a 403 names a missing scope; any other failure says nothing about the token", () => {
  const portal = { kind: "hotcrp", url: SITE } as const;
  const f = (httpStatus: number) =>
    ({ kind: "refused", httpStatus, messages: [] }) as const;
  expect(tokenRefusedLines(portal, hotcrpSite(SITE), f(403))).toStrictEqual([
    "HOTCRP_TOKEN_127_0_0_1_9 was used; the site turned the request away — the token may lack a scope this subcommand needs",
    ...STEPS,
  ]);
  expect(tokenRefusedLines(portal, hotcrpSite(SITE), f(500))).toStrictEqual([]);
  expect(
    tokenRefusedLines(portal, hotcrpSite(SITE), {
      kind: "unreachable",
      detail: "x",
    }),
  ).toStrictEqual([]);
  expect(
    tokenProblemLines(portal, hotcrpSite(SITE), {
      kind: "missing",
      variable: "HOTCRP_TOKEN_127_0_0_1_9",
    }),
  ).toStrictEqual([
    `no hotcrp token for ${SITE}: HOTCRP_TOKEN_127_0_0_1_9 is not set`,
    ...STEPS,
  ]);
});

test("show and update without a submission id: the key to set, or `new` — nothing sent", async () => {
  const noId = files({ paper: { extends: "../../venue.jsonc" } });
  const noIdRuns = await Promise.all(
    map(["show", "update"] as const, (sub) => run({ sub }, { files: noId })),
  );
  expect(map(noIdRuns, (r) => [r.code, r.seen, r.errs])).toStrictEqual(
    map(noIdRuns, () => [
      2,
      [],
      [
        `${PAPER}/paperlint.json: no "submission" — add "submission": { "id": <the submission number on ${SITE}> }, or create the submission with \`paperlint submission new\``,
      ],
    ]),
  );
});

test("the file and key to set: no portal in the preset, no submission in the paper, no preset", () => {
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
  expect(!t1.ok ? t1.error : "").toMatch(
    /^the venue preset declares no "portal" \(read: .*ieee-conference\.jsonc\) — add "portal": \{ "kind": "hotcrp"/,
  );
  const noExtends = files({ paper: { submission: { id: 7 } } });
  const t3 = submissionTarget(PAPER, deps(noExtends));
  expect(!t3.ok ? t3.error : "").toMatch(/paperlint\.json: no "extends"/);
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
  expect(!t5.ok ? t5.error : "").toBe(
    `${PAPER}/paperlint.json: the current cycle names no venue preset, and the preset is what declares the portal — set the venue in the current cycle ("venue": { "kind": "preset", "extends": "paperlint:…" }), or upload by hand`,
  );
  const broken = files({
    paper: { extends: "../../venue.jsonc", submission: { id: "7" } },
  });
  const t4 = submissionTarget(PAPER, deps(broken));
  expect(!t4.ok ? t4.error : "").toMatch(/"submission" must be \{ "id"/);
});

test("an unknown portal kind is refused: upload by hand", async () => {
  const r = await run(
    {},
    { files: files({ portal: { kind: "easychair", url: "https://x.test" } }) },
  );
  expect(r.code).toBe(2);
  expect(r.errs).toStrictEqual([
    `portal kind "easychair" is not supported; upload by hand`,
  ]);
  expect(r.seen).toStrictEqual([]);
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
  expect(t.ok && t.value.portal.kind).toBe("hotcrp");
  expect(t.ok ? t.value.portal.url : "").toMatch(/^https:\/\//);
});

test("usage: refused before anything is read, exit 2", async () => {
  const r = await run({ sub: "upload" });
  expect(r.code).toBe(2);
  expect(r.seen).toStrictEqual([]);
  expect(r.errs[0] ?? "").toMatch(/got `upload`/);
});

test("usage: a subcommand is required, one paper folder, update-only flags refused on show", () => {
  expect(usageProblem({ ...ARGS, sub: undefined }) ?? "").toMatch(
    /needs a subcommand: new or show or update or topics — got ``/,
  );
  expect(usageProblem({ ...ARGS, sub: "upload" }) ?? "").toMatch(
    /got `upload`/,
  );
  expect(usageProblem({ ...ARGS, extra: ["x"] })).toBe(
    "`submission show` takes one paper folder — got also `x`",
  );
  expect(
    usageProblem({ ...ARGS, save: true, submit: true, abstract: "a" }),
  ).toBe(
    "--abstract, --submit, --save: only `submission new` and `submission update` change anything; `show` reads",
  );
  expect(usageProblem({ ...ARGS, sub: "update", save: true })).toBe(null);
  expect(usageProblem({ ...ARGS, sub: "new", save: true, abstract: "a" })).toBe(
    null,
  );
  expect(usageProblem({ ...ARGS, sub: "new", submit: true })).toBe(
    "--submit: `submission new` creates the submission; mark it submitted with `submission update --submit` once `show` says the portal holds this build",
  );
});
