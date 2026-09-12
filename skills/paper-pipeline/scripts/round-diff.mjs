#!/usr/bin/env node
/**
 * round-diff — a review round may only change what it declared, and the WHOLE paper is weighed
 * every round.
 *
 * Usage:  node round-diff.mjs <paper-dir> [--json] [--since=<git-rev>]
 * Exit:   always 0 (advisory). Findings on stdout; a census and a SILENT ABOUT block always.
 *
 * ── THE FAILURE ──────────────────────────────────────────────────────────────────────────────
 * `references/review-ratchet.md`, from a real session: "one session, seven overclaim fixes plus one
 * panel round added roughly a page of pure hedge density." Review only ever ADDS. Every round
 * deposits a hedge, a caveat, a clarification, one more citation — each one locally defensible,
 * none of them authorised by anybody, and the paper that survives four rounds reads like armour.
 * Nothing in this pipeline was watching the aggregate. `tighten-paper` is asked to pay the debt back
 * afterwards, which is a cleanup pass, not a gate: it runs when someone remembers, and what it
 * measures is the paper's state, never the round's spend.
 *
 * Two mechanisms from ARIS (`wanshuiyin/Auto-claude-code-research-in-sleep`, MIT, HEAD 2a23847, read
 * 2026-08-09), adapted to a markdown source:
 *
 *   - `auto-paper-improvement-loop`'s EDIT WHITELIST — `forbidden_operations`, of which theirs are
 *     `new_cite`, `new_bibitem`, `new_theorem_env` and `numerical_claim` ("blocks adding numbers /
 *     percentages / metrics not present in original"). Their argument for making it a parameter is
 *     the whole point of doing it this way: routing the constraint "through a first-class parameter
 *     (rather than relying on the LLM to 'remember' not to do them) makes the constraint enforceable,
 *     auditable … and visible to the user at each round's checkpoint."
 *   - `resubmit-pipeline:412` — "**Per-round diff gate is mandatory.** Multi-round drift is the
 *     highest-risk failure mode … (a small softening at round 1 + another small softening at round 2
 *     can compound into a meaningful framing change)."
 *
 * ── WHY IT IS NOT A DIFF CHECKER ─────────────────────────────────────────────────────────────
 * 🔴 The house failure of 2026-08-05, recorded in `papers/CLAUDE.md`: four defects found by eye, all
 * four covered by an existing tool, all four silent BY CONSTRUCTION because every tool asked a local
 * question. The `carries:` convention had coverage that was "a function of the history of edits" —
 * a pass that annotates only what it touched leaves holes exactly where it touched nothing, and the
 * hole grows silently at the rate the pass skips things.
 *
 * So the load-bearing findings here — `ratchet`, `ratchet-cumulative`, `hedge-mass`,
 * `overbroad-scope` — are computed over the ENTIRE document at both revisions and do not care what
 * the round touched. `ratchet-cumulative` does not even look at this round: it weighs today's body
 * against the base of the FIRST round and against the sum of every budget ever declared, which is
 * the compounding case ARIS names and the case a per-round-only check cannot see by construction.
 * Only `undeclared-section` is diff-shaped, and even it enumerates every section in the document
 * rather than reading a patch.
 *
 * ── WHAT AUTHORISES ──────────────────────────────────────────────────────────────────────────
 * A round is a manifest at `<paper-dir>/rounds/<anything>.md` with a frontmatter block:
 *
 *     ---
 *     round: 3
 *     opened: 2026-08-10
 *     base: 4f1c2ab              # git rev this round starts from  (required)
 *     touches:                   # headings this round may change  (required)
 *       - "4.4"
 *       - Limitations
 *     allows: [new-citation]     # otherwise-forbidden operations  (optional)
 *     budget: +60                # net BODY words this round may add   (optional, default 0)
 *     hedge-budget: +0.4         # hedges per 1000 body words it may add (optional, default 0)
 *     closed: 2026-08-11         # presence means the round is over (optional)
 *     ---
 *
 * The manifest is written BEFORE the round, which is the entire mechanism: a budget agreed after
 * seeing the spend is not a budget. Nothing here reads prose to decide anything — every verdict is a
 * string comparison, a set difference or a counter against a declared number.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, relative } from "node:path";
import { stripFrontmatter, frontmatterBlock } from "../../../lib/markdown.mjs";
import { isMain } from "./consumer.mjs";

// ── the lexicon ──────────────────────────────────────────────────────────────────────────────
//
// Hedges are counted, never judged. A rising count is a fact and the fact is the finding; whether a
// given hedge earned its place is Type B and belongs to a reader (see references/acceptance-gate.md).
// Kept deliberately small and unambiguous: every entry is a word that qualifies a claim rather than
// making one. `Limitations` sections legitimately carry these, which is why the metric is a DENSITY
// over the whole body and why the round declares a budget instead of the checker guessing one.
const HEDGES = [
  "may", "might", "could", "would appear", "appears to", "appear to", "seems to", "seem to",
  "suggests", "suggest that", "arguably", "presumably", "possibly", "perhaps", "somewhat",
  "relatively", "largely", "broadly", "generally", "typically", "usually", "often", "in some cases",
  "to some extent", "not necessarily", "we believe", "we think", "it is possible", "it may be",
  "tends to", "tend to", "roughly", "approximately", "more or less", "at least in part", "partly",
];
const HEDGE_RE = new RegExp(`\\b(?:${HEDGES.map((h) => h.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");

/** Operations a round must declare before it may perform them. Mirrors ARIS `forbidden_operations`. */
const OPS = ["new-citation", "new-number"];

// ── reading a paper ──────────────────────────────────────────────────────────────────────────

/** HTML comments are metadata (TIGHTEN verdicts, carries: notes, figure provenance), not prose.
 *  They churn constantly and none of it is text a reader sees, so every measurement here strips
 *  them first — otherwise a round that only rewrote its own bookkeeping would light the board up. */
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, " ");

/** Split into sections keyed by heading line. A section runs to the next heading of ANY level. */
export function sections(md) {
  const text = stripComments(stripFrontmatter(md));
  const out = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (m) {
      cur = { level: m[1].length, heading: m[2], body: [] };
      out.push(cur);
    } else if (cur) cur.body.push(line);
  }
  return out.map((s) => ({ ...s, text: s.body.join("\n").trim() }));
}

/** Everything before `## References` is BODY; References and the appendices after it are not.
 *  This is the same boundary `paper-lint`'s appendix ratio uses, and it matters for the ratchet: moving
 *  a passage into an appendix is the sanctioned way to pay for added body text (`papers/CLAUDE.md`
 *  rule 4, "never pay by shaving a neighbouring sentence"), so an appendix must not count as growth. */
export function split(secs) {
  const i = secs.findIndex((s) => /^references\b/i.test(s.heading));
  return i === -1 ? { body: secs, appendix: [] } : { body: secs.slice(0, i), appendix: secs.slice(i) };
}

const words = (s) => (s.match(/\S+/g) ?? []).length;
const hedges = (s) => (s.match(HEDGE_RE) ?? []).length;

export function census(md) {
  const { body, appendix } = split(sections(md));
  const bodyText = body.map((s) => s.text).join("\n");
  const bw = words(bodyText);
  return {
    sections: body.length + appendix.length,
    bodyWords: bw,
    appendixWords: words(appendix.map((s) => s.text).join("\n")),
    hedges: hedges(bodyText),
    hedgeDensity: bw ? (hedges(bodyText) * 1000) / bw : 0,
  };
}

/** Citation markers `[12]` in prose, plus numbered entries in the References list. */
export function citations(md) {
  const { body, appendix } = split(sections(md));
  const inProse = [...stripComments(body.map((s) => s.text).join("\n")).matchAll(/\[(\d{1,3})\]/g)].map((m) => m[1]);
  const refs = appendix
    .filter((s) => /^references\b/i.test(s.heading))
    .flatMap((s) => [...s.text.matchAll(/^\s*(\d{1,3})\.\s+\S/gm)].map((m) => m[1]));
  return new Set([...inProse, ...refs]);
}

/**
 * Raw numeric literals in BODY prose — the things ARIS calls `numerical_claim`.
 *
 * Excluded on purpose, and each exclusion is a place this check is deliberately blind:
 *   - HTML comments (stripped upstream) — bookkeeping, not claims;
 *   - `{{registry.key}}` placeholders — a bound quantity has its own gate (`repro/paper_numbers.py`)
 *     which is strictly stronger, being rung 1: a wrong value has no representation there;
 *   - `[12]` citation markers — those are the citation check's business;
 *   - the leading number of a heading (`### 4.4 …`) — structure, not a claim.
 */
export function numbers(md) {
  const { body } = split(sections(md));
  const out = new Set();
  for (const s of body) {
    const t = s.text.replace(/\{\{[^}]*\}\}/g, " ").replace(/\[\d{1,3}\]/g, " ");
    for (const m of t.matchAll(/(?<![\w.])\d+(?:[.,]\d+)*\s*%?/g)) out.add(m[0].replace(/\s+/g, ""));
  }
  return out;
}

// ── the manifest ─────────────────────────────────────────────────────────────────────────────

/**
 * A frontmatter reader for exactly the keys above: scalars, inline `[a, b]` lists, and `- ` lists.
 *
 * Not a YAML parser, and it says so where it fails rather than guessing — a manifest that does not
 * parse is reported as `unreadable-manifest`, never skipped. Four SKILL.md files in this repo
 * shipped frontmatter that no real YAML parser accepts and were read as having no fields at all;
 * silence on a malformed declaration is how a gate becomes decorative.
 */
export function parseManifest(src, path) {
  const block = frontmatterBlock(src);
  if (block === null) return { error: "no frontmatter block", path };
  const out = { path, touches: [], allows: [] };
  let key = null;
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const item = /^\s*-\s+(.*\S)\s*$/.exec(line);
    if (item && key) { out[key].push(unquote(item[1])); continue; }
    const kv = /^([a-zA-Z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v.trim() === "") { key = k; out[k] = out[k] ?? []; continue; }
    key = null;
    const inline = /^\[(.*)\]$/.exec(v.trim());
    out[k] = inline
      ? inline[1].split(",").map((x) => unquote(x.trim())).filter(Boolean)
      : unquote(v.trim());
  }
  if (!out.base) return { error: "no `base:` — a round with no revision to compare against cannot be checked", path };
  if (!Array.isArray(out.touches) || out.touches.length === 0) {
    return { error: "no `touches:` list — a round that declares nothing authorises nothing", path };
  }
  return out;
}
const unquote = (s) => s.replace(/^["']|["']$/g, "");

/**
 * Does `entry` cover `heading`? Number prefixes nest (`4` covers `4.1`); text matches on substring.
 *
 * 🔴 A NUMERIC ENTRY ADDRESSES THE SECTION NUMBER AND NOTHING ELSE, and that clause is not tidiness.
 * The first version fell through to the substring rule for numeric entries too, so `touches: ["2"]`
 * matched "Section 12", "2026", and every heading containing the character 2 — a one-character
 * declaration authorising most of the paper, with `overbroad-scope` silent because the LIST was
 * short. Found on 2026-08-10 by mutation, not by reading: disabling the nesting rule changed no
 * verdict, because the substring fallback was quietly doing its job for it.
 */
export function covers(entry, heading) {
  if (entry === "*") return true;
  const e = String(entry).trim().toLowerCase();
  const h = heading.trim().toLowerCase();
  const num = /^(\d+(?:\.\d+)*)\.?\s/.exec(h)?.[1];
  if (/^\d+(\.\d+)*$/.test(e)) return !!num && (num === e || num.startsWith(e + "."));
  return h.includes(e);
}

// ── git ──────────────────────────────────────────────────────────────────────────────────────

function git(root, ...args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: (r.stderr ?? "").trim() };
}

// ── the check ────────────────────────────────────────────────────────────────────────────────

export function check(dir, { since } = {}) {
  const findings = [];
  const add = (kind, msg) => findings.push({ kind, msg });
  const paperPath = join(dir, "paper.md");
  if (!existsSync(paperPath)) return { findings, census: null, notes: [`no paper.md in ${dir}`] };

  const now = readFileSync(paperPath, "utf8");
  const nowC = census(now);
  const repo = git(dir, "rev-parse", "--show-toplevel").out.trim();
  const rel = repo ? relative(repo, resolve(paperPath)) : null;
  const at = (rev) => {
    if (!repo) return { ok: false, err: "not a git repository" };
    const r = git(repo, "show", `${rev}:${rel}`);
    return r.ok ? { ok: true, src: r.out } : { ok: false, err: r.err || `git show ${rev}:${rel} failed` };
  };

  // ── which round authorises the current state ──
  const roundsDir = join(dir, "rounds");
  const files = existsSync(roundsDir)
    ? readdirSync(roundsDir).filter((f) => f.endsWith(".md") && f !== "README.md").sort()
    : [];

  const manifests = [];
  for (const f of files) {
    const p = join(roundsDir, f);
    const man = parseManifest(readFileSync(p, "utf8"), p);
    if (man.error) { add("unreadable-manifest", `${relOf(dir, p)}: ${man.error}`); continue; }
    manifests.push(man);
  }
  manifests.sort((a, b) => Number(a.round ?? 0) - Number(b.round ?? 0));
  const open = manifests.filter((m) => !m.closed);

  if (!since && manifests.length === 0) {
    add("no-round-ledger", `no readable round manifest under ${relOf(dir, roundsDir)} — review rounds on this paper are unrecorded, so the ratchet (${nowC.bodyWords} body words, ${nowC.hedgeDensity.toFixed(1)} hedges per 1000) is measured against nothing. Open a round before the next review pass.`);
  }
  if (open.length > 1) {
    add("two-open-rounds", `${open.length} manifests have no \`closed:\` (${open.map((m) => `round ${m.round}`).join(", ")}) — with two open rounds every budget below is checked against the wrong base.`);
  }
  if (!since && manifests.length > 0 && open.length === 0) {
    const dirty = repo && git(repo, "diff", "--quiet", "HEAD", "--", rel).ok === false;
    if (dirty) {
      add("no-open-round", `paper.md differs from HEAD and every round manifest is closed — these edits are authorised by nothing. This is the state that deposited a page of hedging in one session.`);
    }
  }

  // ── pick the base ──
  const active = open[open.length - 1] ?? manifests[manifests.length - 1] ?? null;
  const baseRev = since ?? active?.base;
  if (!baseRev) return { findings, census: nowC, notes: [], active: null };

  const got = at(baseRev);
  if (!got.ok) {
    add("unresolvable-base", `cannot read paper.md at \`${baseRev}\`: ${got.err}. A round whose base does not resolve is a round with no gate, and it must not read as a clean run.`);
    return { findings, census: nowC, notes: [], active };
  }
  const base = got.src;
  const baseC = census(base);

  // ── 1. whole-document: this round's spend ──
  const budget = num(active?.budget, 0);
  const grew = nowC.bodyWords - baseC.bodyWords;
  if (grew > budget) {
    add("ratchet", `the body grew ${sign(grew)} words against a declared budget of ${sign(budget)} (${baseC.bodyWords} → ${nowC.bodyWords}); the appendix moved ${sign(nowC.appendixWords - baseC.appendixWords)}. Pay it back with tighten-paper or raise the budget in the manifest before the round, not after.`);
  }

  // ── 2. whole-document, and blind to this round: the compounding case ──
  //
  // ARIS: "a small softening at round 1 + another small softening at round 2 can compound into a
  // meaningful framing change". Every round can sit inside its own budget while the paper drifts a
  // page. This weighs today against the FIRST round's base and against every budget ever declared,
  // so it is the one finding a per-round check cannot produce by construction.
  if (!since && manifests.length > 1) {
    const first = manifests[0];
    const g0 = at(first.base);
    if (g0.ok) {
      const c0 = census(g0.src);
      const total = manifests.reduce((a, m) => a + num(m.budget, 0), 0);
      const cum = nowC.bodyWords - c0.bodyWords;
      if (cum > total) {
        add("ratchet-cumulative", `across ${manifests.length} rounds the body grew ${sign(cum)} words against ${sign(total)} of declared budget (${c0.bodyWords} → ${nowC.bodyWords}, from round ${first.round}'s base \`${first.base}\`). Every individual round may have been inside its own budget; this is the drift they compound into.`);
      }
    } else {
      add("unresolvable-base", `round ${first.round}'s base \`${first.base}\` does not resolve (${g0.err}), so cumulative drift across ${manifests.length} rounds is UNMEASURED — not zero.`);
    }
  }

  // ── 3. whole-document: hedge mass ──
  const hb = num(active?.["hedge-budget"], 0);
  const dh = nowC.hedgeDensity - baseC.hedgeDensity;
  if (dh > hb + 1e-9) {
    add("hedge-mass", `hedge density rose ${dh.toFixed(2)} per 1000 body words against a budget of ${hb.toFixed(2)} (${baseC.hedgeDensity.toFixed(2)} → ${nowC.hedgeDensity.toFixed(2)}; ${baseC.hedges} → ${nowC.hedges} hedges). The ratchet fix order is TIGHTEN → CUT → Threats → inline hedge; if the round reached step four, say so in \`hedge-budget\`.`);
  }

  // ── 4. whole-document: is the declaration a declaration ──
  if (active && !since) {
    const all = [...split(sections(now)).body, ...split(sections(now)).appendix];
    const covered = all.filter((s) => active.touches.some((t) => covers(t, s.heading)));
    if (all.length && covered.length * 2 > all.length) {
      add("overbroad-scope", `\`touches:\` covers ${covered.length} of ${all.length} sections — a round that may change most of the paper has declared nothing. Split it into rounds, or state plainly that this is a rewrite and not a review round.`);
    }
  }

  // ── 5. per-section: what changed outside the declaration ──
  if (active && !since) {
    const before = new Map(sections(base).map((s) => [s.heading, s.text]));
    for (const s of sections(now)) {
      const was = before.get(s.heading);
      if (was === s.text) continue;
      if (active.touches.some((t) => covers(t, s.heading))) continue;
      const how = was === undefined ? "is new" : `changed (${sign(words(s.text) - words(was))} words)`;
      add("undeclared-section", `"${s.heading}" ${how}, and no entry in \`touches:\` covers it (declared: ${active.touches.join(", ")}).`);
    }
    for (const h of before.keys()) {
      if (sections(now).some((s) => s.heading === h)) continue;
      if (active.touches.some((t) => covers(t, h))) continue;
      add("undeclared-section", `"${h}" was removed, and no entry in \`touches:\` covers it (declared: ${active.touches.join(", ")}).`);
    }
  }

  // ── 6. forbidden operations ──
  const allows = new Set((active?.allows ?? []).map((a) => String(a).trim().toLowerCase()));
  for (const op of allows) {
    if (!OPS.includes(op)) add("unknown-op", `\`allows: ${op}\` is not an operation this gate knows (${OPS.join(", ")}) — a permission nothing reads is not a permission.`);
  }

  if (!allows.has("new-citation")) {
    const wasCites = citations(base);
    const added = [...citations(now)].filter((c) => !wasCites.has(c));
    if (added.length) {
      add("unauthorised-citation", `${added.length} citation(s) appeared this round (${added.sort((a, b) => a - b).join(", ")}) and the manifest does not list \`new-citation\`. Every added cite must clear verify-citations before it is in the text; a round that adds one without declaring it skips that queue.`);
    }
  }
  if (!allows.has("new-number")) {
    const wasNums = numbers(base);
    const added = [...numbers(now)].filter((n) => !wasNums.has(n));
    if (added.length) {
      const show = added.slice(0, 8).join(", ") + (added.length > 8 ? `, …` : "");
      add("unauthorised-number", `${added.length} numeric literal(s) new to the body this round (${show}) and the manifest does not list \`new-number\`. A number that entered during a review round has no provenance row and no registry key — this is the shape of the 2026-08-05 defect, arriving under cover of a hedge fix.`);
    }
  }

  return { findings, census: nowC, base: baseC, active, baseRev, rounds: manifests.length };
}

const num = (v, d) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? d : Number(v));
const sign = (n) => (n > 0 ? `+${n}` : String(n));
const relOf = (dir, p) => relative(resolve(dir, ".."), p) || p;

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv.slice(2);
  const dir = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const asJson = args.includes("--json");
  const since = (args.find((a) => a.startsWith("--since=")) ?? "").split("=")[1] || undefined;

  const r = check(dir, { since });
  if (asJson) { console.log(JSON.stringify(r.findings, null, 2)); return 0; }

  if (r.census) {
    const c = r.census, b = r.base;
    console.log(`📏 round-diff — ${dir.split("/").filter(Boolean).pop()}${r.baseRev ? ` against ${r.baseRev}` : ""}`);
    console.log(`   body ${c.bodyWords}w${b ? ` (${sign(c.bodyWords - b.bodyWords)})` : ""} · appendix ${c.appendixWords}w${b ? ` (${sign(c.appendixWords - b.appendixWords)})` : ""} · hedges ${c.hedgeDensity.toFixed(2)}/1000${b ? ` (${sign(+(c.hedgeDensity - b.hedgeDensity).toFixed(2))})` : ""} · ${c.sections} sections · ${r.rounds ?? 0} round(s) on file`);
  }
  for (const n of r.notes ?? []) console.log(`   ${n}`);

  // Always printed, findings or none. A check that speaks only when it fires teaches the reader to
  // hear silence as coverage, and this one has four blind spots big enough to name.
  console.log(`   SILENT ABOUT: a claim whose strength changed at constant length (that is the claims diff);`);
  console.log(`                 edits made and reverted inside one round; whether a hedge deserved its place;`);
  console.log(`                 every file other than paper.md; and prose inside HTML comments, which is stripped.`);

  if (!r.findings.length) { console.log(`   ✅ no finding`); return 0; }
  console.log(`⚠️ round-diff — ${r.findings.length} finding(s):`);
  for (const f of r.findings) console.log(`   [${f.kind}] ${f.msg}`);
  return 0;
}

if (isMain(import.meta.url)) process.exit(main(process.argv));
