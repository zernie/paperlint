/**
 * `paperlint submission new|show|update|topics [paper-dir]` — create, read and change a paper's
 * submission on the venue's portal, through the portal's API.
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
 *   topics   the topics the portal offers, against the ones the venue preset records
 *
 * `new` and `update` also send the paper's `fields` — its answers to the venue's own form fields
 * (topics, PC conflicts, …), checked against the preset's `submission_fields` before anything is
 * sent (`src/domain/submission-fields.ts`). A checkbox field the portal did not take is said, and
 * fails the command: HotCRP keeps an option it does not know as nothing, without an error.
 *
 * Before the portal is asked, `new` and `update` print what the venue rules find in the exact PDF
 * they send, as `paperlint lint` prints it — or "venue rules: no errors" (paperlint#264). The verdict
 * is the author's to act on; the one thing the command refuses is a `--save` whose build facts are
 * missing or about other bytes, because then nothing was checked (exit 2).
 *
 * 🔴 THE TOKEN IS AN INPUT, AND ONLY AN INPUT. It comes from the environment (the root reads it), is
 * handed to the adapter, and never appears in anything printed here.
 */
import { basename, join, resolve } from "node:path";
import { absolutePath } from "./domain/paths.ts";
import { messageOf } from "./domain/text.ts";
import { err, ok, type Result } from "./domain/result.ts";
import { sha256Hex, type Sha256 } from "./domain/sha256.ts";
import {
  supportedPortal,
  withSubmissionId,
  wordCount,
  type Author,
  type CreateOutcome,
  type NewSubmission,
  type PortalFailure,
  type PortalMessage,
  type SubmissionView,
  type SupportedPortal,
  type UpdateOutcome,
} from "./domain/submission.ts";
import {
  droppedFields,
  parsePaperFields,
  type FieldValues,
  type VenueFields,
} from "./domain/submission-fields.ts";
import type { Files } from "./ports/files.ts";
import type {
  PortalSite,
  SubmissionPortal,
} from "./ports/submission-portal.ts";
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
  readingText,
  type InForce,
} from "./domain/deadline.ts";
import { CONFIG_FILE } from "#lib/paper-config";
import {
  hostOf,
  lookUpToken,
  type TokenProblem,
} from "./domain/portal-token.ts";
import { LINE_BREAK, OPAQUE, runText } from "./domain/tex-document.ts";
import type { LatexReader } from "./ports/latex.ts";
import { factsPath, parseFactsText } from "./facts-file.ts";
import { lineColumn, readPaper } from "./tex-paper.ts";
import { originOf, type PaperSource } from "./domain/paper-source.ts";
import type { SourcesCodec } from "./ports/sources-codec.ts";
import { MAIN } from "./build.ts";
import { ESLint } from "eslint";
import { assessSent, venueMessages } from "./venue-rules.ts";

/** How to make and set the site's token: the page, the scopes, the variable. Pure. */
export function tokenSteps(
  portal: SupportedPortal,
  site: PortalSite,
  variable: string,
): readonly string[] {
  const c = site.credentials;
  return [
    `  1. create a token on this site: ${c.page} (${c.where}), with the scopes ${c.scopes}`,
    `  2. set it in your environment — never paste it into a chat: export ${variable}=<the token>`,
    `  tokens are per ${portal.kind} site: ${variable} is read for ${hostOf(portal.url)} alone, so two venues take two variables`,
  ];
}

/** Why there is no token, as the complete instruction the author follows. Pure. */
export function tokenProblemLines(
  portal: SupportedPortal,
  site: PortalSite,
  p: TokenProblem,
): readonly string[] {
  const head =
    p.kind === "missing"
      ? `no ${portal.kind} token for ${portal.url}: ${p.variable} is not set`
      : `${p.siteLess} is no longer read: tokens are per ${portal.kind} site. If it was made on ${hostOf(portal.url)}, rename it to ${p.variable}; if it was made on another site, rename it to that site's variable (${site.variablePattern}) and create a token here:`;
  return [head, ...tokenSteps(portal, site, p.variable)];
}

/**
 * What to do when the portal turned the token away: 401 is "this site does not know the token", 403
 * a token without the scope — both answered with the site's token page. Empty for anything else. Pure.
 */
export function tokenRefusedLines(
  portal: SupportedPortal,
  site: PortalSite,
  f: PortalFailure,
): readonly string[] {
  if (f.kind !== "refused" || (f.httpStatus !== 401 && f.httpStatus !== 403))
    return [];
  const variable = site.tokenVariable;
  const why =
    f.httpStatus === 401
      ? `${variable} was used; it may belong to another ${portal.kind} site (tokens are per site), or be revoked or expired`
      : `${variable} was used; the site turned the request away — the token may lack a scope this subcommand needs`;
  return [why, ...tokenSteps(portal, site, variable)];
}

export const SUBCOMMANDS = ["new", "show", "update", "topics"] as const;
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
  /**
   * `--abstract <file>`, relative to `cwd`; null: `update` leaves the abstract as it is, `new` reads
   * it from the build.
   */
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
  /** The portal site of a supported kind: its token variable and help, and its API once there is a token. */
  readonly site: (p: SupportedPortal) => PortalSite;
  /** Reads the paper's `\title` and its abstract, its includes spliced in (`new`). */
  readonly latex: LatexReader;
  /** Reads the build's record of the files TeX read, for the includes (`new`). */
  readonly codec: SourcesCodec;
  readonly log: (line: string) => void;
  readonly err: (line: string) => void;
}

/** A paper's portal, its submission there, and the PDF the paper builds. */
export interface SubmissionTarget {
  /** The paper's folder, absolute. */
  readonly paperDir: string;
  /** The paper's settings and venue preset, resolved: what the venue rules judge the PDF against. */
  readonly resolved: Extract<PaperPreset, { readonly kind: "resolved" }>;
  readonly portal: SupportedPortal;
  /** The paper's submission on the portal; null before `new` created one. */
  readonly id: number | null;
  /** The paper's `paperlint.json`, absolute. */
  readonly config: string;
  /** The authors the paper declares for the portal; null when it declares none. */
  readonly authors: readonly Author[] | null;
  /**
   * The paper's answers to the venue's own form fields, checked against `venueFields`: only `new`
   * and `update` send them, so only they stop on a problem — `show` and `topics` read past it.
   */
  readonly answers: Result<FieldValues, string>;
  /** The answers to send: `answers`' value once a sending subcommand checked it; empty otherwise. */
  readonly fields: FieldValues;
  /** The venue's own form fields, as its preset records them; null when it records none. */
  readonly venueFields: VenueFields | null;
  /** The cycle attempt is accepted: a new submission belongs to a new cycle. */
  readonly accepted: boolean;
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

/** The paper's `fields`, checked against its venue preset's form, or the line naming what is wrong. */
function fieldsOf(
  paperDir: string,
  p: Extract<PaperPreset, { readonly kind: "resolved" }>,
): Result<FieldValues, string> {
  const fields = parsePaperFields(
    p.settings.fields,
    p.preset.submissionFields,
    p.preset.chain.join(", "),
  );
  return fields.ok ? fields : err(`${configOf(paperDir)}: ${fields.error}`);
}

/** The venue preset's portal, if it declares one that paperlint can talk to; else the line to act on. */
function portalOfPreset(
  p: Extract<PaperPreset, { readonly kind: "resolved" }>,
): Result<SupportedPortal, string> {
  const declared = p.preset.portal;
  return declared === null
    ? err(
        `the venue preset declares no "portal" (read: ${p.preset.chain.join(", ")}) — add "portal": { "kind": "hotcrp", "url": "<the site>" } to the venue's preset, or upload by hand`,
      )
    : supportedPortal(declared);
}

/** A resolved paper → its portal and submission, or the line naming the file and key to set. */
function targetOf(
  paperDir: string,
  p: Extract<PaperPreset, { readonly kind: "resolved" }>,
): Result<SubmissionTarget, string> {
  const portal = portalOfPreset(p);
  if (!portal.ok) return portal;
  const identity = p.preset.identity;
  const own =
    p.settings.cycles === null
      ? []
      : currentDeadlines(p.settings.cycles.current);
  return ok({
    paperDir,
    resolved: p,
    portal: portal.value,
    id: p.settings.submission?.id ?? null,
    config: configOf(paperDir),
    authors: p.settings.authors,
    answers: fieldsOf(paperDir, p),
    fields: {},
    venueFields: p.preset.submissionFields,
    accepted: p.settings.cycles?.current.kind === "accepted",
    pdf: join(paperDir, p.settings.pdf ?? "paper.pdf"),
    call: identity.type === "venue" ? identity.url : null,
    deadlines: deadlinesInForce(own, p.preset.deadlines),
  });
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

/** One deadline in force, what set it, and the other readings of it. Pure. */
export function deadlineLine(d: InForce): string {
  const by = d.by;
  const set =
    by.kind === "override"
      ? `${d.at} — override: ${by.override.reason} (${by.override.evidence})`
      : readingText(by.reading);
  const others = d.readings.filter(
    (r) => by.kind === "override" || r !== by.reading,
  );
  const also = others.length
    ? `; also ${others.map(readingText).join("; ")}`
    : "";
  return `deadline      ${d.what} ${set}${also}`;
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

/** The fields the paper sent, one line each, as the portal will get them. Pure. */
export const fieldLines = (fields: FieldValues): readonly string[] =>
  Object.entries(fields).map(
    ([key, value]) => `field         ${key}: ${JSON.stringify(value)}`,
  );

/** The checkbox fields the portal did not take, said; none when it took them all. Pure. */
export function droppedLines(
  fields: FieldValues,
  venue: VenueFields | null,
  o: UpdateOutcome,
): readonly string[] {
  const dropped = droppedFields(fields, venue, {
    changes: o.changes,
    messageFields: o.messages.map((m) => m.field),
  });
  return dropped.map(
    (key) =>
      `NOT TAKEN     ${key}: the portal kept none of ${JSON.stringify(fields[key])} — an option it does not know is dropped without an error; \`paperlint submission topics\` lists what it offers`,
  );
}

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

/** The deps a subcommand runs with: the command's, and what to say when the portal turns the token away. */
type RunDeps = SubmissionDeps & {
  readonly portalSite: PortalSite;
  readonly refused: (f: PortalFailure) => readonly string[];
};

const logAll = (lines: readonly string[], deps: RunDeps): void => {
  lines.forEach((l) => {
    deps.log(l);
  });
};

/** A failure printed — the portal's words, then what to do about the token if it was the token — exit 1. */
function failed(f: PortalFailure, deps: RunDeps): number {
  [failureText(f), ...deps.refused(f)].forEach((l) => {
    deps.err(l);
  });
  return 1;
}

/** The submission's id, or the line naming the key to set — `show` and `update` need one. */
const idOf = (t: SubmissionTarget): Result<number, string> =>
  t.id === null
    ? err(
        `${t.config}: no "submission" — add "submission": { "id": <the submission number on ${t.portal.url}> }, or create the submission with \`paperlint submission new\``,
      )
    : ok(t.id);

/** `show`: read the submission and compare its PDF with the local one. */
async function runShow(
  t: SubmissionTarget & { readonly id: number },
  portal: SubmissionPortal,
  pdfPath: string,
  deps: RunDeps,
): Promise<number> {
  const view = await portal.show(t.id);
  if (!view.ok) return failed(view.error, deps);
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

/** What `update` sends: the PDF's bytes, the abstract's text, whether to mark it submitted, the fields. */
const changeOf = (
  a: SubmissionArgs & { readonly pdfPath: string },
  bytes: Uint8Array,
  abstract: string | null,
  fields: FieldValues,
) => ({
  pdf: { name: basename(a.pdfPath), bytes },
  abstract,
  submit: a.submit,
  fields,
});

/**
 * The venue rules on the bytes about to be sent, printed as `paperlint lint` prints them (ESLint's
 * `stylish`), or one line when they find nothing. Returns whether `--save` must stop: the build's
 * facts are missing, unreadable or about other bytes, so the rules did not see this PDF.
 */
async function venueCheck(
  t: SubmissionTarget,
  bytes: Uint8Array,
  deps: RunDeps,
): Promise<boolean> {
  const a = assessSent(t.paperDir, t.resolved, bytes, deps.presets);
  const tex = join(t.paperDir, MAIN);
  const source = bytesAt(deps.files, tex);
  const messages = venueMessages(
    a,
    source === null ? null : new TextDecoder().decode(source),
  );
  const errorCount = messages.filter((m) => m.severity === 2).length;
  const result: ESLint.LintResult = {
    filePath: tex,
    messages,
    suppressedMessages: [],
    errorCount,
    fatalErrorCount: 0,
    warningCount: messages.length - errorCount,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
    usedDeprecatedRules: [],
  };
  const stylish = await new ESLint().loadFormatter("stylish");
  const printed = (await stylish.format([result])).trim();
  logAll(
    printed === ""
      ? [
          a.kind === "porting"
            ? 'venue rules: none run — the current cycle\'s phase is "porting", so the venue\'s format does not apply yet'
            : "venue rules: no errors",
        ]
      : printed.split("\n"),
    deps,
  );
  return a.kind === "unbuilt" || a.kind === "stale";
}

/** What `--save` says when the build's facts do not describe the PDF: nothing was sent. */
const REBUILD_REFUSAL =
  "refused: no build facts describe this PDF (none, unreadable, or of other bytes), so the venue rules did not see it — rebuild (`paperlint build`), run the dry run again, and read its venue check; nothing was sent";

/** `update`: send the PDF (and the abstract, and "submitted" when asked); a dry run unless saving. */
async function runUpdate(
  t: SubmissionTarget & { readonly id: number },
  portal: SubmissionPortal,
  a: SubmissionArgs & { readonly pdfPath: string },
  deps: RunDeps,
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
  const unseen = await venueCheck(t, bytes, deps);
  logAll(fieldLines(t.fields), deps);
  if (a.save && unseen) return (deps.err(REBUILD_REFUSAL), 2);
  const change = changeOf(a, bytes, abstract.value, t.fields);
  const r = await portal.update(t.id, change, { save: a.save });
  if (!r.ok) return failed(r.error, deps);
  const local = { shown, sha256: sha256Hex(bytes) };
  const dropped = droppedLines(t.fields, t.venueFields, r.value);
  logAll([...updateLines(r.value, local, a.save), ...dropped], deps);
  const fine =
    r.value.valid && r.value.httpStatus >= 200 && r.value.httpStatus < 300;
  return fine && dropped.length === 0 ? 0 : 1;
}

// ── new ──────────────────────────────────────────────────────────────────────────────

/**
 * The metadata of the PDF that is sent, from the build's facts — the title's fallback; null when
 * there are no facts, or they describe another PDF.
 */
function pdfMetadata(
  paperDir: string,
  pdf: Uint8Array,
  deps: SubmissionDeps,
): Readonly<Record<string, string>> | null {
  const bytes = bytesAt(deps.files, factsPath(paperDir));
  const facts =
    bytes === null ? null : parseFactsText(new TextDecoder().decode(bytes));
  return facts?.ok === true && facts.value.sha === sha256Hex(pdf)
    ? facts.value.text.metadata
    : null;
}

/** Where an offset of the assembled paper stands in its own file: `file:line:column`. */
function placeIn(paper: PaperSource, offset: number): string {
  const o = originOf(paper, { start: offset, end: offset });
  return o === null ? MAIN : `${o.file}:${lineColumn(o.source, o.span.start)}`;
}

/**
 * The abstract from the paper's source: its `abstract` environment, with the files it includes
 * spliced in as the build recorded them, as plain text — or why it cannot be read without guessing.
 */
function sourceAbstract(
  paper: PaperSource | null,
  deps: SubmissionDeps,
): Result<string, string> {
  const instead = "give the abstract with --abstract <file>, a plain-text file";
  if (paper === null)
    return err(`no ${MAIN} to read the abstract from — ${instead}`);
  const r = deps.latex.abstractText(paper.text);
  if (r.ok) return r;
  const guess = "paperlint sends no text it would have to guess";
  switch (r.error.kind) {
    case "none":
      return err(
        `${MAIN} has no \\begin{abstract}…\\end{abstract} — ${instead}`,
      );
    case "unreadable":
      return err(
        `the abstract, ${placeIn(paper, r.error.at)}: ${r.error.what} — ${guess}; ${instead}`,
      );
    case "redefined":
      return err(
        `the abstract uses \\${r.error.name}, which the paper defines ${String(r.error.at.length)} times (${r.error.at.map((o) => placeIn(paper, o)).join(", ")}) — which one TeX uses there is not guessed; ${instead}`,
      );
  }
}

/**
 * The title as the paper sets it: its `\title`, as text — or, when the title holds a command
 * paperlint cannot read (a macro of the author's own), the PDF's own Title (`pdftitle`). Pure.
 */
export function titleOf(
  source: {
    readonly text: string;
    /** Where an offset of `text` stands, as a message names it (file:line:column). */
    readonly where: (offset: number) => string;
  } | null,
  latex: Pick<LatexReader, "headings">,
  metadata: Readonly<Record<string, string>> | null,
): Result<string, string> {
  const titles = (source === null ? [] : latex.headings(source.text)).filter(
    (h) => h.command.kind === "title" && h.argument === "title",
  );
  // One \title is read; several are not chosen between — the PDF's own Title stands in, or the fix.
  const [heading] = titles.length === 1 ? titles : [];
  const text =
    heading === undefined
      ? ""
      : runText(heading.title)
          .replaceAll(LINE_BREAK, " ")
          .replace(/\s+/g, " ")
          .trim();
  if (text !== "" && !text.includes(OPAQUE)) return ok(text);
  const pdfTitle = pdfTitleOf(metadata);
  if (pdfTitle !== "") return ok(pdfTitle);
  return err(
    titles.length > 1
      ? `the paper sets \\title ${String(titles.length)} times (${titles.map((h) => source?.where(h.title.segments[0].at)).join(", ")}), and the PDF names no Title — which one to send is not guessed: keep one \\title, or set \\hypersetup{pdftitle={<the title as plain text>}} and rebuild`
      : noReadableTitle(text),
  );
}

/** The Info dictionary's Title, else the XMP packet's dc:title (pdf-content.ts keeps both); "" for none. */
const pdfTitleOf = (
  metadata: Readonly<Record<string, string>> | null,
): string =>
  [metadata?.["Title"], metadata?.["dc:title"]]
    .map((t) => t?.trim() ?? "")
    .find((t) => t !== "") ?? "";

/** The fix when the one \\title is missing (`text` "") or holds a command paperlint does not read. */
const noReadableTitle = (text: string): string =>
  text === ""
    ? `no \\title in ${MAIN}, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild`
    : `the \\title in ${MAIN} uses a command paperlint does not read («${text.replaceAll(OPAQUE, "…")}»), and the PDF names no Title — set \\hypersetup{pdftitle={<the title as plain text>}} and rebuild`;

/** What `new` will send, as the author reads it before saying yes. Pure. */
export function newLines(p: NewSubmission): readonly string[] {
  return [
    `title         ${p.title}`,
    ...p.authors.map(
      (a, i) =>
        `author ${String(i + 1).padEnd(6)} ${a.name} <${a.email}>${a.affiliation === null ? "" : `, ${a.affiliation}`}`,
    ),
    `abstract      ${String(wordCount(p.abstract))} words:`,
    `  ${p.abstract}`,
    ...fieldLines(p.fields),
  ];
}

/** What is left after `new`: the venue's fields the paper did not answer, what only the site takes, the submit. Pure. */
export function onTheSiteLines(
  site: PortalSite,
  t: Pick<SubmissionTarget, "fields" | "venueFields">,
  id: number | null,
  paperArg: string,
): readonly string[] {
  const sent = Object.keys(t.fields);
  const unanswered = Object.keys(t.venueFields?.fields ?? {}).filter(
    (k) => !sent.includes(k),
  );
  return [
    `still to do for ${site.submissionPage(id)} — paperlint sent the title, the abstract, the authors and the PDF${sent.length ? `, and ${sent.join(", ")}` : ""}:`,
    ...unanswered.map(
      (k) =>
        `  - answer ${k} in the paper's paperlint.json "fields" (the venue preset records it), then: npx paperlint submission update ${paperArg} (a dry run; --save after your yes)`,
    ),
    ...site.siteOnly.map((f) => `  - on the site: ${f}`),
    `  - then mark it submitted: npx paperlint submission update ${paperArg} --submit (a dry run; --save after your yes)`,
  ];
}

/** `new`'s report of the portal's answer. Pure. */
export function createLines(
  o: CreateOutcome,
  save: boolean,
): readonly string[] {
  const mode = save
    ? o.id === null
      ? "NOTHING CREATED — the portal did not save it"
      : `created submission ${String(o.id)}`
    : "dry run — the portal checked the new submission and kept nothing; --save creates it for real";
  return [
    mode,
    `HTTP          ${String(o.httpStatus)}`,
    `valid         ${o.valid ? "yes" : "NO"}`,
    `changes       ${o.changes.length ? o.changes.join(", ") : "—"}`,
    ...o.messages.map(messageLine),
  ];
}

/** A file's JSON, or why there is none: gone, or not JSON. */
function jsonAt(files: Files, path: string): Result<unknown, string> {
  const bytes = bytesAt(files, path);
  if (bytes === null) return err("the file is gone");
  try {
    return ok(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) {
    return err(`not JSON: ${messageOf(e)}`);
  }
}

/** `paperlint.json` with the new id recorded in it, written; or why it was not. */
function recordId(
  config: string,
  id: number,
  deps: SubmissionDeps,
): Result<null, string> {
  const json = jsonAt(deps.files, config);
  if (!json.ok) return json;
  const next = withSubmissionId(json.value, id);
  if (!next.ok) return next;
  // A write that fails (read-only, disk full) must not lose the id the portal just gave.
  try {
    deps.files.writeAtomic(
      absolutePath(config),
      new TextEncoder().encode(`${JSON.stringify(next.value, null, 2)}\n`),
    );
    return ok(null);
  } catch (e) {
    return err(messageOf(e));
  }
}

//** Why `new` cannot run for this paper, or the authors it sends: checked before anything is read. */
function readyForNew(t: SubmissionTarget): Result<readonly Author[], string> {
  if (t.id !== null)
    return err(
      `${t.config}: the paper already has submission ${String(t.id)} on ${t.portal.url} — \`paperlint submission show\` reads it, \`paperlint submission update\` changes it`,
    );
  if (t.accepted)
    return err(
      `${t.config}: the current attempt is accepted — a new submission belongs to a new cycle`,
    );
  return t.authors === null
    ? err(
        `${t.config}: no "authors" — add "authors": [{ "name": "…", "email": "…", "affiliation": "…" }], every author in the paper's order, as ${hostOf(t.portal.url)} should record them; paperlint never guesses them`,
      )
    : ok(t.authors);
}

/** The paper as the build read it: paper.tex with the files it includes spliced in; null without one. */
function assembledPaper(
  paperDir: string,
  deps: SubmissionDeps,
): PaperSource | null {
  const bytes = bytesAt(deps.files, join(paperDir, MAIN));
  return bytes === null
    ? null
    : readPaper(join(paperDir, MAIN), new TextDecoder().decode(bytes), deps);
}

/** The title and the abstract: the paper's `\title`, and `--abstract`'s file or the source's abstract. */
function titleAndAbstract(
  a: SubmissionArgs & { readonly paperDir: string },
  pdf: Uint8Array,
  deps: SubmissionDeps,
): Result<{ readonly title: string; readonly abstract: string }, string> {
  const own = abstractOf(a, deps);
  if (!own.ok) return own;
  const paper = assembledPaper(a.paperDir, deps);
  const metadata = pdfMetadata(a.paperDir, pdf, deps);
  const title = titleOf(
    paper === null
      ? null
      : { text: paper.text, where: (o: number) => placeIn(paper, o) },
    deps.latex,
    metadata,
  );
  if (!title.ok) return title;
  const abstract =
    own.value === null
      ? sourceAbstract(paper, deps)
      : ok(own.value.replace(/\s+/g, " "));
  return abstract.ok
    ? ok({ title: title.value, abstract: abstract.value })
    : abstract;
}

/** What `new` sends, or the first line saying what is missing. */
function newSubmissionOf(
  t: SubmissionTarget,
  a: SubmissionArgs & { readonly pdfPath: string; readonly paperDir: string },
  deps: SubmissionDeps,
): Result<{ readonly paper: NewSubmission; readonly shown: string }, string> {
  const authors = readyForNew(t);
  if (!authors.ok) return authors;
  const shown = shownPath(deps.cwd, a.pdfPath);
  const pdf = bytesAt(deps.files, a.pdfPath);
  if (pdf === null)
    return err(`no PDF at ${shown} — build the paper, or name one with --pdf`);
  const text = titleAndAbstract(a, pdf, deps);
  if (!text.ok) return text;
  const paper = {
    ...text.value,
    authors: authors.value,
    pdf: { name: basename(a.pdfPath), bytes: pdf },
    fields: t.fields,
  };
  return ok({ paper, shown });
}

//** After a save that created one: the id written into `paperlint.json`, and the next command. */
function recordCreated(
  t: SubmissionTarget,
  id: number,
  paperArg: string,
  deps: RunDeps,
): number {
  const config = shownPath(deps.cwd, t.config);
  const recorded = recordId(t.config, id, deps);
  if (!recorded.ok) {
    deps.err(
      `submission ${String(id)} was created (${deps.portalSite.submissionPage(id)}), but ${config} was not changed (${recorded.error}) — add "submission": { "id": ${String(id)} } to the current attempt by hand`,
    );
    return 1;
  }
  deps.log(`recorded      "submission": { "id": ${String(id)} } in ${config}`);
  deps.log(
    `next          npx paperlint submission show ${paperArg} — it should say "match yes"`,
  );
  return 0;
}

/** After a creation the portal took: what is still to do, and the id recorded when it saved one. */
function afterCreated(
  t: SubmissionTarget,
  id: number | null,
  a: SubmissionArgs & { readonly paperDir: string },
  deps: RunDeps,
): number {
  const paperArg =
    a.paperDir === deps.cwd ? "." : shownPath(deps.cwd, a.paperDir);
  logAll(onTheSiteLines(deps.portalSite, t, id, paperArg), deps);
  return id === null ? 0 : recordCreated(t, id, paperArg, deps);
}

/**
 * `new`: create the paper's submission — title and abstract from the build, the authors the paper
 * declares, the PDF. A dry run unless `--save`; after a save, the id goes into `paperlint.json`.
 */
async function runNew(
  t: SubmissionTarget,
  portal: SubmissionPortal,
  a: SubmissionArgs & { readonly pdfPath: string; readonly paperDir: string },
  deps: RunDeps,
): Promise<number> {
  const n = newSubmissionOf(t, a, deps);
  if (!n.ok) return (deps.err(n.error), 2);
  const { paper, shown } = n.value;
  deps.log(checkPdfLine(shown, t.call));
  const unseen = await venueCheck(t, paper.pdf.bytes, deps);
  logAll(newLines(paper), deps);
  if (a.save && unseen) return (deps.err(REBUILD_REFUSAL), 2);
  const r = await portal.create(paper, { save: a.save });
  if (!r.ok) return failed(r.error, deps);
  const dropped = droppedLines(t.fields, t.venueFields, r.value);
  logAll([...createLines(r.value, a.save), ...dropped], deps);
  const fine =
    r.value.valid && r.value.httpStatus >= 200 && r.value.httpStatus < 300;
  if (!fine || (a.save && r.value.id === null)) return 1;
  const recorded = afterCreated(t, r.value.id, a, deps);
  return dropped.length === 0 ? recorded : 1;
}

/** The subcommands that run before the paper has a submission id: `new` creates it, `topics` needs none. */
const NEEDS_NO_ID: readonly string[] = ["new", "topics"];
/** The subcommands that send the paper's answers to the venue's fields. */
const SENDS_FIELDS: readonly string[] = ["new", "update"];

/**
 * What the subcommand needs before a token is looked up: the submission id (`show`, `update`) and
 * the paper's checked answers (`new`, `update`) — or the line naming what to fix.
 */
function readyFor(
  sub: string | undefined,
  t: SubmissionTarget,
): Result<
  { readonly id: number | null; readonly fields: FieldValues },
  string
> {
  const id = NEEDS_NO_ID.some((s) => s === sub) ? ok(null) : idOf(t);
  if (!id.ok) return id;
  const fields = SENDS_FIELDS.some((s) => s === sub) ? t.answers : ok({});
  return fields.ok ? ok({ id: id.value, fields: fields.value }) : fields;
}

/** The checkbox field the preset records the portal's topics under: the one named `topics`. */
const TOPICS = "topics";

/** `topics`' report: each topic the portal offers against the preset's options, and whether they agree. Pure. */
export function topicsReport(
  t: Pick<SubmissionTarget, "portal" | "venueFields">,
  offered: readonly string[],
): { readonly lines: readonly string[]; readonly agrees: boolean } {
  const declared = t.venueFields?.fields[TOPICS];
  const head = `topics on ${t.portal.url}: ${String(offered.length)}`;
  if (t.venueFields === null || declared?.kind !== "checkboxes")
    return {
      lines: [
        head,
        ...offered.map((n) => `  ${n}`),
        `the venue preset records no "submission_fields" with "topics" — record these, spelled as listed, before a paper can send any`,
      ],
      agrees: false,
    };
  const recorded = declared.options;
  const extra = offered.filter((n) => !recorded.includes(n));
  const missing = recorded.filter((n) => !offered.includes(n));
  return {
    lines: [
      `${head}; the preset records ${String(recorded.length)} (read ${t.venueFields.read})`,
      ...offered.map(
        (n) => `  ${recorded.includes(n) ? "✓" : "+ not in the preset:"} ${n}`,
      ),
      ...missing.map((n) => `  − in the preset, not offered: ${n}`),
    ],
    agrees: extra.length === 0 && missing.length === 0,
  };
}

/** `topics`: what the portal offers, and whether the preset records the same — exit 1 when not. */
async function runTopics(
  t: SubmissionTarget,
  portal: SubmissionPortal,
  deps: RunDeps,
): Promise<number> {
  const r = await portal.options();
  if (!r.ok) return failed(r.error, deps);
  const report = topicsReport(t, r.value.topics);
  logAll(report.lines, deps);
  return report.agrees ? 0 : 1;
}

//** The flags that change something, as given. */
const writingFlags = (a: SubmissionArgs): readonly string[] =>
  [
    a.abstract === null ? null : "--abstract",
    a.submit ? "--submit" : null,
    a.save ? "--save" : null,
  ].filter((f) => f !== null);

/** Why the command line cannot be run as asked; null when it can. Pure. */
export function usageProblem(a: SubmissionArgs): string | null {
  if (!isSubcommand(a.sub))
    return `\`submission\` needs a subcommand: ${SUBCOMMANDS.join(" or ")} — got \`${a.sub ?? ""}\``;
  if (a.extra.length > 0)
    return `\`submission ${a.sub}\` takes one paper folder — got also \`${a.extra.join(" ")}\``;
  const writing = writingFlags(a);
  if ((a.sub === "show" || a.sub === "topics") && writing.length > 0)
    return `${writing.join(", ")}: only \`submission new\` and \`submission update\` change anything; \`${a.sub}\` reads`;
  return a.sub === "new" && a.submit
    ? "--submit: `submission new` creates the submission; mark it submitted with `submission update --submit` once `show` says the portal holds this build"
    : null;
}

/** The variables a site's token lookup reads. */
const tokenNames = (site: PortalSite) => ({
  variable: site.tokenVariable,
  siteLess: site.siteLessVariable,
});

/** No token to use: the complete instruction, exit 2 — nothing is sent. */
function tokenMissing(
  portal: SupportedPortal,
  site: PortalSite,
  p: TokenProblem,
  deps: SubmissionDeps,
): number {
  tokenProblemLines(portal, site, p).forEach((l) => {
    deps.err(l);
  });
  return 2;
}

/** `paperlint submission <new|show|update> [paper-dir]` — exit 0, 1 (the portal said no), or 2 (usage). */
export async function runSubmission(
  a: SubmissionArgs,
  deps: SubmissionDeps,
): Promise<number> {
  const usage = usageProblem(a);
  if (usage !== null) return (deps.err(usage), 2);
  const paperDir = resolve(deps.cwd, a.paperDir);
  const t = submissionTarget(paperDir, deps.presets);
  if (!t.ok) return (deps.err(t.error), 2);
  const ready = readyFor(a.sub, t.value);
  if (!ready.ok) return (deps.err(ready.error), 2);
  const site = deps.site(t.value.portal);
  const found = lookUpToken(tokenNames(site), deps.env);
  if (!found.ok) return tokenMissing(t.value.portal, site, found.error, deps);
  const portal = site.connect(found.value.token);
  const pdfPath = a.pdf === null ? t.value.pdf : resolve(deps.cwd, a.pdf);
  const withToken: RunDeps = {
    ...deps,
    portalSite: site,
    refused: (f) => tokenRefusedLines(t.value.portal, site, f),
  };
  const sending = { ...t.value, fields: ready.value.fields };
  if (a.sub === "topics") return runTopics(sending, portal, withToken);
  if (ready.value.id === null)
    return runNew(sending, portal, { ...a, pdfPath, paperDir }, withToken);
  const target = { ...sending, id: ready.value.id };
  return a.sub === "show"
    ? runShow(target, portal, pdfPath, withToken)
    : runUpdate(target, portal, { ...a, pdfPath }, withToken);
}
