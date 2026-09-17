/**
 * plan-paper-timeline — the EFFECTS tier. What the run can actually reach, not what
 * SKILL.md says it reaches.
 *
 * SIBLING, NOT REPLACEMENT. `plan-paper-timeline.harness.mjs` next door is static
 * (`checkSkill()`): frontmatter, wiring, script paths, verdict vocabulary. It is untouched.
 * This file runs the REAL `claude` CLI against a SCRIPTED MOCK MODEL (`runHarnessTest`),
 * so it costs $0 and no API key — and observes the one thing static analysis structurally
 * cannot: whether the tools this skill DECLARES EXIST WHERE IT RUNS.
 *
 * ── WHY THIS SKILL FOR THIS CHANNEL ──────────────────────────────────────────────
 * It is the only skill in the corpus whose core step is an MCP call. §3 says, literally,
 * «Use `mcp__Google_Calendar__create_event` … 🔴 Read the zone, do not assume it». Four of its ten
 * declared entries are MCP calendar tools. A declaration naming a tool that is not there is
 * invisible to every static check in this repo and to `vigiles audit`, which scores this
 * corpus Structure 100.
 *
 * ── SAFETY: WHY THIS CANNOT TOUCH A REAL CALENDAR ───────────────────────────
 * Measured before this file was written, not assumed. The probe below is `list_events`,
 * which is READ-ONLY; `create_event`/`update_event` are NEVER called here, on purpose,
 * even though the surface turns out to be absent. The run also happens in a `mkdtemp`
 * work dir the runner deletes. If a future CLI ever exposes the calendar headlessly, the
 * read-only probe starts PASSING and this test FAILS loudly — which is the point of
 * pinning it, and is a far better way to learn it than a created event.
 *
 * ── WHAT THIS PINS (a characterization test, deliberately) ───────────────────────
 * Under `claude -p` at `CHARACTERIZED_CLI` (`lib/agent-cli-version.mjs`, 2.1.227) the whole
 * `mcp__*` surface is ABSENT, and so is `ToolSearch`.
 *
 * 🔴 THAT NUMBER IS A VALUE, NOT PROSE, and it was prose until issue #7. The probe below used
 * to run with `stdio: "ignore"`, so the version the CLI printed was never read — this tier
 * characterized whatever the runner installed that day while this paragraph kept saying 2.1.227.
 * Measured: 2.1.273 on the reporter's machine and on this one, forty-six patch releases of drift
 * that nothing in a green log could show. The version is now OBSERVED, reported in the summary
 * below, and named in every failure message — so a red says which version it characterized.
 * That means:
 *   1. §3 of this skill is UNEXECUTABLE in any headless / CI context. It is an
 *      interactive-session-only step. Nothing in the file says so.
 *   2. 🔴 THE RECORDED `ToolSearch` FINDING DOES NOT REPRODUCE HERE, AND THE CORRECTION
 *      MATTERS. `.claude/lib/skill-effects-results/README.md` (2026-08-10, $0.82)
 *      recorded «модель вызвала ToolSearch … его в allowed-tools нет», with the caveat
 *      that it might be an artifact of the headless environment. It is the opposite:
 *      headless has NO ToolSearch to call. Adding `ToolSearch` to `allowed-tools` would
 *      therefore fix nothing here. The reachability of these four tools is a property of
 *      the ENVIRONMENT, not of the declaration.
 *
 * If either fact changes, this file fails and says which one — that is its whole job.
 * It is not asserting that absence is good.
 *
 * Cost: $0 (scripted mock model, no API key). Wall clock ~30-60s for one CLI spawn.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runHarnessTest, skip } from "vigiles";
import { observeAgentCli } from "../../lib/agent-cli-version.mjs";
import { DEFAULT_TIMEZONE } from "../paper-pipeline/scripts/consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// 🔴 НЕ СЧИТАЕМ УРОВНИ, А ИЩЕМ. Здесь стояло `resolve(HERE, "..", "..", "..")` — верно, пока
// файл лежал в `.claude/skills/<skill>/` у потребителя (три уровня до корня), и МОЛЧА неверно
// после переезда в пакет, где он лежит в `skills/<skill>/` (два). Промах не падает: `resolve`
// охотно отдаёт каталог ВЫШЕ репозитория, `pluginDir` указывает в никуда, и симптом приходит
// как «Unknown skill» — то есть выглядит поломкой скилла, а не арифметики пути.
// Подъём до каталога, в котором реально есть `.claude`, от глубины не зависит вовсе.
const REPO = (() => {
  let dir = HERE;
  for (;;) {
    if (existsSync(resolve(dir, ".claude"))) return dir;
    const up = dirname(dir);
    if (up === dir)
      throw new Error(
        `не найден корень с каталогом .claude, начиная от ${HERE}. Без него \`pluginDir\` ` +
          `указывал бы мимо, и прогон сообщал бы «Unknown skill» вместо «путь посчитан неверно».`,
      );
    dir = up;
  }
})();
const CLAUDE_DIR = resolve(REPO, ".claude");

// The deterministic tier spawns the real agent binary. Without it there is nothing to
// observe, and a silent ✓ would be the exact lie this tier exists to end.
//
// 🔴 OBSERVED, NOT PROBED. This spawn already existed; it ran with `stdio: "ignore"`, which
// discarded the one thing worth reading. `observeAgentCli` keeps the spawn and keeps the string,
// refuses an exit-0-with-empty-stdout as "not an observation", and carries the characterized
// version alongside so the two can be compared on every run instead of by a reader's memory.
const { spawnSync } = await import("node:child_process");
const cli = observeAgentCli({ spawnSync });
if (!cli.present) skip(`plan-paper-timeline effects: ${cli.note}`);

const declaredMcp = [
  "mcp__Google_Calendar__list_events",
  "mcp__Google_Calendar__search_events",
  "mcp__Google_Calendar__create_event",
  "mcp__Google_Calendar__update_event",
];

const r = await runHarnessTest({
  // The REAL harness — this repo's skills and hooks, not a retyped subset.
  pluginDir: CLAUDE_DIR,
  // bubblewrap is absent on this machine, so `sandbox: "auto"` would REFUSE rather than
  // run. The code being loaded is our own `.claude`, which is the trust condition
  // `specTrusted` is about; the container is the outer confinement.
  sandbox: false,
  transcript: true,
  timeoutMs: 180_000,
  prompt: "plan the AISec timeline",
  // The SESSION grant. Deliberately WIDER than the skill's declaration for `Read`, and
  // deliberately missing `Bash` — that asymmetry is what turns the two probes below into
  // a control and a measurement inside ONE permission configuration.
  allowedTools: ["Read", "Write", "Skill", "ToolSearch", ...declaredMcp],
  files: { "cfp.md": "AISec 2026 — submission 24 Jul AoE\n" },
  model: [
    { tool: "Skill", input: { skill: "plan-paper-timeline" } },
    // CONTROL: a tool that is present and permitted. If this failed, every "absent"
    // verdict below would be a broken run, not a finding.
    { tool: "Read", input: { file_path: "cfp.md" } },
    // READ-ONLY calendar probe. Never create_event / update_event — see header.
    { tool: "mcp__Google_Calendar__list_events", input: { calendarId: "primary" } },
    // The tool the 2026-08-10 sweep said was missing from the declaration.
    { tool: "ToolSearch", input: { query: "select:mcp__Google_Calendar__create_event", max_results: 1 } },
    { text: "done" },
  ],
});

try {
  const call = (name) => r.toolCalls.find((c) => c.name === name);
  const absent = (c) => c !== undefined && c.isError && /No such tool available/.test(c.resultText);

  // ── 1. The run actually happened and the skill actually loaded ──────────────────
  // Asserted FIRST and separately from everything below. A confident "nothing was
  // reachable" from a run where the skill never loaded is a wiring bug wearing a
  // finding's clothes; this repo produced four of those on 2026-08-10.
  const activation = call("Skill");
  if (!activation || activation.isError)
    throw new Error(
      `plan-paper-timeline never activated (${activation ? activation.resultText : "no Skill call"}). ` +
        `Everything below would be a fact about a broken fixture, not about the skill.`,
    );

  const reachedModel = r.modelRequests
    .map((q) => [q.system, ...q.messages.map((m) => m.text)].join("\n"))
    .join("\n");
  if (!reachedModel.includes("FILING-SPACING"))
    throw new Error(
      `the Skill call resolved but the skill BODY never reached the model ` +
        `("FILING-SPACING", a §4 heading, is absent from all ${String(r.modelRequests.length)} requests). ` +
        `Activation without a body is a loaded skill that guides nothing.`,
    );

  const ctrl = call("Read");
  if (!ctrl || ctrl.isError)
    throw new Error(
      `POSITIVE CONTROL FAILED: Read — a tool this skill declares and the session grants — ` +
        `did not succeed (${ctrl ? ctrl.resultText.slice(0, 160) : "never called"}). ` +
        `Until this passes, no "tool absent" result below can be believed.`,
    );

  // ── 2. The pinned environment fact: the declared MCP surface is not there ───────
  const cal = call("mcp__Google_Calendar__list_events");
  if (!absent(cal))
    throw new Error(
      `THE ENVIRONMENT CHANGED — and this is good news that must be read, not silenced. ` +
        `Observed \`claude\` ${cli.version} (characterized against ${cli.characterized}). ` +
        `\`mcp__Google_Calendar__list_events\` is now REACHABLE from \`claude -p\` ` +
        `(result: ${cal ? cal.resultText.slice(0, 200) : "no call recorded"}). ` +
        `Consequences: (a) §3 of this skill is now executable headlessly, so it can finally be ` +
        `tested for real instead of characterized; (b) 🔴 every future run of this tier can now ` +
        `WRITE A REAL CALENDAR — re-check the safety argument in this file's header BEFORE ` +
        `adding a create_event probe; (c) update this assertion deliberately, do not delete it.`,
    );

  const ts = call("ToolSearch");
  if (!absent(ts))
    throw new Error(
      `\`ToolSearch\` is now available under \`claude -p\` ${cli.version} ` +
        `(characterized against ${cli.characterized}) (result: ` +
        `${ts ? ts.resultText.slice(0, 200) : "no call recorded"}). The 2026-08-10 sweep recorded ` +
        `"ToolSearch missing from allowed-tools" as a finding about THIS SKILL; measured on ` +
        `2026-08-11 it was a fact about the ENVIRONMENT (headless had no ToolSearch at all). ` +
        `If it exists now, that finding becomes actionable again: add it to allowed-tools.`,
    );

  // ── 3. What that means, stated once, where a reader will see it ────────────────
  console.log(
    `✓ plan-paper-timeline [effects]: skill activated and its body reached the model; ` +
      `Read (declared+granted) works — the run is live.\n` +
      // 🔴 The version goes in the REPORT, not only into failures. A characterization test that
      // silently still holds is indistinguishable from one nobody re-checked, so the run says
      // which version it held against — and says it whether or not the numbers agree.
      `  CLI: ${cli.note}\n` +
      `  PINNED: ${String(declaredMcp.length)} of its 10 declared entries are MCP calendar tools, ` +
      `and the whole mcp__* surface is ABSENT under \`claude -p\`; \`ToolSearch\` is absent too.\n` +
      `  → §3 ("Create the calendar events") is an INTERACTIVE-SESSION-ONLY step. Nothing in ` +
      `SKILL.md says so, and no static check can see it.\n` +
      `  → Corrects the 2026-08-10 sweep: the ToolSearch gap was environmental, not a defect ` +
      `in this declaration.`,
  );
} finally {
  r.cleanup();
}

// ════════════════════════════════════════════════════════════════════════════════
// RUN B — §3 EXECUTED, not characterized
//
// Run A above pins that the calendar surface is absent from a headless session, which
// is true and worth knowing and also means the skill's CENTRAL STEP has never been
// checked by anything. Run B supplies the surface with a stand-in
// (`fixtures/fake-google-calendar.mjs`) carrying the REAL API's required-field sets,
// so the step becomes executable for the first time.
//
// ── WHAT IS UNDER TEST, AND WHY IT IS NOT THE MODEL ─────────────────────────────
// The model here is scripted, so asserting "the agent decided to create three events"
// would only be replaying this file's own script — a green light that means nothing.
// Whether a real model reads §3 and does the right thing is a PROBABILISTIC question
// and it belongs to `plan-paper-timeline.eval.mjs`, which costs money and runs locally.
//
// The unit under test here is §3 ITSELF: the call it prescribes. The prescribed
// arguments are PARSED OUT OF SKILL.md — not retyped here — and replayed against the
// strict double. So the harness answers a question nobody was asking: is the call this
// section tells the model to make actually well-formed against the real Google
// Calendar API? Edit §3 into something the API would reject and this goes red.
//
// That framing is the whole reason the block in §3 exists. It also found the defect
// that motivated it: §3 named only the title, the date and `timeZone`, while
// `create_event` requires `summary` + `startTime` + `endTime`. A model following the
// old §3 literally had no reason to pass an end time.
// ════════════════════════════════════════════════════════════════════════════════

const MARKER = "harness:prescribed-call create_event";

/** §3's prose, read once — the zone assertions below check the PROSE as well as the call. */
const skillBody = readFileSync(join(HERE, "SKILL.md"), "utf8");

/**
 * Pull §3's prescribed call out of SKILL.md.
 *
 * Parsed with markdown-it rather than a regex, deliberately: a fenced block is markup
 * structure, and "the fence after the marker" is a statement about TOKENS. A regex over
 * lines cannot tell a real fence from one quoted inside another fence, and this repo has
 * paid for that lesson four times (root CLAUDE.md, «Markdown разбираем ПАРСЕРОМ»).
 * A missing markdown-it must fail LOUDLY — a quiet fallback would let a degraded
 * version of this check run forever without anyone noticing.
 */
async function prescribedCall() {
  const { default: MarkdownIt } = await import("markdown-it");
  const src = readFileSync(join(HERE, "SKILL.md"), "utf8");
  // `html: true` is load-bearing, not a style choice: with the default the comment is
  // not a token of its own at all — it lands INSIDE a paragraph's inline token, the
  // marker is never seen, and the harness reports the marker as missing while it is
  // sitting right there in the file. Measured while writing this.
  const tokens = new MarkdownIt({ html: true }).parse(src, {});
  let armed = false;
  for (const t of tokens) {
    // Matched on content rather than on `type === "html_block"` so that a future
    // tokenizer change degrades into the loud error below instead of a silent miss.
    if (!armed && (t.content ?? "").includes(MARKER)) {
      armed = true;
      continue;
    }
    if (!armed) continue;
    if (t.type !== "fence")
      throw new Error(
        `SKILL.md: the token after the "${MARKER}" marker is a ${t.type}, not a fenced block. ` +
          `The marker must sit immediately above the json fence it labels.`,
      );
    return JSON.parse(t.content);
  }
  throw new Error(
    `SKILL.md no longer contains the "${MARKER}" marker. §3's prescribed call is the unit ` +
      `under test here; without it this harness has nothing to check and must not pass quietly.`,
  );
}

const prescribed = await prescribedCall();
const logDir = realpathSync(mkdtempSync(join(tmpdir(), "ppt-effects-")));
const callLog = join(logDir, "calls.jsonl");

try {
  const b = await runHarnessTest({
    pluginDir: CLAUDE_DIR,
    sandbox: false,
    transcript: true,
    timeoutMs: 180_000,
    prompt: "plan the AISec timeline",
    // Two lines are the entire cost of supplying the surface. Claude Code discovers a
    // `.mcp.json` in its cwd headlessly when the settings enable project servers —
    // measured 2026-08-17, `vigiles/repro/mcp-double-2026-08-17/spike-harness-pickup.mjs`.
    // Naming the server `Google_Calendar` is what makes the skill's own declared
    // `mcp__Google_Calendar__create_event` resolve to the stand-in.
    files: {
      ".mcp.json": JSON.stringify({
        mcpServers: {
          Google_Calendar: {
            command: process.execPath,
            args: [join(HERE, "fixtures", "fake-google-calendar.mjs")],
            env: { FAKE_MCP_LOG: callLog },
          },
        },
      }),
    },
    settings: { enableAllProjectMcpServers: true },
    allowedTools: ["Read", "Skill", ...declaredMcp],
    model: [
      { tool: "Skill", input: { skill: "plan-paper-timeline" } },
      { tool: "mcp__Google_Calendar__create_event", input: prescribed },
      { text: "done" },
    ],
  });

  try {
    const call = b.toolCalls.find((c) => c.name === "mcp__Google_Calendar__create_event");
    if (!call)
      throw new Error(
        `the prescribed \`create_event\` call was never recorded. The stand-in was not reached — ` +
          `check that \`.mcp.json\` discovery still works in this CLI version before trusting any ` +
          `verdict from this run.`,
      );

    // ── The vacuousness guard, asserted BEFORE the verdict it protects ────────────
    // Identity is established from the LOG, not from the reply text, and the order
    // matters more than it looks. The first version of this guard keyed on `evt_fake_`,
    // a string the stand-in prints only on SUCCESS — so a perfectly correct schema
    // REJECTION arrived with no marker and was reported as "something else served this
    // tool". The guard meant to protect the verdict was hiding it, and it took a
    // mutation run to notice (2026-08-17). The log is written on both paths, so a
    // non-empty log means our server handled the call, whatever it decided.
    const logged = existsSync(callLog)
      ? readFileSync(callLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    if (logged.length === 0)
      throw new Error(
        `nothing reached the stand-in (reply was: ${call.resultText.slice(0, 200)}). Either the ` +
          `tool was served by something else, or FAKE_MCP_LOG did not survive into the server ` +
          `process. Every assertion below would be vacuous, so this fails instead of passing.`,
      );

    // ── The verdict: is §3's prescription well-formed against the real API? ───────
    const bad = logged.filter((e) => !e.ok);
    if (bad.length)
      throw new Error(
        `§3 of SKILL.md prescribes a call the REAL Google Calendar API would reject:\n` +
          bad.map((e) => `  ${e.name}: ${e.why}`).join("\n") +
          `\nFix the json block under the "${MARKER}" marker in SKILL.md — the prose there is an ` +
          `instruction to a model, and an instruction that cannot succeed is worse than none.`,
      );

    // Only now is the success marker meaningful: the log says our server accepted this
    // call, so a reply without the marker means the ACCEPTED call was answered by
    // someone else — a genuinely different failure from the two above.
    if (!/evt_fake_\d/.test(call.resultText))
      throw new Error(
        `the stand-in accepted the call, but the reply the agent saw did not come from it ` +
          `(got: ${call.resultText.slice(0, 200)}). Two servers are answering this tool name.`,
      );

    // §3 names the timezone; this is where that claim stops being prose.
    //
    // 🔴 THIS USED TO COMPARE AGAINST ONE HARD-CODED ZONE — the first consumer's. That is exactly
    // the thing a package may not know: the same CFP date is a different wall-clock hour for every
    // author, so the zone is the `timezone` CARRIER, read from the consumer's package.json. What
    // the PRESCRIPTION in §3 must show is therefore not anybody's real zone but the documented
    // DEFAULT, next to the instruction telling the model to substitute the declared one.
    //
    // Two assertions, because they fail for different reasons: an unusable zone is a call the
    // calendar API rejects, while a usable-but-unexplained zone is a prescription that silently
    // schedules every other author in someone else's day.
    const zone = logged[0].args.timeZone;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
    } catch {
      throw new Error(
        `§3 prescribes \`timeZone: ${JSON.stringify(zone)}\`, which is not an IANA zone. An anchor ` +
          `in an unusable zone is a call the calendar API rejects.`,
      );
    }
    if (zone !== DEFAULT_TIMEZONE)
      throw new Error(
        `§3's example carries \`timeZone: ${JSON.stringify(zone)}\`, but the example must show the ` +
          `documented default ${JSON.stringify(DEFAULT_TIMEZONE)} — a real zone in the example reads ` +
          `as the zone to use, and every author who copies it schedules in someone else's day.`,
      );

    // …and the instruction to substitute must still be there, or the default becomes the value.
    if (!/\?\.timezone\b/.test(skillBody))
      throw new Error(
        `§3 shows the default zone but no longer tells the model to READ the \`timezone\` carrier. ` +
          `Without that line the example stops being an example and becomes the prescription.`,
      );

    console.log(
      `✓ plan-paper-timeline [effects/§3]: the call §3 prescribes is WELL-FORMED against the real ` +
        `Google Calendar schema — required ${JSON.stringify(["summary", "startTime", "endTime"])} ` +
        `all present, no unknown fields, timeZone=${zone}.\n` +
        `  The step is now EXECUTED, not characterized: the stand-in answered ` +
        `(${String(logged.length)} call(s) logged), so the run continued past the effectful step — ` +
        `which a deny rule can never allow.\n` +
        `  Under \`--strict-mcp-config\` the real \`mcp__Google_Calendar__*\` surface does not exist ` +
        `in this session, so the real calendar was not blocked here, it was UNREACHABLE.`,
    );
  } finally {
    b.cleanup();
  }
} finally {
  rmSync(logDir, { recursive: true, force: true });
}
