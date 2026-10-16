/**
 * A BLIND STUDY'S SEALED RESULTS — what a plan's `blind` declares, what `sealed.json` records, and the
 * decisions over them: which files are sealed, what a seal does to each, what the lint reports. The
 * design is docs/design/sealed-studies.md; the rule is `repro/blind-plaintext`.
 *
 * A blind study's outcomes are computed by a runner in the same workspace where the people deciding
 * exclusions work. Its result files are encrypted (age, public key) the moment they are written; only
 * the holder of the private key can decrypt them, and only after a recorded decision. The manifest
 * records each file's sha256 before encryption, so anyone can check, after unsealing, that the
 * plaintext is the one that was sealed.
 *
 * ── STATE LIVES IN THE MANIFEST, NOT IN THE PLAN ─────────────────────────────────────
 * The plan says what is sealed and to whom; it never says whether it is. `sealed.json` is written only
 * by `paperlint studies seal` and `unseal`, and "unsealed" is one field that carries the decision's
 * commit — an unsealed study without its gate cannot be written down.
 *
 * Pure: the caller lists the study's folder, reads the files, hashes them and asks git.
 */
import { posix } from "node:path";
import { README } from "./repro-layout.ts";

/** The manifest, in the study's folder beside its plan. */
export const MANIFEST_FILE = "sealed.json";

/** A sealed file is its plaintext's path with this suffix. */
export const SEALED_SUFFIX = ".age";

/**
 * A native age recipient: `age1`, then 58 characters of bech32's alphabet. Plugin and post-quantum
 * recipients are longer and are refused: the age CLI this package drives is the one that must read them.
 */
export const RECIPIENT_PATTERN = /^age1[02-9ac-hj-np-z]{58}$/u;

/** The decision that unseals the study: a file of the study's, and what it is. */
export interface UnsealGate {
  /** A path inside the study's folder; once committed, unsealing may begin. */
  readonly file: string;
  readonly note: string;
}

/** A plan's `blind`: who can unseal, which files are sealed, and the decision that unseals them. */
export interface Blind {
  readonly recipients: readonly string[];
  /** Globs relative to the study's folder. */
  readonly outputs: readonly string[];
  readonly unseal_after: UnsealGate;
}

/** One sealed file, as `paperlint studies seal` recorded it. */
export interface SealedFile {
  /** The plaintext's path, relative to the study's folder; the ciphertext is `<path>.age`. */
  readonly path: string;
  /** The plaintext's sha256, hex. */
  readonly sha256: string;
  /** The plaintext's size in bytes. */
  readonly size: number;
  /** The ciphertext's sha256: a swapped ciphertext is seen without the key. */
  readonly age_sha256: string;
  readonly sealed_at: string;
}

/** The commit that recorded the decision a study was unsealed on. */
export interface GateCommit {
  readonly file: string;
  readonly commit: string;
  readonly date: string;
}

export interface Unsealed {
  readonly at: string;
  readonly gate: GateCommit;
}

/** `sealed.json`: the recipients, every sealed file, and — once — the unsealing. */
export interface SealManifest {
  readonly recipients: readonly string[];
  readonly files: readonly SealedFile[];
  /** null: still sealed. */
  readonly unsealed: Unsealed | null;
}

/** A manifest's text, parsed: the manifest, or the reasons it is not one. */
export type ParsedManifest =
  | { readonly ok: true; readonly manifest: SealManifest }
  | { readonly ok: false; readonly why: string };

/** What a study's folder holds of a manifest. */
export type ManifestState =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "read"; readonly manifest: SealManifest };

/** The manifest's text as the commands write it: JSON, two-space indented, a final newline. */
export const manifestText = (m: SealManifest): string =>
  `${JSON.stringify(m, null, 2)}\n`;

/** Names no output glob may match: the study's own files, which are never results. */
export const RESERVED_NAMES: readonly string[] = [MANIFEST_FILE, README];

/**
 * Whether the file at `path` (relative to the study's folder) is one the study seals: matched by an
 * output glob, and none of the study's own files — the manifest, the README, the plan, the gate, a
 * ciphertext.
 */
export const isSealable = (blind: Blind, plan: string, path: string): boolean =>
  !path.endsWith(SEALED_SUFFIX) &&
  ![...RESERVED_NAMES, plan, blind.unseal_after.file].includes(path) &&
  blind.outputs.some((g) => posix.matchesGlob(path, g));

/** A plaintext on disk, hashed. */
export interface Plaintext {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

/** What a seal does with one plaintext. */
export type SealStep =
  /** Not sealed yet, or its ciphertext is gone: encrypt it. */
  | { readonly kind: "seal"; readonly file: Plaintext }
  /** Sealed already, the same bytes: only the plaintext is removed. */
  | { readonly kind: "drop"; readonly path: string }
  /** Sealed already, other bytes: refused, the sealed one stands. */
  | {
      readonly kind: "conflict";
      readonly path: string;
      readonly sealed: string;
      readonly found: string;
    };

/**
 * The step for each plaintext, against the manifest (null: none yet). `hasCiphertext` says whether
 * `<path>.age` is a file.
 */
export const sealSteps = (
  manifest: SealManifest | null,
  plaintexts: readonly Plaintext[],
  hasCiphertext: (path: string) => boolean,
): readonly SealStep[] =>
  plaintexts.map((p): SealStep => {
    const sealed = manifest?.files.find((f) => f.path === p.path);
    if (sealed === undefined || !hasCiphertext(p.path))
      return { kind: "seal", file: p };
    return sealed.sha256 === p.sha256
      ? { kind: "drop", path: p.path }
      : {
          kind: "conflict",
          path: p.path,
          sealed: sealed.sha256,
          found: p.sha256,
        };
  });

/** `files` with `added` in place of any of the same path, in path order. */
export const withSealed = (
  files: readonly SealedFile[],
  added: readonly SealedFile[],
): readonly SealedFile[] =>
  [
    ...files.filter((f) => !added.some((a) => a.path === f.path)),
    ...added,
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

/** Whether two lists of recipients name the same set. */
export const sameRecipients = (
  a: readonly string[],
  b: readonly string[],
): boolean =>
  a.length === b.length &&
  a.every((r) => b.includes(r)) &&
  new Set(a).size === a.length;

/** What a check of one sealed file against the disk came to; null: it holds. */
export type FileMismatch =
  | { readonly path: string; readonly why: "no-ciphertext" }
  | {
      readonly path: string;
      readonly why: "ciphertext";
      readonly recorded: string;
      readonly found: string;
    }
  | { readonly path: string; readonly why: "no-plaintext" }
  | {
      readonly path: string;
      readonly why: "plaintext";
      readonly recorded: string;
      readonly found: string;
    };

/** One line for a mismatch. */
export const mismatchLine = (m: FileMismatch): string => {
  switch (m.why) {
    case "no-ciphertext":
      return `${m.path}${SEALED_SUFFIX}: missing — the sealed file is gone`;
    case "ciphertext":
      return `${m.path}${SEALED_SUFFIX}: sha256 ${m.found}, the manifest recorded ${m.recorded} — the ciphertext is not the one sealed`;
    case "no-plaintext":
      return `${m.path}: missing — the study is unsealed and its plaintext is gone`;
    case "plaintext":
      return `${m.path}: sha256 ${m.found}, the manifest recorded ${m.recorded} — the plaintext is not the one sealed`;
  }
};

/** The bytes and hash of a file on disk, or null when it is not there. */
export interface Hashed {
  readonly sha256: string;
  readonly size: number;
}

/**
 * Every file of `m` checked against the disk: the ciphertext always (no key needed), the plaintext
 * once unsealed. `at(path)` hashes the file at `path`, relative to the study's folder.
 */
export const mismatches = (
  m: SealManifest,
  at: (path: string) => Hashed | null,
): readonly FileMismatch[] =>
  m.files.flatMap((f): readonly FileMismatch[] => {
    const c = at(`${f.path}${SEALED_SUFFIX}`);
    const cipher: readonly FileMismatch[] =
      c === null
        ? [{ path: f.path, why: "no-ciphertext" }]
        : c.sha256 === f.age_sha256
          ? []
          : [
              {
                path: f.path,
                why: "ciphertext",
                recorded: f.age_sha256,
                found: c.sha256,
              },
            ];
    if (m.unsealed === null) return cipher;
    const p = at(f.path);
    const plain: readonly FileMismatch[] =
      p === null
        ? [{ path: f.path, why: "no-plaintext" }]
        : p.sha256 === f.sha256 && p.size === f.size
          ? []
          : [
              {
                path: f.path,
                why: "plaintext",
                recorded: f.sha256,
                found: p.sha256,
              },
            ];
    return [...cipher, ...plain];
  });

// ── the lint ──────────────────────────────────────────────────────────────────────

/** One defect `repro/blind-plaintext` reports. */
export type BlindFinding =
  | {
      readonly problem: "plaintext";
      readonly id: string;
      readonly folder: string;
      readonly path: string;
    }
  | {
      readonly problem: "unreadable-manifest";
      readonly id: string;
      readonly folder: string;
      readonly why: string;
    };

/** What the judge reads of one blind study. */
export interface BlindStudy {
  readonly id: string;
  readonly folder: string;
  /** The plan's path in the folder, as the row names it. */
  readonly plan: string;
  readonly blind: Blind;
  readonly manifest: ManifestState;
  /** Every file under the study's folder, relative to it. */
  readonly files: readonly string[];
}

/**
 * The defects of a blind study: a manifest that cannot be read, and — until the manifest says
 * unsealed — each plaintext file its outputs match. An unreadable manifest is not an unsealed one.
 */
export const judgeBlind = (s: BlindStudy): readonly BlindFinding[] => {
  const at = { id: s.id, folder: s.folder };
  if (s.manifest.kind === "read" && s.manifest.manifest.unsealed !== null)
    return [];
  return [
    ...(s.manifest.kind === "unreadable"
      ? [
          {
            problem: "unreadable-manifest",
            ...at,
            why: s.manifest.why,
          } as const,
        ]
      : []),
    ...s.files
      .filter((f) => isSealable(s.blind, s.plan, f))
      .map((path): BlindFinding => ({ problem: "plaintext", ...at, path })),
  ];
};

const RULE = "repro/blind-plaintext";

/** The one text a finding is reported with: what is wrong, what to do, and the rule's page. */
export const blindMessage = (f: BlindFinding): string => {
  const head =
    f.problem === "plaintext"
      ? `\`repro/${f.folder}/${f.path}\` is a plaintext result of the blind study \`${f.id}\`, which is still sealed: its plan's \`blind.outputs\` match it, and its \`${MANIFEST_FILE}\` does not say unsealed. What to do: run \`npx paperlint studies seal <paper-dir> ${f.id}\` — it encrypts the file to the plan's recipients and removes the plaintext. Never read it first.`
      : `\`repro/${f.folder}/${MANIFEST_FILE}\`, the sealed results of \`${f.id}\`, is not a manifest: ${f.why}. It is written only by \`paperlint studies seal\` and \`unseal\`. What to do: restore it from git (\`git checkout -- repro/${f.folder}/${MANIFEST_FILE}\`).`;
  return `${head}\nRule ${RULE}: https://github.com/zernie/paperlint/blob/main/docs/rules/${RULE}.md`;
};
