/**
 * WHERE A BUILD'S BIBLIOGRAPHY COMES FROM, as the `.aux` and the disk stand after a pdflatex pass:
 * the facts `src/domain/bib-source.ts` decides from (paperlint#708). The `.aux` names the databases
 * and the style; `kpsewhich` says where bibtex would find each; a `paper.bbl` on disk is what is
 * typeset when one cannot be found. Reads through the `Files` port and runs `kpsewhich` through the `Runner` the build
 * already uses, so a test fakes both.
 */
import { resolve } from "node:path";
import { filter, isNonNull } from "remeda";
import { callerPath } from "./caller-path.ts";
import { bibSource } from "./domain/bib-source.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { JOBNAME } from "./domain/sources-record.ts";
import { printed } from "./domain/text.ts";
import type { Runner } from "./engine.ts";
import { auxBib } from "./latex-log.ts";
import type { BibInput } from "./latex-loop.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import type { Files } from "./ports/files.ts";

/** What finding the bibliography needs: the paper, the build's environment, the runner, the disk. */
export interface BibDeps {
  readonly paperDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly run: Runner;
  readonly files: Files;
}

const at = (deps: BibDeps, name: string) =>
  callerPath(resolve(deps.paperDir, name));

const textOf = (deps: BibDeps, name: string): string | null => {
  const b = deps.files.readBytes(at(deps, name));
  return b === null ? null : new TextDecoder().decode(b);
};

/**
 * Where the file bibtex would read under `name` is, as `kpsewhich` answers in the build's directory
 * and environment: the paper directory, `BIBINPUTS`, then the TeX tree, the order bibtex searches
 * (`IEEEabrv.bib` lives in the tree). Null when it is nowhere. A `kpsewhich` that cannot be started
 * is answered from the paper directory alone.
 */
function located(
  deps: BibDeps,
  format: "bib" | "bst",
  name: string,
): AbsolutePath | null {
  const r = deps.run("kpsewhich", [`-format=${format}`, name], {
    cwd: deps.paperDir,
    env: deps.env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (r.error) return deps.files.isFile(at(deps, name)) ? at(deps, name) : null;
  // One name asked, so one path printed.
  const path = printed(r.stdout).trim();
  return r.status === 0 && path !== "" ? at(deps, path) : null;
}

/** Where the bibliography comes from, as the `.aux` and the disk stand now. */
export function bibInput(deps: BibDeps): BibInput {
  const aux = textOf(deps, `${JOBNAME}.aux`);
  if (aux === null) return { kind: "none" };
  const bib = auxBib(aux, (name) => textOf(deps, name));
  const names = bib.databases.map((d) => (d.endsWith(".bib") ? d : `${d}.bib`));
  const paths = names.map((n) => located(deps, "bib", n));
  const style = bib.style === null ? null : `${bib.style}.bst`;
  const source = bibSource({
    databases: names.map((name, i) => ({ name, found: paths[i] != null })),
    style:
      style === null
        ? null
        : { name: style, found: located(deps, "bst", style) !== null },
    bbl: deps.files.isFile(at(deps, `${JOBNAME}.bbl`)),
  });
  if (source.kind !== "run-bibtex") return source;
  // Every database was found, or the source would not be run-bibtex; one gone since is no bytes.
  const bytes = filter(
    filter(paths, isNonNull).map((p) => deps.files.readBytes(p)),
    isNonNull,
  );
  return {
    kind: "run-bibtex",
    citations: bib.citations,
    databases: bib.databases,
    style: bib.style,
    bibHash: sha256Hex(Buffer.concat(bytes)),
  };
}

/**
 * The line a build that typeset the paper.bbl on disk prints: bibtex did not run, so nothing checked
 * the references, and what it could not find. Empty for any other bibliography.
 */
export function shippedBblNote(bib: BibInput): string {
  if (bib.kind !== "shipped-bbl") return "";
  return `; bibliography: the ${JOBNAME}.bbl on disk, typeset as it is — bibtex not run (${bib.missing.join(", ")} not found), references not checked`;
}
