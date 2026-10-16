/**
 * `paperlint studies seal|verify <paper-dir> <id>` — a blind study's results, sealed and checked
 * (docs/design/sealed-studies.md).
 *
 *   seal     every file the plan's `blind.outputs` match, encrypted with age to `<file>.age` for every
 *            recipient; `sealed.json` records each plaintext's sha256, size and the time; the plaintext
 *            is removed. A re-run seals only what is new and refuses a changed result.
 *   verify   no key needed: every ciphertext against the sha256 the manifest recorded, and once the
 *            study is unsealed, every plaintext too.
 *
 * Unsealing is not here yet: who holds the private key, and where, is an open decision.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  blindStudies,
  filesUnder,
  type BlindDeps,
} from "./blind-plaintext-rule.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import {
  MANIFEST_FILE,
  SEALED_SUFFIX,
  isSealable,
  manifestText,
  mismatchLine,
  mismatches,
  sameRecipients,
  sealSteps,
  withSealed,
  type BlindStudy,
  type Hashed,
  type SealManifest,
  type SealStep,
  type SealedFile,
} from "./domain/sealed-study.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { RemoveFile } from "./ports/remove-file.ts";
import type { Sealer } from "./ports/sealer.ts";

/** What sealing reads and writes with, beyond the registry's own. */
export interface SealDeps extends BlindDeps {
  readonly sealer: Sealer;
  readonly remove: RemoveFile;
  /** Now, ISO 8601 in UTC: the root reads the clock. */
  readonly now: string;
}

/** A refusal: the exit code, and the line that explains it. */
export interface SealRefusal {
  readonly code: 1 | 2;
  readonly line: string;
}

/** What a run came to: the lines it printed, or the refusal. */
export type SealRun =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly refusal: SealRefusal };

const refusal = (line: string): SealRefusal => ({ code: 1, line });
const refused = (r: SealRefusal): SealRun => ({ ok: false, refusal: r });
const isRefusal = (v: unknown): v is SealRefusal =>
  typeof v === "object" && v !== null && "code" in v && "line" in v;

/** What `age` missing means to the person who ran the command. */
export const INSTALL_AGE =
  "age is not installed, and sealing runs it (this package implements no cryptography). Install it — `apt install age`, `brew install age`, or a release from https://github.com/FiloSottile/age/releases — then run this again.";

/** `k` things, singular or plural. */
const count = (k: number, what: string): string =>
  `${String(k)} ${what}${k === 1 ? "" : "s"}`;

/** The study a command works on: its folder on disk and as shown. */
interface At {
  readonly s: BlindStudy;
  readonly folder: string;
  readonly where: string;
}

/** The blind study `id` of the paper folder, or the refusal naming why there is none. */
const blindStudy = (
  paper: string,
  shown: string,
  id: string,
  deps: BlindDeps,
): At | SealRefusal => {
  const s = blindStudies(paper, deps).find((b) => b.id === id);
  return s === undefined
    ? refusal(
        `${id} is not a blind study of ${shown}: no row of ${shown}/${REPRO_DIR}/studies.json with this id names a plan.json that parses and has \`blind\`. Lint the paper (\`npx paperlint lint\`) to see why.`,
      )
    : {
        s,
        folder: join(paper, REPRO_DIR, s.folder),
        where: `${shown}/${REPRO_DIR}/${s.folder}`,
      };
};

/** The hash and size of the file at `p`; null when there is none. */
const hashed = (deps: BlindDeps, p: string): Hashed | null => {
  const b = deps.files.isFile(callerPath(p))
    ? deps.files.readBytes(callerPath(p))
    : null;
  return b === null ? null : { sha256: sha256Hex(b), size: b.length };
};

/** The manifest a read study can be sealed into: still sealed, to the plan's recipients. */
const stillSealed = (
  s: BlindStudy,
  m: SealManifest,
): SealManifest | SealRefusal => {
  if (m.unsealed !== null)
    return refusal(
      `${s.id} was unsealed at ${m.unsealed.at} (commit ${m.unsealed.gate.commit}); a study is sealed once, and its results are now plain.`,
    );
  return sameRecipients(m.recipients, s.blind.recipients)
    ? m
    : refusal(
        `${s.id} is sealed to ${m.recipients.join(", ")}, and its plan now names ${s.blind.recipients.join(", ")}. A study's files are sealed to one set of recipients: restore the plan's \`blind.recipients\`.`,
      );
};

/** The manifest the study can be sealed into: none yet, or a sealed one; else the refusal. */
const sealableManifest = (a: At): SealManifest | null | SealRefusal => {
  const state = a.s.manifest;
  switch (state.kind) {
    case "absent":
      return null;
    case "unreadable":
      return refusal(
        `${a.where}/${MANIFEST_FILE} is not a manifest: ${state.why}. It is written only by this command; restore it from git, then run this again.`,
      );
    case "read":
      return stillSealed(a.s, state.manifest);
  }
};

/** A plaintext on disk, its bytes beside its hash. */
interface Plain {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Every plaintext of the study's outputs. */
const plainsOf = (a: At, deps: BlindDeps): readonly Plain[] =>
  filesUnder(a.folder, deps)
    .filter((f) => isSealable(a.s.blind, a.s.plan, f))
    .flatMap((path) => {
      const b = deps.files.readBytes(callerPath(join(a.folder, path)));
      return b === null ? [] : [{ path, bytes: b }];
    });

/** The refusal of the steps that conflict with what was sealed; null when none does. */
const conflictsOf = (a: At, steps: readonly SealStep[]): SealRefusal | null => {
  const c = steps.flatMap((st) => (st.kind === "conflict" ? [st] : []));
  return c.length === 0
    ? null
    : refusal(
        [
          `${a.s.id}: ${count(c.length, "result file")} not the one sealed, and a sealed result is never replaced by a seal. Nothing was written.`,
          ...c.map((x) => `  ${x.path}: sealed ${x.sealed}, now ${x.found}`),
          `To replace one on purpose, remove its ${SEALED_SUFFIX} file (git rm) and run this again: the change is then in the history.`,
        ].join("\n"),
      );
};

/** A file sealed in this run: its record, and the ciphertext to write. */
interface Sealed {
  readonly file: SealedFile;
  readonly cipher: Uint8Array;
}

/** The record of `p` sealed to `cipher` at `now`. */
const recordOf = (p: Plain, cipher: Uint8Array, now: string): Sealed => ({
  file: {
    path: p.path,
    sha256: sha256Hex(p.bytes),
    size: p.bytes.length,
    age_sha256: sha256Hex(cipher),
    sealed_at: now,
  },
  cipher,
});

/** Each file encrypted; or the refusal of the first age could not seal. Writes nothing. */
const encrypted = (
  a: At,
  plains: readonly Plain[],
  deps: SealDeps,
): readonly Sealed[] | SealRefusal => {
  const done = plains.map((p) => ({
    p,
    sealed: deps.sealer.seal(a.s.blind.recipients, p.bytes),
  }));
  const failed = done.find((d) => !d.sealed.ok)?.sealed;
  if (failed !== undefined && !failed.ok)
    return refusal(
      failed.error.kind === "missing"
        ? INSTALL_AGE
        : `age could not seal ${a.where}: ${failed.error.message}. Nothing was written.`,
    );
  return done.flatMap(({ p, sealed }) =>
    sealed.ok ? [recordOf(p, sealed.value, deps.now)] : [],
  );
};

/** What one seal changes: the new manifest, the files sealed now, and the step for each plaintext. */
interface Change {
  readonly manifest: SealManifest;
  readonly added: readonly Sealed[];
  readonly steps: readonly SealStep[];
}

/** Write the ciphertexts, then the manifest, then remove every plaintext: the order a crash survives. */
function write(a: At, c: Change, deps: SealDeps): void {
  const at = (p: string) => callerPath(join(a.folder, p));
  c.added.forEach((f) => {
    deps.files.writeAtomic(at(`${f.file.path}${SEALED_SUFFIX}`), f.cipher);
  });
  deps.files.writeAtomic(
    at(MANIFEST_FILE),
    new TextEncoder().encode(manifestText(c.manifest)),
  );
  c.steps.forEach((st) => {
    deps.remove(at(st.kind === "seal" ? st.file.path : st.path));
  });
}

/** What a seal prints. */
const sealLines = (a: At, c: Change): readonly string[] => [
  ...c.added.map(
    ({ file: f }) =>
      `sealed ${a.where}/${f.path} → ${f.path}${SEALED_SUFFIX} (${String(f.size)} bytes, sha256 ${f.sha256})`,
  ),
  ...c.steps.flatMap((st) =>
    st.kind === "drop"
      ? [`removed ${a.where}/${st.path}: already sealed, the same sha256`]
      : [],
  ),
  c.added.length === 0
    ? `nothing new to seal: ${count(c.manifest.files.length, "file")} sealed in ${a.where}/${MANIFEST_FILE}`
    : `${count(c.manifest.files.length, "file")} sealed to ${count(c.manifest.recipients.length, "recipient")} in ${a.where}/${MANIFEST_FILE}. Next: commit ${MANIFEST_FILE} and the ${SEALED_SUFFIX} files — the hashes are then public before anyone can decrypt.`,
];

/** The step for each plaintext; or the refusal when one conflicts, or there is nothing at all. */
const stepsOf = (
  a: At,
  manifest: SealManifest | null,
  plains: readonly Plain[],
  deps: SealDeps,
): readonly SealStep[] | SealRefusal => {
  const steps = sealSteps(
    manifest,
    plains.map((p) => ({
      path: p.path,
      sha256: sha256Hex(p.bytes),
      size: p.bytes.length,
    })),
    (p) =>
      deps.files.isFile(callerPath(join(a.folder, `${p}${SEALED_SUFFIX}`))),
  );
  if (manifest === null && steps.length === 0)
    return refusal(
      `${a.where} has no file that blind.outputs (${a.s.blind.outputs.join(", ")}) match, and nothing is sealed yet. Run the study first, or correct the outputs.`,
    );
  return conflictsOf(a, steps) ?? steps;
};

/** The plaintexts whose step is to be sealed. */
const toSeal = (
  plains: readonly Plain[],
  steps: readonly SealStep[],
): readonly Plain[] =>
  plains.filter((p) =>
    steps.some((st) => st.kind === "seal" && st.file.path === p.path),
  );

/** The seal of a study whose manifest allows one. */
function sealInto(
  a: At,
  manifest: SealManifest | null,
  deps: SealDeps,
): SealRun {
  const plains = plainsOf(a, deps);
  const steps = stepsOf(a, manifest, plains, deps);
  if (isRefusal(steps)) return refused(steps);
  const added = encrypted(a, toSeal(plains, steps), deps);
  if (isRefusal(added)) return refused(added);
  const change: Change = {
    manifest: {
      recipients: a.s.blind.recipients,
      files: withSealed(
        manifest?.files ?? [],
        added.map((f) => f.file),
      ),
      unsealed: null,
    },
    added,
    steps,
  };
  write(a, change, deps);
  return { ok: true, lines: sealLines(a, change) };
}

/** `studies seal`: every output encrypted, recorded, and its plaintext removed. */
export function runSeal(
  paper: string,
  shown: string,
  id: string,
  deps: SealDeps,
): SealRun {
  const a = blindStudy(paper, shown, id, deps);
  if (isRefusal(a)) return refused(a);
  const manifest = sealableManifest(a);
  return isRefusal(manifest) ? refused(manifest) : sealInto(a, manifest, deps);
}

/** The line verify prints for a manifest whose files all hold. */
const verified = (a: At, m: SealManifest): string => {
  const files = count(m.files.length, "file");
  return m.unsealed === null
    ? `${a.s.id}: ${files} sealed, every ciphertext the one recorded. Still sealed: the plaintexts are checked once it is unsealed.`
    : `${a.s.id}: ${files}, every ciphertext and every plaintext the one sealed. Unsealed at ${m.unsealed.at}, on ${m.unsealed.gate.file} as committed in ${m.unsealed.gate.commit} (${m.unsealed.gate.date}).`;
};

/** The manifest verify reads; the refusal when there is none to read. */
const toVerify = (a: At, shown: string): SealManifest | SealRefusal => {
  const state = a.s.manifest;
  switch (state.kind) {
    case "absent":
      return refusal(
        `${a.where} has no ${MANIFEST_FILE}: nothing is sealed to verify. Seal it with \`npx paperlint studies seal ${shown} ${a.s.id}\`.`,
      );
    case "unreadable":
      return refusal(
        `${a.where}/${MANIFEST_FILE} is not a manifest: ${state.why}. Restore it from git.`,
      );
    case "read":
      return state.manifest;
  }
};

/** `studies verify`: the files against the manifest, no key needed. */
export function runVerify(
  paper: string,
  shown: string,
  id: string,
  deps: BlindDeps,
): SealRun {
  const a = blindStudy(paper, shown, id, deps);
  if (isRefusal(a)) return refused(a);
  const m = toVerify(a, shown);
  if (isRefusal(m)) return refused(m);
  const found = mismatches(m, (p) => hashed(deps, join(a.folder, p)));
  return found.length === 0
    ? { ok: true, lines: [verified(a, m)] }
    : refused(
        refusal(
          [
            `${a.s.id}: ${count(found.length, "file")} in ${a.where}/${MANIFEST_FILE} not as sealed:`,
            ...found.map((f) => `  ${mismatchLine(f)}`),
          ].join("\n"),
        ),
      );
}
