/**
 * The two papers and the shared checks of the cut-order evals (#486): `cut-order-loud.eval.ts` and
 * `cut-order-quiet.eval.ts`. A paper over its page limit, audited by `tighten-paper` with no edits.
 *
 * LOUD: a Threats to validity section that spends paragraphs on each limitation, and five
 * references cited once in sentences that carry no claim. The cut order in
 * `paper-pipeline/references/body-vs-appendix.md` spends both before any result.
 * QUIET: the same paper with Threats already one clause per limitation; nothing to take there.
 *
 * Both papers carry the same results, two of them easy to cut (an outside benchmark, a base rate):
 * those are what the pass reached for on the consumer paper in #486.
 */
import {
  existsSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Check, RunContext } from "vigiles/eval";
import { z } from "zod";

/** This file sits in `skills/tighten-paper/fixtures/`, so the skills directory is two levels up. */
const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = dirname(SKILL_DIR);

/** Keys cited exactly once, each in a sentence that is not a claim. */
export const ONCE_CITED = [
  "kerrigan2014",
  "osei2018",
  "brandt2020",
  "lindqvist2016",
  "moreau2021",
] as const;

/** The two results the cut order spends last; named by their subsection titles. */
export const CHEAP_RESULTS = ["Outside benchmark", "Base rate"] as const;

const THREATS_FAT = String.raw`\section{Threats to Validity}
\textbf{Construct validity.} Our oracle labels a test flaky when it both passes and fails on the same
commit within ten reruns. This matters because the whole of our headline rate rests on that label,
and a reader who doubts the label has every reason to doubt the rate. It is worth noting that a test
which fails once in a hundred runs would escape a ten-rerun oracle, so our oracle undercounts rare
flakiness. We consider this an important limitation and we want the reader to keep it in mind when
reading every number in Section~\ref{sec:results}, since all of them inherit it.

\textbf{Internal validity.} The reruns share a machine, and shared machines carry state between
runs: caches, temporary files, open ports. Why does this matter? Because state carried between runs
can make a test look stable when it is not, or unstable when it is stable. We reset the working
directory between runs, but we did not reboot the machine, and so some carried state may remain. We
believe the effect is small, but we cannot rule it out, and we think it is important to be candid
about this, because carried state is a well-known source of spurious results in this area.

\textbf{External validity.} All 40 projects are Java projects built with Maven. Projects in other
languages and other build systems may behave differently, because their test runners isolate tests
differently, and isolation is exactly what decides whether one test can disturb another. This is a
real limit on how far our numbers travel, and a reader working in Python or JavaScript should not
assume our rates carry over. We think this is worth stating plainly, since practitioners often read
a number like ours as a property of flaky tests in general rather than of the corpus we measured.

\textbf{Conclusion validity.} With 40 projects, a difference of a few points between two detectors
is within noise. We report confidence intervals for every rate, and we refrain from ranking
detectors whose intervals overlap. This is important because rankings are what readers remember, and
a ranking that is not supported by the data would mislead exactly the readers who act on it.

\textbf{Reliability of our own tooling.} Our rerun harness is new and was tested only on our corpus.
A bug in it would affect every number we report. We tested it on 12 tests whose flakiness we knew in
advance, and it labelled all 12 correctly, but 12 is a small number, and so we cannot claim the harness
is free of defects. We release it so that others can check it, and we would welcome reports of any
problem they find, since only wider use can establish whether it behaves as we believe it does.
`;

const THREATS_LEAN = String.raw`\section{Threats to Validity}
Our ten-rerun oracle misses tests that fail less than once in ten runs. Reruns share a machine, and
state not cleared between them may remain. All 40 projects are Java and Maven. With 40 projects, gaps
of a few points between detectors are within noise, so we rank none whose intervals overlap. Our
rerun harness was checked on 12 tests of known status only.
`;

/** The paper up to its Threats section, and from Related Work on; the two halves differ only between. */
const BEFORE_THREATS = String.raw`\documentclass[conference]{IEEEtran}
\begin{document}
\title{How Often Do Flaky-Test Detectors Agree?}
\maketitle

\begin{abstract}
Flaky tests pass and fail on the same code. Four detectors claim to find them, and nobody has
measured whether they find the same tests. On 40 Java projects and 5,112 tests, the four detectors
agree on 31\% of the tests any of them flags. The best single detector finds 58\% of the flaky tests
a ten-rerun oracle confirms. On an outside benchmark the agreement is 29\%, close to ours.
\end{abstract}

\section{Introduction}
A flaky test passes and fails on the same commit. Build systems have long been studied as a source of
such noise~\cite{kerrigan2014}. Developers lose time to flaky tests, and four detectors now promise
to find them before a developer does~\cite{luo2014}. Each reports a precision on its own corpus. We
ask whether they find the same tests. On 40 Java projects, they agree on 31\% of what any of them
flags, and the best finds 58\% of the flaky tests our oracle confirms.

\section{Background}
Test-order dependence is one cause of flakiness~\cite{luo2014}; concurrency and time are others. See
also the survey of build-failure taxonomies~\cite{osei2018}. A detector either reruns a test, reorders
the suite, or predicts flakiness from the test's code. Rerunning is the most expensive and the most
direct.

\section{Method}
We took 40 Java projects with at least 50 tests and a Maven build, 5,112 tests in all. We ran each
of four detectors with its published settings. For ground truth we reran every test ten times on the
same commit; a test that both passed and failed is flaky. Our harness is built on a container
runner~\cite{brandt2020} and records every run.

\section{Results}\label{sec:results}
\subsection{Agreement}
The four detectors flag 412 tests between them. All four agree on 128, which is 31\%. Pairwise
agreement ranges from 38\% to 61\%.

\subsection{Detection rate}
The oracle confirms 236 flaky tests. The best detector finds 137 of them, 58\%; the worst finds 61,
26\%. A rate this low matches the 20--60\% range reported for one detector by its authors~\cite{parry2022}.

\subsection{Outside benchmark}
On an outside benchmark of 1,000 labelled tests~\cite{parry2022}, the four detectors agree on 29\%,
within two points of our corpus.

\subsection{Base rate}
Of the 5,112 tests, 4.6\% are flaky by our oracle, inside the 2--16\% range of earlier
studies~\cite{parry2022}.

\section{Discussion}
Detectors disagree because they look for different causes. Mutation-based approaches take yet
another view~\cite{lindqvist2016}. A team that adopts one detector inherits its blind spots.

`;

const AFTER_THREATS = String.raw`
\section{Related Work}
Luo et al.\ classify the root causes of flaky tests~\cite{luo2014}; we measure whether detectors
agree on which tests have them. Dataset curation for software engineering is discussed
elsewhere~\cite{moreau2021}.

\section{Conclusion}
Four flaky-test detectors agree on 31\% of what they flag, and the best finds 58\% of confirmed flaky
tests. Choosing a detector is choosing which flaky tests to miss.

\bibliographystyle{IEEEtran}
\bibliography{refs}
\end{document}
`;

const paper = (threats: string): string =>
  BEFORE_THREATS + threats + AFTER_THREATS;

const BIB = ["luo2014", "parry2022", ...ONCE_CITED]
  .map(
    (key) =>
      `@article{${key},\n  author = {Author, A.},\n  title = {A Paper Titled ${key}},\n  journal = {Journal},\n  year = {${key.slice(-4)}}\n}\n`,
  )
  .join("\n");

/** One half's fixture: the paper, its bibliography, and nothing built. */
export const fixture = (half: "loud" | "quiet"): Record<string, string> => ({
  "paper.tex": paper(half === "loud" ? THREATS_FAT : THREATS_LEAN),
  "refs.bib": BIB,
});

export const TASK =
  "/paperlint-eval:tighten-paper paper.tex — audit only, do not edit paper.tex. The venue is an IEEE " +
  "two-column workshop with an 8-page limit that includes references, and the build is 9 pages: " +
  "about 600 words of body text must go. Write the ranked cut plan to cut-plan.md.";

/** The throwaway plugin the runs install; both skills it needs are LINKED, not copied. */
export const PLUGIN_DIR = join(
  realpathSync(tmpdir()),
  "paperlint-cut-order-plugin",
);

/** Make the plugin: tighten-paper, and paper-pipeline for the reference it points to. */
export const makePlugin = (): undefined => {
  mkdirSync(join(PLUGIN_DIR, ".claude-plugin"), { recursive: true });
  mkdirSync(join(PLUGIN_DIR, "skills"), { recursive: true });
  writeFileSync(
    join(PLUGIN_DIR, ".claude-plugin", "plugin.json"),
    '{ "name": "paperlint-eval", "version": "0.0.0" }\n',
  );
  for (const name of ["tighten-paper", "paper-pipeline"])
    if (!existsSync(join(PLUGIN_DIR, "skills", name)))
      symlinkSync(join(SKILLS, name), join(PLUGIN_DIR, "skills", name), "dir");
  return undefined;
};

const ToolInput = z.object({ file_path: z.string().catch("") });

/** A check over the run that the stock vocabulary cannot say. */
export const check = (
  kind: string,
  holds: (ctx: RunContext) => boolean,
  what: string,
): Check<RunContext> => ({
  kind,
  eval: (ctx) => {
    const pass = holds(ctx);
    return { pass, score: pass ? 1 : 0, message: pass ? what : `NOT: ${what}` };
  },
  toJSON: () => ({ kind, what }),
});

/** The plan's lines, or none when it was not written. */
export const planLines = (ctx: RunContext): string[] =>
  ctx.sh("cat cut-plan.md 2>/dev/null").split("\n");

/** A line that proposes taking words from the Threats section. */
export const takesFromThreats = (line: string): boolean =>
  line.includes("Threats") &&
  /SHORTEN|CUT|shorten|trim|merge/.test(line) &&
  !/\b0 words\b|nothing to (take|cut)|already one clause/.test(line);

/** Checks both halves share: the paper is untouched and the plan exists. */
export const COMMON: readonly Check<RunContext>[] = [
  check(
    "paper-not-written",
    (ctx) =>
      ![...ctx.toolCalls, ...(ctx.subagents ?? []).flatMap((s) => s.toolCalls)]
        .filter((c) => ["Edit", "MultiEdit", "Write"].includes(c.name))
        .some((c) => ToolInput.parse(c.input).file_path.endsWith("paper.tex")),
    "no Edit, MultiEdit or Write on paper.tex",
  ),
  check(
    "plan-written",
    (ctx) => planLines(ctx).some((l) => l.trim() !== ""),
    "cut-plan.md is written and not empty",
  ),
];
