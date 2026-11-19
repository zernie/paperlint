// The one owner of each job on a paper's text. A key is the job as the "One Owner Per Job" rule
// says it (`skills/CLAUDE.md.spec.ts` prints this table into that sentence), with a scope after `/`
// when one job is split between owners. A job is an object key, so two owners for one key do not
// compile (TS1117); an owner is an imported spec, so a misspelled or deleted skill does not either.
// `test/pipeline.test.ts` fails on a job with no owner, and `docs/pipeline.md` lists each owner's jobs.
import argumentArc from "./argument-arc/SKILL.md.spec.ts";
import coldReadDiff from "./cold-read-diff/SKILL.md.spec.ts";
import hardenPaper from "./harden-paper/SKILL.md.spec.ts";
import paperPipeline from "./paper-pipeline/SKILL.md.spec.ts";
import rewriteUnclear from "./rewrite-unclear/SKILL.md.spec.ts";
import tightenPaper from "./tighten-paper/SKILL.md.spec.ts";

export const JOBS = {
  "find unclear sentences": coldReadDiff,
  "rewrite for clarity": rewriteUnclear,
  "cut for length": tightenPaper,
  "the order of the argument": argumentArc,
  "judge headings/a heading in the last edit": coldReadDiff,
  "judge headings/the headings as a set": argumentArc,
  "one name for one thing across the paper/the name budget": argumentArc,
  "fix a heading or a name": rewriteUnclear,
  "is it ready to submit": hardenPaper,
  "which stage runs next": paperPipeline,
  "the final review": paperPipeline,
} as const;
