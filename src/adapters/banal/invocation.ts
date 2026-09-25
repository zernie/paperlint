/**
 * A banal run, as DATA. What must be on disk before banal starts — the banal input XML and the
 * `pdftohtml -v` stub, always together — and the command that runs it.
 *
 * Why the stub: banal asks `$pdftohtml -v` once, before it reads any input (the XML included), to
 * pick the zoom and a font-size correction (banal 1.2, lines 1828-1868). With no pdftohtml it stops
 * (`Error: Failed to run pdftohtml`, measured); told a version below 0.85 it applies a larger
 * correction and every font size moves. So `$PDFTOHTML` (banal's own override, line 166) points at a
 * stub that answers `-v` with `XML_DIALECT.version` — the pdftohtml whose XML `xml.ts` writes — and
 * refuses anything else. `test/e2e/banal.mjs` shows both failures with the real banal.
 */
import type { Opaque } from "ts-essentials";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { Command } from "../../ports/process.ts";
import type { Scratch } from "../../ports/workspace.ts";
import type { LocatedBanal } from "./locate.ts";
import type { PageLayout } from "../../domain/page-layout.ts";
import { pdf2xml, XML_DIALECT } from "./xml.ts";

/** banal takes well under a second on a paper; a hang still has to end. */
export const BANAL_RUN_MS = 120_000;

/** A path quoted for `/bin/sh`. Minted by `shQuote` only. */
export type ShQuoted = Opaque<string, "ShQuoted">;

/** banal interpolates `$PDFTOHTML` into a shell command unquoted — so the value is quoted here. */
export const shQuote = (s: string): ShQuoted =>
  `'${s.replace(/'/g, `'"'"'`)}'` as ShQuoted;

/** The stub standing in for `pdftohtml`: it answers `-v` and refuses to convert anything. */
export const PDFTOHTML_STUB = [
  "#!/bin/sh",
  "# research-paper-pipeline: banal reads the banal input XML rpp writes, never a PDF. banal still",
  "# asks `pdftohtml -v` which dialect to expect; this answers with the one rpp writes.",
  'if [ "$1" = "-v" ]; then',
  `  echo "pdftohtml version ${XML_DIALECT.version}"`,
  "  exit 0",
  "fi",
  'echo "rpp: this pdftohtml only answers -v; banal was given a PDF instead of the banal input XML" >&2',
  "exit 1",
  "",
].join("\n");

export interface StagedFile<N extends string, M extends "read" | "exec"> {
  readonly name: N;
  readonly content: string;
  readonly mode: M;
}

/** What must exist on disk before banal runs. Both files, always: there is no way to build one alone. */
export interface BanalStaging {
  readonly files: readonly [
    StagedFile<"paper.xml", "read">,
    StagedFile<"pdftohtml", "exec">,
  ];
}

export const stageBanalInput = (
  pages: readonly PageLayout[],
): BanalStaging => ({
  files: [
    { name: "paper.xml", content: pdf2xml(pages), mode: "read" },
    { name: "pdftohtml", content: PDFTOHTML_STUB, mode: "exec" },
  ],
});

/** The staging written to disk. Minted by `stage` only: both files written, or nothing returned. */
export type StagedInput = Opaque<
  { readonly xml: AbsolutePath; readonly stub: AbsolutePath },
  "StagedInput"
>;

/** Write a staging into a scratch directory, the stub executable. The only minter of `StagedInput`. */
export function stage(s: Scratch, staging: BanalStaging): StagedInput {
  const [xml, stub] = staging.files;
  return {
    xml: s.write(xml.name, xml.content, xml.mode),
    stub: s.write(stub.name, stub.content, stub.mode),
  } as StagedInput;
}

/** `perl banal -no-time -json <xml>`, with `$PDFTOHTML` quoted by construction. */
export function banalCommand(
  banal: LocatedBanal,
  staged: StagedInput,
  baseEnv: Readonly<Record<string, string>>,
): Command {
  return {
    file: "perl",
    args: [banal.path, "-no-time", "-json", staged.xml],
    env: { ...baseEnv, PDFTOHTML: shQuote(staged.stub) },
    timeoutMs: BANAL_RUN_MS,
    maxOutputBytes: 64 * 1024 * 1024,
  };
}
