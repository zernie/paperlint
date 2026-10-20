/** `paperlint submission show`: what the portal holds, whether it is the local build, the deadlines in force. */
import { expect, test } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { err, ok } from "./domain/result.ts";
import { sha256Hex } from "./domain/sha256.ts";
import {
  type PortalFailure,
  type SubmissionView,
} from "./domain/submission.ts";
import { presetsDir } from "./package-dirs.ts";
import { deadlineLine, submissionTarget } from "./submission.ts";
import {
  PAPER,
  SITE,
  PDF,
  HEX,
  withPresets,
  VIEW,
  fakePortal,
  run,
  STEPS,
} from "../test/submission-fixtures.ts";

test("show: the portal from the preset, the id from the paper, the token from the site's variable", async () => {
  const r = await run({});
  expect(r.code).toBe(0);
  expect(r.errs).toStrictEqual([]);
  expect(r.seen).toStrictEqual([
    {
      portal: { kind: "hotcrp", url: SITE },
      token: "hct_secret",
      calls: [["show", 7]],
    },
  ]);
  expect(r.out).toStrictEqual([
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
  expect([...r.out, ...r.errs].join("\n")).not.toMatch(/hct_secret/);
});

test("show: a different PDF on the portal is reported as NO, and still exits 0", async () => {
  const other = {
    ...VIEW,
    pdf: VIEW.pdf && { ...VIEW.pdf, sha256: sha256Hex(new Uint8Array([1])) },
  };
  const r = await run({}, { portal: fakePortal({ show: ok(other) }) });
  expect(r.code).toBe(0);
  expect(r.out.at(-1)).toBe(
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
  expect(r1.out.slice(1)).toStrictEqual([
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
  expect(r2.out[6]).toBe("portal PDF    sha1-abc, ? bytes, uploaded —");
  expect(r2.out[8]).toBe(
    "match         unknown — the portal names a sha1 hash, not a sha256",
  );
  const r4 = await run({ pdf: "/elsewhere/x.pdf" });
  expect(r4.out[7]).toBe("local PDF     /elsewhere/x.pdf (missing)");
  const r3 = await run({ pdf: "missing.pdf" });
  expect(r3.out[7]).toBe("local PDF     missing.pdf (missing)");
  expect(r3.out[8]).toBe("match         unknown — no local PDF to compare");
});

test("the portal's refusal is printed with its own message, exit 1", async () => {
  const refused = err<PortalFailure>({
    kind: "refused",
    httpStatus: 401,
    messages: [{ message: "Missing credentials", field: null, status: 2 }],
  });
  const r = await run({}, { portal: fakePortal({ show: refused }) });
  expect(r.code).toBe(1);
  expect(r.errs).toStrictEqual([
    "the portal refused (HTTP 401): Missing credentials",
    "HOTCRP_TOKEN_127_0_0_1 was used; it may belong to another hotcrp site (tokens are per site), or be revoked or expired",
    ...STEPS,
  ]);
});

test("show sends nothing, so it asks for no check", async () => {
  const r = await run({});
  expect(r.out.some((l) => l.includes("call for papers"))).toBe(false);
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
  expect(t.ok ? t.value.deadlines.map(deadlineLine) : t).toStrictEqual([
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
  expect(f.ok ? f.value.deadlines.map((d) => [d.what, d.at]) : f).toStrictEqual(
    [
      ["submission", "2026-10-21T11:59:59Z"],
      ["resubmission", "2026-10-24T11:59:59Z"],
    ],
  );
});

// ── new ───────────────────────────────────────────────────────────────────────────────
