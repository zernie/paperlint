/**
 * skill-checks.mjs's two refusing halves, which the per-skill harnesses (all green on the real
 * corpus) never reach: `checkSkill` on an unknown name and on a skill with a planted defect, and `checkProseSkill` — the check for skills WITHOUT the pipeline, which the package
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
import { useTempDir, writeTree } from "../test/support.ts";

const SHIPPED = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const consumer = useTempDir("skill-checks-");
const SKILLS = join(consumer, ".claude", "skills");
cpSync(SHIPPED, SKILLS, { recursive: true, verbatimSymlinks: true });
process.env.CLAUDE_PROJECT_DIR = consumer;
const { checkProseSkill, checkSkill, checkVenueBar } =
  await import("./skill-checks.mjs");

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

test("checkSkill passes a real shipped skill and refuses a name with no SKILL.md", async () => {
  assert.deepEqual(
    [
      await checkSkill("cold-read-diff"),
      await thrown(() => checkSkill("no-such-skill")),
    ],
    [1, `"no-such-skill" has no SKILL.md under ${SKILLS}`],
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
    // The header, then each numbered finding.
    const lines = e.message.split("\n");
    return [
      lines[0],
      ...lines.filter((l) => /^  \[\d+\] /.test(l)).map((l) => l.trim()),
    ];
  } finally {
    writeFileSync(md, clean);
  }
}
test("checkSkill reports EVERY finding at once: a renamed skill with no description", async () => {
  const lines = await brokenBy("cold-read-diff", (s) =>
    s
      .replace("name: cold-read-diff", "name: renamed")
      .replace(/^description: .*\n/m, ""),
  );
  assert.deepEqual(lines?.slice(0, 1), [
    '2 assertion(s) failed for skill "cold-read-diff":',
  ]);
  assert.match(lines?.[1] ?? "", /frontmatter name is "renamed"/);
  assert.match(lines?.[2] ?? "", /description is missing/);
});

test("checkSkill refuses an instructed script that does not exist", async () => {
  const lines = await brokenBy("verify-citations", (s) =>
    s.replaceAll("scripts/extract-ref-facts.js", "scripts/missing.js"),
  );
  assert.equal(
    lines?.[0],
    '2 assertion(s) failed for skill "verify-citations":',
  );
  assert.match(
    lines?.[1] ?? "",
    /instructs `node .*missing\.js.*` but .*missing\.js does not exist/,
  );
});

test("checkSkill resolves a bare scripts/ path from the skill's own directory", async () => {
  const spelled = (path) => (s) =>
    s.replaceAll("${CLAUDE_SKILL_DIR}/scripts/bib-authors.js", path);
  // Guards: a bare path to a script the skill has is accepted.
  assert.equal(
    await brokenBy("verify-citations", spelled("scripts/bib-authors.mjs")),
    null,
  );
  // Guards: a bare path to a script it lacks is refused, once per line that names it.
  assert.deepEqual(
    (await brokenBy("verify-citations", spelled("scripts/missing.js")))?.[0],
    '2 assertion(s) failed for skill "verify-citations":',
  );
});

test("checkSkill refuses a pipeline script the skill's allowed-tools do not permit", async () => {
  const lines = await brokenBy("verify-citations", (s) =>
    s.replace(
      /^allowed-tools: \[(.*)\]$/m,
      (_, list) =>
        `allowed-tools: [${list
          .split(", ")
          .filter((t) => t !== "Bash")
          .join(", ")}]`,
    ),
  );
  // Guards: each of the seven `node ${CLAUDE_SKILL_DIR}/…` lines is named, the first one first.
  assert.equal(
    lines?.[0],
    '7 assertion(s) failed for skill "verify-citations":',
  );
  assert.match(
    lines?.[1] ?? "",
    /verify-cites\.js.* permit no such Bash command/,
  );
});

test("a Bash entry that covers the instructed scripts permits them, and one narrowed to another does not", async () => {
  const narrowTo = (pattern) => (s) =>
    s.replace(
      /^allowed-tools: \[(.*)\]$/m,
      (_, list) =>
        `allowed-tools: [${list
          .split(", ")
          .map((t) =>
            t === "Bash" ? `"Bash(node \${CLAUDE_SKILL_DIR}/${pattern}:*)"` : t,
          )
          .join(", ")}]`,
    );
  // Guards: an entry that covers the skill's own scripts permits all seven commands.
  assert.equal(await brokenBy("verify-citations", narrowTo("*")), null);
  const lines = await brokenBy(
    "verify-citations",
    narrowTo("../paper-pipeline/scripts/extract-ref-facts.js"),
  );
  // Guards: narrowed to one script, the other five commands (verify-cites.js, bib-authors.js) are named.
  assert.equal(
    lines?.[0],
    '5 assertion(s) failed for skill "verify-citations":',
  );
  assert.match(lines?.[1] ?? "", /permit no such Bash command/);
});

test("checkVenueBar passes the shipped scoring skills and names each missing half of a skill without the venue bar", () => {
  const wired = ["pc-panel-review"].map(checkVenueBar);
  writeTree(SKILLS, {
    "unwired/SKILL.md": PROSE("A review that never reads the venue's bar."),
  });
  const msg = (() => {
    try {
      checkVenueBar("unwired");
    } catch (e) {
      return e.actual;
    }
    return null;
  })();
  assert.deepEqual(
    [wired, msg],
    [
      [1],
      [
        "unwired: does not point to `paper-pipeline/references/venue-bar.md`",
        "unwired: does not name `<papers-root>/venues/<venue>/summary.md`",
        'unwired: does not carry the fallback "main-conference bar assumed"',
      ],
    ],
  );
});
