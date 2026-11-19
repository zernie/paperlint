# Writing-craft reference — how well-written papers actually read

Grounding for `draft-paper`, `rewrite-unclear` and `tighten-paper`. Distilled from the canonical
craft sources + an honest dissection of exemplar papers (writing craft only, not scientific impact).
The point: grade a draft's _prose and structure_ against how the best-written papers do it, not against
taste. Especially for the failure mode "a wall of text and jargon that doesn't drive home how crazy the
situation is."

## The three moves that make a human care (the core finding)

The most-cited papers are NOT uniformly the best-written — _Attention Is All You Need_ is famous-but-terse
and wins only because its audience already cared. The papers that actually **make a reader care** —
_Reflections on Trusting Trust_, indirect-prompt-injection (Greshake), training-data-extraction (Carlini)
— all share three moves. This trio is the direct cure for "wall of text":

1. **Open on a problem/assumption the reader already holds** (not background, not a topic tour).
2. **Break it with the single most visceral concrete instance** (not an aggregate statistic).
3. **Land one repeatable sentence** the reader will quote to a colleague.

## Canonical craft rules

### Simon Peyton Jones — _How to Write a Great Research Paper_

- **One key idea.** The reader should be able to state it in a sentence. Don't dilute with five half-ideas.
- **Tell a story — the intro arc:** _problem → it's an interesting problem → it's an unsolved problem →
  here is my idea → my idea works._ This is the canonical intro skeleton.
- **Intro ≈ one page**, doing two things fast: (1) the problem via a concrete example in ~sentence 1;
  (2) contributions as a **bulleted list with forward references** ("we do X (§3)").
- **Contributions are "molecules, not atoms"** — refutable, specific claims, not vague ("we studied X").
- **Do NOT write "the rest of this paper is organized as follows."** The forward-referenced bullets do it better.
- **Related work goes at the END**, not after the intro — early, it's a wall before the reader knows why to care, and reads as defensive.
- **The reader is the only person who matters.** Convey the idea; don't recite what you did.
  Sources: simon.peytonjones.org/great-research-paper · microsoft.com/en-us/research/academic-program/write-great-research-paper

### Larry McEnerney — _The Craft of Writing Effectively_

- **Writing creates VALUE for a community of readers — it is not a record of your thinking.** The job is to
  change what the reader believes about the world, not to explain what you did.
- **Clear ≠ good.** "Clear and useless = useless." Value first; clarity only matters in service of value.
- **The reader is expensive to move** — busy, skeptical experts. Every sentence must earn the next.
- **The "so what / who cares" test** — before a claim earns space, it must resolve an instability _this
  community_ cares about.
- **Frame around a problem/instability, not a foundation.** Reject the martini-glass (broad→narrow→broad)
  and the topic-then-background opening; open by exposing a problem the reader already feels, and create tension.
- **Use the community's code-words** deliberately (for security-measurement: "threat model," "attack
  surface," "false-negative," "real-world," "at scale") — they signal "this is for you."
  Sources: robincussol.com/the-craft-of-writing-effectively-summary · singjupost.com transcript

### Gopen & Swan — _The Science of Scientific Writing_ (sentence mechanics)

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

Five famous papers read for craft, with what to imitate and what not: `docs/design/writing-exemplars.md`
in the package.

## Ten dimensions of how a paper reads (anchors 1–5), most-severe first

For the "wall of jargon" failure mode, **weight #5 Prose, #6 Jargon, #7 Landing-the-point ×2**; for the
"blog post" failure mode, **weight #10 Register ×2** as well. Score each, name the offending
sentence/section, write the fix. Dimensions #1–#9 push toward plain and memorable; #10 is the floor
under them — a fix that raises one of them by leaving the venue's register lowers #10, and the
grade says so.

1. **Title — value + memorability.** 1 = generic topic label, forgettable. 5 = states the finding or the
   reader's benefit and is quotable; repeatable after one read.
2. **Abstract — context→gap→approach→result→meaning, with ONE number.** 1 = stat-wall/method-dump, no gap,
   no "so what." 5 = five moves in ≤5 sentences, one memorable result, a line the reader remembers.
3. **Intro architecture — problem/why-care/contribution/evidence, fast.** 1 = background/lit-tour, point
   arrives on page 2–3. 5 = SPJ arc in the first half-page + a bulleted, forward-referenced contributions list.
4. **Structure & signposting (incl. visual density).** 1 = arbitrary order, paragraphs open mid-thought,
   no signposting between claims (the reader must infer how one claim relates to the next), OR a wall — one giant unbroken paragraph the reader's eye slides off. 5 = each
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
10. **Register distance to the target venue — graded against 2–3 accepted papers of that venue (or its
    parent conference), never against the exemplars above.** 1 = reads as another genre: aphorisms and
    punchline closings, fragments, colloquial asides, claims with no stated owner, relations between
    claims left for the reader to infer. 5 = a reviewer at the venue could not tell it from the
    reference papers by register: results owned (_we measured_, a citation, a named population),
    relations signposted (_therefore_, _in contrast_, _this section_), sentences complete. Every flag
    quotes the reference sentence it was compared against. No reference papers → not graded, and the
    report says so; this dimension is never scored from memory.

## The cold-read stall pass (the "wait, what does that even mean?" axis)

The stall pass has one owner: `cold-read-diff`, with `--whole` over the whole paper; the two
readers' prompts have one owner, `skills/cold-read-diff/scripts/readers.ts`. Rewrites of what it finds:
`rewrite-unclear`. Kept here: the term buckets below.

### Register calibration — which terms to KEEP vs kill (the hard balance)

"Flag every term the reader wouldn't get in 5 seconds" is too blunt on its own: applied literally it strips the
**field-native vocabulary that makes a paper read as competent to its reviewers**, and glossing those reads as
naïve. The reader is a strong engineer _in the paper's own field_ — **not a layperson and not a cross-field
methodologist.** Sort every candidate term into three buckets:

1. **KEEP — field-native terms a reviewer at THIS venue uses without thinking.** Glossing them wastes words and
   signals you don't know the field. _Security venue:_ `exfiltrate`, `PreToolUse`, `AST`, `false positive`,
   `supply-chain`. _Benchmark venue:_ `held-out`, `baseline`, `ablation`. Test: **would a reviewer at
   this venue type this word in their own review?** If yes, keep it (gloss at most once if borderline, then move on).
   **Bucket-1 is NARROW — be strict, when in doubt it's bucket 2.** The failure mode (real: `fnmatch` slipped through
   this list as a "keep" and the author stalled on it) is calling a **library/function/POSIX name** field-native
   because it's _plausibly_ known. Test harder: not "might a reviewer know it?" but "would they type it _unglossed_
   in prose?" A libc function (`fnmatch`), a specific syscall, a niche flag — usually **NO**; it's artifact/detail,
   so gloss-or-cut (often just cut the name: "matches the glob" beats "an `fnmatch` bound"). **The AUTHOR's stall is
   authoritative:** if the author — a strong engineer — stalls on a term, it is NOT bucket-1, no matter how
   field-native it looks to you. Your "a reviewer probably knows it" does not override a real reader's "wtf is that."
2. **GLOSS-ONCE-OR-CUT — methodology / stats / philosophy-of-measurement shorthand foreign to the paper's field.**
   The LLM grader waves these through because _it_ knows them, but they aren't native to the venue's reviewers as
   prose: `construct validity`, `existence result`, `declared scope`, `orthogonal`, `null` (=no effect), `TOST`,
   `coarse`, `net-cancel`, `re-derivation`, `modal` (=most common), `Bonferroni`. Gloss in plain words at first
   use, or cut.
3. **RENAME — labels the authors COINED that brand instead of describe** (sound like marketing, mean nothing to the
   reader): `robust coverage` → _coverage under evasion_; `honest residue` → _what still gets through_; a "corner"
   / "split" / "axis" used before it's shown. Test: **did we invent this label, and does it describe the thing or
   just brand it?** If it brands, it is a stall; the new name comes from `rewrite-unclear`.

## The claim-preservation diff (`claims`) — mandatory after EVERY rewrite

**Owner of the `claims` scorecard row.** A rewrite/de-jargon/readability pass is NOT done until an
adversarial claim-preservation diff clears it. Rewording is a claim-integrity RISK, not a cosmetic
edit: it silently drops hedges, flips "no _detectable_ change" into proven-zero, restates a bounded
result as an absolute, and re-breaks numbers. A real Fable diff-check caught three that readability
passes _introduced_ — a heading ("Deny-globs that never match") contradicting its own body ("rarely
match, median 1/10"); "both estimates point to no saving **at all**" (proven-zero overclaim); and
"with correctness **held fixed**" (overstating a gate the paper itself calls shallow).

**The check:** after ANY rewrite pass, run an adversarial diff (Fable or equivalent) over the
before/after that verifies — **no number moved, no hedge dropped, no claim strengthened, no new
absolute, no self-contradiction with unchanged text.** Pair every readability/fix pass with this
check; the pass isn't complete without it, and the `claims` row in `PIPELINE-STATUS.md` records the run.
`rewrite-unclear` runs it after every rewrite (its step 4); `harden-paper` gates on it
(claims-honest gate).

## The wall-of-text check (visual density — distinct from stall density)

Stall density is about COMPREHENSION (unglossed terms, sourceless numbers). This is about the EYE: a
paragraph so long and unbroken the reader slides off it before reading a word. The classic offender is a
Related-work or Discussion section dumped as one 30+-line block covering a dozen works. Rules:

- **A paragraph `tex/max-paragraph-words` reports, or covering >3 distinct sub-points, is a wall —
  break it.** Split into 2–4 chunks, each led by a **bold or italic run-in sub-head** that names its theme
  (`\textbf{Denylist fragility.}`, `\emph{Syntax vs.\ intent.}`), exactly as the section's other paragraph
  heads do. This costs ~no length and transforms scannability.
- **Every long section needs visual separators** — run-in heads, paragraph breaks, or bullets — never one
  undifferentiated block. Related work, Discussion, and Threats are the usual offenders.
- **Watch orphaned run-in heads:** a bold head must not dangle alone at the bottom of a column/page with its
  content overleaf — keep it with its first sentence (no paragraph break immediately after a standalone head).
- **Mechanical signal:** `tex/max-paragraph-words` counts it (opt-in, `docs/rules/tex/max-paragraph-words.md`). A wall
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
  _past_ the result — the uncomfortable implication or the better direction (framed as a call, not an
  unproven claim), and (d) **gives the reader something to DO** — a concrete directive/takeaway, not "we
  release X." A conclusion that only recaps results is a **2**. Ask: what should the reader _do differently_
  on Monday after reading this?
- **Quotability — is there a line that travels?** The abstract needs one extractable sentence; the conclusion
  needs one. Test: could a reader paste it onto a talk slide or into a post and it still lands, standing
  alone? If every sentence is a hedged composite, there is nothing to quote — flag it as a miss. (Complements `harden-paper`'s citability axis, which names the stat that gets cited.)
- **A line written to be quoted is held to rubric #10:** an aphorism or a punchline closing scores 1 there,
  and its literal claim comes from `rewrite-unclear` (rule 2).

## The avoid-list — words that read as slop or stall a human (flag every hit)

The north star: **a paper should be readable by a smart non-specialist AND read as a paper at its venue —
plain where plainness costs nothing, academic where the register expects it.** Two tests, both apply: would a
strong engineer who is NOT a researcher get this sentence in 10 seconds? If not, it's too dense. Would it sit
unremarked in one of the venue's accepted papers (dimension #10)? If not, it's too loose — a replacement that
passes the first test by failing the second is not a fix. The jargon dimension (#6) and the
stall pass are the judgment; the list below is the _checkable_ part (prose isn't policy — compile what's
mechanical). These are **scrutinize-words, not absolute bans** (some are legit in context — "significant" for
a real stat, "method"); on every hit, ask "does this earn its place, or is it slop / hype / a reader-stall?"
and cut or replace. During grading, **grep for these and report hits with line numbers.**

- **Web / blog slang — never in an academic paper:** `listicle`, `clickbait`, `deep dive`, `game-changer`,
  `supercharge`, `unpack` (as metaphor), `in the weeds`, `at the end of the day`, `10x`, `roundup`, `vibe`.
  → say the plain thing (`listicle` → `list`).
- **Empty academic filler — cut or shrink:** `it is important/worth noting that`, `it should be noted`,
  `in order to`→`to`, `utilize`→`use`, `a plethora/myriad of`→`many`, `facilitate`→`let/help`,
  `due to the fact that`→`because`, `the fact that`, `methodology`→`method` (unless you mean the study _of_
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
IF glossed in plain language at first use. The line is _glossed-for-the-reader_ vs _stacked-to-sound-rigorous_.
(A coined handle used as the paper's headline term — `GateBench`, `keyword theater` — is fine; a coined
_compound-adjective sprinkled through the prose_ — `operation-targeting`, `scope-bounded` — is the slop.)

## Paper vs artifact — where numbers live (the concrete fix for stat-density)

A measurement paper drowns the reader when every secondary result is inline. The artifact reproduces every
number, so the paper does not have to print them all — divide the labor:

- **In the paper:** the handful of HEADLINE numbers the thesis rests on, plus the inferential stat that
  backs each HEADLINE claim (a security/measurement reviewer wants the key p-value / CI / effect size _on
  the page_ — moving those out reads as hiding). Exactly ONE memorable number in the abstract.
- **In the artifact:** the exhaustive tables — per-item breakdowns, full sweep grids, ablation cells,
  secondary p-values — cited as "the artifact reports X (Table Y)." A number that supports only a
  _secondary_ point lives there, not inline.
- **Test:** when `tex/max-paragraph-numbers` reports a paragraph and only one of its numbers is load-bearing, push the rest to the artifact.
  This is the concrete fix when Abstract / Prose / Figure score low for stat-density — it is not hiding
  (the artifact is public and recomputes them), it is letting the reader see the point.
  Cross-ref: `build-benchmark` (the artifact that holds the numbers) · `draft-paper` (the drafting decision).

## The 5 highest-leverage do/don'ts

1. **DO lead with the concrete crazy instance, not the aggregate stat** (Carlini's UUID).
2. **DO manufacture the "wait, what?" pivot** — surface the held assumption, then break it (Greshake).
3. **DO write the intro as the SPJ arc + a bulleted, forward-referenced contributions list**; keep an
   "organized as follows" paragraph only when the venue's accepted papers carry one.
4. **DON'T imitate Attention-style dense contribution-less prose** unless the audience already cares.
5. **DON'T stack jargon or hedges** — gloss every term plainly at first use; replace hedge-piles with one
   precise scope sentence; land one repeatable moral (Trusting Trust).

## Sources

Peyton Jones (great-research-paper) · McEnerney (Craft of Writing Effectively) · Gopen & Swan (Science of
Scientific Writing) · Zobel (Writing for Computer Science) · exemplars: Attention Is All You Need
(arXiv 1706.03762), Reflections on Trusting Trust (Thompson 1984), indirect prompt injection
(arXiv 2302.12173), Extracting Training Data from LLMs (arXiv 2012.07805), MapReduce (OSDI 2004).
