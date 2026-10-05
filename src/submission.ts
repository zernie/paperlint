/**
 * `paperlint submission show|update [paper-dir]` — read and change a paper's submission on the
 * venue's portal, through the portal's API.
 *
 * The command is named by the job, not by the portal: WHERE the submission lives is data. The venue
 * preset declares the portal (`"portal": { "kind": "hotcrp", "url": … }`), the paper's
 * `paperlint.json` declares which submission is its own (`"submission": { "id": 7 }`), and one
 * adapter per portal kind does the talking (`src/adapters/hotcrp/`).
 *
 *   show     status, id, title, paper type, topics, abstract length, the PDF the portal holds — and
 *            whether it is the local `paper.pdf`, by sha256
 *   update   send the PDF (and, if asked, an abstract, or "submitted"). A DRY RUN unless `--save`:
 *            the portal checks the change and keeps nothing
 *
 * 🔴 THE TOKEN IS AN INPUT, AND ONLY AN INPUT. It comes from the environment (the root reads it), is
 * handed to the adapter, and never appears in anything printed here.
 */
import { basename, join, resolve } from "node:path";
import { absolutePath } from "./domain/paths.ts";
import { err, ok, type Result } from "./domain/result.ts";
import { sha256Hex, type Sha256 } from "./domain/sha256.ts";
import {
  supportedPortal,
  wordCount,
  type PortalFailure,
  type PortalMessage,
  type SubmissionView,
  type SupportedPortal,
  type UpdateOutcome,
} from "./domain/submission.ts";
import type { Files } from "./ports/files.ts";
import type { SubmissionPortal } from "./ports/submission-portal.ts";
import {
  paperPreset,
  unusablePresetLine,
  type PaperPreset,
  type PresetDeps,
} from "./presets.ts";
import type { PaperSettings } from "./paper-settings.ts";
import { currentDeadlines } from "./domain/cycle.ts";
import {
  deadlinesInForce,
  type InForce,
  type Observation,
} from "./domain/deadline.ts";
import { CONFIG_FILE } from "#lib/paper-config";

/** The environment variable each portal kind's token is read from. */
export const TOKEN_ENV: Readonly<Record<SupportedPortal["kind"], string>> = {
  hotcrp: "HOTCRP_TOKEN",
};

/** Where each portal kind lets an author create a token. */
const TOKEN_HELP: Readonly<Record<SupportedPortal["kind"], string>> = {
  hotcrp:
    "create one on the HotCRP site under Account settings → Developer, with the scopes submeta:read and document:read (show) and submeta:write and document:write (update)",
};

export const SUBCOMMANDS = ["show", "update"] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];
const isSubcommand = (s: string | undefined): s is Subcommand =>
  SUBCOMMANDS.some((x) => x === s);

/** What one `submission` run was asked, after the command line. */
export interface SubmissionArgs {
  readonly sub: string | undefined;
  readonly paperDir: string;
  /** Positional arguments past the paper directory: refused. */
  readonly extra: readonly string[];
  /** `--pdf <file>`, relative to `cwd`; null: the paper's own PDF. */
  readonly pdf: string | null;
  /** `--abstract <file>`, relative to `cwd`; null: leave the abstract as it is. */
  readonly abstract: string | null;
  readonly submit: boolean;
  readonly save: boolean;
}

export interface SubmissionDeps {
  readonly files: Files;
  readonly presets: PresetDeps;
  readonly cwd: string;
  /** The value of an environment variable; the root reads the environment. */
  readonly env: (name: string) => string | undefined;
  readonly portalFor: (p: SupportedPortal, token: string) => SubmissionPortal;
  readonly log: (line: string) => void;
  readonly err: (line: string) => void;
}

/** A paper's portal, its submission there, and the PDF the paper builds. */
export interface SubmissionTarget {
  readonly portal: SupportedPortal;
  readonly id: number;
  /** The paper's built PDF, absolute. */
  readonly pdf: string;
  /** The venue's call for papers (the preset's `url`); null when the preset names no venue. */
  readonly call: string | null;
  /**
   * The deadlines in force for the current attempt: the paper's own entries (with `cycles`) over the
   * venue preset's readings. Instants and where each came from — never how long is left.
   */
  readonly deadlines: readonly InForce[];
}

const configOf = (dir: string): string => join(dir, CONFIG_FILE);

/** Why a paper without a venue preset has no portal: the key to set, or — with cycles — where. */
const noPresetLine = (
  paperDir: string,
  settings: PaperSettings | null,
): string =>
  settings === null || settings.cycles === null
    ? `${configOf(paperDir)}: no "extends" — the venue preset it names declares the portal ("portal": { "kind": …, "url": … })`
    : `${configOf(paperDir)}: the current cycle names no venue preset, and the preset is what declares the portal — set the venue in the current cycle ("venue": { "kind": "preset", "extends": "paperlint:…" }), or upload by hand`;

/**
 * Why a paper names no submission, and where the id goes: at the top level in the flat form; with
 * cycles, inside the current one — a top-level `submission` beside `cycles` is refused by the parser.
 * Between venues (the venue then comes from the root's default), the advice is a new cycle.
 */
function noSubmissionLine(
  paperDir: string,
  settings: PaperSettings,
  site: string,
): string {
  const file = configOf(paperDir);
  const add = `add "submission": { "id": <the submission number on ${site}> }`;
  const refused = `beside "cycles" a top-level "submission" is refused`;
  if (settings.cycles === null) return `${file}: no "submission" — ${add}`;
  const current = settings.cycles.current;
  switch (current.kind) {
    case "cycle":
    case "accepted":
      return `${file}: the current cycle «${current.cycle.id}» has no "submission" — ${add} inside that cycle; ${refused}`;
    case "parked":
      return `${file}: no cycle is open — the last, «${current.last.id}», has ended; open a new cycle for this venue and ${add} inside it; ${refused}`;
    case "none":
      return `${file}: "cycles" is empty — open a cycle for this venue and ${add} inside it; ${refused}`;
  }
}

/** A resolved paper → its portal and submission, or the line naming the file and key to set. */
function targetOf(
  paperDir: string,
  p: Extract<PaperPreset, { readonly kind: "resolved" }>,
): Result<SubmissionTarget, string> {
  const declared = p.preset.portal;
  if (declared === null)
    return err(
      `the venue preset declares no "portal" (read: ${p.preset.chain.join(", ")}) — add "portal": { "kind": "hotcrp", "url": "<the site>" } to the venue's preset, or upload by hand`,
    );
  const sub = p.settings.submission;
  if (sub === null)
    return err(noSubmissionLine(paperDir, p.settings, declared.url));
  const portal = supportedPortal(declared);
  if (!portal.ok) return portal;
  const pdf = join(paperDir, p.settings.pdf ?? "paper.pdf");
  const identity = p.preset.identity;
  const call = identity.type === "venue" ? identity.url : null;
  const own =
    p.settings.cycles === null
      ? []
      : currentDeadlines(p.settings.cycles.current);
  const deadlines = deadlinesInForce(own, p.preset.deadlines);
  return ok({ portal: portal.value, id: sub.id, pdf, call, deadlines });
}

/** The paper directory → its portal and submission, or the line naming the file and key to set. */
export function submissionTarget(
  paperDir: string,
  deps: PresetDeps,
): Result<SubmissionTarget, string> {
  const p = paperPreset(paperDir, deps);
  switch (p.kind) {
    case "none":
      return err(noPresetLine(paperDir, p.settings));
    case "settings-problem":
    case "preset-problem":
      return err(unusablePresetLine(paperDir, p));
    case "resolved":
      return targetOf(paperDir, p);
  }
}

/** The token from the environment, or the line naming the variable and where to get one. */
export function tokenFor(
  portal: SupportedPortal,
  env: (name: string) => string | undefined,
): Result<string, string> {
  const name = TOKEN_ENV[portal.kind];
  const v = env(name)?.trim();
  return v
    ? ok(v)
    : err(
        `${name} is not set — the ${portal.kind} API needs a token: ${TOKEN_HELP[portal.kind]}. Then: export ${name}=…`,
      );
}

const iso = (seconds: number | null): string =>
  seconds === null ? "—" : new Date(seconds * 1000).toISOString();

const messageLine = (m: PortalMessage): string =>
  `  portal says: ${m.field === null ? "" : `${m.field}: `}${m.message}`;

/** A failure in words: HTTP status and the portal's own messages. Never the token. */
export function failureText(f: PortalFailure): string {
  switch (f.kind) {
    case "refused": {
      const said = f.messages.map((m) => m.message).filter(Boolean);
      return `the portal refused (HTTP ${String(f.httpStatus)})${said.length ? `: ${said.join("; ")}` : ""}`;
    }
    case "unreachable":
      return `the portal cannot be reached: ${f.detail}`;
    case "malformed":
      return `the portal answered HTTP ${String(f.httpStatus)}, but not as its API does: ${f.detail}`;
  }
}

/** Whether the portal holds the local build, in one line. */
function matchLine(view: SubmissionView, local: Sha256 | null): string {
  if (local === null) return "match         unknown — no local PDF to compare";
  if (view.pdf === null) return "match         NO — the portal holds no PDF";
  if (view.pdf.sha256 === null)
    return `match         unknown — the portal names a ${view.pdf.hash.replace(/-.*$/s, "")} hash, not a sha256`;
  return view.pdf.sha256 === local
    ? "match         yes — the portal holds this build"
    : "match         NO — the portal holds a different PDF than the local one";
}

const pdfLine = (view: SubmissionView): string =>
  view.pdf === null
    ? "portal PDF    none"
    : `portal PDF    ${view.pdf.hash}, ${view.pdf.size === null ? "?" : String(view.pdf.size)} bytes, uploaded ${iso(view.pdf.uploadedAt)}`;

const readingText = (o: Observation): string =>
  `${o.source} ${o.at}, read ${o.read}`;

/** One deadline in force, what set it, and the other readings of it. Pure. */
export function deadlineLine(d: InForce): string {
  const by = d.by;
  const why =
    by.kind === "override"
      ? `override: ${by.override.reason} (${by.override.evidence})`
      : `${by.reading.source}, read ${by.reading.read}`;
  const others = d.readings.filter(
    (r) => by.kind === "override" || r !== by.reading,
  );
  const also = others.length
    ? `; also ${others.map(readingText).join("; ")}`
    : "";
  return `deadline      ${d.what} ${d.at} — ${why}${also}`;
}

/** `show`'s report. Pure. */
export function showLines(
  t: SubmissionTarget,
  view: SubmissionView,
  local: { readonly shown: string; readonly sha256: Sha256 | null },
): readonly string[] {
  return [
    `submission ${String(view.id)} on ${t.portal.url} (${t.portal.kind})`,
    `status        ${view.status}${view.submittedAt === null ? "" : `, submitted ${iso(view.submittedAt)}`}`,
    `title         ${view.title ?? "—"}`,
    `paper type    ${view.paperType ?? "—"}`,
    `topics        ${view.topics.length ? view.topics.join("; ") : "—"}`,
    `abstract      ${view.abstract === null ? "—" : `${String(wordCount(view.abstract))} words`}`,
    pdfLine(view),
    `local PDF     ${local.shown} ${local.sha256 === null ? "(missing)" : `sha2-${local.sha256}`}`,
    matchLine(view, local.sha256),
    ...t.deadlines.map(deadlineLine),
    ...view.messages.map(messageLine),
  ];
}

/**
 * What `update` says before it sends a PDF, dry run or not: the author opens that file and checks it
 * against the venue's call. paperlint's checks are an aid; the venue's reading of the PDF is what
 * counts. Pure.
 */
export const checkPdfLine = (shown: string, call: string | null): string =>
  `before you rely on it, open ${shown} yourself and check it against ${call === null ? "the venue's call for papers" : `the call for papers, ${call}`}: the page count and what counts toward the limit, the template and its class options, anonymity, and that every figure, table and reference renders — paperlint passing is not the venue accepting the format`;

/** `update`'s report. Pure. */
export function updateLines(
  o: UpdateOutcome,
  local: { readonly shown: string; readonly sha256: Sha256 },
  save: boolean,
): readonly string[] {
  const mode = save
    ? o.dryRun
      ? "SAVE WITHHELD by the portal — nothing changed"
      : "saved"
    : "dry run — the portal checked the change and kept nothing; --save sends it for real";
  return [
    mode,
    `HTTP          ${String(o.httpStatus)}`,
    `valid         ${o.valid ? "yes" : "NO"}`,
    `changes       ${o.changes.length ? o.changes.join(", ") : "—"}`,
    `local PDF     ${local.shown} sha2-${local.sha256}`,
    ...o.messages.map(messageLine),
  ];
}

const shownPath = (cwd: string, p: string): string =>
  p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : p;

/** The file's bytes, or null when there is none. */
const bytesAt = (files: Files, p: string): Uint8Array | null =>
  files.readBytes(absolutePath(p));

/** `show`: read the submission and compare its PDF with the local one. */
async function runShow(
  t: SubmissionTarget,
  portal: SubmissionPortal,
  pdfPath: string,
  deps: SubmissionDeps,
): Promise<number> {
  const view = await portal.show(t.id);
  if (!view.ok) return (deps.err(failureText(view.error)), 1);
  const bytes = bytesAt(deps.files, pdfPath);
  const local = {
    shown: shownPath(deps.cwd, pdfPath),
    sha256: bytes === null ? null : sha256Hex(bytes),
  };
  showLines(t, view.value, local).forEach((l) => {
    deps.log(l);
  });
  return 0;
}

/** The abstract file's text, or the line saying it is missing; null when none was asked for. */
function abstractOf(
  a: SubmissionArgs,
  deps: SubmissionDeps,
): Result<string | null, string> {
  if (a.abstract === null) return ok(null);
  const p = resolve(deps.cwd, a.abstract);
  const bytes = bytesAt(deps.files, p);
  return bytes === null
    ? err(`--abstract: no file at ${shownPath(deps.cwd, p)}`)
    : ok(new TextDecoder().decode(bytes).trim());
}

/** What `update` sends: the PDF's bytes, the abstract's text, and whether to mark it submitted. */
const changeOf = (
  a: SubmissionArgs & { readonly pdfPath: string },
  bytes: Uint8Array,
  abstract: string | null,
) => ({
  pdf: { name: basename(a.pdfPath), bytes },
  abstract,
  submit: a.submit,
});

/** `update`: send the PDF (and the abstract, and "submitted" when asked); a dry run unless saving. */
async function runUpdate(
  t: SubmissionTarget,
  portal: SubmissionPortal,
  a: SubmissionArgs & { readonly pdfPath: string },
  deps: SubmissionDeps,
): Promise<number> {
  const bytes = bytesAt(deps.files, a.pdfPath);
  const shown = shownPath(deps.cwd, a.pdfPath);
  if (bytes === null)
    return (
      deps.err(`no PDF at ${shown} — build the paper, or name one with --pdf`),
      2
    );
  const abstract = abstractOf(a, deps);
  if (!abstract.ok) return (deps.err(abstract.error), 2);
  deps.log(checkPdfLine(shown, t.call));
  const r = await portal.update(t.id, changeOf(a, bytes, abstract.value), {
    save: a.save,
  });
  if (!r.ok) return (deps.err(failureText(r.error)), 1);
  const local = { shown, sha256: sha256Hex(bytes) };
  updateLines(r.value, local, a.save).forEach((l) => {
    deps.log(l);
  });
  const fine =
    r.value.valid && r.value.httpStatus >= 200 && r.value.httpStatus < 300;
  return fine ? 0 : 1;
}

/** Why the command line cannot be run as asked; null when it can. Pure. */
export function usageProblem(a: SubmissionArgs): string | null {
  if (!isSubcommand(a.sub))
    return `\`submission\` needs a subcommand: ${SUBCOMMANDS.join(" or ")} — got \`${a.sub ?? ""}\``;
  if (a.extra.length > 0)
    return `\`submission ${a.sub}\` takes one paper folder — got also \`${a.extra.join(" ")}\``;
  const updateOnly = [
    a.abstract === null ? null : "--abstract",
    a.submit ? "--submit" : null,
    a.save ? "--save" : null,
  ].filter((f) => f !== null);
  return a.sub === "show" && updateOnly.length > 0
    ? `${updateOnly.join(", ")}: only \`submission update\` changes anything; \`show\` reads`
    : null;
}

/** `paperlint submission <show|update> [paper-dir]` — exit 0, 1 (the portal said no), or 2 (usage). */
export async function runSubmission(
  a: SubmissionArgs,
  deps: SubmissionDeps,
): Promise<number> {
  const usage = usageProblem(a);
  if (usage !== null) return (deps.err(usage), 2);
  const paperDir = resolve(deps.cwd, a.paperDir);
  const t = submissionTarget(paperDir, deps.presets);
  if (!t.ok) return (deps.err(t.error), 2);
  const token = tokenFor(t.value.portal, deps.env);
  if (!token.ok) return (deps.err(token.error), 2);
  const portal = deps.portalFor(t.value.portal, token.value);
  const pdfPath = a.pdf === null ? t.value.pdf : resolve(deps.cwd, a.pdf);
  return a.sub === "show"
    ? runShow(t.value, portal, pdfPath, deps)
    : runUpdate(t.value, portal, { ...a, pdfPath }, deps);
}
