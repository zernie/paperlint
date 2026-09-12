// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "research-ideate",
  description:
    "Go / no-go по идее исследования — ДО того, как в неё вложились. Use когда идея уже на столе и вопрос в том, браться за неё или нет: потянет ли она на рецензируемую статью или это в лучшем случае пост в блог, есть ли дешёвая версия находки, которая не требует страшного результата, не распыляемся ли мы в сторону от своей линии. Даёт вердикт плюс самую острую формулировку, минимальную находку и типы площадок. Оценивает идею по тому, что реально засчитывается в корпусе работ: рецензируемая индексируемая публикация (authorship), переиспользуемый метод или бенчмарк вместо разового «инструмент X плох» (original contribution), цитирования дальше, а не звёзды на GitHub, и одна связная линия вместо россыпи тем. Стадия — замысел, до find-venue и до любого драфта. Compose with find-venue (downstream), build-benchmark, draft-paper.",
  tools: ["Read", "Write", "Grep", "Glob", "Agent", "Skill", "Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*)", "Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)"],
  body: `
# research-ideate — is this idea worth a paper, and does the paper earn authorship credit?

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs research-ideate <dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The \`<dir>\` argument is **optional in spirit**: this skill can run before a paper directory exists, so
pass whichever directory the work lives in, or \`.\`. The ledger row is written either way, and a plain
dot is more honest than an invented path.

Runs BEFORE any effort is spent. An idea can be interesting and still be a bad *publication*
investment — the wrong framing produces something un-publishable or un-citable, which counts for
nothing toward a body of work. This skill kills those ideas early and reshapes the survivors into the framing
that publishes. It does NOT do the venue search (that's \`find-venue\`) — it decides whether there's a
paper worth taking to \`find-venue\` at all.

Grounding for every judgment below: the authorship, judging and original-contribution criteria —
what a reviewer of a body of work actually counts.

## Score the idea on five axes

Answer each explicitly. A "no" on (a) is a hard stop; a "no" on the rest is a reshape signal.

**(a) Does it yield a PEER-REVIEWED, INDEXED publication?**
This is the authorship criterion, full stop. The paper must land in indexed proceedings (ACM DL /
IEEE Xplore / archival workshop proceedings). Peer-reviewed + indexed papers count
**regardless of caliber** — conference and workshop proceedings qualify. There is **no
approved-venue list** and **venue newness does not hurt** the authorship criterion (prestige is
only a late-stage enhancer). So the bar here is binary: will
this produce something that goes through peer review and gets indexed? A blog post, a preprint that
never gets reviewed, or a non-archival talk = **no credit**. If the idea can't clear this, stop.

**(b) Is the contribution a reusable METHOD/BENCHMARK, or a one-off result?**
Reviewers accept methods and benchmarks; they reject "we ran tool X and it's bad." Name both framings:
- **Weakest framing** — the bare result. "Coding agent X produces insecure code." Reads as a blog
  post, doesn't generalize, dies in review, earns nothing citable.
- **Strongest framing** — the reusable artifact. The *way you measured it*: a benchmark, a metric, a
  probe, a protocol others can rerun against the next tool. That survives review AND gets cited when
  someone applies it to tool Y. Pick the strongest framing before writing a line.

**(c) Will it generate downstream CITATIONS / ADOPTION?**
This is the original-contribution criterion, and it is read through **citations and adoption, NOT
GitHub stars**. Ask: when the next person studies this space, must they cite or reuse this? A
benchmark others rerun, a metric others report, a finding others build on — yes. A one-off teardown of
one product — no. Methods/benchmarks (axis b) are exactly what earns this credit; scattered results do
not.

**(d) Is there a fast MVP finding — a "proof of method" that needs no scary result?**
The idea should have a small first result that *validates the method itself*, independent of how
dramatic the finding is. A **medium-severity finding is sufficient** if the method is the
contribution. You do not need to prove the tool is catastrophically broken; you need to prove your
measurement works and reveals something real. If the idea only pays off with a huge, hard-to-get
result, it's slow and risky — reshape it toward a proof-of-method MVP.

**(e) Does it stay in the researcher's coherent LANE?**
**Name the lane explicitly** — the research area the existing corpus is already in. A
connected corpus of papers in one lane beats scattered topics — review of a body of work rewards a
sustained, coherent corpus, not a grab-bag. Score whether this idea deepens the existing corpus
(good) or wanders into an unrelated field (weak, even if publishable). Same lane compounds; scattered
does not.

## Output

Emit a compact verdict:
1. **Go / No-go** — with the single reason. No-go if (a) fails, or if (b)+(c) can't be reshaped out of
   blog-post territory.
2. **Sharpest framing** — the one-sentence method/benchmark contribution, in its strongest form (the
   thing every future reviewer will paraphrase back). This sentence is the seed for \`draft-paper\`.
3. **The MVP finding** — the smallest proof-of-method result that validates the contribution;
   explicitly note the minimum severity that suffices (usually: medium is enough).
4. **2–3 candidate venue TYPES** — not specific venues (that's \`find-venue\`'s job), but the shape:
   e.g. "security-of-AI-coding workshop @ a top-tier security conference," "SE-measurement workshop @
   ASE/FSE," "eval/benchmark track." Hand these to \`find-venue\`.

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record research-ideate <dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record research-ideate <dir> ABSTAINED <reason> "<one line>"
\`\`\`

🔴 **There is no PASS**, so there is no way to write down "go" as a value. A clean go is the
absence of findings across the axes, and whoever wants to call it a go says so themselves.

**FINDING** — go with reshaping, where \`<count>\` is the number of axes that need it and
\`<report-path>\` is the output. Add \`--blocking\` for a no-go: axis (a) is a hard stop, not a weight,
and a no-go is the loudest finding this skill produces.
**ABSTAINED** — \`no-witness\`: all axes were scored and none needed reshaping. \`blocked\`: the idea
was too vague to score, which is a different thing from a no-go and must not be recorded as one.

A recorded no-go is the cheapest artifact in this whole pipeline, and the one most often lost: an idea
killed in conversation comes back three months later wearing a different name, and nothing in the repo
remembers that it was already judged.

## Rules
- Axis (a) is a gate, not a weight — no indexed peer review, no idea. Everything else reshapes.
- Never justify an idea by GitHub stars, demo virality, or "it'd be a great blog post." Those don't
  count. Citations/adoption and indexed proceedings do.
- Prefer the proof-of-method MVP over the heroic result — a shipped medium finding beats a stalled big
  one, and it's what earns the credit on time.
- Keep it in lane. If it's a great idea in the wrong field, say so and note it belongs elsewhere.
- Don't invent numbers, severities, or venue names here — this is a framing pass, not a study.

## Compose with
- \`find-venue\` (downstream) — hand it the candidate venue types + the sharpest framing.
- \`build-benchmark\` — the MVP finding usually IS a small benchmark; this skill scopes it.
- \`draft-paper\` — the sharpest-framing sentence becomes the paper's one-contribution seed.
- \`plan-paper-timeline\` — once go/no-go is "go," size the effort against a real deadline.

## Provenance
Both real papers passed this filter as **proof-of-method, medium-severity-is-sufficient** ideas in one
lane:
- **AgenticDev 2026 @ ASE — "Measuring the Wrong Number"** (~90%, submitted). The contribution was the
  *measurement method*, not a verdict on one tool; a medium-severity finding was enough because the
  reusable way-to-measure was the point. Stayed in the AI-assisted-SE reliability lane.
- **AISec 2026 @ ACM CCS — "Safety Theater in Agentic Coding"** (~87–88%). Same shape at a security
  bar: a reusable probe/finding about agentic coding safety, proof-of-method sufficient, squarely in
  the security-of-AI-coding lane. Together the two form a *connected corpus* — exactly what axis (e)
  rewards — rather than two scattered one-offs.`,
});
