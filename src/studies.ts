/**
 * `paperlint studies new|index <paper-dir>` — the two commands that write a paper's study registry,
 * `repro/studies.json`, and its index in `repro/README.md` (docs/design/study-registry.md).
 *
 *   new <paper-dir> "<title>" [--kind <kind>]
 *            the next id; `repro/<id>-<slug>/README.md` with the id and title in its frontmatter; the
 *            row, `status: designing`, today's date; the index regenerated
 *   index <paper-dir>
 *            the index block of `repro/README.md`, regenerated from the registry
 *
 * Nothing else changes a row: a study's status, result and `in_paper` are edited in `studies.json`, and
 * `repro/study-registered` checks them. The prefix is the paper's own choice, so a paper without a
 * registry is refused with the file to write rather than given a guessed one.
 */
import { join, relative, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import { README, REPRO_DIR } from "./domain/repro-layout.ts";
import {
  DEFAULT_KIND,
  STUDIES_FILE,
  STUDY_KINDS,
  addStudy,
  indexInSync,
  isStudyKind,
  registryText,
  studyReadme,
  withIndex,
  type Study,
  type StudyKind,
  type StudyRegistry,
} from "./domain/study-registry.ts";
import type { Files } from "./ports/files.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { registryOf } from "./study-registry-rule.ts";

/** What one `studies` run was asked, after the command line. */
export interface StudiesArgs {
  readonly sub: string | undefined;
  readonly paperDir: string | undefined;
  /** `new`'s title; for `index`, an argument too many. */
  readonly title: string | undefined;
  /** Positional arguments past the title: refused. */
  readonly extra: readonly string[];
  /** `--kind <kind>`; null: the default. */
  readonly kind: string | null;
}

export interface StudiesDeps {
  readonly files: Files;
  readonly listDir: ListDir;
  readonly codec: StudyRegistryCodec;
  readonly cwd: string;
  /** Today, `YYYY-MM-DD`: the root reads the clock. */
  readonly today: string;
  readonly log: (line: string) => void;
  readonly err: (line: string) => void;
}

const NEW_USAGE =
  'npx paperlint studies new <paper-dir> "<title>" [--kind <kind>]';
const INDEX_USAGE = "npx paperlint studies index <paper-dir>";
const SUBS = `new or index — ${NEW_USAGE} · ${INDEX_USAGE}`;

const STATUS_FILE = "PIPELINE-STATUS.md";

/** The paper folder a run works in: absolute, and as the messages show it. */
interface Paper {
  readonly dir: string;
  readonly shown: string;
}

/** A run's outcome: the exit code, and the line that explains a refusal. */
type Refusal = { readonly code: 1 | 2; readonly line: string };

const refuse = (code: 1 | 2, line: string): Refusal => ({ code, line });

/** The paper folder's registry, or the refusal naming why there is none to write to. */
function registryIn(p: Paper, deps: StudiesDeps): StudyRegistry | Refusal {
  const r = registryOf(p.dir, deps);
  const file = `${p.shown}/${REPRO_DIR}/${STUDIES_FILE}`;
  switch (r.kind) {
    case "absent":
      return refuse(
        1,
        `${file} does not exist. Its prefix is the paper's own choice — a capital letter, then capitals or digits, one per paper (P1) — so write the file, then run this again:\n\n{ "prefix": "P1", "studies": [] }`,
      );
    case "unreadable":
      return refuse(1, `${file} is not a study registry: ${r.why}`);
    case "read":
      return r.registry;
  }
}

const isRefusal = (v: unknown): v is Refusal =>
  typeof v === "object" && v !== null && "code" in v && "line" in v;

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

/** The README's text; null when there is none. */
const readmeOf = (dir: string, files: Files): string | null => {
  const b = files.readBytes(callerPath(join(dir, REPRO_DIR, README)));
  return b === null ? null : new TextDecoder().decode(b);
};

const studiesCount = (r: StudyRegistry): string =>
  `${String(r.studies.length)} ${r.studies.length === 1 ? "study" : "studies"}`;

/**
 * Write the index of `r` into the README; whether it wrote. A block already in sync is left as it
 * is, so the padding a formatter gave the table is never undone.
 */
function writeIndex(dir: string, r: StudyRegistry, files: Files): boolean {
  const before = readmeOf(dir, files);
  if (indexInSync(before, r)) return false;
  files.writeAtomic(
    callerPath(join(dir, REPRO_DIR, README)),
    text(withIndex(before, r)),
  );
  return true;
}

/** The refusal when something that is not a file sits where `repro/README.md` goes; null when none. */
function readmeBlocked(p: Paper, deps: StudiesDeps): Refusal | null {
  const listed = deps.listDir(callerPath(join(p.dir, REPRO_DIR)));
  const path = callerPath(join(p.dir, REPRO_DIR, README));
  return listed.includes(README) && !deps.files.isFile(path)
    ? refuse(
        1,
        `${p.shown}/${REPRO_DIR}/${README} is not a file, so the index cannot be written there. Move it, then run this again.`,
      )
    : null;
}

/** `studies index`: the README's block regenerated from the registry. */
function runIndex(
  p: Paper,
  a: StudiesArgs,
  deps: StudiesDeps,
): Refusal | readonly string[] {
  const [surplus] = [...(a.title === undefined ? [] : [a.title]), ...a.extra];
  if (surplus !== undefined)
    return refuse(
      2,
      `studies index takes only the paper's folder — \`${surplus}\` is one argument too many`,
    );
  const r = registryIn(p, deps);
  if (isRefusal(r)) return r;
  const blocked = readmeBlocked(p, deps);
  if (blocked !== null) return blocked;
  const readme = `${p.shown}/${REPRO_DIR}/${README}`;
  return [
    writeIndex(p.dir, r, deps.files)
      ? `wrote the index of ${studiesCount(r)} in ${readme}`
      : `the index in ${readme} is in sync with ${studiesCount(r)}`,
  ];
}

/** `new`'s title and kind from the command line, or the refusal. */
function newArgs(
  a: StudiesArgs,
): Refusal | { readonly title: string; readonly kind: StudyKind } {
  if (a.title === undefined)
    return refuse(2, `studies new needs the study's title: ${NEW_USAGE}`);
  const [surplus] = a.extra;
  if (surplus !== undefined)
    return refuse(
      2,
      `studies new takes the paper's folder and one title — \`${surplus}\` is one argument too many (quote a title of several words)`,
    );
  const kind = a.kind ?? DEFAULT_KIND;
  return isStudyKind(kind)
    ? { title: a.title, kind }
    : refuse(
        2,
        `--kind ${kind} is not a kind of study: one of ${STUDY_KINDS.join(", ")}`,
      );
}

/** Write a new study's README.md, the registry, and the index; the lines that say so. */
function writeStudy(
  p: Paper,
  added: { readonly registry: StudyRegistry; readonly study: Study },
  files: Files,
): readonly string[] {
  const { study, registry } = added;
  const at = (...names: readonly string[]): AbsolutePath =>
    callerPath(join(p.dir, REPRO_DIR, ...names));
  files.writeAtomic(at(study.folder, README), text(studyReadme(study)));
  files.writeAtomic(at(STUDIES_FILE), text(registryText(registry)));
  writeIndex(p.dir, registry, files);
  const repro = `${p.shown}/${REPRO_DIR}`;
  return [
    `created ${repro}/${study.folder}/${README}`,
    `added ${study.id} to ${repro}/${STUDIES_FILE}: kind ${study.kind}, status ${study.status}, ${study.date}`,
    `wrote the index of ${studiesCount(registry)} in ${repro}/${README}`,
    `Next: write the study's one-sentence question in its row (\`question\`) and in its README.md. When it ends, set \`status\`, \`result\`, \`result_file\` and \`in_paper\` in its row, then run \`npx paperlint studies index ${p.shown}\`.`,
  ];
}

/** `studies new`: the folder, its README.md, the row, the index. */
function runNew(
  p: Paper,
  a: StudiesArgs,
  deps: StudiesDeps,
): Refusal | readonly string[] {
  const args = newArgs(a);
  if (isRefusal(args)) return args;
  const r = registryIn(p, deps);
  if (isRefusal(r)) return r;
  const blocked = readmeBlocked(p, deps);
  if (blocked !== null) return blocked;
  const added = addStudy(r, { ...args, date: deps.today });
  if (!added.ok) return refuse(2, added.why);
  const folder = added.study.folder;
  return deps.listDir(callerPath(join(p.dir, REPRO_DIR))).includes(folder)
    ? refuse(
        1,
        `${p.shown}/${REPRO_DIR}/${folder}/ already exists; it is never overwritten. Register it by hand, or remove it and run this again.`,
      )
    : writeStudy(p, added, deps.files);
}

/** The paper folder the command line names, or the refusal. */
function paperOf(a: StudiesArgs, deps: StudiesDeps): Refusal | Paper {
  if (a.sub === undefined)
    return refuse(2, `studies needs a subcommand: ${SUBS}`);
  if (a.sub !== "new" && a.sub !== "index")
    return refuse(2, `unknown subcommand \`studies ${a.sub}\`: ${SUBS}`);
  if (a.paperDir === undefined)
    return refuse(
      2,
      `studies ${a.sub} needs the paper's folder: ${a.sub === "new" ? NEW_USAGE : INDEX_USAGE}`,
    );
  const dir = resolve(deps.cwd, a.paperDir);
  const shown = relative(deps.cwd, dir) || ".";
  return deps.files.isFile(callerPath(join(dir, STATUS_FILE)))
    ? { dir, shown }
    : refuse(2, `${shown} is not a paper folder: it has no ${STATUS_FILE}`);
}

/** The run: 0 done, 1 refused by the paper's state, 2 refused by the command line. */
export function runStudies(a: StudiesArgs, deps: StudiesDeps): number {
  const p = paperOf(a, deps);
  const out = isRefusal(p)
    ? p
    : a.sub === "new"
      ? runNew(p, a, deps)
      : runIndex(p, a, deps);
  if (isRefusal(out)) {
    deps.err(out.line);
    return out.code;
  }
  out.forEach((line) => {
    deps.log(line);
  });
  return 0;
}
