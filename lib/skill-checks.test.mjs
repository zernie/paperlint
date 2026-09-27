/**
 * skill-checks.mjs's two refusing halves, which the per-skill harnesses (all green on the real
 * corpus) never reach: `checkSkill` on an unknown name and on a pipeline skill with a planted
 * defect, and `checkProseSkill` — the check for skills WITHOUT the pipeline, which the package
 * exports for a consumer's own skills and no harness here calls.
 *
 * The consumer is a temp root holding a COPY of the shipped skills, so a planted defect edits the
 * copy, never the tracked files. It is set before import: the corpus resolves it at load time.
 */
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.mjs";

const SHIPPED = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const consumer = useTempDir("skill-checks-");
const SKILLS = join(consumer, ".claude", "skills");
cpSync(SHIPPED, SKILLS, { recursive: true, verbatimSymlinks: true });
process.env.CLAUDE_PROJECT_DIR = consumer;
const { checkProseSkill, checkSkill } = await import("./skill-checks.mjs");

/** The message of what `fn` throws — an AggregateError's messages joined, one per line. */
async function thrown(fn) {
  try {
    await fn();
  } catch (e) {
    return e instanceof AggregateError
      ? [e.message, ...e.errors.map((x) => x.message.split("\n")[0])]
      : e.message.split("\n")[0];
  }
  return null;
}

test("checkSkill passes a real shipped skill and refuses a name that is not a wired skill", async () => {
  assert.deepEqual(
    [
      await checkSkill("cold-read-diff"),
      await thrown(() => checkSkill("no-such-skill")),
    ],
    [
      1,
      `"no-such-skill" is not a wired pipeline skill. Known: ${(await import("./skill-corpus.mjs")).SKILLS.join(", ")}`,
    ],
  );
});

test("checkSkill reports EVERY finding of a broken pipeline skill at once", async () => {
  const md = join(SKILLS, "cold-read-diff", "SKILL.md");
  const clean = readFileSync(md, "utf8");
  writeFileSync(
    md,
    clean
      .replace("name: cold-read-diff", "name: renamed")
      .replace("## Run me", "## Not run"),
  );
  try {
    const first = await thrown(() => checkSkill("cold-read-diff"));
    assert.equal(
      first,
      '2 assertion(s) failed for pipeline skill "cold-read-diff":',
    );
  } finally {
    writeFileSync(md, clean);
  }
});

test("a pipeline skill whose record block is gone: ONE finding naming the heading — the ledger checks that read the block skip it", async () => {
  const md = join(SKILLS, "cold-read-diff", "SKILL.md");
  const clean = readFileSync(md, "utf8");
  writeFileSync(md, clean.replaceAll("## Record the verdict", "## Afterwards"));
  let message = "";
  try {
    await checkSkill("cold-read-diff");
  } catch (e) {
    message = e.message;
  } finally {
    writeFileSync(md, clean);
  }
  assert.equal(
    message,
    '1 assertion(s) failed for pipeline skill "cold-read-diff":\n\n' +
      '  [1] cold-read-diff: no "Record the verdict" heading. A run with an announce row and no verdict row is indistinguishable from a skill that started and died.',
  );
});

const PROSE = (extra = "") =>
  [
    "---",
    "name: prose",
    "description: a skill with no pipeline",
    "allowed-tools: [Read, Write]",
    "---",
    "",
    "<!-- vigiles:sha256:0000000000000000 compiled from SKILL.md.spec.ts -->",
    "",
    "Measured rule: always say which file. See [the notes](./notes.md) and [the web](https://x.org).",
    extra,
    "",
  ].join("\n");
writeTree(SKILLS, { "prose/SKILL.md": PROSE(), "prose/notes.md": "notes\n" });

test("checkProseSkill passes a clean prose skill", async () => {
  assert.equal(await checkProseSkill("prose"), 1);
});

test("checkProseSkill refuses an option it does not read, instead of silently skipping it", async () => {
  assert.deepEqual(
    await thrown(() =>
      checkProseSkill("prose", { mustSay: [[/x/, "x"]], toolsNeeded: {} }),
    ),
    "prose: unknown option(s) mustSay — checkProseSkill takes only toolsNeeded",
  );
});

test("checkProseSkill collects every finding: a banned tool, a dangling link, no compile mark", async () => {
  writeTree(SKILLS, {
    "broken/SKILL.md": [
      "---",
      "name: broken",
      "description: d",
      "allowed-tools: [Read, Bash]",
      "---",
      "See [gone](./gone.md). never mind the file.",
      "",
    ].join("\n"),
  });
  assert.deepEqual(await thrown(() => checkProseSkill("broken")), [
    "broken: 3 findings",
    "broken: Bash appeared in the contract. It was dropped deliberately; bringing it back restores a leg of the lethal trifecta (data + network + execution) on a skill that only writes text. If the tool IS needed IN SUBSTANCE — declare it in toolsNeeded WITH A REASON, not silently.",
    "broken: dangling links → ./gone.md. A skill naming a path that does not exist is a dead instruction: the model reads it, does something adjacent and reports success.",
    "broken: no compilation mark. That means SKILL.md was edited by hand rather than through .spec.ts — the next `vigiles compile` will overwrite the edit without warning.",
  ]);
});

test("checkProseSkill: a tool exemption needs a reason, and an exemption for a tool not in the contract is stale", async () => {
  writeTree(SKILLS, {
    "needs-bash/notes.md": "notes\n",
    "needs-bash/SKILL.md": PROSE()
      .replace("name: prose", "name: needs-bash")
      .replace("[Read, Write]", "[Read, Bash]"),
  });
  assert.deepEqual(
    [
      await thrown(() =>
        checkProseSkill("needs-bash", { toolsNeeded: { Bash: "short" } }),
      ),
      await checkProseSkill("needs-bash", {
        toolsNeeded: { Bash: "runs the measurement script it documents" },
      }),
      await thrown(() =>
        checkProseSkill("prose", {
          toolsNeeded: { Agent: "delegates the heavy read to a subagent" },
        }),
      ),
    ],
    [
      "needs-bash: toolsNeeded.Bash is declared without an intelligible reason. An exemption must say WHY the tool is needed in substance — otherwise it is a silent disabling of the check.",
      1,
      [
        "prose: 1 findings",
        "prose: toolsNeeded.Agent is declared, but Agent itself is NOT in the contract. The exemption is stale — remove it, otherwise it describes a different skill.",
      ],
    ],
  );
});

test("checkProseSkill refuses a skill with no SKILL.md, an empty contract, and one that does not parse", async () => {
  writeTree(SKILLS, {
    "empty-tools/notes.md": "notes\n",
    "bad-yaml/notes.md": "notes\n",
    "empty-tools/SKILL.md": PROSE()
      .replace("name: prose", "name: empty-tools")
      .replace("allowed-tools: [Read, Write]", "allowed-tools: []"),
    "bad-yaml/SKILL.md": PROSE()
      .replace("name: prose", "name: bad-yaml")
      .replace("allowed-tools: [Read, Write]", "allowed-tools: [Read, Write"),
  });
  assert.deepEqual(
    [
      await thrown(() => checkProseSkill("absent")),
      await thrown(() => checkProseSkill("empty-tools")),
      (await thrown(() => checkProseSkill("bad-yaml")))[0],
    ],
    [
      `absent: no ${join(SKILLS, "absent", "SKILL.md")} — nothing to check`,
      [
        "empty-tools: 1 findings",
        "empty-tools: empty allowed-tools — inherits everything",
      ],
      "bad-yaml: 2 findings",
    ],
  );
});

/** Rewrite a copied skill's SKILL.md with `edit`, run checkSkill, restore; the failure's first line. */
async function brokenBy(name, edit) {
  const md = join(SKILLS, name, "SKILL.md");
  const clean = readFileSync(md, "utf8");
  writeFileSync(md, edit(clean));
  try {
    await checkSkill(name);
    return null;
  } catch (e) {
    // The header, then the first 90 characters of each numbered finding.
    const lines = e.message.split("\n");
    return [
      lines[0],
      ...lines
        .filter((l) => /^  \[\d+\] /.test(l))
        .map((l) => l.trim().slice(0, 90)),
    ];
  } finally {
    writeFileSync(md, clean);
  }
}
const recordSection = /## Record the verdict[\s\S]*?(?=\n## |\n# |$)/;

test("checkSkill on the defects its own corpus never has: no description, no record block, a record block naming no kind", async () => {
  assert.deepEqual(
    [
      await brokenBy("cold-read-diff", (s) =>
        s.replace(/^description: .*\n/m, ""),
      ),
      await brokenBy("argument-arc", (s) =>
        s.replace(
          recordSection,
          "## Record the verdict\n\nNothing named here.\n",
        ),
      ),
      await brokenBy("draft-paper", (s) =>
        s.replace(
          recordSection,
          "## Record the verdict\n\n**ABSTAINED** — and no reason is named.\n",
        ),
      ),
    ],
    [
      [
        '1 assertion(s) failed for pipeline skill "cold-read-diff":',
        "[1] cold-read-diff: description is missing or trivially short (0 chars). The description i",
      ],
      [
        '3 assertion(s) failed for pipeline skill "argument-arc":',
        '[1] argument-arc: the "Record the verdict" block instructs no `node .claude/skills/paper-p',
        "[2] argument-arc: its record block names [nothing] and not FINDING, and does not admit tha",
        "[3] argument-arc: its record block names no abstention reason from [started, no-witness, i",
      ],
      [
        '5 assertion(s) failed for pipeline skill "draft-paper":',
        '[1] draft-paper: the "Record the verdict" block instructs no `node .claude/skills/paper-pi',
        "[2] draft-paper: its record block names [ABSTAINED] and not FINDING, and does not admit th",
        "[3] draft-paper: its record block names no abstention reason from [started, no-witness, in",
        "[4] draft-paper: the honest admission is gone from its record block. It is the one skill i",
        "[5] ABSTAINED needs a reason from started|no-witness|input-missing|blocked|crashed, got nu",
      ],
    ],
  );
});

test("a skill may show `ledger.mjs status` — only a `record` call must file under the skill", async () => {
  assert.equal(
    await brokenBy("cold-read-diff", (s) =>
      s.replace(
        "node .claude/skills/paper-pipeline/scripts/announce.mjs cold-read-diff <paper-dir>",
        "node .claude/skills/paper-pipeline/scripts/announce.mjs cold-read-diff <paper-dir>\n" +
          "node .claude/skills/paper-pipeline/scripts/ledger.mjs status <paper-dir>",
      ),
    ),
    null,
  );
});

test("a skill whose only ledger call is `status` records nothing, and is told so", async () => {
  assert.deepEqual(
    await brokenBy("cold-read-diff", (s) =>
      s.replaceAll(
        /ledger\.mjs record cold-read-diff <paper-dir> \w+[^\n]*/g,
        "ledger.mjs status <paper-dir>",
      ),
    ),
    [
      '1 assertion(s) failed for pipeline skill "cold-read-diff":',
      '[1] cold-read-diff: the "Record the verdict" block instructs no `node .claude/skills/paper',
    ],
  );
});

test("the record CALL is the contract, not the heading: a renamed record section still passes", async () => {
  assert.equal(
    await brokenBy("camera-ready", (s) =>
      s.replace("## Record the verdict", "## Something else"),
    ),
    null,
  );
});
