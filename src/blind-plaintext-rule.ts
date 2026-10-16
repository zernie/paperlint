/**
 * `repro/blind-plaintext` — a blind study that is still sealed has no plaintext result in the tree:
 * no file its plan's `blind.outputs` match, until its `sealed.json` says unsealed. What is judged, and
 * why, is `src/domain/sealed-study.ts` and docs/rules/repro/blind-plaintext.md; this file finds the
 * blind studies, lists their folders, reads their manifests, and reports.
 *
 * It reads the DISK, not git: a plaintext someone can open in the workspace defeats the blinding
 * whether or not it is committed, and an ignored file is as readable as a tracked one.
 *
 * Reported on `PIPELINE-STATUS.md`, first line, like `repro/study-registered`: ESLint lints no file
 * in `repro/`.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import {
  MANIFEST_FILE,
  blindMessage,
  judgeBlind,
  type Blind,
  type BlindFinding,
  type BlindStudy,
  type ManifestState,
} from "./domain/sealed-study.ts";
import type { Study } from "./domain/study-registry.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { Files } from "./ports/files.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { registryOf } from "./study-registry-rule.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** What reading a blind study needs: the disk, its listings, and the parsers. */
export interface BlindDeps {
  readonly files: Files;
  readonly listDir: ListDir;
  readonly codec: StudyRegistryCodec;
}

/** The text of the file at `p`; null when there is none. */
const textAt = (files: Files, p: string): string | null => {
  const b = files.isFile(callerPath(p)) ? files.readBytes(callerPath(p)) : null;
  return b === null ? null : new TextDecoder().decode(b);
};

/** Every file under `dir`, relative to it, `/`-separated; none when it is not a directory. */
export const filesUnder = (
  dir: string,
  deps: Pick<BlindDeps, "files" | "listDir">,
  prefix = "",
): readonly string[] =>
  deps.listDir(callerPath(dir)).flatMap((name) => {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    const at = join(dir, name);
    return deps.files.isFile(callerPath(at))
      ? [rel]
      : filesUnder(at, deps, rel);
  });

/** The manifest in the study folder `dir`: absent, unreadable with why, or read. */
export const manifestOf = (
  dir: string,
  deps: Pick<BlindDeps, "files" | "codec">,
): ManifestState => {
  const text = textAt(deps.files, join(dir, MANIFEST_FILE));
  if (text === null) return { kind: "absent" };
  const parsed = deps.codec.parseManifest(text);
  return parsed.ok
    ? { kind: "read", manifest: parsed.manifest }
    : { kind: "unreadable", why: parsed.why };
};

/** A row's plan, when it parsed: the plan's path in the folder and its `blind` (undefined: not blind). */
export type PlanBlind =
  | { readonly kind: "no-plan" }
  | { readonly kind: "unreadable"; readonly why: string }
  | {
      readonly kind: "plan";
      readonly plan: string;
      readonly blind: Blind | undefined;
    };

/** The blind of the study `s` in the paper folder `paper`. A plan outside its folder reads as none. */
export const planBlindOf = (
  paper: string,
  s: Study,
  deps: Pick<BlindDeps, "files" | "codec">,
): PlanBlind => {
  const plan = s.plan;
  const text =
    plan === undefined || plan.split("/").includes("..") || plan.includes("\0")
      ? null
      : textAt(deps.files, join(paper, REPRO_DIR, s.folder, plan));
  if (plan === undefined || text === null) return { kind: "no-plan" };
  const parsed = deps.codec.parsePlan(text);
  return parsed.kind === "unreadable"
    ? { kind: "unreadable", why: parsed.why }
    : { kind: "plan", plan, blind: parsed.plan.blind };
};

/** Every blind study of the paper folder `paper`, with what the judge reads of it. */
export const blindStudies = (
  paper: string,
  deps: BlindDeps,
): readonly BlindStudy[] => {
  const r = registryOf(paper, deps);
  return (r.kind === "read" ? r.registry.studies : []).flatMap((s) => {
    const p = planBlindOf(paper, s, deps);
    if (p.kind !== "plan" || p.blind === undefined) return [];
    const folder = join(paper, REPRO_DIR, s.folder);
    return [
      {
        id: s.id,
        folder: s.folder,
        plan: p.plan,
        blind: p.blind,
        manifest: manifestOf(folder, deps),
        files: filesUnder(folder, deps),
      },
    ];
  });
};

const PROBLEMS: readonly BlindFinding["problem"][] = [
  "plaintext",
  "unreadable-manifest",
];

const NAME = "repro/blind-plaintext";

/** On `PIPELINE-STATUS.md`, every finding of every blind study of its paper, at its first line. */
const reportOn = (context: FolderRuleContext, deps: BlindDeps) => {
  if (basename(context.filename) !== STATUS_FILE) return {};
  return {
    root() {
      const at = context.sourceCode.getLocFromIndex(0);
      blindStudies(dirname(context.filename), deps)
        .flatMap(judgeBlind)
        .forEach((f) => {
          context.report({
            loc: { start: at, end: at },
            messageId: f.problem,
            data: { text: blindMessage(f) },
          });
        });
    },
  };
};

/** The rule, reading the folder through `deps`. */
export const blindPlaintextRules = (
  deps: BlindDeps,
): Readonly<Record<"blind-plaintext", FolderRuleModule>> => ({
  "blind-plaintext": {
    meta: {
      type: "suggestion",
      docs: {
        description:
          "a blind study that is still sealed has no plaintext file in the tree that its plan's blind.outputs match",
        url: rulePageUrl(NAME),
      },
      schema: [],
      messages: Object.fromEntries(PROBLEMS.map((p) => [p, "{{text}}"])),
    },
    create: (context) => reportOn(context, deps),
  },
});

/** Its level in paperlint's own config: an error, so a commit through the lint fails. */
export const BLIND_RULE_LEVELS: Readonly<{ "repro/blind-plaintext": "error" }> =
  { "repro/blind-plaintext": "error" };
