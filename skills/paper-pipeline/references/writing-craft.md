# Writing-craft reference — how well-written papers actually read

Grounding for `grade-paper-writing`, `draft-paper`, and `harden-paper`. Distilled from the canonical
craft sources + an honest dissection of exemplar papers (writing craft only, not scientific impact).
The point: grade a draft's *prose and structure* against how the best-written papers do it, not against
taste. Especially for the failure mode "a wall of text and jargon that doesn't drive home how crazy the
situation is."

## The three moves that make a human care (the core finding)
The most-cited papers are NOT uniformly the best-written — *Attention Is All You Need* is famous-but-terse
and wins only because its audience already cared. The papers that actually **make a reader care** —
*Reflections on Trusting Trust*, indirect-prompt-injection (Greshake), training-data-extraction (Carlini)
— all share three moves. This trio is the direct cure for "wall of text":
1. **Open on a problem/assumption the reader already holds** (not background, not a topic tour).
2. **Break it with the single most visceral concrete instance** (not an aggregate statistic).
3. **Land one repeatable sentence** the reader will quote to a colleague.

## Canonical craft rules

### Simon Peyton Jones — *How to Write a Great Research Paper*
- **One key idea.** The reader should be able to state it in a sentence. Don't dilute with five half-ideas.
- **Tell a story — the intro arc:** *problem → it's an interesting problem → it's an unsolved problem →
  here is my idea → my idea works.* This is the canonical intro skeleton.
- **Intro ≈ one page**, doing two things fast: (1) the problem via a concrete example in ~sentence 1;
  (2) contributions as a **bulleted list with forward references** ("we do X (§3)").
- **Contributions are "molecules, not atoms"** — refutable, specific claims, not vague ("we studied X").
- **Do NOT write "the rest of this paper is organized as follows."** The forward-referenced bullets do it better.
- **Related work goes at the END**, not after the intro — early, it's a wall before the reader knows why to care, and reads as defensive.
- **The reader is the only person who matters.** Convey the idea; don't recite what you did.
Sources: simon.peytonjones.org/great-research-paper · microsoft.com/en-us/research/academic-program/write-great-research-paper

### Larry McEnerney — *The Craft of Writing Effectively*
- **Writing creates VALUE for a community of readers — it is not a record of your thinking.** The job is to
  change what the reader believes about the world, not to explain what you did.
- **Clear ≠ good.** "Clear and useless = useless." Value first; clarity only matters in service of value.
- **The reader is expensive to move** — busy, skeptical experts. Every sentence must earn the next.
- **The "so what / who cares" test** — before a claim earns space, it must resolve an instability *this
  community* cares about.
- **Frame around a problem/instability, not a foundation.** Reject the martini-glass (broad→narrow→broad)
  and the topic-then-background opening; open by exposing a problem the reader already feels, and create tension.
- **Use the community's code-words** deliberately (for security-measurement: "threat model," "attack
  surface," "false-negative," "real-world," "at scale") — they signal "this is for you."
Sources: robincussol.com/the-craft-of-writing-effectively-summary · singjupost.com transcript

### Gopen & Swan — *The Science of Scientific Writing* (sentence mechanics)
- "The meaning of prose is not what the writer intends, but what readers interpret." Put info where readers expect it.
- **Topic position (sentence start) = old/linking info + context. Stress position (sentence end) = the new
  payload you want emphasized.** Put the important word last.
- **Keep subject and verb close.** Long clauses jammed between them make readers hold their breath.
- One sentence = one point. Don't put two new ideas in two stress positions.
Source: usenix.org/sites/default/files/gopen_and_swan_science_of_scientific_writing.pdf

### Strong-abstract structure (Zobel / 4-sentence)
Operational template to check an abstract against: **Context (1 sentence) → Gap/problem (1) → Approach (1)
→ Result with ONE memorable number/instance (1) → Meaning/so-what (1).** A stat-wall abstract fails this
because it stacks numbers with no gap and no "so what." (The tight "4-sentence abstract" is commonly
attributed to Kent Beck — treat as widely-cited, not primary-verified.)

## Exemplar lessons (writing craft only; grades = craft judgment, 1–5)
- **Attention Is All You Need** — Title 5, Abstract 4, Prose **2**. Imitate: six-word thesis-title, one
  killer figure, one memorable number (28.4 BLEU). **Do NOT imitate** the dense, contribution-less prose —
  it works only because the audience already cared. This IS the "wall of jargon" trap.
- **Reflections on Trusting Trust** — Prose **5**, the gold model. Plain words, one idea built step by step,
  opens on a question the reader already feels ("to what extent should one trust…"), lands one unforgettable
  moral ("You can't trust code that you did not totally create yourself"). The antidote.
- **Not What You've Signed Up For** (indirect prompt injection, AISec) — the **security-audience** model.
  Abstract pivots on a rhetorical question — *"But, what if it is not the user prompting?"* — that makes a
  human sit up harder than any statistic. Surface the assumption everyone holds, then break it.
- **Extracting Training Data from LLMs** (Carlini) — the **measurement-paper** model. Every abstraction is
  cashed out in a visceral concrete example ("128-bit UUID… appearing in just one document"). The fix for
  "doesn't drive home how crazy it is" is the concrete instance, NOT more numbers.
- **MapReduce** — "Simplified" in the title = the reader's *benefit* as the promise; clean topic sentences;
  motivating example before mechanism.

## The gradeable rubric — 9 dimensions, score 1–5 (anchors), most-severe first
For the "wall of jargon" failure mode, **weight #5 Prose, #6 Jargon, #7 Landing-the-point ×2.** Score each,
name the offending sentence/section, write the fix.

1. **Title — value + memorability.** 1 = generic topic label, forgettable. 5 = states the finding or the
   reader's benefit and is quotable; repeatable after one read.
2. **Abstract — context→gap→approach→result→meaning, with ONE number.** 1 = stat-wall/method-dump, no gap,
   no "so what." 5 = five moves in ≤5 sentences, one memorable result, a line the reader remembers.
3. **Intro architecture — problem/why-care/contribution/evidence, fast.** 1 = background/lit-tour, point
   arrives on page 2–3. 5 = SPJ arc in the first half-page + a bulleted, forward-referenced contributions list.
4. **Structure & signposting (incl. visual density).** 1 = arbitrary order, paragraphs open mid-thought,
   boilerplate roadmap, OR a wall — one giant unbroken paragraph the reader's eye slides off. 5 = each
   section one job, every paragraph's first sentence is its claim, forward refs not a roadmap, AND no wall:
   long related-work / discussion blocks are broken into scannable chunks with bold/italic run-in sub-heads
   (see the wall-of-text check below).
5. **Prose clarity (Gopen/Swan).** 1 = long two-idea sentences, subject/verb far apart, payload buried,
   passive. 5 = one idea/sentence, subject next to verb, payload in the stress position, active by default.
6. **Jargon discipline (graded for the NON-ACADEMIC target reader, not for you the expert).** 1 = undefined
   acronyms/in-group terms stacked to sound rigorous, OR standard field-jargon (`Bonferroni`, `construct
   validity`, `null`, `coarse`, coined handles) used with no plain-words gloss — the LLM-grader trap: you know
   them so you don't stall, but the reader does. 5 = every term earns its place and is glossed in plain language
   at first use; analogy before term; a strong engineer who is not a researcher never hits a wall. **Hard-capped
   by stall density (see the stall pass): > 1 stall/page ⇒ ≤ 2 here.**
7. **Landing-the-point / reader value (graded on BOTH the intro AND the conclusion).** 1 = abstractions all
   the way down; reader finishes thinking "so what?" 5 = exposes an assumption, breaks it with the most
   visceral concrete instance, quantifies stakes, and **the abstract and the conclusion each leave a
   memorable, extractable line** (the quotable test). A strong intro with a weak, summary-only conclusion
   scores LOW here — the conclusion is a graded surface, not an afterthought (see the conclusion & quotability
   check below). **Boring is a defect here, not neutral:** a technically-correct paper the target reader
   skims out of duty — flat, no line worth quoting, no moment that makes them sit up — scores ≤ 2, however
   sound. "Correct but I was bored to death" is a failing Landing grade.
8. **Figure/table economy.** 1 = many dense tables, no single figure that carries the thesis, captions not
   self-contained. 5 = one "money figure" a skim-reader understands alone; self-contained captions; tables show the one comparison that matters.
9. **Honesty without hedge-stacking.** 1 = overclaims OR drowns in hedges + defensive early related-work
   wall. 5 = explicit "what we do NOT claim," one clean threats-to-validity move, related work at the end as context.

## Scoring calibration — how to avoid an inflated grade (read before scoring)
A writing grade is worthless if it's inflated, and the default failure mode is a single grader — *especially
one that just wrote, rewrote, or verified the paper* — scoring on optimism and anchoring on "it got better."

**⚠️ The blind panel does NOT fix the expertise blind spot.** LLM graders share a vocabulary: all three know
`Bonferroni`, `construct validity`, `null`, `coarse` — so a blind 3-grader panel can *converge* on 44/60 and
all be wrong the same way (this happened; the human target reader then found the paper unreadable). The panel
fixes *optimism/anchoring*, not *"the graders are experts and the reader isn't."* Defenses: (1) every grader
runs the stall pass with expertise DEMOTED to the target reader (above); (2) **if the human target reader
stalls where the panel didn't, the human wins — they ARE the reader the grade is for.** A panel consensus that
contradicts the actual reader's "I was bored / lost" is a mis-grade, not a tie.

Two disciplines are mandatory:

**1. Absolute scale, not relative.** Grade against the whole field, NEVER against the previous draft.
- **5** = the best-written papers in existence (Trusting-Trust tier: a non-expert reads it willingly, one
  unforgettable line). Vanishingly rare — almost no real paper earns a 5 on most dimensions.
- **4** = clearly above average, a pleasure to read.
- **3** = competent and publishable but a slog in places — **the DEFAULT for a solid accepted paper.**
- **2** = a real weakness a reviewer gripes about. **1** = bad.
Most dimensions of most accepted papers are **2–3**. A row of 4s and 5s means you are being lenient —
recheck. "It improved from the last draft" is not evidence of a 4; grade only what is on the page today.

**2. One grade is not trustworthy — run a blind panel when the number matters.** Spawn **≥3 independent
graders**, each blind to (a) any prior score, (b) each other, and (c) the "we improved X" framing — give
them only the current page and the field's best as the yardstick. **Report the distribution (per-dimension
and overall min / median / max), not a point estimate.** Treat a lone high score as suspect until a blind
panel confirms it; if graders disagree by >1 on a dimension, that dimension is genuinely ambiguous — say so.
(This is the writing-axis analogue of `pc-panel-review`'s N-independent-reviewers design.)

## The cold-read stall pass (the "wait, what does that even mean?" axis)
The rubric's Prose, Jargon, and Figure dimensions are scored holistically — but the most *actionable* signal
is localized: the exact spots where a reader who did NOT write the paper stops and thinks "what does that even
mean?" Those stalls are what make a paper *feel* like a wall, and **authors are blind to them because they
already know what everything means.** This is the pass most worth delegating to a cold grader (a fresh
subagent with no context on the work), because the author literally cannot run it honestly on themselves.

**Run it as a PERSONA subagent, not as yourself "demoting expertise."** This is the fix for why the pass
under-fires: telling a frontier model to "imagine you don't know the terms" is an abstract instruction it glides
past — it still knows everything, so it glances over the jargon a real reader would trip on. A subagent
*committed to a specific persona* flags authentically, because it is answering AS someone who genuinely lacks the
vocabulary. Spawn a fresh subagent with a prompt like:
> You are Sam, a senior software engineer — 10 years building production web backends, sharp, but you have NEVER
> read an academic paper in this subfield and you do NOT know its vocabulary. Read this start to finish, linearly.
> EVERY time you hit a word, symbol, table cell, or sentence you would not use in a normal code review — STOP and
> write down the exact trigger (quote it) and what you'd need to get it. Do not be polite, do not push through, do
> not assume "it'll be explained later." If you'd mutter "what the fuck does that mean," that is a stall — log it.
> Output the stall inventory only.

Match the persona to the paper's ACTUAL target reader, and keep it inside the venue's field but OUTSIDE academia
(a security paper → a security-adjacent engineer who still doesn't know stats/measurement jargon), so it keeps
bucket-1 field terms and trips on buckets 2–3. Optionally also run it on a **deliberately weaker model**, which
lacks the vocabulary for real (not by role-play) and stalls even more like a human. The persona's inventory feeds
straight into the fix pass.

**Run the persona PER SECTION for a dense or long (>~6pp) paper — never one whole-paper pass.** A single pass over
a full paper skims the middle: this session a whole-paper sweep scored 44/60 and missed the walls that per-section
persona reads (intro, method, results) each caught immediately. Chunk it to 2–3pp / one section per subagent, so
the reader's attention doesn't degrade across the length.

**This persona-proxy technique generalizes.** Any skill that needs the LLM to stand in for a *limited* human —
a naive first-time-user docs walkthrough, a "can a newcomer follow this setup," a non-native-speaker read, a
"would a busy exec get the point in 10s" test — hits the same wall: the model's omniscience makes it a bad proxy.
The fix is always the same: **give it a committed persona (and/or a weaker model), don't ask it to "imagine" the
limitation.** When adding a skill that simulates a human constraint, reach for a persona subagent by default.

**Read as the paper's ACTUAL target reader — a strong practitioner/engineer who is NOT an academic in this
subfield — NOT as "a smart non-author."** This is the fix for the failure that let a jargon-dense paper score
"above average": *you, the LLM grader, know what `Bonferroni`, `construct validity`, `coarse`, `null`, `TOST`,
`ablation`, `orthogonal` mean — the target reader does not.* An LLM's default failure is never stalling because
it knows every term. **Deliberately demote your own expertise** and flag every term, notation, or construction
the target reader wouldn't get in ~5 seconds. If a strong engineer who is not a researcher would type "fuck
does that even mean" — it is a stall, no matter how standard the term is in the field. That "fuck does that mean"
reflex is the FLAG pass (catch broadly); the **Register calibration** below is the TRIAGE (keep field-native terms,
gloss/cut methodology shorthand, rename coinages) — run both, in that order.

### Register calibration — which terms to KEEP vs kill (the hard balance)
"Flag every term the reader wouldn't get in 5 seconds" is too blunt on its own: applied literally it strips the
**field-native vocabulary that makes a paper read as competent to its reviewers**, and glossing those reads as
naïve. The reader is a strong engineer *in the paper's own field* — **not a layperson and not a cross-field
methodologist.** Sort every candidate term into three buckets:

1. **KEEP — field-native terms a reviewer at THIS venue uses without thinking.** Glossing them wastes words and
   signals you don't know the field. *Security venue:* `exfiltrate`, `PreToolUse`, `AST`, `false positive`,
   `supply-chain`. *Benchmark venue:* `held-out`, `baseline`, `ablation`. Test: **would a reviewer at
   this venue type this word in their own review?** If yes, keep it (gloss at most once if borderline, then move on).
   **Bucket-1 is NARROW — be strict, when in doubt it's bucket 2.** The failure mode (real: `fnmatch` slipped through
   this list as a "keep" and the author stalled on it) is calling a **library/function/POSIX name** field-native
   because it's *plausibly* known. Test harder: not "might a reviewer know it?" but "would they type it *unglossed*
   in prose?" A libc function (`fnmatch`), a specific syscall, a niche flag — usually **NO**; it's artifact/detail,
   so gloss-or-cut (often just cut the name: "matches the glob" beats "an `fnmatch` bound"). **The AUTHOR's stall is
   authoritative:** if the author — a strong engineer — stalls on a term, it is NOT bucket-1, no matter how
   field-native it looks to you. Your "a reviewer probably knows it" does not override a real reader's "wtf is that."
2. **GLOSS-ONCE-OR-CUT — methodology / stats / philosophy-of-measurement shorthand foreign to the paper's field.**
   The LLM grader waves these through because *it* knows them, but they aren't native to the venue's reviewers as
   prose: `construct validity`, `existence result`, `declared scope`, `orthogonal`, `null` (=no effect), `TOST`,
   `coarse`, `net-cancel`, `re-derivation`, `modal` (=most common), `Bonferroni`. Gloss in plain words at first
   use, or cut.
3. **RENAME — labels the authors COINED that brand instead of describe** (sound like marketing, mean nothing to the
   reader): `robust coverage` → *coverage under evasion*; `honest residue` → *what still gets through*; a "corner"
   / "split" / "axis" used before it's shown. Test: **did we invent this label, and does it describe the thing or
   just brand it?** If it brands, make it say the thing.

**The failure is the reader STALLING or getting BORED — not fancy words per se.** A paragraph with zero jargon can
still be a wall: a **comma-list of mechanism steps where a story belongs** (the reader can't find the point through
the enumeration — e.g. a guard described as "resolves quoting, reduces the interpreter to its basename, strips a
backslash head, canonicalizes flag aliases, expands \$HOME…" instead of "it strips the disguises so every spelling
of `rm -rf` collapses to one"), a triple-nested-em-dash sentence you parse twice, or a dutiful flat paragraph.
**Fix by leading with the plain story in 1–2 sentences, THEN the precise mechanism/term — never the reverse.**
(the author's rule: don't open on the spec sheet.) When unsure which bucket a term is in, ask: *would a reviewer at THIS
venue use it, or is it imported from stats/philosophy/our own coinage?*

**De-jargon is RE-VOICING the sentence, not swapping the word.** Replacing a coined term with a plainer noun inside
an otherwise stiff academic sentence leaves the sentence academic — the reader still stalls on the *register*, not
just the word (GateBench 2026-07-25: a term-level de-jargon pass cleared the flagged words but the author still hit
sections "way too academicy for 0 reason"). The fix: rewrite the whole SENTENCE the way you'd say it to a colleague
at a whiteboard — subject–verb–object, active voice, one clause, contractions fine, no nominalizations ("performs
an evaluation of" → "checks"). **Read each rewritten sentence ALOUD: if you'd never say it that way to a person,
it's still academic.** E.g. "We therefore position the guard as a defense against trigger~A and a measurement
instrument, not an injection defense" → "So the guard is there to catch accidents and to measure the problem — it
is not built to stop an attacker." A word-swap that leaves the academic sentence shape is a HALF-fix; the
deliverable is plain-spoken sentences, and a de-jargon/tighten pass is not done until the prose reads spoken.

**Step 0 — mechanical pre-scan (BEFORE reading, so the pass can't rubber-stamp).** Run the coined-compound
grep from the avoid-list against the source and add EVERY hit to the stall inventory as a candidate; grep the
named avoid-list terms too. This is the FLOOR the repeated 44/60 mis-grades kept falling through — a persona
that "reads and feels" keeps waving these past because the model knows them. The persona's real job is to ADD
what a regex can't see (walls, boredom, read-twice sentences, a coinage used before it's defined), not to
re-discover terms a grep already finds. **A hyphenated coinage or a listed avoid-term that survives to the
final draft unglossed is a FAIL of this pass, full stop — not a "minor" left for later.**

**Run it as a linear cold read**, start to finish. Every time that reader would stop, log a stall. Trigger on:
- **Gloss-or-die: any academic/technical term used without a plain-words gloss at first use.** These are the
  ones LLM graders wave through because they know them — flag every one: `Bonferroni`, `construct validity`,
  `null` (meaning "no effect"), `ablation`, `TOST`, `coarse`, `orthogonal`, `monotone`, `a priori`,
  `first-class` (as jargon), an unexpanded acronym (`MCP`, `CI` on first use), or a **coined handle used before
  it's defined** ("the corner", "the split", "output-share bound", "the input-dominance fact our audit
  presupposes"). Rule: **gloss in plain words at first use, or cut.** A coined handle is fine *once glossed*.
- a **bare number with no source on the page** — "where did 31.7% come from?", a naked p-value;
- **"what am I looking at?"** — a table cell needing a dagger legend, a figure whose caption isn't self-contained;
- a **sentence you had to read twice** to parse (usually an em-dash-nested composite);
- **boredom** — a paragraph the reader skims because it's dutiful and flat. Boring is a defect, not a neutral.

**No paragraph is exempt — and Related-Work / "grounding" citation clusters are the WORST jargon nests.**
A sentence like "grounded in construct-validity and benchmarking-pitfall work [4,10,20]" stacks field terms
to sound rigorous and is exactly where a de-jargon pass tends to skip (it "looks like citations"). Sweep it
like everything else: gloss or kill each term. **A term glossed once and then reused unglossed pages later is
still a stall on reuse** — the reader can't hold a definition from three pages ago; prefer the plain wording
every time over relying on an earlier gloss (`construct validity` recurring = fix it everywhere, not once).

**Each stall:** location → the exact trigger (quote it) → the reader's question → the one-line fix
(gloss / define / cut / move / add a source). The **stall inventory is the deliverable** — hand it straight to
a fix pass.

**Stall density HARD-CAPS the score (mechanical, not "considered").** A paper the target reader stalls on every
paragraph is NOT "above average," however correct or clean-sentenced. Apply as a ceiling:
- **> 1 stall/page → Jargon (#6) ≤ 2.**
- **> 2 stalls/page → Jargon ≤ 2, Prose (#5) ≤ 2, and Landing (#7) ≤ 3.**
- **A row of 4s on a paper with > 2 stalls/page is a MIS-GRADE — you read as an expert, not the target
  reader. Re-run the pass demoting your expertise.** Report stalls/page next to the scorecard; if it exceeds
  these thresholds and the dimension scores don't reflect the cap, the grade is wrong.

**Why this pass UNDER-FIRES in practice — and how to make it bite.** Cautionary case (2026-07 AISec paper): the
blind panel scored it 44/60 and called the remaining walls "minor," yet the author — a real non-expert reading
linearly — hit ~15 WTF stalls it had waved through (`exfiltrate`-adjacent terms, `robust coverage`, `honest
residue`, `held-out`, a spec-sheet mechanism paragraph, `construct validity`, `existence result`). **Root cause:
a frontier LLM cannot authentically stall — it knows every term, so "did *I* stop and go 'what's that'?"
systematically under-counts. "Demote your expertise" only half-works.** Remedies:
- **Count stalls MECHANICALLY, not by felt confusion.** Auto-stall regardless of whether you understand it:
  (1) any bucket-2 methodology term unglossed at first use; (2) any bucket-3 coined label — a metric or heading
  name the authors invented (`robust coverage`, `honest residue`); (3) any **comma-list of ≥3 mechanism steps**
  standing in for a story; (4) any run-in heading that's cute rather than descriptive. These fire by
  pattern-match, so the count no longer depends on the grader's knowledge.
- **Walls and spec-sheets HARD-FAIL — never "minor."** "Minor walls left" is the signature of a mis-grade: a
  wall's fix is cheap and mandatory, so an un-fixed wall caps Prose/Landing — it does not get a pass because the
  sentences around it are clean.
- **The LLM pass is a PROXY that under-fires by design; the ground truth is a human linear read.** Budget for one
  (the author, or a deliberately WEAKER model that actually lacks the vocabulary and so stalls like a human). When
  a human read surfaces stalls the LLM missed, that is a **skill miss, not just a paper bug** — feed the specific
  terms back into the Register-calibration buckets so the next paper never ships them.

## The claim-preservation diff (`claims`) — mandatory after EVERY rewrite
**Owner of the `claims` scorecard row.** A rewrite/de-jargon/readability pass is NOT done until an
adversarial claim-preservation diff clears it. Rewording is a claim-integrity RISK, not a cosmetic
edit: it silently drops hedges, flips "no *detectable* change" into proven-zero, restates a bounded
result as an absolute, and re-breaks numbers. A real Fable diff-check caught three that readability
passes *introduced* — a heading ("Deny-globs that never match") contradicting its own body ("rarely
match, median 1/10"); "both estimates point to no saving **at all**" (proven-zero overclaim); and
"with correctness **held fixed**" (overstating a gate the paper itself calls shallow).

**The check:** after ANY rewrite pass, run an adversarial diff (Fable or equivalent) over the
before/after that verifies — **no number moved, no hedge dropped, no claim strengthened, no new
absolute, no self-contradiction with unchanged text.** Pair every readability/fix pass with this
check; the pass isn't complete without it, and the `claims` row in `PIPELINE-STATUS.md` records the run.
`grade-paper-writing` runs it after applying its sentence fixes; `harden-paper` gates on it
(claims-honest gate).

## The wall-of-text check (visual density — distinct from stall density)
Stall density is about COMPREHENSION (unglossed terms, sourceless numbers). This is about the EYE: a
paragraph so long and unbroken the reader slides off it before reading a word. The classic offender is a
Related-work or Discussion section dumped as one 30+-line block covering a dozen works. Rules:
- **A paragraph running >~15 source lines / ~150 words, or covering >3 distinct sub-points, is a wall —
  break it.** Split into 2–4 chunks, each led by a **bold or italic run-in sub-head** that names its theme
  (`\textbf{Denylist fragility.}`, `\emph{Syntax vs.\ intent.}`), exactly as the section's other paragraph
  heads do. This costs ~no length and transforms scannability.
- **Every long section needs visual separators** — run-in heads, paragraph breaks, or bullets — never one
  undifferentiated block. Related work, Discussion, and Threats are the usual offenders.
- **Watch orphaned run-in heads:** a bold head must not dangle alone at the bottom of a column/page with its
  content overleaf — keep it with its first sentence (no paragraph break immediately after a standalone head).
- **Mechanical signal (grep-able):** flag any paragraph in the source exceeding ~15 lines / ~150 words. A wall
  caps dimension #4 no matter how good the individual sentences are.
- **Session-earned:** GateBench's "Concurrent agent-safety work" block was one 38-line wall of ~11 works;
  broken into 3 run-in-headed groups (syntax-vs-intent / guard-failure / capability-scoping) it became
  scannable at zero length cost.

## The conclusion & quotability check (the two surfaces authors under-invest)
The **abstract** and the **conclusion** are the two most-read, most-quoted surfaces of a paper — and the
conclusion is the one authors most often leave as a limp restatement. Grade both explicitly; this is the
axis that catches "the conclusion isn't strong enough."

- **Conclusion — does it PAY OFF, or just summarize?** A 5 conclusion (a) states the finding in the plainest
  possible language (a non-researcher gets it), (b) names the real-world stakes / who should care, (c) points
  *past* the result — the uncomfortable implication or the better direction (framed as a call, not an
  unproven claim), and (d) **gives the reader something to DO** — a concrete directive/takeaway, not "we
  release X." A conclusion that only recaps results is a **2**. Ask: what should the reader *do differently*
  on Monday after reading this?
- **Quotability — is there a line that travels?** The abstract needs one extractable sentence; the conclusion
  needs one. Test: could a reader paste it onto a talk slide or into a post and it still lands, standing
  alone? If every sentence is a hedged composite, there is nothing to quote — flag it as a miss and draft the
  candidate line. (Complements `harden-paper`'s citability axis, which coins the handle / stat that gets cited.)
- **The money-line must be the LAST sentence, ISOLATED, and liftable VERBATIM.** "Is there a quotable line
  somewhere" is not enough — the commonest real miss is a genuinely quotable CORE buried inside a clause-heavy
  closer with a preamble, so a reader can't copy it without trimming. Session example (GateBench 2026-07-25, the
  author had to hand-extract it): *"For unattended agents at scale, enterprises most of all, a copied
  string-matcher is not a safety layer but a liability shaped like one"* — the core ("a copied string-matcher is
  a liability shaped like one, not a safety layer") is strong but not liftable as-is. **Mechanical rule: the
  paper must END on ONE short standalone sentence** — no leading "For X, Y most of all," preamble, no
  comma-spliced second idea — that a reader copies onto a slide unedited, sitting on **its own line (its own
  short paragraph)**. Test the LAST sentence specifically: if it carries a subordinate-clause preamble or two
  independent clauses, it is NOT yet the money-line — split the quote off and make it the final sentence.
- **Session-earned example:** the GateBench conclusion went from a weak results-recap to: the plain theater
  call-out ("checking spelling, not meaning"), a coined verdict a reader can quote ("a copied string-matcher
  is not a safety layer but a liability shaped like one"), a direction past the result ("cannot be
  *expressed*, not merely caught after the fact"), and a reader directive ("before you trust a hook to guard
  an unattended agent, make it clear more than one disaster").

## The avoid-list — words that read as slop or stall a human (flag every hit)
The north star: **a paper should be engaging and human-readable — write for a smart non-specialist who will
read it willingly, not to sound academic.** The test (the author's 10-second rule): would a strong engineer who is
NOT a researcher get this sentence in 10 seconds? If not, it's too dense. The jargon dimension (#6) and the
stall pass are the judgment; the list below is the *checkable* part (prose isn't policy — compile what's
mechanical). These are **scrutinize-words, not absolute bans** (some are legit in context — "significant" for
a real stat, "method"); on every hit, ask "does this earn its place, or is it slop / hype / a reader-stall?"
and cut or replace. During grading, **grep for these and report hits with line numbers.**

- **Web / blog slang — never in an academic paper:** `listicle`, `clickbait`, `deep dive`, `game-changer`,
  `supercharge`, `unpack` (as metaphor), `in the weeds`, `at the end of the day`, `10x`, `roundup`, `vibe`.
  → say the plain thing (`listicle` → `list`).
- **Empty academic filler — cut or shrink:** `it is important/worth noting that`, `it should be noted`,
  `in order to`→`to`, `utilize`→`use`, `a plethora/myriad of`→`many`, `facilitate`→`let/help`,
  `due to the fact that`→`because`, `the fact that`, `methodology`→`method` (unless you mean the study *of*
  methods), `in this work we…` opening every paragraph.
- **Hype / vague intensifiers — delete unless earned:** `very`, `really`, `quite`, `vast`, `massive`,
  `seamless`, `powerful`, `cutting-edge` / `state-of-the-art` as filler, `robust` (overused),
  `significantly` (only if it's a statistical result), `novel` (SHOW novelty, don't assert it).
- **Insider shorthand with no gloss** (overlaps the stall pass): any acronym not expanded at first use, any
  internal code-name / project nickname. → expand or gloss on first use, or drop.
- **Coined compound-adjectives — the paper's OWN hyphenated coinages that brand instead of describe.** This is
  the class that slipped an ENTIRE grade + persona + tighten pass on GateBench (2026-07-25), after which the
  author read it cold and hand-flagged ~30: `category-spanning`, `non-adaptive`, `scope-bounded`,
  `operation-targeting`, `learned-family`, `obfuscation-crafting`, `privilege-control`, `ten-intent`,
  `spelling-versus-effect`, `wrapper-prefix`, `control-plane`, `low-false-positive corner` — plus single-word
  coinages `held-out` (→ "fresh, written after the fact and never tuned against"), `oracle` (→ "answer key"),
  `adapter` (→ the plain allow/deny interface), `transcribe` (→ "copy out by hand"), `textbook X` (→
  "well-known X"), `incident-grounded` (→ "based on a real incident"), `flatters` (→ "makes … look better than
  it is"). **Mechanical pattern rule: treat EVERY paper-invented hyphenated `\w+-\w+` compound as a stall
  unless it is plain English a non-academic would say unprompted.** They read as branding; make them say the
  thing (`operation-targeting rules` → "rules aimed at what the command does"). Seed the stall inventory with:
  `grep -noE '\b[a-z]+-[a-z]+(ing|ed|bound|based|family|control|targeting|spanning|adaptive|intent)\b' paper.tex`
  then rule each hit in or out — the grep is the floor, the persona adds what the regex can't see.

When adding a new coined handle of your own (a good thing — citability), that is NOT slop: it's earned jargon
IF glossed in plain language at first use. The line is *glossed-for-the-reader* vs *stacked-to-sound-rigorous*.
(A coined handle used as the paper's headline term — `GateBench`, `keyword theater` — is fine; a coined
*compound-adjective sprinkled through the prose* — `operation-targeting`, `scope-bounded` — is the slop.)

## Paper vs artifact — where numbers live (the concrete fix for stat-density)
A measurement paper drowns the reader when every secondary result is inline. The artifact reproduces every
number, so the paper does not have to print them all — divide the labor:
- **In the paper:** the handful of HEADLINE numbers the thesis rests on, plus the inferential stat that
  backs each HEADLINE claim (a security/measurement reviewer wants the key p-value / CI / effect size *on
  the page* — moving those out reads as hiding). Exactly ONE memorable number in the abstract.
- **In the artifact:** the exhaustive tables — per-item breakdowns, full sweep grids, ablation cells,
  secondary p-values — cited as "the artifact reports X (Table Y)." A number that supports only a
  *secondary* point lives there, not inline.
- **Test:** if a sentence carries 3+ numbers and only one is load-bearing, push the rest to the artifact.
  This is the concrete fix when Abstract / Prose / Figure score low for stat-density — it is not hiding
  (the artifact is public and recomputes them), it is letting the reader see the point.
Cross-ref: `build-benchmark` (the artifact that holds the numbers) · `draft-paper` (the drafting decision).

## The 5 highest-leverage do/don'ts
1. **DO lead with the concrete crazy instance, not the aggregate stat** (Carlini's UUID).
2. **DO manufacture the "wait, what?" pivot** — surface the held assumption, then break it (Greshake).
3. **DO write the intro as the SPJ arc + a bulleted, forward-referenced contributions list**; kill the "organized as follows" roadmap.
4. **DON'T imitate Attention-style dense contribution-less prose** unless the audience already cares.
5. **DON'T stack jargon or hedges** — gloss every term plainly at first use; replace hedge-piles with one
   precise scope sentence; land one repeatable moral (Trusting Trust).

## Sources
Peyton Jones (great-research-paper) · McEnerney (Craft of Writing Effectively) · Gopen & Swan (Science of
Scientific Writing) · Zobel (Writing for Computer Science) · exemplars: Attention Is All You Need
(arXiv 1706.03762), Reflections on Trusting Trust (Thompson 1984), indirect prompt injection
(arXiv 2302.12173), Extracting Training Data from LLMs (arXiv 2012.07805), MapReduce (OSDI 2004).
