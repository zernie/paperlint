// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "harden-paper",
  description:
    'Use when asking "is this paper actually ready to submit?" / "what\'s still missing before I upload?" / "run the pre-submission gate" on a DRAFTED paper. The multi-axis hardening orchestrator — it runs the review skills AND closes the axes they miss (structure via tighten-paper, threat-model + ethics/dual-use, reproducibility artifact, double-blind hygiene, page/word-fit, citability), and its verdict is a VECTOR of gates reported worst-gate-first — any failing gate (readability, structure, claims, citations, nearest-neighbor scoop, mechanical) caps "ready" regardless of a high accept-probability. NOT for grading how the prose reads (grade-paper-writing), a structural cut plan alone (tighten-paper), or a single hostile review (paper-adversarial-review) — this calls all of those and makes the submit/no-submit decision. Composes with pc-panel-review / verify-citations (it calls them) and submit-paper (downstream).',
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Bash",
    "WebSearch",
    "WebFetch",
    "Agent",
    "Skill",
  ],
  body: `
# harden-paper — the multi-axis pre-submit gate

> **Which paper skill?** \`paper-adversarial-review\` / \`pc-panel-review\` (whose venue-fit mode covers the
> CFP-fit score) = the *reviewer's-eye* axis (defects, fit, accept-prob). \`verify-citations\` = the
> *citation* axis.
> **\`harden-paper\` (here) = the orchestrator** that runs those AND closes the axes a reviewer-sim
> doesn't systematically hit — the submission-readiness gate. Run it after the draft is written and
> before \`submit-paper\`. It does not re-implement the sub-skills; it calls them and checks the rest.

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs harden-paper <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

**Principle:** a paper dies from any *one* unclosed axis. Reviewers only *read* — so every claim,
number, and omission must survive on the page. Go axis by axis; for each, **find → fix → re-verify**,
don't just list. Below, each axis says what to run / check and the specific traps that recur.

> Axes 1–10 are **soundness** gates (get it accepted / avoid desk-reject). Axis 11 (**citability**) is
> the *impact* gate — a correct-but-forgettable paper passes review and gets cited zero times. For a
> body of work, citability is not optional polish; run it as a gate too.

## The axes (run all; each is a gate)

**Order matters: STRUCTURE before SENTENCES.** Run axis 0 FIRST. There is no point polishing prose (axis 8),
verifying claims, or scoring a section that a structural pass says to cut or fold to the artifact. The 2026-07
AISec session did this backwards — a full sentence-level polish, *then* the author said "it's too long and the
middle sags" — wasting the polish on possibly-cut sections.

0. **Structure / editorial (run FIRST)** — run **\`tighten-paper\`**: is this the right paper, at the right length,
   delivering its ONE point, skimmable, with no TMI that belongs in the artifact? Apply its cut/fold/merge/reorder
   plan BEFORE any sentence-level work. On a paper that "feels long / overly complex / middle drags," this is the
   highest-leverage pass. (Near a deadline, apply the SAFE cuts and hold big restructures for camera-ready — state
   the tradeoff, don't silently gut a submitted paper.)

1. **Reviewer defects** — run \`paper-adversarial-review\` (quick) and, as the final decision gate,
   \`pc-panel-review\`. Use a *separate model* (e.g. Fable subagent) as the reviewer, and — critically —
   **run it blind**: give it ONLY the submission text, no author, no sibling papers, no outside context.
   A sighted review judges overlap; a blind review predicts what the real double-blind PC sees. Do both:
   sighted for overlap/de-anon, blind for the true score.

2. **Overclaims — suite-specific traps only (the general hunt is delegated).** The general
   overclaim hunt — every sentence stronger than the evidence, causal-from-correlational, headline
   numbers vs reported stats, title over-promise — is \`paper-adversarial-review\`'s job, and axis 1
   already runs it; don't redo it here. This axis adds the traps that recur in THIS suite's papers
   and that a generic hunt keeps missing:
   - **Absolute "no / none / never / first / only."** These are almost always false or unprovable.
     Soften to "no *established / adopted / install-time* X," or "*first to* [narrow, true scope]."
   - **Self-contradiction with your OWN citations** — an absolute your own reference list refutes
     (e.g. "no provenance controls exist" while you cite an emerging provenance registry — a self-own).
   - **Rhetorical hooks that reality falsifies** (e.g. "you'd never install a library that runs
     arbitrary code" — npm postinstall does exactly that). Reframe to the *true* differentiator.
   - **The review-ratchet rule — how to FIX a caught overclaim.** Tighten → cut → move to Threats →
     only then inline-hedge; review only ever ADDS, so run \`tighten-paper\` AFTER the round to strip
     what it deposited. Full rule: \`paper-pipeline/references/review-ratchet.md\`.
   - 🔴 **A bound that lives only in an appendix is still an overclaim.** Check every headline number
     in the abstract and intro against the appendices: if a qualification narrowing it sits out
     there with no pointer reaching it, the body is overclaiming and "it's in the appendix" is not
     a defence — reviewers are not required to read appendices, and ARR says so in as many words.
     Rule and the sorting test: \`paper-pipeline/references/body-vs-appendix.md\`.
   Mechanical leg: the ESLint rule \`paper/uncited-assertion\` (axis 7) compiles part of this hunt.

3. **Novelty vs the nearest neighbor** — the scoop check. Search for the paper that *already did your
   thing* (\`verify-citations\` covers metadata; here, actively hunt the closest empirical/method twin).
   For every genuine sibling found, run **\`analyze-sibling-paper\`** — deep-read the ACTUAL paper (not its
   abstract), classify contribution type, date it prior-vs-concurrent, steelman the scoop, and judge the
   delta with an adversarial model. If found: cite it, and **rewrite the delta honestly** — you are almost
   never "first"; you are "first to [specific lens/surface/method]." Acknowledge a shared *concept*
   head-on. A genuine scoop is an escalation (reframe / \`extend-paper\`), not a one-line patch. Missing the
   neighbor = desk-reject. **Completeness check (the checkable part):** every close sibling must have a
   saved analysis colocated in \`<paper-dir>/siblings/\` — a close competitor with no file there is an
   unclosed axis, not a cleared one.

4. **Citations** — run \`verify-citations\`: every \\cite is a real work with correct arXiv-id/DOI/venue;
   no fabrication; the delta over the nearest neighbor is explicit; the one obviously-expected cite is
   present. Drop any cite you cannot verify (never invent metadata).

5. **Threat model (security/systems venues)** — reviewers dock a security paper with no explicit one.
   State: **adversary** (who, what capability), **trust boundary**, **assets**, and what you **assume
   not** compromised. One crisp paragraph. \`paper-adversarial-review\` does not force this — add it.

6. **Ethics / responsible disclosure / dual-use (security venues)** — often a hard CFP requirement.
   If you measured weaknesses in *named real systems*: (a) report aggregate + anonymized; (b) plan
   **disclosure to affected maintainers before any public de-anonymized release** (log it as a to-do);
   (c) add a **dual-use** line (the work is defensive; introduces no new exploitation technique).

7. **Reproducibility artifact** — if the paper says "artifact / query set accompanies this submission,"
   that file must actually exist. Build a \`REPRODUCE.md\`: **every headline number → its exact query /
   command → the count/output → the date**. State that snapshot counts drift (lower bounds), so
   re-running gives similar magnitudes, not identical integers.
   - **Availability-promise gate (verify, don't assume):** every "we release X" / "the full repo will be linked
     at camera-ready" / "available at \\url{...}" sentence must point to something that EXISTS or is concretely
     deliverable NOW — actually fetch the repo/URL and confirm it holds what the sentence claims (the harness, the
     task defs, the logs). A promise you can't cash is a camera-ready landmine. (This session: verified
     \`zernie/vigiles/bench/ecosystem\` really contains the promised harness before trusting Paper 1's Availability
     line.) If it's deferred to camera-ready, record the exact deliverable in the paper's camera-ready checklist so
     it can't be dropped on accept.
   - **Adversarial cold reproduction — run the protocol, don't restate it:**
     **\`../build-benchmark/references/adversarial-cold-repro.md\`** (single home). It covers the cold
     clean-checkout/clean-ENVIRONMENT re-run (incl. the \`MODULE_NOT_FOUND\` deps-in-release-script trap),
     the three-way reconcile of every headline number, and robustness attacks under the paper's own
     caveats. Default stance SKEPTIC; one honest REFUTED beats ten hand-wavy CONFIRMEDs.
   - **Claim↔evidence reconciliation (mechanical — every number and every "we release X" must trace).**
     The measurement gate above checks *headline* numbers; two things slip it. Run both enumerators:
     - **\`check-release-claims.sh <paper-dir>\`** — greps release-verb prose and lists it beside the actual
       \`artifact/\` tree. **Every "we release X" must be satisfied by a shipped file**; promised-but-absent
       (claimed "raw runs" but shipped only aggregates) → soften to "(at camera-ready)" or add the file.
       *(This session's exact miss: a paper about advertised-vs-delivered gaps claimed "we release the
       harness and raw runs" while the artifact held only aggregates — the PC-panel caught it late.)*
     - **\`check-numbers.sh <paper-dir>\`** — enumerates every quantitative token in the body so **each traces
       to an artifact output or a \`\\cite\`; an untraceable number is treated as fabricated** (source or cut).
       *(This session: "37% growth to 18% cut across independent runs" was in neither — only the artifact
       evaluator caught it.)*
     - **\`npx eslint --no-config-lookup --config eslint.config.mjs <paper-file.tex|.md>\`** — the *overclaim*
       axis (axis 2), compiled. The rule is \`paper/uncited-assertion\` (\`eslint-rules/paper-claims.mjs\`); it
       used to be a hand-run script \`check-uncited-assertions.{sh,mjs}\`, ported into the rule family on
       2026-08-27 because the script had to be REMEMBERED and the rule runs with the other 32 in one pass —
       on all four paper bodies, \`.tex\` included, not just \`paper.md\`.
       It flags any sentence making an empirical/quantitative claim about **prior work** — a number, a \`%\`, a
       fuzzy quantifier (\`most\`/\`the majority\`/\`significantly\`), or an empirical verb
       (\`shows\`/\`demonstrates\`/\`outperforms\`/\`reduces\`/\`improves\`/\`we find\`) — that carries **no citation**.
       Citation forms recognized: **any \`\\…cite…\` macro** (\`\\cite\`/\`\\citep\`/\`\\citet\`/\`\\footcite\`/\`\\smartcite\`/
       \`\\parencite\`/\`\\textcite\`/\`\\citeauthor\`/\`\\citeyearpar\`…), \`\\footnote\`, **numeric cites** \`[12]\`/\`[3,4]\`/
       \`[1]\` (the dominant CS style), a URL, or a markdown \`[@key]\`/\`[^fn]\`/\`](link)\`. This is the exact thing a
       reviewer pounces on ("[citation needed]"). *Complementary to \`check-numbers.sh\`, not a dup:* that one
       traces **every** number; this one flags **empirical assertions lacking a cite** and stays quiet on the
       paper's own results. **Guards** (so it doesn't false-alarm): years (\`2026\`), version numbers (\`v1.2\`,
       \`Node 18\`), figure/table/section/equation refs — both literal (\`Table 2 shows …\`) and cross-ref macros
       (\`Table~\\ref{tab:x} shows …\`, \`\\autoref\`/\`\\Cref\`), numbers inside math mode, **tabular/array bodies** and
       **ordered-list markers** (\`2.\`), **definitions** (\`is defined as\`/\`refers to\`/\`we define\`), and the
       paper's **OWN reported results**. The own-result guard is a **subject-proximity heuristic** (not a
       parser): it exempts a sentence only when first person is the *subject* — it **starts** with
       \`we\`/\`this paper\`/\`this work\`, or has \`we <verb>\` / \`our <contribution-noun>\` — so \`We find a 6% reduction\`
       passes but a bare \`Transformers outperform RNNs by 12%\` flags, and, deliberately, \`US-based detectors
       reject 40%\` (country "US", not "us") and \`Our reading of the literature shows X outperforms Y\` (a claim
       about others) still **flag**. Fix each hit by attaching a cite, reframing honestly as your own result, by
       cutting the claim — or, for a genuinely defensible one, an \`eslint-disable-next-line\` **with the reason
       on the spot**. Contract fixtures live in \`fixtures/uncited-assertions-sample.{tex,md}\` (annotated
       MUST/​MUST-NOT-flag cases, incl. the numeric-cite / \`\\footcite\` / \`\\ref\`-float / list-marker / own-result
       regressions) and are still the rule's test — \`eslint-rules/paper-claims.harness.mjs\` runs them.
       *(Severity is \`warn\` on purpose: both the own-result guard and sentence splitting are **heuristics** —
       a fixed abbreviation set (\`vs.\`/\`e.g.\`/\`i.e.\`/\`et al.\`/\`cf.\`) is protected from false breaks, and on the
       four committed papers the rule reports 374 findings. Treat volume as advisory, not a hard gate.)*
     Enumeration is mechanical; the per-line trace/reconcile stays judgment (prose isn't policy — compile the list).

8. **Writing craft (audience-appropriate language + how it reads)** — run **\`grade-paper-writing\`** (the
   9-dim rubric in \`../paper-pipeline/references/writing-craft.md\`).
   🔴 **Invoke it BY NAME with the Skill tool — do not describe the need and hope it fires.**
   Selection of this skill is **not reliable, and not reliably bad either**: the same eight prompts,
   the same description and the same 36 competitors measured **21%** in the morning and **50–54%**
   hours later on 2026-08-08, across two independent implementations
   (\`../paper-pipeline/repro/2026-08-08-grade-paper-writing-ablation-raw.log\`,
   \`2026-08-08-parent-replication.log\`). Seven description rewrites — shorter, no negations, no
   internal machinery, persona-only — moved it by nothing, so the instability is not in the text and
   cannot be edited away. Meanwhile a closed-book reader given that same text picks it 7–8 times in 8.
   An explicit call does not depend on selection at all. Without it this axis silently does not run,
   and a hardening pass that skipped its readability axis reports the same "done" as one that ran it.
   **Downstream of axis 0** (don't polish a
   section slated to be cut). Two hard rules from the AISec session: (a) run the stall pass as a **persona
   subagent** ("Sam", a non-expert reader), per-section for a dense paper — the rubric SCORE under-fires because a
   frontier grader knows every term and never stalls (it scored a wall-heavy paper 44/60); the persona inventory,
   not the number, is the gate. (b) **A wall / spec-sheet / coined-jargon-heading HARD-FAILS this axis — it is not
   a "minor" note.** Strip jargon the *target venue's* reviewers won't know (register-calibration: keep field-native
   terms, gloss methodology shorthand, rename coinages), and confirm the paper leads with its most visceral concrete
   instance. **After any rewrite here, run the claim-preservation diff (\`claims\` —
   \`../paper-pipeline/references/writing-craft.md\` → "The claim-preservation diff") — rewording silently
   changes claims.**

9. **Internal consistency — matching is not enough; every headline count must be RECONSTRUCTIBLE from
   the object that presents it.** Two distinct checks:
   - *(a) Matching:* every number agrees across abstract / intro / results / tables (86% = 19/22; the
     "X trip nothing" complements the "Y have finding" count). One mismatch reads as sloppy.
   - *(b) Countability:* for every "N categories / N rules / N repositories / N cases" in the abstract,
     **open the table or figure it points to and count the rows.** If a reader cannot arrive at N from
     that object alone, either the object is wrong or N needs its derivation stated in the caption.
     Sub-items buried in a cell's prose are not rows. **Mechanical leg:** \`grep -c\` the table's row
     marker and compare with the abstract's N — a mismatch is a finding, not a rounding difference.
     Corollary: **never quote a count for an entity that has no row of its own.**

10. **Honest scoping** — a threats-to-validity that pre-empts the obvious attacks (sample size,
    selection bias, construct validity, "measured X not Y") earns trust. Turn limitations into stated
    scope, not hidden holes.

11. **Citability** — soundness gets you accepted; citability gets you *cited* (the axis that actually
    moves an impact case). A correct-but-forgettable paper is a desk-accept and a dead end. Make the
    work the thing people reach for when they discuss the problem. Levers, in order of payoff:
    - **Coin a reusable handle for the phenomenon** and ride an *existing* citation pattern. One named
      concept that fills a naming gap ("the *install surface*", riding "the lethal trifecta") becomes the
      noun people cite. Rules: it must name something readers already feel but can't point to; short,
      literal, goog-able, not cute; **defined in one sentence on first use** (abstract if possible);
      used consistently (grep — no synonym drift). One coinage per paper, max.
    - **Frame the contribution as "first *taxonomy / benchmark / measurement* of X,"** not "we found Y is
      bad." A reusable framework (the four risk classes, the audit predicate) is what later work builds
      on and cites; a one-off result is a blog post. (This is the same reframe as axis 3, aimed at
      citability rather than novelty-defense.)
    - **Ship a reusable artifact others can run against their own corpus** — a deterministic
      benchmark/auditor + a listed query set turns readers into *users*, and users cite. State it's
      open-source and reproducible (ties to axis 7).
    - **Give one quotable, load-bearing statistic** — a single number a talk/blog will repeat ("<1% carry
      any test"). Make it defensible and prominent; don't bury it.
    - **Dry humour is a citability multiplier — but *framing only*.** One deadpan line that crystallizes
      the absurdity ("comes with a README") makes the concept sticky and quotable. Strict scope: allowed
      in intro/framing/section-openers; **never** in methodology, threat model, ethics, results, or
      limitations (humour there reads as unrigorous and sinks trust). One or two lines total, deadpan not
      jokey, load-bearing not decorative.
    - **arXiv-first + plan the extended SoK.** A 2-page workshop paper is a flag-plant; the citations
      accrue to the extended/arXiv version. Log the follow-on (fuller taxonomy, bigger corpus, the
      dropped refs) so the citable artifact exists. Put a preprint where people can find and cite it.

## Mechanical submission gates (do these yourself — don't punt to the author)

- **Double-blind hygiene.** Run the mechanical gate — it greps the deny-list across the PDF text +
  every artifact file + inside any \`*.zip\`, so an identifier hiding in an artifact README (invisible to
  a paper-only read) still trips it: \`bash .claude/skills/submit-paper/check-deanon.sh <paper-dir>\`
  (must PASS/exit 0; deny-list at \`.claude/skills/submit-paper/deanon-denylist.txt\`). Beyond the
  deny-list, also grep the *actual submission text* for author name, tool name, org, repo
  URLs, self-authored issue links. For a tool you built that's publicly attributed: **anonymize its
  name AND its distinctive output vocabulary** (a reviewer can fingerprint the tool by running it and
  matching its exact strings → de-anon, and can *link* it to your other submissions). Anonymize the
  artifact host too ("released on acceptance").
- **Word / page fit — verify, don't estimate.** Word caps: count them. Page cap: **render and count.**
  When a LaTeX toolchain exists in the env, the primary route is **\`../render-paper/check-render.sh\`**
  (compile the real \`.tex\`, count real pages). The Chromium proxy below is the FALLBACK only.
  No LaTeX in-env? Build an HTML at the venue's density (single-column 10pt Letter, 1in margins is a
  typical proxy) with the exact content + table + refs, and render with headless Chromium:
  \`/opt/pw-browsers/chromium-*/chrome-linux/chrome --headless --no-pdf-header-footer
  --print-to-pdf=fit.pdf fit.html\`, then read the page-tree \`/Count N\` from the PDF (\`grep -aoE
  '/Count [0-9]+' fit.pdf | head -1\`). Trim the reference list to the essential subset if it spills —
  the body text + a lean ~10 refs is what must fit; the rest go to the extended/journal version.
- **Format template.** Confirm the venue's actual template (ACM sigconf / Word / 2-part SiP). Match its
  structure, not just your draft's.

## Output — a VECTOR of gates, never one number

The verdict is a **vector of independent gates**, and **ANY failing gate caps the verdict at "not
ready"** — the gates are orthogonal axes and do not average out. **Ready ⇔ ALL of these pass:**

- **Science / defects** — \`pc-panel-review\` decision + accept-probability;
- **Readability** — \`grade-paper-writing\`'s PERSONA stall pass (the inventory + density caps, not the
  rubric number);
- **Structure + length** — \`tighten-paper\`'s structural verdict (right length, no sag, no TMI);
- **Claims-honest** — the Hn claim-preservation diff clean after every rewrite;
- **Citations** — \`verify-citations\` clean: no \cite that fails to resolve, nothing marked VERIFY
  left unresolved;
- **Nearest-neighbor scoop** — axis 3 answered: the closest sibling found and either distinguished
  or escalated (\`analyze-sibling-paper\`);
- **The mechanical gates** — de-anon hygiene, page/word-fit, format template.

> 🔴 **Citations and scoop were MISSING from this list until 2026-08-31, and the omission had
> teeth.** This same file calls axes 1–10 «soundness gates (get it accepted / **avoid
> desk-reject**)» and says outright that a missed neighbor «= desk-reject». But the \`--blocking\`
> rule below keys on *this list*: anything absent from it is «an axis **merely** being open», i.e.
> non-blocking. So the two axes the file names as fatal were the two that could not stop a submit.
> The list read as exhaustive because it is introduced by **«Ready ⇔ ALL of these pass»** — and a
> list in that position is read as the definition, not as examples.
> **Generalisable:** a rule stated as «not narrower than X», or a gate stated as «all of these»,
> narrows to exactly what its list contains. Same defect class found the same night in
> \`corporate-english-lead-search\` (geo list omitted Russia → a 357-employer scan with zero
> Russian companies, unnoticed for 11 days).

**A high pc-panel accept-probability does NOT mean "ready" if the readability or structure gate
fails. A single scalar (e.g. "88% accept") hides multi-dimensional failure — never report it as the
headline.** Report the verdict **WORST-GATE-FIRST**: lead with the failing gate and its concrete fix;
the flattering numbers come after. (Proven failure mode: "44/60 writing, ~88% accept" reported as
headlines on a paper whose readability + structure gates were failing — the human reader found it
exhausting while the scalars said ship.)

Then: the per-axis PASS / FIXED / OPEN report (each OPEN with the concrete fix), the **citability
levers landed** (coined handle + its one-sentence definition, the "first taxonomy/benchmark of X"
framing, the one quotable stat, the reusable artifact, any dry-humour line and where), and the short
list of items only the author can close (host artifact, click submit, disclose-before-public, post the
preprint). If every gate passes and every axis is PASS/FIXED → hand off to \`submit-paper\`.

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record harden-paper <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record harden-paper <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` is the number of failing gates plus still-OPEN axes and \`<report-path>\` the
worst-gate-first vector. Add \`--blocking\` when any gate in the vector fails, as opposed to an axis
merely being open.
**ABSTAINED** — \`no-witness\`: every gate answered and no axis is open, which is the state that hands
off to \`submit-paper\`. \`blocked\`: a gate in the vector has never been run, so the vector has a hole
in it and there is nothing to hand off.

🔴 **There is no PASS, and this skill must not reinvent one.** Its whole design is that the verdict
is a VECTOR reported worst-gate-first, and a stored scalar acquittal was the single value that could
flatten it. \`no-witness\` here means every gate answered and none of them found anything — it is not
"ready", and the readiness call is a sentence a human writes in the report.

🔴 **Never record the accept-probability as the count.** A single scalar hiding a multi-dimensional
failure is the exact thing this skill refuses to report in prose, and a ledger row is prose that
survives longer.

The artifact-coverage script files separately as \`harden-paper/artifact-coverage\`. One check, one row.

## Composes with
\`tighten-paper\` (axis 0, run FIRST — structure before sentences), \`paper-adversarial-review\` +
\`pc-panel-review\` + \`verify-citations\` + \`grade-paper-writing\` (called by this), \`render-paper\` (if LaTeX
toolchain exists), \`submit-paper\` (downstream), \`extend-paper\` (the dropped refs / deferred axes live here).`,
});
