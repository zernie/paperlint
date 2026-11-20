/**
 * `artifact/contents` — a paper's reproduction artifact holds what the venue's artifact bar asks for
 * and what the paper promises.
 *
 * Two sources, read once per paper folder:
 *   the venue's bar     `artifact_bar` in the venue preset: the top-level files the artifact call asks
 *                       for (README, LICENSE). A workshop with none takes its parent conference's,
 *                       and every message names the edition whose call it is, with the call's URL.
 *   the paper's word    `artifact` in the paper's `paperlint.json`: the artifact's folder, and each
 *                       promise the paper makes about it, a label and a glob that must match a file.
 *
 * ── WHY IT IS OFF BY DEFAULT ─────────────────────────────────────────────────────
 * A venue's call decides what is on by default; most calls for papers (AGENT's among them) say
 * nothing about an artifact, so the rule is registered and on for no paper. A paper turns it on with
 * `"artifact/contents": "error"` in its `paperlint.json`.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ───────────────────────────────────
 * A `paperlint.json` that does not parse, or an `extends` that does not resolve: silent —
 * `pdf/profile` says why. No bar along the chain: only the promises are judged.
 */
import { basename, dirname, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  answers,
  type PaperArtifact,
  type SourcedBar,
} from "./domain/artifact.ts";
import type { GlobFiles } from "./ports/glob-files.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import { paperPreset } from "./presets.ts";
import {
  rulePageUrl,
  type Finding,
  type VenueRuleDeps,
} from "./venue-rules.ts";

/** The file the rule reports on: one per paper folder. */
const STATUS_FILE = "PIPELINE-STATUS.md";

export interface ArtifactRuleDeps extends VenueRuleDeps {
  readonly glob: GlobFiles;
}

/** Where the bar comes from, as every message about it says it. Pure. */
const barData = (bar: SourcedBar) => ({
  venue: bar.venue,
  url: bar.url,
  read: bar.read,
});

/**
 * The findings for one paper's artifact against the venue's bar. `look` is the folder's files that a
 * glob matches, or null when the folder is not one. Pure.
 */
export function judgeArtifact(
  artifact: PaperArtifact | null,
  bar: SourcedBar | null,
  look: (pattern: string) => readonly string[] | null,
): readonly Finding[] {
  if (artifact === null)
    return [
      {
        messageId: "undeclared",
        data: {
          bar:
            bar === null
              ? ""
              : `. ${bar.venue}'s artifact call (${bar.url}, read ${bar.read}) asks for ${bar.files.join(", ")}`,
        },
      },
    ];
  const dir = artifact.dir;
  const top = look("*");
  if (top === null) return [{ messageId: "noDir", data: { dir } }];
  const missing = (bar?.files ?? []).filter(
    (file) => !top.some((name) => answers(name, file)),
  );
  const broken = Object.entries(artifact.promises).filter(
    ([, glob]) => (look(glob) ?? []).length === 0,
  );
  return [
    ...missing.flatMap((file) =>
      bar === null
        ? []
        : [{ messageId: "missingFile", data: { dir, file, ...barData(bar) } }],
    ),
    ...broken.map(([label, glob]) => ({
      messageId: "emptyPromise",
      data: { dir, label, glob },
    })),
  ];
}

/** The findings for the paper folder `dir`; none when its settings or preset cannot be used. */
function findingsFor(dir: string, deps: ArtifactRuleDeps): readonly Finding[] {
  const p = paperPreset(dir, deps);
  if (p.kind === "settings-problem" || p.kind === "preset-problem") return [];
  const artifact = p.settings?.artifact ?? null;
  const bar = p.kind === "resolved" ? p.preset.artifactBar : null;
  const at = callerPath(resolve(dir, artifact?.dir ?? "."));
  return judgeArtifact(artifact, bar, (pattern) => deps.glob(at, pattern));
}

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "the paper's reproduction artifact holds the files the venue's artifact call asks for, and a file for every promise the paper makes about it",
    url: rulePageUrl("artifact/contents"),
  },
  schema: [],
  messages: {
    undeclared:
      'artifact/contents is on, and the paper declares no "artifact" in its paperlint.json: add "artifact": { "dir": "<its folder, relative to the paper>", "promises": { "<label>": "<glob relative to dir>" } }{{bar}}',
    noDir:
      'the artifact folder {{dir}} ("artifact.dir" in paperlint.json, relative to the paper) does not exist or is not a folder',
    missingFile:
      "the artifact {{dir}} has no top-level {{file}} (any extension counts: {{file}}.md, {{file}}.txt, {{file}}): {{venue}}'s artifact call asks for one ({{url}}, read {{read}})",
    emptyPromise:
      'the artifact promise "{{label}}" ({{glob}}) matches no file under {{dir}}: the paper says the artifact holds it — add the files, or correct the glob in "artifact.promises"',
  },
};

/** The rule, reading the paper's settings, its preset and the artifact folder through `deps`. */
export function artifactRules(
  deps: ArtifactRuleDeps,
): Readonly<Record<"contents", FolderRuleModule>> {
  return {
    contents: {
      meta: META,
      create(context: FolderRuleContext) {
        if (basename(context.filename) !== STATUS_FILE) return {};
        return {
          root() {
            const at = context.sourceCode.getLocFromIndex(0);
            findingsFor(dirname(context.filename), deps).forEach((f) => {
              context.report({ loc: { start: at, end: at }, ...f });
            });
          },
        };
      },
    },
  };
}
