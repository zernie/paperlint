/**
 * The decisions over a blind study's sealed results (`src/domain/sealed-study.ts`): which files are
 * sealed, what a seal does to each plaintext, what a check against the disk finds, and what
 * `repro/blind-plaintext` reports. Both halves: each defect reported, the clean state silent.
 */
import { expect, it } from "vitest";
import {
  blindMessage,
  isSealable,
  judgeBlind,
  manifestText,
  mismatchLine,
  mismatches,
  sameRecipients,
  sealSteps,
  withSealed,
  type FileMismatch,
  type Hashed,
  type SealManifest,
  type SealedFile,
} from "./sealed-study.ts";
import type { Blind } from "./study-mode.ts";

const R1 = `age1${"q".repeat(58)}`;
const R2 = `age1${"p".repeat(58)}`;

const BLIND: Blind = {
  kind: "blind",
  recipients: [R1],
  outputs: ["data/outcome/**", "RESULTS.md"],
  unseal_after: {
    file: "repro/P1-S01-x/exclusions.md",
    note: "exclusions frozen",
  },
};

const sealed = (path: string, over: Partial<SealedFile> = {}): SealedFile => ({
  path,
  sha256: "a".repeat(64),
  size: 3,
  age_sha256: "c".repeat(64),
  sealed_at: "2026-10-16T10:00:00.000Z",
  ...over,
});

const MANIFEST: SealManifest = {
  recipients: [R1],
  files: [sealed("RESULTS.md")],
  unsealed: null,
};

it("isSealable — which files a blind study seals — a file an output glob matches, at any depth the glob reaches", () => {
  // Guards: `**` reaches nested outcome files, and a literal names one file at the top.
  expect(
    ["data/outcome/a.csv", "data/outcome/x/b.csv", "RESULTS.md"].map((p) =>
      isSealable(BLIND, "P1-S01-x", "plan.json", p),
    ),
  ).toEqual([true, true, true]);
});

it("isSealable — which files a blind study seals — never the study's own files, a ciphertext, or a file no glob matches", () => {
  const all: Blind = { ...BLIND, outputs: ["**"] };
  // Guards: even `**` cannot seal the manifest, the README, the plan, the gate or a ciphertext.
  expect(
    [
      "sealed.json",
      "README.md",
      "plan.json",
      "exclusions.md",
      "data/outcome/a.csv.age",
    ].map((p) => isSealable(all, "P1-S01-x", "plan.json", p)),
  ).toEqual([false, false, false, false, false]);
  expect(isSealable(BLIND, "P1-S01-x", "plan.json", "notes/RESULTS.md")).toBe(
    false,
  );
});

const p = (path: string, sha = "a".repeat(64)) => ({
  path,
  sha256: sha,
  size: 3,
});

it("sealSteps — what a seal does with each plaintext — a new file is sealed; the same bytes already sealed are only dropped; other bytes conflict", () => {
  // Guards: idempotence — a re-run removes a reappeared plaintext; a different one is refused.
  expect(
    sealSteps(
      MANIFEST,
      [p("new.csv"), p("RESULTS.md"), p("RESULTS.md", "b".repeat(64))],
      () => true,
    ),
  ).toEqual([
    { kind: "seal", file: p("new.csv") },
    { kind: "drop", path: "RESULTS.md" },
    {
      kind: "conflict",
      path: "RESULTS.md",
      sealed: "a".repeat(64),
      found: "b".repeat(64),
    },
  ]);
});

it("sealSteps — what a seal does with each plaintext — a sealed file whose ciphertext is gone is sealed again; no manifest seals everything", () => {
  // Guards: a crash between writing the manifest and the ciphertext does not strand a file.
  expect(sealSteps(MANIFEST, [p("RESULTS.md")], () => false)).toEqual([
    { kind: "seal", file: p("RESULTS.md") },
  ]);
  expect(sealSteps(null, [p("x")], () => true)).toEqual([
    { kind: "seal", file: p("x") },
  ]);
});

it("the manifest's lists — withSealed replaces a file by its path and keeps path order", () => {
  const b = sealed("b");
  const a2 = sealed("a", { size: 9 });
  // Guards: a re-sealed path has one entry, the newest; the order does not depend on the run.
  expect(withSealed([sealed("a"), sealed("c")], [b, a2])).toEqual([
    a2,
    b,
    sealed("c"),
  ]);
});

it("the manifest's lists — sameRecipients is set equality, and a repeated recipient is never the same set", () => {
  // Guards: order does not matter; a list with a repeat cannot pass as a set it is not.
  expect([
    sameRecipients([R1, R2], [R2, R1]),
    sameRecipients([R1], [R1, R2]),
    sameRecipients([R1, R1], [R1, R2]),
  ]).toEqual([true, false, false]);
});

it("the manifest's lists — manifestText is indented JSON with a final newline", () => {
  // Guards: the file the commands write is stable, so a re-run with nothing new changes no byte.
  expect(manifestText({ recipients: [], files: [], unsealed: null })).toBe(
    '{\n  "recipients": [],\n  "files": [],\n  "unsealed": null\n}\n',
  );
});

const disk =
  (files: Readonly<Record<string, Hashed>>) =>
  (path: string): Hashed | null =>
    files[path] ?? null;
const ok = { sha256: "a".repeat(64), size: 3 };
const cipher = { sha256: "c".repeat(64), size: 40 };

it("mismatches — the files against the manifest — while sealed only the ciphertext is checked; it holds or is named", () => {
  // Guards: verify needs no key — and a swapped or missing ciphertext is seen without one.
  expect(mismatches(MANIFEST, disk({ "RESULTS.md.age": cipher }))).toEqual([]);
  expect(
    mismatches(
      MANIFEST,
      disk({ "RESULTS.md.age": { sha256: "d".repeat(64), size: 1 } }),
    ),
  ).toEqual([
    {
      path: "RESULTS.md",
      why: "ciphertext",
      recorded: "c".repeat(64),
      found: "d".repeat(64),
    },
  ]);
  expect(mismatches(MANIFEST, disk({}))).toEqual([
    { path: "RESULTS.md", why: "no-ciphertext" },
  ]);
});

it("mismatches — the files against the manifest — once unsealed the plaintext is checked too: present, same hash and size", () => {
  const m: SealManifest = {
    ...MANIFEST,
    unsealed: {
      at: "2026-10-17T00:00:00.000Z",
      gate: { file: "exclusions.md", commit: "f".repeat(40), date: "x" },
    },
  };
  // Guards: after the decision, a plaintext that is not the sealed one is named — no swap.
  expect(
    mismatches(m, disk({ "RESULTS.md.age": cipher, "RESULTS.md": ok })),
  ).toEqual([]);
  expect(
    mismatches(
      m,
      disk({
        "RESULTS.md.age": cipher,
        "RESULTS.md": { sha256: ok.sha256, size: 4 },
      }),
    ),
  ).toEqual([
    {
      path: "RESULTS.md",
      why: "plaintext",
      recorded: ok.sha256,
      found: ok.sha256,
    },
  ]);
  expect(mismatches(m, disk({ "RESULTS.md.age": cipher }))).toEqual([
    { path: "RESULTS.md", why: "no-plaintext" },
  ]);
});

it("mismatches — the files against the manifest — each mismatch has its line", () => {
  // Guards: every kind of mismatch says which file and what is wrong with it.
  const all: readonly FileMismatch[] = [
    { path: "a", why: "no-ciphertext" },
    { path: "a", why: "ciphertext", recorded: "r", found: "f" },
    { path: "a", why: "no-plaintext" },
    { path: "a", why: "plaintext", recorded: "r", found: "f" },
  ];
  expect(all.map(mismatchLine)).toEqual([
    "a.age: missing — the sealed file is gone",
    "a.age: sha256 f, the manifest recorded r — the ciphertext is not the one sealed",
    "a: missing — the study is unsealed and its plaintext is gone",
    "a: sha256 f, the manifest recorded r — the plaintext is not the one sealed",
  ]);
});

const study = {
  id: "P1-S01",
  folder: "P1-S01-x",
  plan: "plan.json",
  blind: BLIND,
  files: ["plan.json", "README.md", "RESULTS.md.age", "sealed.json"],
};

it("judgeBlind — what repro/blind-plaintext reports — a sealed study with only its ciphertext is silent", () => {
  // Guards: the clean tree — silent on a correct study.
  expect(
    judgeBlind({ ...study, manifest: { kind: "read", manifest: MANIFEST } }),
  ).toEqual([]);
});

it("judgeBlind — what repro/blind-plaintext reports — each plaintext an output matches is one finding, sealed or never sealed", () => {
  const files = [...study.files, "RESULTS.md", "data/outcome/a.csv", "x.log"];
  const expected = [
    {
      problem: "plaintext",
      id: "P1-S01",
      folder: "P1-S01-x",
      path: "RESULTS.md",
    },
    {
      problem: "plaintext",
      id: "P1-S01",
      folder: "P1-S01-x",
      path: "data/outcome/a.csv",
    },
  ];
  // Guards: loud on each defect, before the first seal as after it; a file no glob matches is not one.
  expect(judgeBlind({ ...study, files, manifest: { kind: "absent" } })).toEqual(
    expected,
  );
  expect(
    judgeBlind({
      ...study,
      files,
      manifest: { kind: "read", manifest: MANIFEST },
    }),
  ).toEqual(expected);
});

it("judgeBlind — what repro/blind-plaintext reports — an unreadable manifest is reported, and is not read as unsealed", () => {
  // Guards: a broken manifest cannot switch the rule off.
  expect(
    judgeBlind({
      ...study,
      files: [...study.files, "RESULTS.md"],
      manifest: { kind: "unreadable", why: "not JSON" },
    }),
  ).toEqual([
    {
      problem: "unreadable-manifest",
      id: "P1-S01",
      folder: "P1-S01-x",
      why: "not JSON",
    },
    {
      problem: "plaintext",
      id: "P1-S01",
      folder: "P1-S01-x",
      path: "RESULTS.md",
    },
  ]);
});

it("judgeBlind — what repro/blind-plaintext reports — an unsealed study's plaintext is silent", () => {
  // Guards: after the recorded decision the plaintext belongs in the tree.
  expect(
    judgeBlind({
      ...study,
      files: [...study.files, "RESULTS.md"],
      manifest: {
        kind: "read",
        manifest: {
          ...MANIFEST,
          unsealed: {
            at: "t",
            gate: {
              file: "exclusions.md",
              commit: "f".repeat(40),
              date: "d",
            },
          },
        },
      },
    }),
  ).toEqual([]);
});

it("judgeBlind — what repro/blind-plaintext reports — each finding's message names the file, the command, and the rule's page", () => {
  // Guards: the whole text a person reads, for both problems.
  expect(
    blindMessage({
      problem: "plaintext",
      id: "P1-S01",
      folder: "P1-S01-x",
      path: "RESULTS.md",
    }),
  ).toBe(
    "`repro/P1-S01-x/RESULTS.md` is a plaintext result of the blind study `P1-S01`, which is still sealed: its plan's `mode.outputs` match it, and its `sealed.json` does not say unsealed. What to do: run `npx paperlint studies seal <paper-dir> P1-S01` — it encrypts the file to the plan's recipients and removes the plaintext. Never read it first.\nRule repro/blind-plaintext: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/blind-plaintext.md",
  );
  expect(
    blindMessage({
      problem: "unreadable-manifest",
      id: "P1-S01",
      folder: "P1-S01-x",
      why: "not JSON",
    }),
  ).toBe(
    "`repro/P1-S01-x/sealed.json`, the sealed results of `P1-S01`, is not a manifest: not JSON. It is written only by `paperlint studies seal` and `unseal`. What to do: restore it from git (`git checkout -- repro/P1-S01-x/sealed.json`).\nRule repro/blind-plaintext: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/blind-plaintext.md",
  );
});

it("judgeBlind — a decision the outputs match is reported, sealed or unsealed, and its message says why", () => {
  const clash: Blind = { ...BLIND, outputs: ["**/*.md"] };
  const finding = {
    problem: "decision-is-output",
    id: "P1-S01",
    folder: "P1-S01-x",
    file: "repro/P1-S01-x/exclusions.md",
    glob: "**/*.md",
  } as const;
  // Guards: a decision that would be sealed with the results is loud even after unsealing.
  expect(
    judgeBlind({
      ...study,
      blind: clash,
      files: ["plan.json"],
      manifest: { kind: "absent" },
    }),
  ).toEqual([finding]);
  expect(
    judgeBlind({
      ...study,
      blind: clash,
      files: ["plan.json"],
      manifest: {
        kind: "read",
        manifest: {
          ...MANIFEST,
          unsealed: {
            at: "t",
            gate: { file: "f", commit: "f".repeat(40), date: "d" },
          },
        },
      },
    }),
  ).toEqual([finding]);
  expect(blindMessage(finding)).toBe(
    "The decision `P1-S01` is unsealed after, `repro/P1-S01-x/exclusions.md`, is matched by its output `**/*.md`: it would be sealed with the results, and the study could never be unsealed. What to do: move the decision out of the outputs (a file the globs do not match, or one elsewhere in the paper) and set `mode.unseal_after.file`.\nRule repro/blind-plaintext: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/blind-plaintext.md",
  );
});
