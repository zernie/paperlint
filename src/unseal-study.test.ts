/**
 * `paperlint studies unseal <paper-dir> <id> --identity <file>` (`src/unseal-study.ts`) on papers held
 * in memory, age and git stand-ins. Both halves: once the decision and the manifest are committed, the
 * plaintexts and `unsealed` are written; every refusal writes nothing.
 */
import { expect, it } from "vitest";
import { manifestText, type SealManifest } from "./domain/sealed-study.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { INSTALL_AGE } from "./sealed-studies.ts";
import {
  DATE,
  NOW,
  R1,
  S,
  SHA,
  W,
  enc,
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
const KEY = "/work/key.txt";
const SEALED = tree({
  [`${S}/RESULTS.md.age`]: sealedText("41 of 60"),
  [`${S}/data/outcome/a.csv.age`]: sealedText("1,2"),
  [`${S}/sealed.json`]: manifestText(MANIFEST),
  [KEY]: "AGE-SECRET-KEY-1TEST\n",
});
const GATE = `${S}/exclusions.md`;
const COMMITTED = {
  [GATE]: { kind: "committed", commit: SHA, date: DATE },
  [`${S}/sealed.json`]: {
    kind: "committed",
    commit: "e".repeat(40),
    date: DATE,
  },
} as const;
const unseal = (
  t: Readonly<Record<string, string>> = SEALED,
  git: NonNullable<Parameters<typeof studies>[3]>["git"] = COMMITTED,
  sealer: NonNullable<Parameters<typeof studies>[3]>["sealer"] = "works",
) => studies("unseal", t, { identity: KEY }, { git, sealer });

it("writes every plaintext, then unsealed with the gate's commit, once both are committed", () => {
  const r = unseal();
  const gate = {
    file: "repro/P1-S01-outcome/exclusions.md",
    commit: SHA,
    date: DATE,
  };
  // Guards: the whole after-state — plaintexts as sealed, the manifest recording the gate.
  expect(r).toEqual({
    code: 0,
    err: [],
    log: [
      `unsealed ${W}/RESULTS.md (8 bytes, sha256 ${sha("41 of 60")}, as sealed)`,
      `unsealed ${W}/data/outcome/a.csv (3 bytes, sha256 ${sha("1,2")}, as sealed)`,
      `P1-S01: 2 files unsealed on repro/P1-S01-outcome/exclusions.md as committed in ${SHA} (${DATE}); recorded in ${W}/sealed.json. Next: commit the plaintexts and sealed.json.`,
    ],
    after: {
      ...SEALED,
      [`${S}/RESULTS.md`]: "41 of 60",
      [`${S}/data/outcome/a.csv`]: "1,2",
      [`${S}/sealed.json`]: manifestText({
        ...MANIFEST,
        unsealed: { at: NOW, gate },
      }),
    },
  });
  // Guards: a second run changes nothing and says it is done.
  expect(unseal(r.after).log).toEqual([
    `P1-S01 is already unsealed, at ${NOW} on repro/P1-S01-outcome/exclusions.md as committed in ${SHA}. Check it with \`npx paperlint studies verify\`.`,
  ]);
});

it("refuses before the decision is committed, or while it or the manifest has changed", () => {
  // Guards: no decision, no key use — and the hashes must be public before the key is used.
  expect(
    [
      unseal(SEALED, {}),
      unseal(SEALED, {
        ...COMMITTED,
        [GATE]: { kind: "changed", commit: SHA },
      }),
      unseal(SEALED, { [GATE]: COMMITTED[GATE] }),
      unseal(SEALED, {
        ...COMMITTED,
        [`${S}/sealed.json`]: { kind: "changed", commit: SHA },
      }),
      unseal(SEALED, {
        ...COMMITTED,
        [`${S}/sealed.json`]: { kind: "unknown", why: "no git" },
      }),
    ].map((r) => [
      r.code,
      r.err,
      r.after === SEALED || JSON.stringify(r.after) === JSON.stringify(SEALED),
    ]),
  ).toEqual([
    [
      1,
      [
        "P1-S01: the decision repro/P1-S01-outcome/exclusions.md is not committed; unsealing waits for it. Write the decision there, commit it, then run this again.",
      ],
      true,
    ],
    [
      1,
      [
        `P1-S01: the decision repro/P1-S01-outcome/exclusions.md has changed since its last commit, ${SHA}; unsealing waits for the decision as committed. Commit it, then run this again.`,
      ],
      true,
    ],
    [
      1,
      [
        `P1-S01: ${W}/sealed.json must be committed as it stands before unsealing — the hashes are public before the key is used — and it is not-committed. Commit it, then run this again.`,
      ],
      true,
    ],
    [
      1,
      [
        `P1-S01: ${W}/sealed.json must be committed as it stands before unsealing — the hashes are public before the key is used — and it is changed. Commit it, then run this again.`,
      ],
      true,
    ],
    [
      1,
      [
        `P1-S01: ${W}/sealed.json must be committed as it stands before unsealing — the hashes are public before the key is used — and it is unknown to git (no git). Commit it, then run this again.`,
      ],
      true,
    ],
  ]);
});

it("refuses a swapped ciphertext and a plaintext that is not the one sealed, writing nothing", () => {
  const swapped = {
    ...SEALED,
    [`${S}/RESULTS.md.age`]: sealedText("59 of 60"),
  };
  const lying = {
    ...SEALED,
    [`${S}/sealed.json`]: manifestText({
      ...MANIFEST,
      files: [
        { ...file("RESULTS.md", "41 of 60"), sha256: sha("40 of 60") },
        file("data/outcome/a.csv", "1,2"),
      ],
    }),
  };
  // Guards: no swap after the decision — each mismatch named, the tree as it was.
  expect(
    [unseal(swapped), unseal(lying)].map((r) => [r.code, r.err, r.after]),
  ).toEqual([
    [
      1,
      [
        [
          "P1-S01: 2 checks failed — not as sealed; nothing was written:",
          `  RESULTS.md.age: sha256 ${sha(sealedText("59 of 60"))}, the manifest recorded ${sha(sealedText("41 of 60"))} — the ciphertext is not the one sealed`,
          `  RESULTS.md: decrypts to sha256 ${sha("59 of 60")}, the manifest recorded ${sha("41 of 60")} — not the plaintext sealed`,
        ].join("\n"),
      ],
      swapped,
    ],
    [
      1,
      [
        [
          "P1-S01: 1 check failed — not as sealed; nothing was written:",
          `  RESULTS.md: decrypts to sha256 ${sha("41 of 60")}, the manifest recorded ${sha("40 of 60")} — not the plaintext sealed`,
        ].join("\n"),
      ],
      lying,
    ],
  ]);
});

it("refuses when age is missing or cannot open a file, and without an identity file", () => {
  const broken = { ...SEALED, [`${S}/RESULTS.md.age`]: "garbage" };
  // Guards: a missing age names the install; a wrong key names the file; nothing is written.
  expect([
    unseal(SEALED, COMMITTED, "missing").err,
    unseal(broken).err,
    studies(
      "unseal",
      SEALED,
      { identity: "/work/none.txt" },
      { git: COMMITTED },
    ).err,
    studies("unseal", SEALED, {}, { git: COMMITTED }).err,
  ]).toEqual([
    [INSTALL_AGE],
    [
      "age could not open RESULTS.md.age: no identity matched any of the recipients. Nothing was written.",
    ],
    [
      "--identity /work/none.txt is not a file: an age identity file (AGE-SECRET-KEY-1…) is.",
    ],
    [
      "studies unseal needs the age identity file: npx paperlint studies unseal <paper-dir> <id> --identity <file>",
    ],
  ]);
});

it("refuses a study that is not blind, naming the id", () => {
  // Guards: unseal never guesses which study was meant.
  expect(
    studies(
      "unseal",
      SEALED,
      { identity: KEY, title: "P1-S09" },
      { git: COMMITTED },
    ).err,
  ).toEqual([
    "P1-S09 is not a blind study of papers/example: no row of papers/example/repro/studies.json with this id names a plan.json that parses with the mode `blind`. Lint the paper (`npx paperlint lint`) to see why.",
  ]);
});

it("refuses a study with no manifest, or one that is not one", () => {
  // Guards: nothing sealed is never "unsealed".
  expect([
    unseal(tree({ [KEY]: "k" })).err,
    unseal({ ...SEALED, [`${S}/sealed.json`]: "{" }).err,
  ]).toEqual([
    [`${W} has no sealed.json: nothing is sealed.`],
    [`${W}/sealed.json is not a manifest: not JSON. Restore it from git.`],
  ]);
});
