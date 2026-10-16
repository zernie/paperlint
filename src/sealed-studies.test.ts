/**
 * `paperlint studies seal|verify <paper-dir> <id>` (`src/sealed-studies.ts`, through `runStudies`) on
 * paper folders held in memory, with a stand-in sealer whose "ciphertext" is the plaintext behind a
 * header. Both halves: each command writes exactly what it promises, and a run that cannot do what
 * it was asked writes nothing and says why. The real age is in test/e2e/age/.
 */
import { expect, it } from "vitest";
import { manifestText, type SealManifest } from "./domain/sealed-study.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { planText } from "./domain/study-registry.ts";
import { INSTALL_AGE } from "./sealed-studies.ts";
import {
  BLIND,
  DIR,
  NOW,
  PLAN,
  R1,
  ROW,
  S,
  W,
  enc,
  planOf,
  sealedText,
  studies,
  tree,
} from "../test/study-tree.ts";

const sha = (s: string): string => sha256Hex(enc(s));

const file = (path: string, text: string) => ({
  path,
  sha256: sha(text),
  size: enc(text).length,
  age_sha256: sha(sealedText(text)),
  sealed_at: NOW,
});

const MANIFEST: SealManifest = {
  recipients: [R1],
  files: [file("RESULTS.md", "41 of 60"), file("data/outcome/a.csv", "1,2")],
  unsealed: null,
};

/** The tree after a first seal of RESULTS.md and data/outcome/a.csv. */
const SEALED = tree({
  [`${S}/RESULTS.md.age`]: sealedText("41 of 60"),
  [`${S}/data/outcome/a.csv.age`]: sealedText("1,2"),
  [`${S}/sealed.json`]: manifestText(MANIFEST),
});

it("studies seal — encrypts every output, records it, removes the plaintext — and leaves every other file", () => {
  const out = studies(
    "seal",
    tree({
      [`${S}/RESULTS.md`]: "41 of 60",
      [`${S}/data/outcome/a.csv`]: "1,2",
      [`${S}/exclusions.md`]: "draft",
      [`${S}/notes.txt`]: "n",
    }),
  );
  // Guards: the whole after-state — ciphertexts, the manifest in path order, no plaintext left.
  expect(out).toEqual({
    code: 0,
    err: [],
    log: [
      `sealed ${W}/RESULTS.md → RESULTS.md.age (8 bytes, sha256 ${sha("41 of 60")})`,
      `sealed ${W}/data/outcome/a.csv → data/outcome/a.csv.age (3 bytes, sha256 ${sha("1,2")})`,
      `2 files sealed to 1 recipient in ${W}/sealed.json. Next: commit sealed.json and the .age files — the hashes are then public before anyone can decrypt.`,
    ],
    after: {
      ...SEALED,
      [`${S}/exclusions.md`]: "draft",
      [`${S}/notes.txt`]: "n",
    },
  });
});

it("studies seal — a second run with nothing new changes nothing; a reappeared plaintext of the same bytes is removed", () => {
  // Guards: idempotent — the manifest is not rewritten with new times.
  expect(studies("seal", SEALED)).toEqual({
    code: 0,
    err: [],
    log: [`nothing new to seal: 2 files sealed in ${W}/sealed.json`],
    after: SEALED,
  });
  expect(
    studies("seal", { ...SEALED, [`${S}/RESULTS.md`]: "41 of 60" }),
  ).toEqual({
    code: 0,
    err: [],
    log: [
      `removed ${W}/RESULTS.md: already sealed, the same sha256`,
      `nothing new to seal: 2 files sealed in ${W}/sealed.json`,
    ],
    after: SEALED,
  });
});

it("studies seal — a new output is added to the manifest beside what was sealed", () => {
  const out = studies("seal", {
    ...SEALED,
    [`${S}/data/outcome/b.csv`]: "3",
  });
  // Guards: the earlier records keep their times; the new one is added in path order.
  expect(out.code).toBe(0);
  expect(out.after[`${S}/sealed.json`]).toBe(
    manifestText({
      ...MANIFEST,
      files: [
        file("RESULTS.md", "41 of 60"),
        file("data/outcome/a.csv", "1,2"),
        file("data/outcome/b.csv", "3"),
      ],
    }),
  );
});

it("studies seal — refuses a result that differs from the one sealed, and writes nothing", () => {
  const t = { ...SEALED, [`${S}/RESULTS.md`]: "59 of 60" };
  // Guards: no swap — a sealed result is never replaced by a seal.
  expect(studies("seal", t)).toEqual({
    code: 1,
    log: [],
    err: [
      [
        "P1-S01: 1 result file not the one sealed, and a sealed result is never replaced by a seal. Nothing was written.",
        `  RESULTS.md: sealed ${sha("41 of 60")}, now ${sha("59 of 60")}`,
        "To replace one on purpose, remove its .age file (git rm) and run this again: the change is then in the history.",
      ].join("\n"),
    ],
    after: t,
  });
});

it("studies seal — refuses a study with nothing to seal yet, without age, or when age fails — writing nothing", () => {
  const t = tree({ [`${S}/RESULTS.md`]: "41 of 60" });
  // Guards: a misconfigured outputs list is said, not sealed as an empty study; a missing age names the install.
  expect(studies("seal", tree())).toEqual({
    code: 1,
    log: [],
    err: [
      `${W} has no file that mode.outputs (data/outcome/**, RESULTS.md) match, and nothing is sealed yet. Run the study first, or correct the outputs.`,
    ],
    after: tree(),
  });
  expect(studies("seal", t, {}, { sealer: "missing" })).toEqual({
    code: 1,
    log: [],
    err: [INSTALL_AGE],
    after: t,
  });
  expect(studies("seal", t, {}, { sealer: "failed" }).err).toEqual([
    `age could not seal ${W}: bad recipient. Nothing was written.`,
  ]);
});

it("studies seal — refuses an unreadable manifest, an unsealed study, and recipients other than the sealed ones", () => {
  const unsealed: SealManifest = {
    ...MANIFEST,
    unsealed: {
      at: NOW,
      gate: {
        file: "exclusions.md",
        commit: "f".repeat(40),
        date: "2026-10-16T15:00:00+05:00",
      },
    },
  };
  const other = `age1${"p".repeat(58)}`;
  // Guards: a study is sealed once, to one set of recipients; a broken manifest is never overwritten.
  expect(
    [
      { ...SEALED, [`${S}/sealed.json`]: "{" },
      { ...SEALED, [`${S}/sealed.json`]: manifestText(unsealed) },
      {
        ...SEALED,
        [`${S}/plan.json`]: planText({
          ...PLAN,
          mode: { ...BLIND, recipients: [other] },
        }),
      },
    ].map((t) => studies("seal", t).err),
  ).toEqual([
    [
      `${W}/sealed.json is not a manifest: not JSON. It is written only by this command; restore it from git, then run this again.`,
    ],
    [
      `P1-S01 was unsealed at ${NOW} (commit ${"f".repeat(40)}); a study is sealed once, and its results are now plain.`,
    ],
    [
      `P1-S01 is sealed to ${R1}, and its plan now names ${other}. A study's files are sealed to one set of recipients: restore the plan's \`mode.recipients\`.`,
    ],
  ]);
});

it("studies verify — a sealed study whose ciphertexts are as recorded", () => {
  // Guards: no key needed, and it says the plaintexts wait for the unsealing.
  expect(studies("verify", SEALED)).toEqual({
    code: 0,
    err: [],
    log: [
      "P1-S01: 2 files sealed, every ciphertext the one recorded. Still sealed: the plaintexts are checked once it is unsealed.",
    ],
    after: SEALED,
  });
});

it("studies verify — an unsealed study whose plaintexts are the ones sealed — and one that is not", () => {
  const m: SealManifest = {
    ...MANIFEST,
    unsealed: {
      at: NOW,
      gate: {
        file: "exclusions.md",
        commit: "f".repeat(40),
        date: "2026-10-16T15:00:00+05:00",
      },
    },
  };
  const t = {
    ...SEALED,
    [`${S}/sealed.json`]: manifestText(m),
    [`${S}/RESULTS.md`]: "41 of 60",
    [`${S}/data/outcome/a.csv`]: "1,2",
  };
  // Guards: after the decision, a swapped plaintext is named by its hash.
  expect(studies("verify", t).log).toEqual([
    `P1-S01: 2 files, every ciphertext and every plaintext the one sealed. Unsealed at ${NOW}, on exclusions.md as committed in ${"f".repeat(40)} (2026-10-16T15:00:00+05:00).`,
  ]);
  expect(studies("verify", { ...t, [`${S}/RESULTS.md`]: "59 of 60" })).toEqual({
    code: 1,
    log: [],
    err: [
      [
        `P1-S01: 1 file in ${W}/sealed.json not as sealed:`,
        `  RESULTS.md: sha256 ${sha("59 of 60")}, the manifest recorded ${sha("41 of 60")} — the plaintext is not the one sealed`,
      ].join("\n"),
    ],
    after: { ...t, [`${S}/RESULTS.md`]: "59 of 60" },
  });
});

it("studies verify — a tampered or missing ciphertext", () => {
  const t = Object.fromEntries(
    Object.entries({
      ...SEALED,
      [`${S}/RESULTS.md.age`]: sealedText("59 of 60"),
    }).filter(([k]) => k !== `${S}/data/outcome/a.csv.age`),
  );
  // Guards: a swapped ciphertext is seen without the key.
  expect(studies("verify", t).err).toEqual([
    [
      `P1-S01: 2 files in ${W}/sealed.json not as sealed:`,
      `  RESULTS.md.age: sha256 ${sha(sealedText("59 of 60"))}, the manifest recorded ${sha(sealedText("41 of 60"))} — the ciphertext is not the one sealed`,
      "  data/outcome/a.csv.age: missing — the sealed file is gone",
    ].join("\n"),
  ]);
});

it("studies verify — refuses a study with no manifest, or one that is not one", () => {
  // Guards: "nothing sealed" is never reported as "verified".
  expect(
    [tree(), { ...SEALED, [`${S}/sealed.json`]: "[]" }].map((t) => [
      studies("verify", t).code,
      studies("verify", t).err,
    ]),
  ).toEqual([
    [
      1,
      [
        `${W} has no sealed.json: nothing is sealed to verify. Seal it with \`npx paperlint studies seal papers/example P1-S01\`.`,
      ],
    ],
    [
      1,
      [
        `${W}/sealed.json is not a manifest: (top): Invalid input: expected object, received array. Restore it from git.`,
      ],
    ],
  ]);
});

it("which study, and the command line — refuses an id that is not a blind study: unknown, no plan, a plan that is not one, a plan without blind", () => {
  const open = planOf(undefined);
  const notBlind = (id: string) =>
    `${id} is not a blind study of papers/example: no row of papers/example/repro/studies.json with this id names a plan.json that parses with the mode \`blind\`. Lint the paper (\`npx paperlint lint\`) to see why.`;
  // Guards: seal never guesses — every way a study is not blind is a refusal naming the id.
  expect([
    studies("seal", tree(), { title: "P1-S09" }).err,
    studies("seal", tree({}, PLAN, { ...ROW, plan: undefined })).err,
    studies("seal", tree({}, PLAN, { ...ROW, plan: "../x.json" })).err,
    studies("seal", { ...tree(), [`${S}/plan.json`]: "{" }).err,
    studies("seal", tree({}, open)).err,
    studies("verify", { ...tree(), [`${DIR}/repro/studies.json`]: "{" }).err,
  ]).toEqual([
    [notBlind("P1-S09")],
    [notBlind("P1-S01")],
    [notBlind("P1-S01")],
    [notBlind("P1-S01")],
    [notBlind("P1-S01")],
    [notBlind("P1-S01")],
  ]);
});

it("which study, and the command line — refuses a missing id and an argument too many, with the usage", () => {
  // Guards: exit 2 for the command line, naming what to type.
  expect(
    [
      studies("seal", SEALED, { title: undefined }),
      studies("verify", SEALED, { extra: ["x"] }),
    ].map((r) => [r.code, r.err]),
  ).toEqual([
    [
      2,
      [
        "studies seal needs the study's id: npx paperlint studies seal <paper-dir> <id>",
      ],
    ],
    [
      2,
      [
        "studies verify takes the paper's folder and one id — `x` is one argument too many",
      ],
    ],
  ]);
});

it("which study, and the command line — an unknown subcommand names all six, and a name of Object's own is no subcommand", () => {
  const usage =
    'new, index, gate, seal, verify or unseal — npx paperlint studies new <paper-dir> "<title>" [--kind <kind>] · npx paperlint studies index <paper-dir> · npx paperlint studies gate <paper-dir> <id> · npx paperlint studies seal <paper-dir> <id> · npx paperlint studies verify <paper-dir> <id> · npx paperlint studies unseal <paper-dir> <id> --identity <file>';
  // Guards: `studies constructor` is refused like any unknown word, not looked up on a prototype.
  expect(
    ["open", "constructor"].map((sub) => studies(sub, SEALED).err),
  ).toEqual([
    [`unknown subcommand \`studies open\`: ${usage}`],
    [`unknown subcommand \`studies constructor\`: ${usage}`],
  ]);
});
