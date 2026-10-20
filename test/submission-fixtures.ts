/**
 * What the `paperlint submission` tests share: a made-up paper over in-memory files, a recording
 * portal, the command run with its output captured, and the paper `new` reads.
 */
import { hotcrpSite } from "../src/adapters/hotcrp/index.ts";
import { latexReader } from "../src/adapters/latex/index.ts";
import { memoryFiles } from "../src/adapters/memory/index.ts";
import { nodeFiles } from "../src/adapters/node/index.ts";
import { sourcesCodec } from "../src/adapters/sources-record/index.ts";
import { ok, type Result } from "../src/domain/result.ts";
import { sha256Hex } from "../src/domain/sha256.ts";
import {
  type CreateOutcome,
  type NewSubmission,
  type PortalFailure,
  type SubmissionChange,
  type SubmissionView,
  type SupportedPortal,
  type UpdateOutcome,
} from "../src/domain/submission.ts";
import { presetsDir } from "../src/package-dirs.ts";
import { type Files } from "../src/ports/files.ts";
import { type LatexReader } from "../src/ports/latex.ts";
import { type SubmissionPortal } from "../src/ports/submission-portal.ts";
import { runSubmission, type SubmissionArgs } from "../src/submission.ts";
import { venuePreset } from "./support.ts";

export const PAPER = "/w/papers/p";
export const SITE = "http://127.0.0.1:9";
export const PDF = new TextEncoder().encode("%PDF fake");
export const HEX = sha256Hex(PDF);

/** The test's files, over the disk for what they do not hold: the shipped presets and their schema. */
export const withPresets = (fs: Files): Files => ({
  ...fs,
  isFile: (p) => fs.isFile(p) || nodeFiles.isFile(p),
  readBytes: (p) => fs.readBytes(p) ?? nodeFiles.readBytes(p),
});

/** A venue over aidc's format with a portal of its own — so none of aidc's deadline readings. */
export const venue = (portal: unknown): string =>
  JSON.stringify(
    venuePreset("venue", { extends: "paperlint:aidc", portal, deadlines: [] }),
  );
export const files = (o: {
  readonly portal?: unknown;
  readonly paper?: Readonly<Record<string, unknown>>;
  readonly extra?: Readonly<Record<string, string | Uint8Array>>;
}) =>
  memoryFiles({
    "/w/package.json": "{}",
    "/w/venue.jsonc": venue(o.portal ?? { kind: "hotcrp", url: `${SITE}/` }),
    [`${PAPER}/paperlint.json`]: JSON.stringify(
      o.paper ?? { extends: "../../venue.jsonc", submission: { id: 7 } },
    ),
    [`${PAPER}/paper.pdf`]: PDF,
    ...o.extra,
  });

export const VIEW: SubmissionView = {
  id: 7,
  status: "submitted",
  title: "A Fake Title",
  paperType: "Regular",
  topics: ["A", "B"],
  abstract: "one two  three\nfour",
  pdf: {
    sha256: HEX,
    hash: `sha2-${HEX}`,
    size: PDF.length,
    mimetype: "application/pdf",
    uploadedAt: 0,
  },
  submittedAt: 60,
  modifiedAt: 120,
  messages: [],
};

export interface Recorded {
  readonly portal: SupportedPortal;
  readonly token: string;
  readonly calls: unknown[];
}

export const fakePortal = (answers: {
  readonly show?: Result<SubmissionView, PortalFailure>;
  readonly update?: Result<UpdateOutcome, PortalFailure>;
  readonly create?: Result<CreateOutcome, PortalFailure>;
}) => {
  const seen: Recorded[] = [];
  const portalFor = (
    portal: SupportedPortal,
    token: string,
  ): SubmissionPortal => {
    const r: Recorded = { portal, token, calls: [] };
    seen.push(r);
    return {
      show: (id) => {
        r.calls.push(["show", id]);
        return Promise.resolve(answers.show ?? ok(VIEW));
      },
      update: (id, change: SubmissionChange, o) => {
        r.calls.push(["update", id, change, o]);
        return Promise.resolve(
          answers.update ??
            ok({
              httpStatus: 200,
              valid: true,
              changes: ["submission"],
              messages: [],
              dryRun: !o.save,
            }),
        );
      },
      create: (paper: NewSubmission, o) => {
        r.calls.push(["create", paper, o]);
        return Promise.resolve(
          answers.create ??
            ok({
              httpStatus: 200,
              valid: true,
              changes: ["new", "title", "abstract", "authors", "submission"],
              messages: [],
              dryRun: !o.save,
              id: o.save ? 42 : null,
            }),
        );
      },
    };
  };
  return { seen, portalFor };
};

/** The line `update` prints before it sends `pdf`, naming `call`. */
export const CHECK = (pdf: string, call: string): string =>
  `before you rely on it, open ${pdf} yourself and check it against ${call}: the page count and what counts toward the limit, the template and its class options, anonymity, and that every figure, table and reference renders — paperlint passing is not the venue accepting the format`;

export const ARGS: SubmissionArgs = {
  sub: "show",
  paperDir: "papers/p",
  extra: [],
  pdf: null,
  abstract: null,
  submit: false,
  save: false,
};

export async function run(
  a: Partial<SubmissionArgs>,
  o: {
    readonly files?: Files;
    readonly env?: Readonly<Record<string, string>>;
    readonly portal?: ReturnType<typeof fakePortal>;
    readonly cwd?: string;
    readonly latex?: LatexReader;
  } = {},
) {
  const out: string[] = [];
  const errs: string[] = [];
  const portal = o.portal ?? fakePortal({});
  const fs = withPresets(o.files ?? files({}));
  const code = await runSubmission(
    { ...ARGS, ...a },
    {
      files: fs,
      presets: { files: fs, venuesDir: presetsDir() },
      cwd: o.cwd ?? "/w",
      env: (n) => (o.env ?? { HOTCRP_TOKEN_127_0_0_1_9: "hct_secret" })[n],
      site: (p) => ({
        ...hotcrpSite(p.url),
        connect: (token) => portal.portalFor(p, token),
      }),
      latex: o.latex ?? latexReader,
      codec: sourcesCodec,
      log: (l) => out.push(l),
      err: (l) => errs.push(l),
    },
  );
  return { code, out, errs, seen: portal.seen };
}

/** The steps every token message ends with, for the test site. */
export const STEPS = [
  `  1. create a token on this site: ${SITE}/profile?t=developer (Account settings → Developer → API tokens), with the scopes submeta:read and document:read (show), submeta:write and document:write (update, new) — tick all four to use every subcommand`,
  "  2. set it in your environment — never paste it into a chat: export HOTCRP_TOKEN_127_0_0_1_9=<the token>",
  "  tokens are per hotcrp site: HOTCRP_TOKEN_127_0_0_1_9 is read for 127.0.0.1:9 alone, so two venues take two variables",
];

export const AUTHORS = [
  { name: "Ada Lovelace", email: "ada@example.org", affiliation: "Analytical" },
  { name: "Bob Bobson", email: "bob@example.org" },
];

export const facts = (
  o: { readonly sha?: string; readonly title?: string } = {},
) =>
  JSON.stringify({
    schema: 3,
    pdf: "paper.pdf",
    pdf_sha256: o.sha ?? HEX,
    fonts: [],
    geometry_source: null,
    pages_text: [],
    metadata: o.title === undefined ? {} : { Title: o.title },
    links: [],
    bib_anchor_page: null,
    appendix_anchor_page: null,
  });

/** The abstract of the made-up paper, its macro defined in the preamble. */
export const ABSTRACT_TEX =
  "\\begin{abstract}\nCoding agents report green builds that never ran.\nWe measure how often, with \\ours{} resolved to TestLie.\n\\end{abstract}\n";

export const DEFAULT_TEX = `\\documentclass{article}\n\\newcommand{\\ours}{TestLie}\n\\title{Agents That\\\\ Lie}\n\\begin{document}\\maketitle\n${ABSTRACT_TEX}\\end{document}\n`;

/** A paper ready for `new`: authors declared, no submission yet, a build with its facts. */
export const newFiles = (o: {
  readonly paper?: Readonly<Record<string, unknown>>;
  readonly tex?: string | null;
  readonly facts?: string | null;
}) =>
  files({
    paper: o.paper ?? { extends: "../../venue.jsonc", authors: AUTHORS },
    extra: {
      ...(o.tex === null
        ? {}
        : { [`${PAPER}/paper.tex`]: o.tex ?? DEFAULT_TEX }),
      ...(o.facts === null
        ? {}
        : { [`${PAPER}/_build/paper.facts.json`]: o.facts ?? facts() }),
    },
  });

export const WANT: NewSubmission = {
  title: "Agents That Lie",
  abstract:
    "Coding agents report green builds that never ran. We measure how often, with TestLie resolved to TestLie.",
  authors: [
    {
      name: "Ada Lovelace",
      email: "ada@example.org",
      affiliation: "Analytical",
    },
    { name: "Bob Bobson", email: "bob@example.org", affiliation: null },
  ],
  pdf: { name: "paper.pdf", bytes: PDF },
};
