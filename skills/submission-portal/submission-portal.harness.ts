/**
 * submission-portal — the free, deterministic tier: the shared per-skill checks (frontmatter,
 * tool contract, pipeline wiring, own identity). It does not check that the skill's
 * `npx paperlint submission …` commands are ones the CLI runs — that belongs in vigiles
 * (zernie/vigiles#395) — nor that the skill fires; see `submission-portal.eval.mjs`.
 */
import { checkSkill } from "../../lib/skill-checks.mjs";

await checkSkill("submission-portal");
