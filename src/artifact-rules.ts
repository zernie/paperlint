/**
 * THE ARTIFACT RULES — the artifact holds what the paper's own `paperlint.json` says it must
 * (`src/domain/artifact.ts`): `artifact/required-files` (each `artifact.required` name at its top
 * level) and `artifact/promised` (each `artifact.promises` glob matches a path). The paths are every
 * file under `artifact.dir` (the `ListTree` port) or the lines of the committed list `artifact.files`.
 *
 * On by default and silent for a paper that declares nothing they read, as the talk rules are for a
 * paper without `talk`; silent on a `paperlint.json` that does not parse (`pdf/profile` says why). A
 * missing folder, or a list missing or empty: each rule says so, naming what it could not check.
 */
import { basename, dirname, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  brokenPromises,
  listedPaths,
  missingRequired,
  type PaperArtifact,
} from "./domain/artifact.ts";
import type { Files } from "./ports/files.ts";
import type { ListTree } from "./ports/list-tree.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import { readPaperSettings } from "./paper-settings.ts";
import { rulePageUrl, type Finding } from "./venue-rules.ts";

/** The file the rules report on: one per paper folder, whatever the paper's source format. */
const STATUS_FILE = "PIPELINE-STATUS.md";

export interface ArtifactRuleDeps {
  readonly files: Files;
  readonly listTree: ListTree;
}

type ArtifactRuleName = "required-files" | "promised";

/** A rule of this file: a folder rule that reports a problem, not a suggestion. */
interface ArtifactRuleModule {
  readonly meta: Omit<FolderRuleModule["meta"], "type"> & {
    readonly type: "problem";
  };
  create(context: FolderRuleContext): { root?: () => void };
}

/** The artifact's paths, relative to its root, or why there are none to judge. */
type Listing =
  | { readonly kind: "paths"; readonly paths: readonly string[] }
  | { readonly kind: "noDir" | "noList" | "emptyList"; readonly path: string };

/** The paths of the artifact `a` declares, read through `deps`; `paperDir` is what its paths are relative to. */
function listing(
  paperDir: string,
  a: PaperArtifact,
  deps: ArtifactRuleDeps,
): Listing {
  const at = callerPath(resolve(paperDir, a.source.path));
  const { path } = a.source;
  if (a.source.kind === "dir") {
    const paths = deps.listTree(at);
    return paths === null ? { kind: "noDir", path } : { kind: "paths", paths };
  }
  const bytes = deps.files.readBytes(at);
  if (bytes === null) return { kind: "noList", path };
  const paths = listedPaths(new TextDecoder().decode(bytes));
  return paths.length === 0
    ? { kind: "emptyList", path }
    : { kind: "paths", paths };
}

/** The three messages about where the paths come from, naming what `what` could not be checked. */
const sourceMessages = (what: string): Readonly<Record<string, string>> => ({
  noDir: `the artifact folder {{path}} ("artifact.dir" in paperlint.json, relative to the paper) does not exist or is not a folder, so ${what} cannot be checked`,
  noList: `the artifact's list of paths {{path}} ("artifact.files" in paperlint.json, relative to the paper) does not exist, so ${what} cannot be checked`,
  emptyList: `the artifact's list of paths {{path}} names no file, so ${what} cannot be checked — write one path per line, relative to the artifact's root, as \`zipinfo -1\` or \`find . -type f\` print them`,
});

/** Each rule: its page's line, its messages, whether the paper declared what it reads, and its judgement over the paths. */
const RULES: Readonly<
  Record<
    ArtifactRuleName,
    {
      readonly description: string;
      readonly messages: Readonly<Record<string, string>>;
      readonly declared: (a: PaperArtifact) => boolean;
      readonly judge: (
        a: PaperArtifact,
        paths: readonly string[],
      ) => readonly Finding[];
    }
  >
> = {
  "required-files": {
    description:
      "each name the paper's artifact.required lists is at the top level of the artifact, with any extension",
    messages: {
      ...sourceMessages("its required names"),
      missing:
        'the artifact ({{where}}) has no top-level {{name}} — any extension counts ({{name}}.md, {{name}}.txt, {{name}}); "artifact.required" in paperlint.json asks for one',
    },
    declared: (a) => a.required.length > 0,
    judge: (a, paths) =>
      missingRequired(a.required, paths).map((name) => ({
        messageId: "missing",
        data: { name, where: a.source.path },
      })),
  },
  promised: {
    description:
      "each glob the paper's artifact.promises lists matches a path of the artifact",
    messages: {
      ...sourceMessages("its promises"),
      broken:
        'the artifact promise "{{label}}" ({{glob}}) matches no path of the artifact ({{where}}): the paper says the artifact holds it — add the files, or correct the glob in "artifact.promises"',
    },
    declared: (a) => Object.keys(a.promises).length > 0,
    judge: (a, paths) =>
      brokenPromises(a.promises, paths).map(([label, glob]) => ({
        messageId: "broken",
        data: { label, glob, where: a.source.path },
      })),
  },
};

/** The findings of rule `name` for the paper folder `dir`. Reads through `deps`; never throws. */
export function artifactFindings(
  name: ArtifactRuleName,
  dir: string,
  deps: ArtifactRuleDeps,
): readonly Finding[] {
  const settings = readPaperSettings(deps.files, dir);
  const a = settings.ok ? (settings.value?.artifact ?? null) : null;
  const { declared, judge } = RULES[name];
  if (a === null || !declared(a)) return [];
  const l = listing(dir, a, deps);
  return l.kind === "paths"
    ? judge(a, l.paths)
    : [{ messageId: l.kind, data: { path: l.path } }];
}

function rule(
  name: ArtifactRuleName,
  deps: ArtifactRuleDeps,
): ArtifactRuleModule {
  const meta = RULES[name];
  return {
    meta: {
      type: "problem",
      docs: {
        description: meta.description,
        url: rulePageUrl(`artifact/${name}`),
      },
      schema: [],
      messages: meta.messages,
    },
    create(context) {
      if (basename(context.filename) !== STATUS_FILE) return {};
      return {
        root() {
          const at = context.sourceCode.getLocFromIndex(0);
          artifactFindings(name, dirname(context.filename), deps).forEach(
            (f) => {
              context.report({ loc: { start: at, end: at }, ...f });
            },
          );
        },
      };
    },
  };
}

/** The artifact rules, as the rules of the `artifact` plugin. */
export function artifactRules(
  deps: ArtifactRuleDeps,
): Readonly<Record<ArtifactRuleName, ArtifactRuleModule>> {
  return {
    "required-files": rule("required-files", deps),
    promised: rule("promised", deps),
  };
}

/** The level each artifact rule is on at, for every paper's `PIPELINE-STATUS.md`. Silent for a paper without `artifact`. */
export const ARTIFACT_RULE_LEVELS: Readonly<
  Record<`artifact/${ArtifactRuleName}`, "error">
> = {
  "artifact/required-files": "error",
  "artifact/promised": "error",
};
