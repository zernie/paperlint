/**
 * The schemas of a study's mode (`mode` in its plan) and of a blind study's manifest, `sealed.json`.
 * Both halves: what the commands write parses back to itself; a measurement's plan is ready only with
 * exactly one mode; every contradiction is refused with its reason.
 */
import { expect, it } from "vitest";
import { manifestText, type SealManifest } from "../../domain/sealed-study.ts";
import type { StudyMode } from "../../domain/study-mode.ts";
import {
  planTemplate,
  planText,
  type StudyKind,
  type StudyPlan,
} from "../../domain/study-registry.ts";
import { studyRegistryCodec } from "./index.ts";

const R1 = `age1${"q".repeat(58)}`;
const R2 = `age1${"p".repeat(58)}`;

const DECIDED: StudyMode = {
  kind: "decide_before_run",
  outputs: ["data/outcome/**", "RESULTS.md"],
  decision: {
    file: "repro/P1-S01-x/decision.md",
    note: "exclusions and the sample approved",
  },
};
const BLIND: StudyMode = {
  kind: "blind",
  outputs: ["data/outcome/**", "RESULTS.md"],
  recipients: [R1, R2],
  unseal_after: { file: "research/exclusions.md", note: "exclusions frozen" },
};
const EXPLORATORY: StudyMode = {
  kind: "exploratory",
  reason: "a first look at the logs, to find the question",
};

const PLAN: StudyPlan = {
  question: "Does the hint help?",
  population: {
    source: "tasks, 2026-10-01",
    draw: { kind: "all", method: "census" },
  },
  arms: [{ name: "hint" }, { name: "none" }],
  primary_outcome: "pass rate",
  author_check: null,
  mode: DECIDED,
};

const parse = (text: string, kind: StudyKind = "measurement") =>
  studyRegistryCodec.parsePlan(text, kind);
const withMode = (mode: unknown): string => JSON.stringify({ ...PLAN, mode });
const why = (text: string): string => {
  const r = parse(text);
  return r.kind === "unreadable" ? r.why : r.kind;
};
const empty = (text: string, kind: StudyKind = "measurement") => {
  const r = parse(text, kind);
  return r.kind === "draft" ? r.empty : r.kind;
};

it("each mode parses to itself, ready", () => {
  // Guards: the three modes round-trip through the text planText writes.
  expect(
    [DECIDED, BLIND, EXPLORATORY].map((mode) =>
      parse(planText({ ...PLAN, mode })),
    ),
  ).toEqual(
    [DECIDED, BLIND, EXPLORATORY].map((mode) => ({
      kind: "ready",
      plan: { ...PLAN, mode },
    })),
  );
});

it("a measurement's plan without a mode is a draft naming `mode`; a spike's is ready", () => {
  const none: StudyPlan = { ...PLAN, mode: undefined };
  // Guards: "none" is not a ready state for a measurement — and a spike may omit it.
  expect(empty(planText(none))).toEqual(["mode"]);
  expect(empty(planText(none), "spike")).toBe("ready");
});

it("the template of a measurement is a draft decided before its run, its decision file named", () => {
  const t = planTemplate("measurement", "P1-S02-x");
  // Guards: `studies new` scaffolds the default mode; what is left to fill is named.
  expect(t.mode).toEqual({
    kind: "decide_before_run",
    outputs: [],
    decision: { file: "repro/P1-S02-x/decision.md", note: "" },
  });
  expect(empty(planText(t))).toEqual([
    "question",
    "population.source",
    "population.draw.method",
    "primary_outcome",
    "mode.outputs",
    "mode.decision.note",
  ]);
  expect(planTemplate("spike", "P1-S03-y").mode).toBeUndefined();
});

it("each mode's empty texts are named: a blind gate, an exploratory reason", () => {
  // Guards: a mode left half-written is a draft, so a study that has run on it is reported.
  expect(
    empty(
      withMode({
        ...BLIND,
        outputs: [],
        unseal_after: { file: " ", note: "" },
      }),
    ),
  ).toEqual([
    "mode.outputs",
    "mode.unseal_after.file",
    "mode.unseal_after.note",
  ]);
  expect(empty(withMode({ ...EXPLORATORY, reason: "" }))).toEqual([
    "mode.reason",
  ]);
  expect(
    empty(withMode({ ...DECIDED, decision: { file: "", note: "n" } })),
  ).toEqual(["mode.decision.file"]);
});

it("two modes at once, or a mode that is none of the three, cannot be written", () => {
  // Guards: exactly one — a second mode's key is an unknown key, an unknown kind is refused.
  expect(why(withMode({ ...DECIDED, recipients: [R1] }))).toBe(
    'mode: Unrecognized key: "recipients"',
  );
  expect(why(withMode({ kind: "preregistered" }))).toBe(
    "mode.kind: Invalid discriminator value. Expected 'decide_before_run' | 'blind' | 'exploratory'",
  );
  expect(why(JSON.stringify({ ...PLAN, blind: BLIND }))).toBe(
    '(top): Unrecognized key: "blind"',
  );
});

it("refuses a malformed or repeated recipient, and none at all", () => {
  // Guards: a key nobody holds, or a list that seals to no one, is no blind study.
  expect(why(withMode({ ...BLIND, recipients: ["ssh-ed25519 AAAA"] }))).toBe(
    "mode.recipients.0: is not a native age recipient (age1 and 58 more characters, from age-keygen)",
  );
  expect(why(withMode({ ...BLIND, recipients: [R1, R1] }))).toBe(
    `mode.recipients: the recipient «${R1}» is listed more than once`,
  );
  expect(why(withMode({ ...BLIND, recipients: [] }))).toBe(
    "mode.recipients: Too small: expected array to have >=1 items",
  );
});

it("refuses an output outside the folder or naming the study's own files, and a decision outside the paper", () => {
  const outside =
    "is not a path inside the study's folder, or names one of its own files (sealed.json, README.md, *.age)";
  // Guards: a glob cannot reach past the study's folder; a decision cannot leave the paper or be a ciphertext.
  expect(
    ["../x", "/abs", "a\\b", "sealed.json", "README.md", "x.age"].map((o) =>
      why(withMode({ ...DECIDED, outputs: [o] })),
    ),
  ).toEqual(Array.from({ length: 6 }, () => `mode.outputs.0: ${outside}`));
  expect(why(withMode({ ...DECIDED, outputs: ["a", "a"] }))).toBe(
    "mode.outputs: the output «a» is listed more than once",
  );
  expect(
    ["../d.md", "/d.md", "a\\d.md", "d.md.age"].map((file) =>
      why(withMode({ ...DECIDED, decision: { file, note: "n" } })),
    ),
  ).toEqual(
    Array.from(
      { length: 4 },
      () =>
        "mode.decision.file: is not a path inside the paper's folder, or is a ciphertext (*.age)",
    ),
  );
});

it("mode is a field of the plan, so extra cannot carry it", () => {
  // Guards: one place says how a study is gated.
  expect(
    why(JSON.stringify({ ...PLAN, mode: undefined, extra: { mode: {} } })),
  ).toBe(
    "extra.mode: is a field of the plan itself — set it there, not in extra",
  );
});

const MANIFEST: SealManifest = {
  recipients: [R1],
  files: [
    {
      path: "RESULTS.md",
      sha256: "a".repeat(64),
      size: 3,
      age_sha256: "c".repeat(64),
      sealed_at: "2026-10-16T10:00:00.000Z",
    },
  ],
  unsealed: null,
};

const manifestWhy = (m: unknown): string => {
  const r = studyRegistryCodec.parseManifest(JSON.stringify(m));
  return r.ok ? "parsed" : r.why;
};

it("a blind study's manifest, sealed.json — what the commands write parses back, sealed and unsealed", () => {
  const unsealed: SealManifest = {
    ...MANIFEST,
    unsealed: {
      at: "2026-10-17T09:00:00.000Z",
      gate: {
        file: "exclusions.md",
        commit: "f".repeat(40),
        date: "2026-10-17T14:00:00+05:00",
      },
    },
  };
  // Guards: both states round-trip through the text the commands write.
  expect(studyRegistryCodec.parseManifest(manifestText(MANIFEST))).toEqual({
    ok: true,
    manifest: MANIFEST,
  });
  expect(studyRegistryCodec.parseManifest(manifestText(unsealed))).toEqual({
    ok: true,
    manifest: unsealed,
  });
});

it("a blind study's manifest, sealed.json — refuses text that is not JSON", () => {
  // Guards: a broken file is a reason, not an empty manifest.
  expect(studyRegistryCodec.parseManifest("{")).toEqual({
    ok: false,
    why: "not JSON",
  });
});

it("a blind study's manifest, sealed.json — refuses an unsealing without its gate, a flag in its place, and a repeated path", () => {
  // Guards: "unsealed" cannot be written down without the commit it waited for.
  expect(
    manifestWhy({
      ...MANIFEST,
      unsealed: { at: "2026-10-17T09:00:00.000Z" },
    }),
  ).toBe("unsealed.gate: Invalid input: expected object, received undefined");
  expect(manifestWhy({ ...MANIFEST, unsealed: true })).toBe(
    "unsealed: Invalid input: expected object, received boolean",
  );
  expect(
    manifestWhy({
      ...MANIFEST,
      files: [MANIFEST.files[0], MANIFEST.files[0]],
    }),
  ).toBe("files: the path «RESULTS.md» is listed more than once");
});

it("a blind study's manifest, sealed.json — refuses a hash that is not one, and a commit that is not one", () => {
  const [f] = MANIFEST.files;
  // Guards: the record anyone verifies against is made of real digests.
  expect(manifestWhy({ ...MANIFEST, files: [{ ...f, sha256: "xyz" }] })).toBe(
    "files.0.sha256: is not a sha256",
  );
  expect(
    manifestWhy({
      ...MANIFEST,
      unsealed: {
        at: "2026-10-17T09:00:00.000Z",
        gate: {
          file: "e.md",
          commit: "HEAD",
          date: "2026-10-17T14:00:00+05:00",
        },
      },
    }),
  ).toBe("unsealed.gate.commit: is not a commit");
});
