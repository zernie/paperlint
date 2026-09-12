// announce.mjs — a skill says out loud that it started, and the ledger remembers that it did.
//
// vigiles:local-by-design — takes a skill name as an argument and so names none itself, which reads
// generic; it is not. It writes THIS repo's ledger row format, consumed by `status.mjs`'s gate table
// and `ledger.mjs`'s verdict vocabulary, both of which are conventions of this knowledge base rather
// than of any product. Moving it would export a schema nobody else has.
//
// WHY. Запрос владельца репозитория, 2026-08-07: «lack observability into pipeline status and whether skills are actually
// being called — let's ensure each skill outputs something when activated».
//
// The failure behind that sentence is specific and it has happened three times in this repo. An
// advisory check CANNOT BE SEEN FAILING: silence is both its error state and its normal state.
// `paper-skills-nudge.sh` was dead for twelve days and was found only because it writes a throttle
// stamp whose mtime had frozen. Two inline hooks were dead for their entire existence and nobody
// noticed at all. And on 2026-08-06 a whole session of paper work ran with no skill invoked once.
//
// So: starting is an EVENT, and events get written down. A skill that announces leaves two traces —
// one the human sees immediately, one the ledger keeps. Their disagreement is itself information:
//
//   announced, never recorded  → the skill started and died, or the author abandoned it midway
//   recorded, never announced  → someone wrote a verdict without running the gate
//   neither                    → it did not run, whatever any status file claims
//
// This is the "no trace means it did not work" rule the project already applies to hooks, made
// available to skills, which had no equivalent.

import { record, skillHash, inputHash } from "./ledger.mjs";
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { isMain } from "./consumer.mjs";

export function announce(skill, paperDir) {
  const dir = resolve(paperDir || ".");
  const has = existsSync(dir);
  const input = has ? inputHash(dir) : null;

  const lines = [
    `▶ ${skill}  —  ${has ? basename(dir) : "no paper dir"}`,
    `  paper ${input ? input.slice(0, 8) : "(none)"} · skill ${(skillHash(skill) || "????????").slice(0, 8)}`,
  ];
  // stderr, not stdout: the skill's own output is the product, and a banner that pollutes a pipe
  // is a banner someone will remove.
  console.error(lines.join("\n"));

  // An abstention with reason `started`, not an ERROR row. Before 2026-08-10 this wrote `ERROR`,
  // which meant "the check errored" — so every announce looked like a crash until its terminal row
  // landed, and `started` and `crashed` were the same word. Both are abstentions and neither is a
  // judgement about the paper; the reason is what tells them apart.
  record({
    skill,
    check: skill,
    paper: dir,
    kind: "ABSTAINED",
    reason: "started",
    note: "no verdict recorded yet",
  });
  return { skill, paper: basename(dir), input };
}

if (isMain(import.meta.url)) {
  const [skill, paperDir] = process.argv.slice(2);
  if (!skill) {
    console.error("usage: announce.mjs <skill-name> [paper-dir]");
    process.exit(2);
  }
  announce(skill, paperDir);
}
