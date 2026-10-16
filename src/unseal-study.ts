/**
 * `paperlint studies unseal <paper-dir> <id> --identity <file>` — a blind study's results decrypted,
 * once its decision is committed (docs/design/sealed-studies.md). It refuses unless:
 *
 *   - the decision `mode.unseal_after.file` is committed as it stands (its commit and date are recorded);
 *   - `sealed.json` is committed as it stands: the hashes were public before the key was used;
 *   - every ciphertext is the one recorded, and every decrypted plaintext has the recorded sha256 and size.
 *
 * Nothing is written until every check passes; then the plaintexts, and `unsealed` in the manifest.
 * The identity is a standard age identity file. Where it lives — a person's machine, a hardware key, a
 * secret store — is the user's choice; this command holds no policy on it.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  MANIFEST_FILE,
  SEALED_SUFFIX,
  manifestText,
  mismatchLine,
  mismatches,
  type GateCommit,
  type SealManifest,
  type SealedFile,
} from "./domain/sealed-study.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { Committed, GitHistory } from "./ports/git-history.ts";
import type { SealerFailure } from "./ports/sealer.ts";
import {
  INSTALL_AGE,
  blindStudy,
  count,
  hashed,
  isRefusal,
  refusal,
  refused,
  type At,
  type SealDeps,
  type SealRefusal,
  type SealRun,
} from "./sealed-studies.ts";
import { gateLine } from "./study-gate.ts";

export interface UnsealDeps extends SealDeps {
  readonly git: GitHistory;
}

/** The manifest to unseal: read and still sealed; the refusal, or "already", otherwise. */
const sealedManifest = (
  a: At,
): SealManifest | SealRefusal | { readonly already: string } => {
  const state = a.s.manifest;
  switch (state.kind) {
    case "absent":
      return refusal(`${a.where} has no ${MANIFEST_FILE}: nothing is sealed.`);
    case "unreadable":
      return refusal(
        `${a.where}/${MANIFEST_FILE} is not a manifest: ${state.why}. Restore it from git.`,
      );
    case "read":
      return state.manifest.unsealed === null
        ? state.manifest
        : {
            already: `${a.s.id} is already unsealed, at ${state.manifest.unsealed.at} on ${state.manifest.unsealed.gate.file} as committed in ${state.manifest.unsealed.gate.commit}. Check it with \`npx paperlint studies verify\`.`,
          };
  }
};

/** The gate's commit, when both the decision and the manifest are committed as they stand. */
const gateOf = (
  paper: string,
  a: At,
  deps: UnsealDeps,
): GateCommit | SealRefusal => {
  const file = a.s.blind.unseal_after.file;
  const decision = deps.git.committed(
    callerPath(paper),
    callerPath(join(paper, file)),
  );
  if (decision.kind !== "committed")
    return refusal(gateLine(a.s.id, file, decision, "unsealing").line);
  const manifest: Committed = deps.git.committed(
    callerPath(paper),
    callerPath(join(a.folder, MANIFEST_FILE)),
  );
  return manifest.kind === "committed"
    ? { file, commit: decision.commit, date: decision.date }
    : refusal(
        `${a.s.id}: ${a.where}/${MANIFEST_FILE} must be committed as it stands before unsealing — the hashes are public before the key is used — and it is ${manifest.kind === "unknown" ? `unknown to git (${manifest.why})` : manifest.kind}. Commit it, then run this again.`,
      );
};

/** A file opened with the key. */
interface Opened {
  readonly file: SealedFile;
  readonly plain: Uint8Array;
}
/** A file age could not open. */
interface Closed {
  readonly file: SealedFile;
  readonly failure: SealerFailure;
}
const isClosed = (o: Opened | Closed): o is Closed => "failure" in o;
const isOpened = (o: Opened | Closed): o is Opened => "plain" in o;

/** Each file of `m` decrypted; or the refusal of the first that age could not open. Writes nothing. */
const decrypted = (
  a: At,
  m: SealManifest,
  identity: string,
  deps: UnsealDeps,
): readonly Opened[] | SealRefusal => {
  const done = m.files.map((file): Opened | Closed => {
    const r = deps.sealer.unseal(
      callerPath(identity),
      callerPath(join(a.folder, `${file.path}${SEALED_SUFFIX}`)),
    );
    return r.ok ? { file, plain: r.value } : { file, failure: r.error };
  });
  const failed = done.find(isClosed);
  if (failed === undefined) return done.filter(isOpened);
  return refusal(
    failed.failure.kind === "missing"
      ? INSTALL_AGE
      : `age could not open ${failed.file.path}${SEALED_SUFFIX}: ${failed.failure.message}. Nothing was written.`,
  );
};

/** The decrypted files whose bytes are not the ones sealed, as lines; none when all hold. */
const plaintextMismatches = (opened: readonly Opened[]): readonly string[] =>
  opened
    .filter(
      ({ file, plain }) =>
        sha256Hex(plain) !== file.sha256 || plain.length !== file.size,
    )
    .map(
      ({ file, plain }) =>
        `  ${file.path}: decrypts to sha256 ${sha256Hex(plain)}, the manifest recorded ${file.sha256} — not the plaintext sealed`,
    );

/** The refusal when a ciphertext is not the one recorded, or a plaintext not the one sealed; else null. */
const notAsSealed = (
  a: At,
  m: SealManifest,
  opened: readonly Opened[],
  deps: UnsealDeps,
): SealRefusal | null => {
  const lines = [
    ...mismatches(m, (p) => hashed(deps, join(a.folder, p))).map(
      (x) => `  ${mismatchLine(x)}`,
    ),
    ...plaintextMismatches(opened),
  ];
  return lines.length === 0
    ? null
    : refusal(
        [
          `${a.s.id}: ${count(lines.length, "check")} failed — not as sealed; nothing was written:`,
          ...lines,
        ].join("\n"),
      );
};

/** Write every plaintext, then the manifest with its unsealing. */
const writeUnsealed = (
  { a, m, gate }: Ready,
  opened: readonly Opened[],
  deps: UnsealDeps,
): SealManifest => {
  opened.forEach(({ file, plain }) => {
    deps.files.writeAtomic(callerPath(join(a.folder, file.path)), plain);
  });
  const next: SealManifest = { ...m, unsealed: { at: deps.now, gate } };
  deps.files.writeAtomic(
    callerPath(join(a.folder, MANIFEST_FILE)),
    new TextEncoder().encode(manifestText(next)),
  );
  return next;
};

/** A study ready to unseal: its manifest still sealed, its gate committed, the identity to open it. */
interface Ready {
  readonly a: At;
  readonly m: SealManifest;
  readonly gate: GateCommit;
  readonly identity: string;
}

/** The unsealing of a study whose manifest is sealed and whose gate is committed. */
const unsealWith = (
  { a, m, gate, identity }: Ready,
  deps: UnsealDeps,
): SealRun => {
  const opened = decrypted(a, m, identity, deps);
  if (isRefusal(opened)) return refused(opened);
  const bad = notAsSealed(a, m, opened, deps);
  if (bad !== null) return refused(bad);
  writeUnsealed({ a, m, gate, identity }, opened, deps);
  return {
    ok: true,
    lines: [
      ...opened.map(
        ({ file }) =>
          `unsealed ${a.where}/${file.path} (${String(file.size)} bytes, sha256 ${file.sha256}, as sealed)`,
      ),
      `${a.s.id}: ${count(opened.length, "file")} unsealed on ${gate.file} as committed in ${gate.commit} (${gate.date}); recorded in ${a.where}/${MANIFEST_FILE}. Next: commit the plaintexts and ${MANIFEST_FILE}.`,
    ],
  };
};

/** Which study to unseal, and with which identity file. */
export interface UnsealTarget {
  readonly paper: string;
  readonly shown: string;
  readonly id: string;
  readonly identity: string;
}

/** `studies unseal`: the decision and the manifest committed, every file decrypted and checked, then written. */
export function runUnseal(
  { paper, shown, id, identity }: UnsealTarget,
  deps: UnsealDeps,
): SealRun {
  const a = blindStudy(paper, shown, id, deps);
  if (isRefusal(a)) return refused(a);
  const m = sealedManifest(a);
  if (isRefusal(m)) return refused(m);
  if ("already" in m) return { ok: true, lines: [m.already] };
  if (!deps.files.isFile(callerPath(identity)))
    return refused(
      refusal(
        `--identity ${identity} is not a file: an age identity file (AGE-SECRET-KEY-1…) is.`,
      ),
    );
  const gate = gateOf(paper, a, deps);
  return isRefusal(gate)
    ? refused(gate)
    : unsealWith({ a, m, gate, identity }, deps);
}
