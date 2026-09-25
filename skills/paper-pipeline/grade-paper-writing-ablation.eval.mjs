/**
 * grade-paper-writing-ablation.eval.mjs — WHICH PART OF A DESCRIPTION KILLS A SKILL?
 *
 * Run:  node .claude/skills/paper-pipeline/grade-paper-writing-ablation.eval.mjs [--trials N] [--mode main|oracle|preflight|setupdiff] [--arms A0,A6]
 *
 *   --mode preflight   every guard + the arm-by-arm word-set deltas; spends NO tokens   <- run this FIRST
 *   --mode setupdiff   the harness-configuration diff against the parent + the row-by-row
 *                      A0-vs-parent comparison; spends NO tokens
 *   --mode main        7 arms x 8 prompts x 3 trials = 168 harness runs
 *   --mode oracle      7 arms x 8 prompts x 1 closed-book pick = 56 calls
 *   --arms A6          run only these arms and MERGE them into the existing result JSON, so a late
 *                      arm does not cost a re-run of the arms already measured
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING THIS EXISTS TO EXPLAIN
 *
 * `framing-vs-vocabulary.eval.mjs` (this directory, 2026-08-08) measured three skills against the
 * same 36 competitors on the same fixture and found one of them effectively DEAD:
 *
 *     grade-paper-writing   6 fired / 48 runs (12%)     25% even in AH, 17% in SH
 *     tighten-paper        25 fired / 48 runs (52%)
 *     argument-arc         34 fired / 48 runs (71%)
 *
 * Same harness, same trials, same roster. That file could name the anomaly and not test it; its
 * closing list of unsettled questions says so ("WHY `grade-paper-writing` IS DEAD (point 6). Needs a
 * description-length/negation arm."). This is that arm.
 *
 * 🔴 FOUR EXPLANATIONS ARE ALREADY RULED OUT AND THIS FILE MUST NOT RE-TEST THEM.
 *
 *   NOT VOCABULARY. `--mode preflight` in the parent prints the lexical argmax for every prompt. On
 *   all four AH and all four SH prompts, `grade-paper-writing` IS the argmax, overlap 0.67–1.00, two
 *   of them at 1.00 — every content word the user typed is in the description. It fires 25% / 17%
 *   anyway. A prompt cannot be lexically closer than "contained entirely".
 *
 *   NOT COMPETITION. 42 of its 48 runs were SILENT: nothing fired at all. The whole 144-run parent
 *   experiment produced ONE competitor misfire. Nothing is out-competing this skill because nothing
 *   is competing.
 *
 *   NOT RECOVERABILITY. The parent's closed-book oracle, handed all 37 name+description pairs, picks
 *   `grade-paper-writing` 10 times out of 16 on these same prompts. The information IS in the text.
 *
 *   NOT "LONGEST" AND NOT "MOST NEGATED". Checked and false. At 1174 chars it is the SECOND longest
 *   description in the roster (`study-accepted-papers` is 1270 and fires). Its four negation clauses
 *   are exactly as many as `tighten-paper`'s four, and `tighten-paper` fires at 52%.
 *
 * So the cause, if it is in the description at all, is a PROPERTY of the text, not its size, its
 * lexical coverage, its rivals, or its legibility to a careful reader.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESIGN: ABLATE THE DESCRIPTION, HOLD THE PROMPTS FIXED
 *
 * The parent varied the prompts against a fixed description. This inverts that: the eight prompts are
 * copied VERBATIM from the parent's CASES (guarded — see preflight #2) and the target's description
 * is mutated one factor at a time. Everything else — fixture, roster, trials, tools, concurrency — is
 * the parent's, so every arm below is directly comparable to its measured 25% (AH) / 17% (SH).
 *
 *   A0  baseline          verbatim. The control.
 *   A1  short             keep sentence 1 ("Use when asking …") and sentence 2 ("Grades WRITING CRAFT
 *                         only — nine dimensions … the fix for each."). Delete everything after.
 *                         1174 -> ~530 chars. The blunt arm: does ANY deletion revive it?
 *   A2  no-subordination  delete ONLY the two clauses announcing that this skill is a SUBROUTINE of
 *                         other skills: "whose stall inventory … is the readability gate other skills
 *                         consume (pc-panel-review, paper-adversarial-review, harden-paper)" and
 *                         "harden-paper (which calls it)". Everything else stays, NOT-clauses included.
 *                         🎯 THE ARM THIS FILE WAS BUILT FOR. The description twice tells the reader
 *                         that other skills own this one's output. A selector reading that may be
 *                         deferring — declining to call a thing that presents itself as something
 *                         another skill calls. No other skill in the roster says this about itself.
 *   A3  no-negation       delete ONLY the sentence carrying the "NOT …" delegation clauses.
 *   A4  no-machinery      delete ONLY the opaque internals and proper nouns: the nine-dimension
 *                         parenthetical, the "(Peyton Jones, McEnerney, Gopen & Swan; exemplars …)"
 *                         authorities, the PERSONA sentence and the blind-panel/claims-diff sentence.
 *                         Keeps sentence 1 and the NOT-clauses.
 *   A5  renamed           description BYTE-IDENTICAL to A0; the directory and `name:` become
 *                         `paper-readability-review`. Tests whether the NAME is what is lost — whether
 *                         "grade-paper-writing" reads as a niche in-house verb the selector skips.
 *                         The only arm that changes nothing about the description text.
 *   A6  persona-only      ADDED AFTER A0-A5 RAN, on request, and it is A1's MIRROR. The skill has two
 *                         jobs — a nine-dimension rubric and a persona cold-read stall pass — and A1
 *                         as specified keeps the rubric sentence and deletes the persona one, so the
 *                         six-arm design had a rubric-only description and no persona-only twin. A6 is
 *                         that twin: the opening sentence (minus the `"grade the writing"` trigger,
 *                         which belongs to the half being removed) plus "Runs the PERSONA cold-read
 *                         stall pass (a committed non-academic persona subagent, per-section)."
 *                         Nothing else. 🔴 JUDGEMENT CALL, RECORDED: the persona sentence's trailing
 *                         subordination clause ("whose stall inventory … other skills consume …") is
 *                         DELETED here even though the brief did not name it, because A1 drops the
 *                         subordination clause too (it lives in the sentences A1 deletes). Keeping it
 *                         would make A1-vs-A6 differ in TWO factors instead of one, and the pair is
 *                         the whole point of the arm. It also removes a dangling "not the rubric
 *                         number" reference to a rubric this description no longer mentions.
 *
 * Then the ORACLE, exactly as the parent implements it: closed book, no harness, no skills installed,
 * the arm's 37 name+description pairs pasted in, one pick, NONE allowed. 6 arms x 8 prompts = 48.
 * It separates the two things an arm's movement could mean:
 *
 *     oracle moves WITH the harness   the mutation changed what is RECOVERABLE from the text
 *     oracle flat, harness moves      the mutation changed what the HARNESS DOES with the same text
 *
 * The second is the interesting one and the parent already showed the harness sits 14–39pp below the
 * oracle everywhere, so there is room for it.
 *
 * WHY ONLY AH + SH. The parent's AL and SL cells sit on the floor for EVERY skill (44% and 11% across
 * all three, 11% with 86% SILENT for SL). An arm measured there would be measuring the floor, not the
 * skill. AH and SH are where `grade-paper-writing` is anomalous — 25% and 17% against siblings' 60-90%
 * in the same cells — so that is where a mutation can show.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT EACH ARM CAN AND CANNOT DISTINGUISH
 *
 *   A1 rises, others flat        "something after sentence 2 is the problem" — and A1 cannot say
 *                               WHICH thing, because it deletes four sentences at once. A1 is the
 *                               detector, A2/A3/A4 are the localisers. A1 rising with all three
 *                               localisers flat is a real and annoying outcome: it would mean the
 *                               damage is distributed, or is length-after-all inside this one text.
 *   A2 rises                     the subordination clauses are load-bearing. This is the hypothesis;
 *                               a rise here is the finding. It still does not show WHY — "the selector
 *                               defers to the named owner" and "the clause is 150 chars of noise
 *                               between the user's words and the verb" both predict it. Untestable here.
 *   A3 rises                     the NOT-clauses suppress. NOTE this is NOT the already-refuted
 *                               "most negation clauses" claim: that was a COUNT compared across
 *                               skills (4 vs tighten-paper's 4). This is a within-skill deletion.
 *                               Equal counts across skills does not mean equal effect within one.
 *   A4 rises                     the machinery/proper nouns dilute. The weakest-motivated arm; it is
 *                               here because it is the other obvious "what is unusual about this text".
 *   A5 rises                     the name, not the description, is what the selector rejects. If A5
 *                               moves, every conclusion drawn from A1–A4 is about text that was never
 *                               the binding constraint.
 *   ALL FLAT                     the cause is NOT IN THE DESCRIPTION TEXT. That is a real result and
 *                               this file reports it as one. It would point at the parent's point 5
 *                               (the uniform harness-vs-oracle deficit) rather than at this skill.
 *
 * 🔗 A1 AND A6 ARE A PAIR AND MUST BE READ AS ONE. A1 = "this skill is the rubric"; A6 = "this skill
 * is the persona cold read". Same length class, same scope (opening sentence + one job sentence),
 * one factor between them: WHICH job the description claims. The live question behind it is whether
 * to SPLIT the skill in two.
 *
 * 🔴 WHAT THE PAIR CANNOT ESTABLISH, stated before it runs:
 *   - IT CANNOT SHOW THAT A SPLIT WOULD WORK. It measures two candidate DESCRIPTIONS of one skill,
 *     not two SKILLS. A real split changes the roster (38 entries, two of them adjacent in meaning),
 *     gives each half its own gate row in `pc-panel-review` and `harden-paper`, and leaves BOTH
 *     halves subordinate to the same three consumers. None of that is in this measurement.
 *   - THE PERSONA HALF'S VOCABULARY IS ALREADY KNOWN TO BE PRESENT AND ALREADY KNOWN TO FAIL, and
 *     this is an observation carried in, not something tested here: the prompt "the abstract reads
 *     like a wall of jargon" scores overlap 1.00 against the CURRENT description — which already
 *     contains the persona clause — and the parent measured that whole SH cell at 17%. So a high A6
 *     number is not evidence that "the persona half is the healthy one"; it would itself need
 *     explaining against that. A high A6 with a high A1 says the deletions helped, not that the
 *     persona did.
 *   - n = 24 EACH. A1-vs-A6 inherits caveat 1 below in full: the pair resolves a factor of two
 *     between the two halves and nothing finer.
 *
 * 🔴 THE ARMS ARE NOT ORTHOGONAL AND THAT COSTS THE INTERPRETATION.
 * A1's deletion is a strict SUPERSET of A2's and of A3's: everything A2 and A3 remove, A1 also
 * removes. It is NOT a superset of A4's — A4 cuts two parentheticals INSIDE the sentence A1 keeps,
 * while sharing the PERSONA and blind-panel sentences with A1. So:
 *   - A1 < A2 + A3 (i.e. A1 rising LESS than either localiser) is evidence that the deletions
 *     interfere, and no arm here can decompose that.
 *   - A1 ≈ A2 does NOT establish that A2's clauses are the whole story; it is consistent with
 *     "any of the four deleted sentences would have done it".
 *   - A2, A3, A4 are mutually disjoint in what they delete, so THOSE three can be read additively
 *     against A0 — with the n-caveat below, which is the binding one.
 * A clean factorial would need 2^4 = 16 arms x 24 runs = 384 runs, ~$54. Not run. This is a
 * one-factor-at-a-time screen and must be read as one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 WHAT THIS RUN CANNOT SETTLE — stated before it runs, not discovered after
 *
 *  1. n = 24 PER ARM (8 prompts x 3 trials). At a baseline near 20% the 95% interval is roughly
 *     ±16pp. THIS RESOLVES A FACTOR OF TWO. IT DOES NOT RESOLVE FIFTEEN POINTS. An arm at 21% against
 *     a baseline at 17% is noise and will be reported as noise. Only a move to ~50%+ — i.e. into the
 *     range where the sibling skills already live — is readable at this n. The per-cell splits
 *     (AH vs SH, 12 runs each) resolve almost nothing and exist as texture.
 *  2. 🔴 DELETION IS NOT OVERLAP-NEUTRAL, AND THE PREFLIGHT PRINTS THE DAMAGE. Every deletion arm
 *     removes words, so each one also LOWERS the prompt-to-description lexical overlap the parent
 *     measured as the dominant factor (35pp). A1 in particular guts the vocabulary the SH prompts
 *     match against. This biases the deletion arms DOWNWARD: an arm that rises does so despite the
 *     handicap (which strengthens it), but an arm that is FLAT may be a real gain cancelled by lost
 *     overlap, and this design cannot separate those. A5 is the only arm free of this confound — its
 *     word set is identical by construction — which is a second reason it is worth its 24 runs.
 *  3. ONE SKILL, ONE ROSTER, ONE MODEL. Whatever is found is a fact about this description in this
 *     roster. The parent's roster-size question (point 5 there) is untouched here.
 *  4. SILENT IS NOT PROOF OF NON-CANDIDACY — the parent's caveat 2, unchanged. Tools are restricted
 *     to Skill and Read and bodies are stubbed, but nothing forces a selection, and a run that simply
 *     answers from the fixture is also SILENT.
 *  5. THE ORACLE IS A MODEL, NOT A HUMAN, and shares the training distribution of the thing measured.
 *     It bounds what the DESCRIPTIONS support; it does not stand in for a person.
 *  6. A RISE DOES NOT NAME A MECHANISM. Every arm is a deletion; deletions confound "removed a
 *     harmful signal" with "shortened the text" with "removed distracting tokens". The arms differ in
 *     WHAT is deleted, never in WHETHER something is. An additive arm (ADDING a subordination clause
 *     to a healthy skill and watching it fall) is the confirmatory experiment and is NOT run here —
 *     it is the honest next step if A2 moves.
 *  7. NO INTERVENTION FOLLOWS FROM THIS FILE ALONE. Same rule the parent set for itself: a fix
 *     decided and validated on one run is overfitting. If an arm wins, the edit must be re-measured
 *     on prompts held out from THIS file too.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COST — nothing was cut to save it
 *
 * main   6 arms x 8 prompts x 3 trials  = 144 runs
 * oracle 6 arms x 8 prompts x 1 pick    =  48 calls
 *                                         192, the parent's exact budget
 * At the siblings' measured ~$0.14/run that is ~$27 API-equivalent, billed to a subscription,
 * $0 metered. The design as specified is the design that ran. AL and SL were never in it (see
 * "WHY ONLY AH + SH" — they are floor cells, not a saving).
 *
 * 🔴 NOT ONE FILE UNDER `.claude/skills/` IS MODIFIED BY THIS RUN. Each arm is a full copy of the
 * skills directory into the session scratchpad with ONE SKILL.md rewritten there; the copy's path is
 * what `skillsDir` receives. The real `grade-paper-writing/SKILL.md` is read and never written.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 RESULT — 2026-08-08. 168 harness runs (7 arms), 56 oracle picks, 0 errored, + 24 replication runs.
 * Raw logs: `repro/2026-08-08-grade-paper-writing-ablation-raw.log`        (A0-A5 main)
 *           `repro/2026-08-08-grade-paper-writing-ablation-A6-raw.log`     (A6 main)
 *           `repro/2026-08-08-grade-paper-writing-ablation-oracle.log`     (A0-A5 oracle)
 *           `repro/2026-08-08-grade-paper-writing-ablation-A6-oracle.log`  (A6 oracle)
 *           `repro/2026-08-08-grade-paper-writing-ablation-setupdiff.log`  (the config diff, free)
 *           `repro/2026-08-08-parent-replication-gpw.log`                  (the parent's own code, re-run)
 * Rows:     `repro/2026-08-08-grade-paper-writing-ablation.json` (56 prompt-rows, buckets, overlap)
 *           `repro/2026-08-08-grade-paper-writing-ablation-oracle.json`
 *           `repro/2026-08-08-parent-replication-gpw.json`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. 🔴 THE HEADLINE IS NOT AN ARM. THE CONTROL DID NOT REPLICATE THE PARENT, AND THE PREMISE OF THIS
 *    WHOLE EXPERIMENT — "grade-paper-writing is effectively dead" — DOES NOT HOLD ON RE-MEASUREMENT.
 *
 *      ⚠️ 2026-08-09: A0 IS TWO TOKENS OFF THE TEXT MEASURED BELOW. The scorecard row ids were
 *      renamed from two-letter codes to words (`Hn` → `claims`) because the two-letter space had
 *      collided — see `scripts/pipeline-edges.mjs`. The target's description carried one such
 *      reference, so "…mandates the Hn claim-preservation diff." became "…mandates the
 *      claims-preservation diff (row `claims`)." A0 is still read from disk and every guard still
 *      passes; the numbers below were measured on the pre-rename bytes and are left as recorded.
 *
 *      measurement                                            AH        SH       total
 *      parent, this morning                                3/12 25%  2/12 17%   5/24  21%
 *      A0 here, hours later, verbatim description           7/12 58%  6/12 50%  13/24  54%
 *      the PARENT'S OWN CODE, re-run, real .claude/skills   9/12 75%  3/12 25%  12/24  50%
 *
 *    The third row is the decisive one: `repro/2026-08-08-parent-replication.mjs` runs
 *    `framing-vs-vocabulary.eval.mjs` itself, with two asserted textual patches (filter the main loop
 *    to this skill and to AH+SH; redirect the output JSON), every guard, option, fixture and predicate
 *    untouched, against the REAL skills directory. It returns 50%, not 21%. So the gap is not in this
 *    file's setup — it is between two runs of the same code on the same inputs, hours apart.
 *
 *    `--mode setupdiff` (free, logged) checked the alternative mechanically rather than by eye:
 *      · allowedTools, trials, concurrency, spacingSec, timeoutMs, minPrompts — identical strings;
 *      · the FIXTURE source block — byte-identical to the parent's;
 *      · the `fired` predicate and the `firedSkills` helper — identical modulo the id they match;
 *      · every arm dir: 37 skills, and every SKILL.md frontmatter sha256-identical to the real one
 *        except the single deliberate mutation. No copy altered a competitor's description.
 *    Row by row, the parent's 5/24 and A0's 13/24 differ on 3 of 8 prompts by ≥2 of 3 trials
 *    (+3, +2, +2) and one by +1; four prompts are unchanged. The shift is spread, not one prompt.
 *
 *    WHAT THIS MEANS FOR WORK ALREADY DONE ON THE 12% FIGURE. `harden-paper` and `pc-panel-review`
 *    were edited earlier today with paragraphs citing "12% (6/48), measured 2026-08-08" as fact. The
 *    ADVICE in those paragraphs (invoke the skill by name rather than relying on selection) survives
 *    — a 50% selection rate is still a coin flip on a gate whose silent non-run looks like a pass —
 *    but the NUMBER does not, and prose that cites a measurement has to cite one that reproduces.
 *    🔴 This file does not edit them. Flagging it is in scope; rewriting two SKILL.md files on the
 *    strength of one more run is the same mistake in the other direction.
 *
 * 2. THE ONE ARM OUTSIDE NOISE IS A5 — AND IT IS AN ARTIFACT, WHICH THE ORACLE MADE VISIBLE.
 *
 *      arm  what changed                     chars   fired      AH    SH   Δ    silent  oracle
 *      A0   baseline, verbatim                1174  54% 13/24   58%   50%   —    46%    7/8
 *      A1   sentences 1-2 only (rubric)        528  50% 12/24   50%   50%  -4pp  46%    7/8
 *      A2   no subordination clauses           992  50% 12/24   58%   42%  -4pp  42%    8/8
 *      A3   no NOT-delegation sentence         965  54% 13/24   58%   50%   0pp  46%    7/8
 *      A4   no machinery / proper nouns        598  46% 11/24   50%   42%  -8pp  42%    8/8
 *      A5   renamed, description IDENTICAL    1174  25%  6/24   33%   17% -29pp  71%    0/8
 *      A6   persona-only (A1's mirror)         225  42% 10/24   33%   50% -12pp  46%    8/8
 *
 *    A5 is the only arm outside the interval (25% vs 54%; two-proportion z = 2.07, p ≈ 0.04 treating
 *    runs as independent — and they are not, see caveat 1, so read that p as an upper bound on the
 *    evidence). It is also the only arm whose SILENT share moves (71% vs 46%), which is the parent's
 *    discriminator doing exactly the job it was added for.
 *
 *    🔴 BUT A5 IS NOT THE CLEAN NAME TEST IT WAS DESIGNED AS, and the oracle is what caught it. The
 *    closed-book oracle scored A5 at 0/8 — and on 7 of those 8 picks it answered
 *    `grade-paper-writing`, A NAME THAT IS NOT IN THE ROSTER IT WAS SHOWN. It could do that because
 *    SIX OTHER DESCRIPTIONS in the roster name this skill: `cold-read-diff`, `draft-paper`,
 *    `harden-paper`, `paper-adversarial-review`, `pc-panel-review`, `tighten-paper`. Renaming the
 *    skill turns all six into dangling references to a skill that no longer exists, and the reader
 *    follows the cross-references rather than the entry in front of it. So A5 measures
 *    "rename a skill that six sibling descriptions call by its old name", NOT "the name in
 *    isolation". The design intended the second and delivered the first. That is still a real and
 *    useful finding about THIS roster — cross-references are load-bearing and a rename is not a
 *    local edit — but it is not evidence that `grade-paper-writing` is a bad name, and it must not
 *    be quoted as such. A clean name test would have to rewrite the six references in the same pass,
 *    which would break the strict-subset guard (it adds the new name to six other descriptions) and
 *    so needs a different design, not another arm here.
 *
 * 3. EVERY DESCRIPTION-TEXT ARM IS FLAT. THAT IS THE NEGATIVE RESULT AND IT IS THE ANSWER.
 *    A1 -4pp, A2 -4pp, A3 0pp, A4 -8pp, A6 -12pp, against an interval of roughly ±20pp at this
 *    baseline (n = 24, p ≈ 0.5) — and wider than that once the 8-prompt clustering is admitted.
 *    Not one of them is distinguishable from A0, and every one of them is NEGATIVE, i.e. no deletion
 *    helped even nominally. In particular:
 *      · A2, the arm this file was built for, moved -4pp. THE SUBORDINATION HYPOTHESIS IS NOT
 *        SUPPORTED. Announcing that other skills consume your output does not measurably suppress
 *        selection here. (It does move the oracle 7/8 → 8/8, which is a one-pick difference and
 *        means nothing on its own.)
 *      · A3 moved 0pp. The NOT-clauses are inert for selection, consistent with the already-known
 *        fact that `tighten-paper` carries four of them and fires fine.
 *      · A4 (-8pp) deleted half the description's vocabulary (overlap 0.85 → 0.44 on AH) and still
 *        landed inside noise, which is itself mildly interesting against the parent's 35pp
 *        vocabulary effect — but it is one arm at n = 24 and is not a claim.
 *    Read together with point 1: THE CAUSE IS NOT IN THE DESCRIPTION TEXT. There was, on the day,
 *    less to explain than the parent's number suggested, and what remains does not move when the
 *    text is cut in five different places.
 *
 * 4. THE A1 / A6 PAIR DOES NOT SEPARATE THE SKILL'S TWO HALVES. 50% (rubric-only) vs 42%
 *    (persona-only), Δ 8pp, deep inside noise; both oracles near-perfect (7/8 and 8/8). The pair
 *    cannot recommend a split and cannot rank the halves. Two honest observations around it:
 *      · A6 carries by far the largest vocabulary handicap of any arm (AH overlap 0.19 vs A1's 0.71,
 *        SH 0.35 vs 0.78 — it is a 225-character description) and still landed within noise of A1.
 *        If anything that favours the persona half, and it is one arm at n = 24, so it is a
 *        direction to test, not a result.
 *      · The carried-in observation stated in advance stands and cuts the other way: the persona
 *        clause is ALREADY in the shipping description and the SH prompt "the abstract reads like a
 *        wall of jargon" already scores overlap 1.00 against it. That single prompt scored, in
 *        TARGET-of-3: parent 0 · A0 0 · A1 0 · A2 1 · A3 3 · A4 2 · A5 0 · A6 3. A3 differs from A0
 *        by one deleted sentence and went 0 → 3; A5's description is BYTE-IDENTICAL to A0's and also
 *        went 0. That column is the instability of point 1 in miniature, and it is why no arm's
 *        8pp is worth a mechanism.
 *
 * 5. WHAT DID REPRODUCE, LOUDLY: THE HARNESS-VS-ORACLE DEFICIT. The closed-book oracle scores 7/8 or
 *    8/8 on every arm except the artifact one, i.e. the descriptions determine the answer for a
 *    reader with no other task; the harness delivers 42-54% on the same text. A 25-45pp gap, present
 *    in all six non-artifact arms, unchanged by any deletion. That is the parent's point 5 measured
 *    again on a different axis, and it is the finding these two files agree on. It is also the one
 *    that no description edit can fix, because six different descriptions produce it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS RUN CANNOT SETTLE, AFTER THE RUN
 *
 *  - 🔴 A CONFOUND NOT PRE-REGISTERED, AND IT SHOULD HAVE BEEN: THE ARMS RAN IN ORDER, NOT
 *    INTERLEAVED. A0 → A5 ran sequentially over roughly an hour, A6 later still. Point 1 proves the
 *    harness drifts by ~30pp between sessions on this exact prompt set, so drift is not hypothetical
 *    here — it is measured, and it aliases perfectly with arm order. Every Δ in the table above
 *    carries that. A correct version randomises or blocks arm order across trials; this one did not,
 *    and the flat result is the only reading robust to it (a drift explanation cannot manufacture
 *    flatness, only spurious differences).
 *  - WHY THE HARNESS DRIFTED. Point 1 measures the instability; nothing here explains it. Model
 *    routing, load, cache state and time of day are all uncontrolled and unlogged. A stability
 *    experiment — the same cell, the same day, N times spread over hours — is the obvious next run
 *    and is NOT this one.
 *  - WHETHER THE NAME MATTERS. A5 was supposed to answer this and instead found the cross-reference
 *    artifact (point 2). Open.
 *  - WHETHER A SPLIT WOULD HELP. Stated in advance and unchanged: A1/A6 measure two descriptions of
 *    one skill, not two skills with their own gate rows and their own consumers.
 *  - THE COMPETITOR SIGNAL IS THIN BUT NON-ZERO, AND IT WAS ZERO IN THE PARENT. 10 misfires across
 *    168 runs (`tighten-paper` 7, `cold-read-diff` 3), concentrated in the arms that deleted text
 *    (A4 13%, A6 13%, A2 8%; A0 and A3 0%). Consistent with "deleting the NOT-clauses and the
 *    machinery lets neighbours take the run", too small to claim.
 *
 * COST, ACTUAL. 168 harness runs + 56 oracle picks + 24 replication runs = 248 model runs;
 * ~$23.15 API-equivalent measured across the three logs ($17.10 + $2.29 + $3.76), billed to a
 * subscription, $0 metered. Nothing in the design was cut to save money; A6 and the replication were
 * ADDED after the six-arm design ran, and the setup diff was free.
 *
 * 🔴 NO SKILL.md WAS CHANGED BY THIS RUN EITHER. The two paragraphs citing the 12% figure are
 * flagged in point 1 and left alone.
 */

import { assertPromptDiversity, skip } from "vigiles";
import { paid_measureTriggerRate as measureTriggerRate } from "vigiles/eval";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  renameSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { frontmatterBlock } from "../../lib/markdown.mjs";
import { parseFm } from "../../lib/skill-corpus.mjs";
import { installedSkills } from "./scripts/consumer.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const SKILLS_DIR = join(ROOT, ".claude", "skills");
const REPRO = join(SKILLS_DIR, "paper-pipeline", "repro");
const PARENT = join(
  SKILLS_DIR,
  "paper-pipeline",
  "framing-vs-vocabulary.eval.mjs",
);
const SCRATCH =
  process.env.ABLATION_SCRATCH ??
  "/tmp/claude-0/-home-user-mine/8268acb1-66a2-55ac-858e-2b9e3c81f84e/scratchpad/gpw-ablation";
const NS = "vigiles-loose-skills";
const TARGET = "grade-paper-writing";
const STEM = "2026-08-08-grade-paper-writing-ablation";

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const MODE = val("mode", "main");
const TRIALS = Number(val("trials", "3"));
const ONLY = (val("arms", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!["main", "oracle", "preflight", "setupdiff"].includes(MODE))
  throw new Error("--mode must be main | oracle | preflight | setupdiff");

// ── the fixture ──────────────────────────────────────────────────────────────
// Byte-identical to the parent's (and therefore to both of ITS siblings). If it drifts, a difference
// between this run and the 12% it exists to explain stops being attributable to the descriptions.
const FIXTURE = {
  "paper/paper.md": [
    "# Prose Isn't Policy: Measuring Whether Agent-Config Rules Are Enforceable",
    "",
    "## Abstract",
    "Agent configuration files state rules in prose and assume the model obeys them. We compile a",
    "corpus of real rules and measure what fraction can be mechanically enforced. We find that 84%",
    "of rules in our corpus are enforceable, and that LLM-authored checkers for the remainder leak",
    "silently in 84-96% of adversarial cases \\cite{greshake2023}.",
    "",
    "## 1 Introduction",
    "Every agent harness ships a natural-language rulebook. Nothing checks it. This is the same",
    "mistake as a code comment that claims an invariant no test enforces \\cite{thompson1984}.",
    "",
    "## 2 Method",
    "We gather rules from public repositories, classify each by enforceability, and build a",
    "two-stage adversarial gate that validates a synthesized rule against a blind gold set.",
    "",
    "## 3 Results",
    "See Table 1. The headline number is 84%.",
    "",
    "## 4 Discussion",
    "The result generalizes beyond our corpus in the sense that the mechanism is not corpus-specific,",
    "though of course the specific percentages are, and it is important to note in this context that",
    "the framing itself may be what carries, rather than the measurement.",
    "",
    "## 5 Threats to Validity",
    "Our corpus is drawn from public repositories and may not represent private configurations.",
    "",
    "## 6 Related Work",
    "TODO",
    "",
    "## 7 Conclusion",
    "Prose is not policy.",
  ].join("\n"),
  "paper/repro/README.md":
    "# Reproduction artifact\n\n`python3 paper_numbers.py` recomputes every bolded figure in paper.md.\n",
  "paper/PIPELINE-STATUS.md":
    "# Pipeline status\n\n| gate | state |\n|---|---|\n| numbers | pass |\n| structure | not run |\n| citations | not run |\n",
};

// ── the prompts ──────────────────────────────────────────────────────────────
// COPIED VERBATIM from framing-vs-vocabulary.eval.mjs, CASES[1] (grade-paper-writing), cells AH and
// SH. Not paraphrased, not extended, not re-ordered. Preflight #2 proves it by substring against the
// parent's source — inventing a prompt here would make this run incomparable to the 25%/17% it exists
// to explain, which is the only reason the numbers mean anything.
const PROMPTS = {
  AH: [
    "grade the writing craft in this draft and name the offending sentence in each dimension",
    "run the blind multi-grader panel over the prose clarity and jargon discipline",
    "score the title, the abstract and the intro architecture one to five",
    "grade how well this reads, hedge stacking included, and give me the fix for each",
  ],
  SH: [
    "the abstract reads like a wall of jargon",
    "the intro architecture is fine but the prose clarity is not",
    "there is hedge stacking everywhere and the point never lands",
    "the writing does not read well even though the draft is finished",
  ],
};
const CELLS = ["AH", "SH"];
// Next to this sat `CELL_LABEL = { AH: "ACTION / HIGH overlap", SH: "SITUATION / HIGH overlap" }`,
// which nobody called (2026-08-28). The report prints the bare keys `AH`/`SH`, that is, the
// expansion of the cells was written and never wired up. Deleted; to wire it up, put it in the
// table header below.
const allPrompts = CELLS.flatMap((k) =>
  PROMPTS[k].map((p) => ({ cell: k, prompt: p })),
);

// ── the baseline description, read from disk (never hardcoded — it would drift) ──
if (!existsSync(join(SKILLS_DIR, TARGET, "SKILL.md")))
  throw new Error(`${TARGET} is not installed under ${SKILLS_DIR}`);
// READING a field is a parser's job. The hand-rolled version below used a lookahead
// for "the next key" to find where a value ended, which is a guess about YAML that
// YAML does not have to honour: a folded (`>`) or literal (`|`) block, a quoted
// value containing a colon, or a value carried onto a continuation line all end
// somewhere else. `parseFm` is the corpus reader — strict, and loud about why.
const fmOf = (md) => {
  const block = frontmatterBlock(md);
  return block === null ? {} : parseFm(block, "ablation fixture");
};
const parseDesc = (md) =>
  String(fmOf(md).description ?? "")
    .replace(/\s+/g, " ")
    .trim();
const parseName = (md) => fmOf(md).name;
const BASE_MD = readFileSync(join(SKILLS_DIR, TARGET, "SKILL.md"), "utf-8");
const A0 = parseDesc(BASE_MD);
if (parseName(BASE_MD) !== TARGET)
  throw new Error(`${TARGET}/SKILL.md declares name: ${parseName(BASE_MD)}`);

// ── the mutations, as EXACT SUBSTRING DELETIONS from A0 ──────────────────────
// Deletion, never rewriting. A rewritten clause could introduce a word A0 does not contain, and
// "we added vocabulary" is a known-working fix (the parent measured vocabulary at 35pp) and NOT the
// question. Guard #5 below enforces that mechanically; these strings only make it easy to satisfy.
const CUT_A1_AT = "naming the offending sentence and the fix for each.";
const D_SUBORDINATION = [
  " whose stall inventory — not the rubric number — is the readability gate other skills consume (pc-panel-review, paper-adversarial-review, harden-paper)",
  "harden-paper (which calls it), ",
];
const D_NEGATION = [
  " NOT a content/defect review (paper-adversarial-review / pc-panel-review), NOT a structural cut plan (tighten-paper — run that first on a bloated draft), NOT venue-bar content strength (study-accepted-papers).",
];
const D_MACHINERY = [
  " (Title, Abstract, Intro architecture, Structure, Prose clarity, Jargon discipline, Landing-the-point, Figure economy, Honesty-without-hedge-stacking)",
  " (Peyton Jones, McEnerney, Gopen & Swan; exemplars Trusting Trust, Carlini, Greshake)",
  " Runs the PERSONA cold-read stall pass (a committed non-academic persona subagent, per-section) whose stall inventory — not the rubric number — is the readability gate other skills consume (pc-panel-review, paper-adversarial-review, harden-paper).",
  " Defaults to a blind multi-grader panel; after fixes, mandates the claims-preservation diff (row `claims`).",
];
// NOTE ON "FOUR NOT-CLAUSES": the description carries THREE uppercase "NOT …" delegation clauses
// (all in one sentence) plus one lowercase "not the rubric number", which is not a delegation clause
// at all — it is part of the subordination clause and is removed by A2, not by A3. A3 deletes the
// delegation sentence entire. This is stated because the count "4 negations" comes from a
// case-insensitive tally and would otherwise look like a missing deletion.

const applyCuts = (s, cuts) => {
  let out = s;
  for (const c of cuts) {
    if (!out.includes(c))
      throw new Error(
        `deletion string not found in description: ${c.slice(0, 60)}…`,
      );
    out = out.replace(c, "");
  }
  return out.replace(/\s+/g, " ").trim();
};

// A6 keeps the persona sentence as the skill's whole job: the opening sentence MINUS the
// `"grade the writing"` trigger (that trigger names the rubric half), plus the persona clause with
// its subordination tail removed — see the header for why that tail goes.
const D_PERSONA_ONLY = [
  ' / "grade the writing"',
  " Grades WRITING CRAFT only — nine dimensions 1–5 (Title, Abstract, Intro architecture, Structure, Prose clarity, Jargon discipline, Landing-the-point, Figure economy, Honesty-without-hedge-stacking) against how the best-written papers read (Peyton Jones, McEnerney, Gopen & Swan; exemplars Trusting Trust, Carlini, Greshake), naming the offending sentence and the fix for each.",
  " whose stall inventory — not the rubric number — is the readability gate other skills consume (pc-panel-review, paper-adversarial-review, harden-paper)",
  " Defaults to a blind multi-grader panel; after fixes, mandates the claims-preservation diff (row `claims`).",
  " NOT a content/defect review (paper-adversarial-review / pc-panel-review), NOT a structural cut plan (tighten-paper — run that first on a bloated draft), NOT venue-bar content strength (study-accepted-papers).",
  " Compose with harden-paper (which calls it), draft-paper (generative counterpart), render-paper.",
];

const ARMS = [
  { id: "A0", label: "baseline (verbatim)", desc: A0 },
  {
    id: "A1",
    label: "short (sentences 1-2 only)",
    desc: A0.slice(0, A0.indexOf(CUT_A1_AT) + CUT_A1_AT.length),
  },
  { id: "A2", label: "no-subordination", desc: applyCuts(A0, D_SUBORDINATION) },
  { id: "A3", label: "no-negation", desc: applyCuts(A0, D_NEGATION) },
  { id: "A4", label: "no-machinery", desc: applyCuts(A0, D_MACHINERY) },
  {
    id: "A5",
    label: "renamed (description identical)",
    desc: A0,
    rename: "paper-readability-review",
  },
  {
    id: "A6",
    label: "persona-only (A1's mirror)",
    desc: applyCuts(A0, D_PERSONA_ONLY),
  },
];
for (const a of ARMS) a.skill = a.rename ?? TARGET;
const RUN_ARMS = ONLY.length ? ARMS.filter((a) => ONLY.includes(a.id)) : ARMS;
if (ONLY.length && RUN_ARMS.length !== ONLY.length)
  throw new Error(`--arms named an arm that does not exist: ${ONLY.join(",")}`);

// ── PREFLIGHT ────────────────────────────────────────────────────────────────
// Every guard fails LOUDLY and BEFORE a token is spent. The failure this block exists to prevent is
// the parent's: a wrong id or a bad mutation makes `fired` permanently false and the run then prints
// a wall of confident 0.00s that read like a finding.

// 1. the roster is what the parent measured
// Through `installedSkills`, which follows the links `paperlint init` makes (paperlint#62).
const installed = installedSkills(SKILLS_DIR);
const installedSet = new Set(installed);
if (installedSet.has(ARMS[5].rename))
  throw new Error(
    `A5's rename target ${ARMS[5].rename} already exists — it would collide`,
  );

// 2. 🔴 THE PROMPTS ARE THE PARENT'S, PROVEN BY SUBSTRING. The whole comparability of this run to the
//    12% rests on it, and "I copied them carefully" is not a check.
if (!existsSync(PARENT)) throw new Error(`parent eval not found: ${PARENT}`);
const parentSrc = readFileSync(PARENT, "utf-8");
for (const { prompt } of allPrompts)
  if (!parentSrc.includes(prompt))
    throw new Error(
      `PROMPT NOT VERBATIM FROM THE PARENT: "${prompt}". This file must not invent prompts — an ` +
        `invented prompt makes every arm incomparable to the 25%/17% it exists to explain.`,
    );
const seen = new Set();
for (const { prompt } of allPrompts) {
  if (seen.has(prompt)) throw new Error(`duplicate prompt: "${prompt}"`);
  seen.add(prompt);
}
for (const k of CELLS)
  assertPromptDiversity(PROMPTS[k], {
    minPrompts: 4,
    minDistance: 0.3,
    label: `${TARGET}:${k}`,
  });

// 3. the fixture is the parent's, byte for byte
for (const [path, body] of Object.entries(FIXTURE))
  if (!parentSrc.includes(body.split("\n")[0]))
    throw new Error(`fixture drifted from the parent's: ${path}`);

// ── the vocabulary machinery, COPIED VERBATIM from the parent ────────────────
// Guard #4 below re-reads both files and fails if this block and the parent's have diverged. A second
// independent stemmer would mean the subset guard and the parent's overlap numbers measure different
// things while looking like the same metric.
const STOP = new Set(
  (
    "a an the and or but if then than that this these those there here it its is are was were be been being am " +
    "do does did doing done have has had having i me my we our you your he she they them their of in on at to " +
    "for with by from as into over under about after before between out up down off again more most some any " +
    "no not nor only own same so too very can will just should now what which who whom whose when where why how " +
    "me myself yourself each both few other such all one two three back keep still even yet get got give given " +
    "make made want need know knew cannot could would might must let us like also because while against would"
  ).split(/\s+/),
);
const stem = (w) =>
  w
    .replace(/(ies)$/, "y")
    .replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2))
    .replace(/(ing|ed|ly|s)$/, "");
const words = (s) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-zа-яё\s-]/gi, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length >= 3),
  );

const descriptions = {}; // baseline roster; per-arm rosters swap the one entry (oracle mode)
for (const name of installed)
  descriptions[name] = parseDesc(
    readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf-8"),
  );

// 4. THE MACHINERY IS THE PARENT'S, PROVEN BY COMPARING BOTH SOURCES
const MARK_A = "const STOP = new Set(";
const MARK_B = "const descriptions = {};";
const block = (src) => {
  const i = src.indexOf(MARK_A);
  const j = src.indexOf(MARK_B, i);
  if (i < 0 || j < 0) throw new Error("vocabulary machinery markers not found");
  return src.slice(i, j).replace(/\s+/g, " ").trim();
};
const mySrc = readFileSync(fileURLToPath(import.meta.url), "utf-8");
if (block(mySrc) !== block(parentSrc))
  throw new Error(
    "VOCABULARY MACHINERY HAS DIVERGED from framing-vs-vocabulary.eval.mjs. The subset guard and the " +
      "parent's overlap numbers must be the same metric; two stemmers that look alike are worse than one.",
  );

const overlap = (prompt, desc) => {
  const p = words(prompt);
  if (p.size === 0) return 0;
  const d = words(desc);
  let hit = 0;
  for (const w of p) if (d.has(w)) hit++;
  return hit / p.size;
};

// 5. 🔴 THE SUBSET GUARD — the one that decides whether this experiment is measuring its factor.
// A1-A4 must each be a STRICT SUBSET of A0's stemmed content-word set: deletions only, no word added.
// A5 must be EQUAL: it changes the name, nothing else. An arm that ADDS a word is measuring "we added
// vocabulary", which the parent already measured at 35pp and which is a known-working fix, not this
// question.
const W0 = words(A0);
const deltas = {};
for (const a of ARMS) {
  const w = words(a.desc);
  const added = [...w].filter((x) => !W0.has(x));
  const removed = [...W0].filter((x) => !w.has(x));
  deltas[a.id] = { size: w.size, added, removed };
  if (a.id === "A0") {
    if (added.length || removed.length)
      throw new Error("A0 is not the baseline — it differs from A0");
    continue;
  }
  if (a.id === "A5") {
    if (a.desc !== A0)
      throw new Error("A5's description must be BYTE-IDENTICAL to A0");
    if (added.length || removed.length)
      throw new Error(
        `A5's word set must EQUAL A0's (+${added.length}/-${removed.length})`,
      );
    continue;
  }
  if (added.length)
    throw new Error(
      `ARM ${a.id} ADDS ${added.length} content word(s) not in A0: ${added.join(", ")}. That arm would ` +
        `measure added vocabulary, which is the parent's 35pp factor and a known-working fix — not the ` +
        `question. Mutations must be pure deletions.`,
    );
  if (!removed.length)
    throw new Error(`ARM ${a.id} removes nothing — it is a duplicate of A0`);
}
// A1's specific claim: a literal prefix of A0.
if (!A0.startsWith(ARMS[1].desc)) throw new Error("A1 is not a prefix of A0");

// 6. the harness itself
if (MODE !== "preflight") {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    skip(
      "`claude` CLI not on PATH — the eval tier drives the real harness and cannot be faked",
    );
  }
}

// ── build one arm's skills dir (a COPY; the real one is never written) ───────
function buildArm(a) {
  const dir = join(SCRATCH, `arm-${a.id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // 🔴 ONE SKILL AT A TIME, FROM ITS REALPATH — not `cpSync(SKILLS_DIR, dir, { recursive })`.
  // In a consumer every entry of SKILLS_DIR is a link `paperlint init` made (paperlint#62), and `cpSync` copies
  // a link as a link, rewritten to an ABSOLUTE path into the original; `dereference: true` does not
  // change that for nested entries (measured, Node 22.22). The arm's `writeFileSync` below would
  // then land in the real SKILL.md — "the real one is never written" would be false in exactly the
  // setup this eval exists for. Copying each skill's resolved directory makes the arm a real copy.
  for (const name of installed)
    cpSync(realpathSync(join(SKILLS_DIR, name)), join(dir, name), {
      recursive: true,
    });
  const srcDir = join(dir, TARGET);
  const outDir = a.rename ? join(dir, a.rename) : srcDir;
  let md = readFileSync(join(srcDir, "SKILL.md"), "utf-8");
  // WRITING is the opposite case, and a parser is the wrong tool: `yaml.dump` would
  // reformat the whole block, so the fixture would differ from the real file in ways
  // the ablation is not measuring. The line is READ OUT of the file instead of
  // assumed — the idiom skills.mutations.mjs already uses — and a missing line is an
  // error rather than a silent no-op, because a mutation that does not apply scores
  // as a pass over a fixture nobody changed.
  const setLine = (text, key, value) => {
    const line = new RegExp(`^${key}:.*\\n`, "m").exec(text); // kb-lint:markdown-regex-ok — editing a LINE, not parsing
    if (!line)
      throw new Error(
        `FIXTURE TARGET NOT FOUND: no \`${key}:\` line in ${TARGET}/SKILL.md`,
      );
    return text.replace(line[0], `${key}: ${value}\n`);
  };
  md = setLine(md, "description", a.desc);
  if (a.rename) {
    md = setLine(md, "name", a.rename);
    renameSync(srcDir, outDir);
  }
  writeFileSync(join(outDir, "SKILL.md"), md);
  // verify what landed on disk, not what we meant to write
  const back = readFileSync(join(outDir, "SKILL.md"), "utf-8");
  if (parseDesc(back) !== a.desc)
    throw new Error(
      `arm ${a.id}: description did not round-trip through SKILL.md`,
    );
  if (parseName(back) !== a.skill)
    throw new Error(
      `arm ${a.id}: name is ${parseName(back)}, expected ${a.skill}`,
    );
  const n = installedSkills(dir).length;
  if (n !== installed.length)
    throw new Error(
      `arm ${a.id}: ${n} skills installed, baseline has ${installed.length}`,
    );
  return dir;
}

// ── the labelling matrix, printed every run so the arms are auditable ────────
console.log(
  `\n${installed.length} skills installed → ${installed.length - 1} competitors per run`,
);
console.log(
  `\nARMS — description length, word-set delta vs A0, mean prompt overlap`,
);
console.log(
  `${"arm".padEnd(4)}${"label".padEnd(34)}${"chars".padStart(7)}${"words".padStart(7)}${"−".padStart(6)}${"+".padStart(4)}${"ovAH".padStart(7)}${"ovSH".padStart(7)}`,
);
for (const a of ARMS) {
  const d = deltas[a.id];
  const ov = (k) =>
    PROMPTS[k].reduce((s, p) => s + overlap(p, a.desc), 0) / PROMPTS[k].length;
  console.log(
    `${a.id.padEnd(4)}${a.label.padEnd(34)}${String(a.desc.length).padStart(7)}${String(d.size).padStart(7)}` +
      `${String(d.removed.length).padStart(6)}${String(d.added.length).padStart(4)}` +
      `${ov("AH").toFixed(2).padStart(7)}${ov("SH").toFixed(2).padStart(7)}`,
  );
}
console.log(
  `\n⚠ ovAH/ovSH FALL AS TEXT IS DELETED — caveat 2 in the header, quantified. The deletion arms carry\n` +
    `  a vocabulary handicap against the parent's dominant factor. A rising deletion arm rose DESPITE it;\n` +
    `  a flat one may be a real gain cancelled by it, and this design cannot tell. A5 is the only arm\n` +
    `  with zero handicap (identical word set).`,
);

// ── SETUPDIFF — free, and it exists because a control that contradicts its parent is a setup bug
// until proven otherwise. Three checks the coordinator asked for, all mechanical:
//   1. the harness OPTIONS this file passes vs the ones the parent passes, pulled out of the parent's
//      own source rather than eyeballed;
//   2. a checksum of EVERY arm dir's SKILL.md frontmatter against the real one — a copy that altered
//      one competitor's description would change the roster and invalidate the comparison;
//   3. the parent's 24 grade-paper-writing AH+SH rows next to this file's 24 A0 rows, PROMPT BY
//      PROMPT — a disagreement concentrated in one prompt means something different from one spread
//      evenly across eight.
if (MODE === "setupdiff") {
  const OPTS = [
    "allowedTools",
    "trials",
    "concurrency",
    "spacingSec",
    "timeoutMs",
    "minPrompts",
    "fixture",
    "skillsDir",
  ];
  const grab = (src, key) => {
    const m = new RegExp(`\\b${key}:\\s*([^,\\n]+)`).exec(src);
    return m ? m[1].trim() : "—";
  };
  console.log(
    `\nHARNESS OPTIONS — this file vs the parent (extracted from both sources)`,
  );
  console.log(`${"option".padEnd(14)}${"ablation".padEnd(34)}parent`);
  for (const k of OPTS)
    console.log(
      `${k.padEnd(14)}${grab(mySrc, k).slice(0, 32).padEnd(34)}${grab(parentSrc, k).slice(0, 40)}`,
    );
  const fxHash = (s) =>
    createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 16);
  console.log(`\nfixture sha256/16   ablation ${fxHash(FIXTURE)}`);
  const pf = /const FIXTURE = \{[\s\S]*?\n\};/.exec(parentSrc)[0];
  const mf = /const FIXTURE = \{[\s\S]*?\n\};/.exec(mySrc)[0];
  console.log(
    `FIXTURE source block identical to the parent's: ${pf === mf ? "YES" : "🔴 NO"}`,
  );
  // Normalise indentation AND the one expression that must differ (the id each matches), then compare.
  const norm = (s) =>
    s
      .replace(/id\(c\.skill\)|wanted/g, "X")
      .replace(/\s+/g, " ")
      .trim();
  const grabFired = (src) =>
    (
      /fired: \(t\) => \{[\s\S]*?\},\s*\n\s*fixture:/.exec(src)?.[0] ?? ""
    ).replace(/fixture:$/, "");
  const pFired = grabFired(parentSrc);
  const mFired = grabFired(mySrc);
  const same = pFired && norm(pFired) === norm(mFired);
  console.log(
    `fired predicate identical (modulo the id it matches): ${same ? "YES" : "🔴 NO"}`,
  );
  if (!same)
    console.log(`  parent: ${norm(pFired)}\n  mine  : ${norm(mFired)}`);
  // ^-anchored: an unanchored match would find this very check line before the definition.
  const grabHelper = (src) =>
    /^const firedSkills = \(t\) => \[[\s\S]*?\n\];/m.exec(src)?.[0] ?? "";
  console.log(
    `firedSkills() helper identical: ${
      grabHelper(parentSrc) && grabHelper(parentSrc) === grabHelper(mySrc)
        ? "YES"
        : "🔴 NO"
    }`,
  );

  console.log(
    `\nARM DIR INTEGRITY — sha256/16 of each SKILL.md frontmatter vs the real .claude/skills`,
  );
  const fmHash = (p) =>
    createHash("sha256")
      .update(/^---\n[\s\S]*?\n---/.exec(readFileSync(p, "utf-8"))?.[0] ?? "")
      .digest("hex")
      .slice(0, 16);
  const realFm = Object.fromEntries(
    installed.map((n) => [n, fmHash(join(SKILLS_DIR, n, "SKILL.md"))]),
  );
  for (const a of ARMS) {
    const dir = buildArm(a);
    const names = installedSkills(dir);
    const diffs = [];
    for (const n of names) {
      const h = fmHash(join(dir, n, "SKILL.md"));
      if (n === a.skill) continue; // the one deliberate mutation
      if (realFm[n] !== h) diffs.push(n);
    }
    const missing = installed.filter((n) => n !== TARGET && !names.includes(n));
    console.log(
      `  ${a.id}  ${names.length} skills · unintended frontmatter diffs: ${diffs.length ? `🔴 ${diffs.join(", ")}` : "none"}` +
        (missing.length ? ` · MISSING: ${missing.join(", ")}` : ""),
    );
  }

  const mineP = join(REPRO, `${STEM}.json`);
  const parentP = join(REPRO, "2026-08-08-framing-vs-vocabulary.json");
  if (existsSync(mineP) && existsSync(parentP)) {
    const mine = JSON.parse(readFileSync(mineP, "utf-8")).results.filter(
      (r) => r.arm === "A0",
    );
    const par = JSON.parse(readFileSync(parentP, "utf-8")).results.filter(
      (r) => r.skill === TARGET && (r.cell === "AH" || r.cell === "SH"),
    );
    console.log(
      `\nROW BY ROW — parent (${par.length} prompts) vs this file's A0 (${mine.length} prompts)`,
    );
    console.log(
      `${"cell".padEnd(5)}${"parent".padStart(8)}${"A0".padStart(8)}${"Δ".padStart(7)}   prompt`,
    );
    let pT = 0,
      mT = 0;
    for (const p of par) {
      const m = mine.find((x) => x.prompt === p.prompt);
      const pt = p.buckets.filter((b) => b === "TARGET").length;
      const mt = m ? m.buckets.filter((b) => b === "TARGET").length : NaN;
      pT += pt;
      mT += mt;
      console.log(
        `${p.cell.padEnd(5)}${`${pt}/3`.padStart(8)}${`${mt}/3`.padStart(8)}${`${mt - pt > 0 ? "+" : ""}${mt - pt}`.padStart(7)}   ${p.prompt.slice(0, 54)}`,
      );
    }
    console.log(
      `${"".padEnd(5)}${`${pT}/24`.padStart(8)}${`${mT}/24`.padStart(8)}${`+${mT - pT}`.padStart(7)}   TOTAL`,
    );
    const moved = par.filter((p) => {
      const m = mine.find((x) => x.prompt === p.prompt);
      return (
        m &&
        Math.abs(
          m.buckets.filter((b) => b === "TARGET").length -
            p.buckets.filter((b) => b === "TARGET").length,
        ) >= 2
      );
    }).length;
    console.log(
      `\n  ${moved} of 8 prompts moved by ≥2 of 3 trials. Spread across many prompts ⇒ a global shift\n` +
        `  (session, load, model routing). Concentrated in one or two ⇒ something prompt-specific.`,
    );
  } else {
    console.log(
      `\n(row-by-row skipped: need both ${STEM}.json and the parent's json)`,
    );
  }
  console.log(`\nSETUPDIFF COMPLETE. No tokens spent.`);
  process.exit(0);
}

if (MODE === "preflight") {
  console.log(
    `\nWORD-SET DELTAS (stemmed content words removed from A0 — none may be added)`,
  );
  for (const a of ARMS) {
    const d = deltas[a.id];
    console.log(`\n  ${a.id} ${a.label}`);
    console.log(
      `     removed (${d.removed.length}): ${d.removed.join(" ") || "—"}`,
    );
    console.log(
      `     added   (${d.added.length}): ${d.added.join(" ") || "—"}`,
    );
  }
  console.log(`\nRESULTING DESCRIPTIONS`);
  for (const a of ARMS)
    console.log(
      `\n  ── ${a.id} (${a.skill}, ${a.desc.length} chars)\n  ${a.desc}`,
    );
  console.log(
    `\nbuilding each arm's skills dir under ${SCRATCH} (no real file is written) …`,
  );
  for (const a of ARMS) console.log(`  ${a.id} → ${buildArm(a)}`);
  console.log(
    `\nALL PREFLIGHT GUARDS PASSED. No tokens spent. Run --mode main next.`,
  );
  process.exit(0);
}

// ── ORACLE MODE ──────────────────────────────────────────────────────────────
// The parent's implementation, per arm: closed book, no harness, no skills installed, the arm's 37
// name+description pairs pasted in, one pick, NONE allowed.
if (MODE === "oracle") {
  const oraclePath = join(REPRO, `${STEM}-oracle.json`);
  // MERGE, never clobber: an arm added later must not cost a re-run of the arms already paid for.
  const rows =
    ONLY.length && existsSync(oraclePath)
      ? JSON.parse(readFileSync(oraclePath, "utf-8")).filter(
          (r) => !ONLY.includes(r.arm),
        )
      : [];
  console.log(
    `\noracle: ${RUN_ARMS.length} arm(s) x ${allPrompts.length} closed-book picks over ${installed.length} descriptions\n`,
  );
  for (const a of RUN_ARMS) {
    const names = a.rename
      ? installed.map((s) => (s === TARGET ? a.rename : s))
      : installed;
    const nameSet = new Set(names);
    const desc = { ...descriptions, [a.skill]: a.desc };
    if (a.rename) delete desc[TARGET];
    const roster = names.map((s) => `- ${s}: ${desc[s]}`).join("\n");
    console.log(`=== ${a.id} ${a.label}`);
    for (const { cell, prompt } of allPrompts) {
      const q =
        `Below is a list of agent skills, each with the description its author wrote.\n\n${roster}\n\n` +
        `A user typed exactly this:\n\n"${prompt}"\n\n` +
        `Which ONE of the skills above should be invoked? Reply with the skill name alone, ` +
        `or the single word NONE if no skill clearly applies. No explanation.`;
      let pick; // no initializer: both try/catch branches assign it (2026-08-28)
      try {
        const out = execFileSync("claude", ["-p", q, "--model", "sonnet"], {
          encoding: "utf-8",
          timeout: 180000,
          maxBuffer: 1 << 24,
        });
        const t = out
          .trim()
          .split("\n")
          .pop()
          .trim()
          .replace(/[.`"']/g, "");
        pick = nameSet.has(t)
          ? t
          : /^none$/i.test(t)
            ? "NONE"
            : `?${t.slice(0, 40)}`;
      } catch (e) {
        pick = `ERROR:${String(e.message).slice(0, 60)}`;
      }
      const ok = pick === a.skill;
      rows.push({ arm: a.id, label: a.label, cell, prompt, pick, ok });
      console.log(
        `  ${cell}  ${ok ? "HIT " : "miss"}  ${pick.padEnd(26)}  ${prompt.slice(0, 58)}`,
      );
    }
  }
  console.log(
    `\nORACLE ACCURACY BY ARM (closed book, ${installed.length} descriptions in context, 1 pick each)`,
  );
  console.log(
    `${"arm".padEnd(4)}${"label".padEnd(34)}  hit    AH    SH   none  wrong`,
  );
  for (const a of ARMS.filter((a) => rows.some((r) => r.arm === a.id))) {
    const r = rows.filter((x) => x.arm === a.id);
    const c = (k) => r.filter((x) => x.cell === k);
    const h = (xs) => xs.filter((x) => x.ok).length;
    const none = r.filter((x) => x.pick === "NONE").length;
    console.log(
      `${a.id.padEnd(4)}${a.label.padEnd(34)}  ${String(h(r)).padStart(2)}/${r.length}  ${String(h(c("AH"))).padStart(2)}/4  ` +
        `${String(h(c("SH"))).padStart(2)}/4  ${String(none).padStart(4)}  ${String(r.length - h(r) - none).padStart(5)}`,
    );
  }
  mkdirSync(REPRO, { recursive: true });
  rows.sort((x, y) => x.arm.localeCompare(y.arm));
  writeFileSync(oraclePath, JSON.stringify(rows, null, 2));
  console.log(`\nrows → repro/${STEM}-oracle.json`);
  console.log(
    `\nREAD AS AN UPPER BOUND, NOT A HUMAN, and read it AGAINST the harness arms: an arm where the\n` +
      `oracle moves WITH the harness changed what is recoverable from the text; an arm where the oracle\n` +
      `is flat and the harness moves changed what the harness DOES with the same recoverable text.`,
  );
  process.exit(0);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
// One measureTriggerRate call PER PROMPT, as the parent does: the predicate sees a Trace but not which
// prompt produced it, so per-prompt attribution of WHAT FIRED INSTEAD is only available here.
const firedSkills = (t) => [
  ...new Set(
    t.toolCalls
      .filter(
        (c) =>
          c.name === "Skill" &&
          !c.isError &&
          typeof c.input?.skill === "string",
      )
      .map((c) => c.input.skill),
  ),
];

console.log(
  `\nmode=main  ${RUN_ARMS.length} arm(s) x ${allPrompts.length} prompts x ${TRIALS} trials = ` +
    `${RUN_ARMS.length * allPrompts.length * TRIALS} runs`,
);

const mainPath = join(REPRO, `${STEM}.json`);
// MERGE, never clobber — same rule as the oracle.
const results =
  ONLY.length && existsSync(mainPath)
    ? JSON.parse(readFileSync(mainPath, "utf-8")).results.filter(
        (r) => !ONLY.includes(r.arm),
      )
    : [];
for (const a of RUN_ARMS) {
  const dir = buildArm(a);
  const wanted = `${NS}:${a.skill}`;
  console.log(
    `\n${"=".repeat(78)}\n=== ${a.id} ${a.label}  (${a.desc.length} chars, id ${wanted})`,
  );
  for (const { cell, prompt } of allPrompts) {
    const observed = [];
    const rep = await measureTriggerRate({
      name: `gpw-ablation:${a.id}:${cell}`,
      skillsDir: dir,
      prompts: [prompt],
      minPrompts: 1,
      fired: (t) => {
        const set = firedSkills(t);
        observed.push(set);
        return set.includes(wanted);
      },
      fixture: FIXTURE,
      trials: TRIALS,
      allowedTools: ["Skill", "Read"],
      concurrency: 3,
      spacingSec: 2,
      timeoutMs: 180000,
    });
    const bucket = observed.map((set) =>
      set.includes(wanted) ? "TARGET" : set.length > 0 ? "OTHER" : "SILENT",
    );
    const others = observed
      .flat()
      .filter((s) => s !== wanted)
      .map((s) => s.replace(`${NS}:`, ""));
    results.push({
      arm: a.id,
      label: a.label,
      skill: a.skill,
      descChars: a.desc.length,
      cell,
      prompt,
      trials: TRIALS,
      rate: rep.rate,
      errored: rep.errored ?? 0,
      overlap: Number(overlap(prompt, a.desc).toFixed(3)),
      buckets: bucket,
      othersFired: others,
    });
    const tally = (b) => bucket.filter((x) => x === b).length;
    console.log(
      `  ${cell}  ${rep.rate.toFixed(2)}  T${tally("TARGET")} O${tally("OTHER")} S${tally("SILENT")}` +
        `  ov=${overlap(prompt, a.desc).toFixed(2)}  ${prompt.slice(0, 56)}` +
        (others.length
          ? `\n         instead: ${[...new Set(others)].join(", ")}`
          : ""),
    );
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const erroredTotal = results.reduce((x, r) => x + r.errored, 0);
const stat = (arm, cell) => {
  const b = results
    .filter((r) => r.arm === arm && (!cell || r.cell === cell))
    .flatMap((r) => r.buckets);
  return {
    n: b.length,
    target: b.filter((x) => x === "TARGET").length,
    other: b.filter((x) => x === "OTHER").length,
    silent: b.filter((x) => x === "SILENT").length,
  };
};

console.log(`\n${"=".repeat(78)}\nTHE ABLATION — target trigger rate by arm\n`);
console.log(
  `${"arm".padEnd(4)}${"label".padEnd(34)}${"chars".padStart(7)}${"fired".padStart(12)}${"AH".padStart(8)}${"SH".padStart(8)}${"Δ vs A0".padStart(10)}`,
);
const base = stat("A0");
const REPORTED = ARMS.filter((a) => results.some((r) => r.arm === a.id));
for (const a of REPORTED) {
  const s = stat(a.id);
  const pc = (x) => `${((x.target / x.n) * 100).toFixed(0)}%`;
  const d = ((s.target / s.n - base.target / base.n) * 100).toFixed(0);
  console.log(
    `${a.id.padEnd(4)}${a.label.padEnd(34)}${String(a.desc.length).padStart(7)}` +
      `${`${pc(s)} (${s.target}/${s.n})`.padStart(12)}${pc(stat(a.id, "AH")).padStart(8)}${pc(stat(a.id, "SH")).padStart(8)}` +
      `${(a.id === "A0" ? "—" : `${d > 0 ? "+" : ""}${d}pp`).padStart(10)}`,
  );
}

console.log(
  `\n${"=".repeat(78)}\nTARGET / OTHER / SILENT — the parent's discriminator\n`,
);
console.log(`${"arm".padEnd(4)}${"label".padEnd(34)}  target   other  silent`);
for (const a of REPORTED) {
  const s = stat(a.id);
  const p = (x) => `${((x / s.n) * 100).toFixed(0)}%`.padStart(7);
  console.log(
    `${a.id.padEnd(4)}${a.label.padEnd(34)}  ${p(s.target)} ${p(s.other)} ${p(s.silent)}`,
  );
}
console.log(
  `\n  OTHER  = a competitor was selected and the target was not. The parent saw ONE in 144 runs.\n` +
    `  SILENT = nothing resolved. 42 of this skill's 48 parent runs were SILENT; that is the number\n` +
    `           an arm has to move. See caveat 4: a run that simply answered is also SILENT.`,
);

const misfires = {};
for (const r of results)
  for (const o of r.othersFired) misfires[o] = (misfires[o] ?? 0) + 1;
const top = Object.entries(misfires)
  .sort((x, y) => y[1] - x[1])
  .slice(0, 12);
if (top.length) {
  console.log(`\nWHICH competitors took the runs (all arms):`);
  for (const [s, n] of top) console.log(`  ${String(n).padStart(3)}  ${s}`);
}

console.log(
  `\n🔴 n = ${base.n} PER ARM. At ~20% baseline the 95% interval is roughly ±16pp. A factor of two is\n` +
    `   readable; fifteen points is not. If every arm lands within noise of A0, the finding is that the\n` +
    `   cause is NOT IN THE DESCRIPTION TEXT — report that, do not pick the largest number.`,
);
if (erroredTotal > 0)
  console.log(
    `\n⚠ ${erroredTotal} run(s) ERRORED and are excluded — rates are over fewer trials than planned.`,
  );

mkdirSync(REPRO, { recursive: true });
results.sort((x, y) => x.arm.localeCompare(y.arm));
writeFileSync(
  mainPath,
  JSON.stringify(
    {
      trials: TRIALS,
      competitors: installed.length - 1,
      baselineDescChars: A0.length,
      results,
    },
    null,
    2,
  ),
);
console.log(`\nper-run rows → repro/${STEM}.json`);
console.log(
  `\nRun --mode oracle before reading any arm as a mechanism: a harness move with a matching oracle\nmove is a change in what the TEXT supports, not in what the harness does with it.`,
);
