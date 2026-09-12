---
title: "Occupancy research — deterministic prose/readability checkers vs. semantically-opaque-but-simple prose"
created: 2026-08-06
tags: [occupancy-research, prose-linting, readability, paper-pipeline, cold-read, vale, textlint, retext, proselint, coh-metrix, coreference]
---

# Occupancy research: does any shipped checker catch "short, grammatical, correct — parseable only if you already know the idea"?

## Headline finding (read this first)

**No shipped deterministic tool detects the actual defect.** Every mechanical checker in this
space — Vale, textlint/retext, proselint, write-good, alex, LanguageTool, Hemingway, Grammarly,
Acrolinx, every readability formula (Flesch-Kincaid, Gunning Fog, SMOG, Coleman-Liau, ARI,
Dale-Chall, Lexile) — measures **surface form**: word length, syllable count, sentence length,
passive voice, a fixed word/phrase blocklist. None of them model **whether the reader already
holds the referent the sentence assumes**. The literature has a name for the thing that would be
needed — cohesion/coherence modeling, entity-grid coreference tracking (Barzilay & Lapata 2008)
— and it exists only as academic research code (one toolkit, "Cohere," built for corpus
evaluation, not as a linter you run on a draft) and inside Coh-Metrix (a research instrument,
not a red/green pass-fail checker). **Nothing in this space ships as "flag this sentence, a
reader without your mental model cannot parse it."**

I verified this empirically, not just by reading docs — I ran the actual tools (proselint,
write-good, retext-readability via textstat/npm, all installed and executed in this session)
against the six sentences below. Results are in the table at the end. The one mechanical thing
that *does* fire — sentence-length/clause-count thresholds — only catches sentence 6 (the long,
syntactically loaded one). Sentences 1–5, the ones a human immediately called "wtf" / "what" /
"VAGUE AF", passed every tool at every reasonable threshold. The only way one of them lit up at
all was setting retext-readability's target age to 6 years old — at which point it also flags
ordinary adult prose indiscriminately, so that's not a usable signal either.

This matches the author's own report: the homegrown `prose-lint.mjs` and the LLM-persona grader
don't catch this because **no comparable tool in the wild catches it either** — this is not a
gap specific to the homegrown implementation, it's a gap in the entire deterministic-checker
category. What's needed for these six sentences is a reader (human or LLM) simulating "I don't
already know what 'the rule' claims about itself" — i.e., exactly the `cold-read-diff` /
persona-stall pattern already in this pipeline, not a metric.

---

## The test set (verbatim, as given)

1. *"The state to remove is therefore not the rule but its claim about itself"* — reaction: "wtf"
2. *"these files are filled with constructions nobody built"* — "wtf"
3. *"Three answers, all of them after the fact"* (section heading) — "VAGUE AF"
4. *"§4.4 invites the suspicion that the resolver guesses"* — "what"
5. *"The only part that reads English is the one not allowed to decide anything. It proposes; the other two dispose."* — "needs full rewrite confusing af"
6. A sentence carrying six separate factual claims joined by dashes/semicolons (exact original
   text not given to me — I constructed a representative stand-in of the same shape for testing:
   *"The audit found six problems: the config was stale, the hook silently no-ops on error, the
   guard reads a variable the harness never sets, the fallback path was never tested, the log
   rotates before anyone reads it, and the alert fires into a channel nobody watches."* — this is
   a **reconstruction**, not the original, flagged so it isn't mistaken for a quote later.)

### Empirical readability numbers (textstat 0.7.13, run locally)

| # | words | Flesch reading ease | FK grade | Gunning Fog | Coleman-Liau | ARI | Dale-Chall |
|---|---|---|---|---|---|---|---|
| 1 | 14 | 83.9 (easy) | 5.0 | 5.6 | 6.5 | 5.8 | 6.6 |
| 2 | 8 | 71.8 (fairly easy) | 5.2 | 8.2 | 14.6 | 10.8 | 10.0 |
| 3 | 8 | 93.0 (very easy) | 2.3 | 3.2 | 4.4 | 3.2 | 6.0 |
| 4 | 9 | 56.7 (fairly difficult) | 7.6 | 8.0 | 13.1 | 10.3 | 14.6 |
| 5 | 20 (2 sent.) | 69.8 (fairly easy) | 6.0 | 6.0 | 7.1 | 5.2 | 7.3 |
| 6 | 46 | 29.6 (difficult) | **20.6** | **20.1** | 10.2 | **24.0** | 12.1 |

Every published deterministic tool's threshold for "flag this" lives in the FK-grade-8-to-12 /
Flesch-under-50 range. On that basis: sentences 1, 2, 3, 5 are **invisible** to every formula in
this table — grade level 2 to 7, "easy" to "fairly easy." Sentence 4 sits right at a common
threshold (grade 7.6, Flesch 56.7) — borderline, would fire on strict configs, not on defaults.
Sentence 6 blows every ceiling (grade 20+) purely because it's long, not because of the six-claims
structure specifically — a single 46-word sentence about anything would trip the same alarm.

---

## Tool-by-tool

### Vale (errata-ai)

**What it is:** The dominant open-source prose linter. Config-driven (YAML rules organized into
"styles"), CI-native, markup-aware (Markdown/AsciiDoc/reST/HTML). [github.com/errata-ai/vale](https://github.com/errata-ai/vale)

**Alive?** Yes, actively maintained — latest release **v3.17.1** (Aug 2024), with a steady
release cadence through 2024 and 5.7k GitHub stars; no signs of abandonment as of this research.

**Rule mechanics:** Rules extend one of several check types — `existence`, `substitution`,
`occurrence`, `repetition`, `consistency`, `conditional`, `capitalization`, `sequence`, and
**`readability`**. `existence`/`substitution` are regex-over-tokens; they can absolutely match
"N semicolons in one sentence" or "3+ commas in one sentence" as a proxy for clause count — but
this is a **structural/punctuation proxy**, not a semantic one, and I found no shipped Vale style
(Microsoft, Google, Red Hat, write-good port, Joblint) that actually ships such a rule. Someone
*could* author one; nobody has.

**Does it ship a readability rule?** Yes — `extends: readability`, config example:
```yaml
extends: readability
message: "Content must be readable at 6th grade level (current: %s)"
level: error
grade: 6
metrics:
  - Flesch-Kincaid
  - Coleman-Liau
```
It supports Flesch-Kincaid, Coleman-Liau, and other classic formulas (implementations live in
[github.com/errata-ai/readability](https://github.com/errata-ai/readability)), averaging across
whichever metrics you list. **Critical limitation for this exact problem: the rule is scoped to
`summary` level — it evaluates a whole document/section's aggregate grade level, not individual
sentences.** A single opaque-but-short sentence sitting inside an otherwise normal-grade-level
document will not move the aggregate enough to trip a document-level threshold. It structurally
cannot do what's being asked here — flag sentence 1 in isolation — even in principle, without a
custom re-scoped rule nobody ships.

**Ecosystem it pulls in:** Microsoft Writing Style Guide and Google Developer Docs Style Guide
(both Vale-compatible ports, actively maintained), write-good, proselint, alex, Joblint, Red Hat
style — all as separate installable "styles," same YAML rule engine, same limitation (surface
regex/word-list/readability-formula, nothing semantic).
[github.com/vale-cli/Microsoft](https://github.com/vale-cli/Microsoft) ·
[github.com/vale-cli/Google](https://github.com/vale-cli/Google) ·
[github.com/vale-cli/Joblint](https://github.com/vale-cli/Joblint) ·
Red Hat reference: [redhat-documentation.github.io/vale-at-red-hat](https://redhat-documentation.github.io/vale-at-red-hat/reference-guide.html)
(has "define acronyms/abbreviations on first occurrence" as a rule — see term-first-use section
below).

**Would it flag the 6 test sentences?** No on 1, 2, 3, 5 (short, simple words, well under any
grade threshold, and readability is document-scoped anyway so it wouldn't even see them
individually). Borderline-possible on 4 depending on threshold. Would flag 6 on length alone if
`readability` were scoped per-sentence (it isn't, by default) or if a custom `existence` rule
counted commas/semicolons.

**Adoption cost:** Low-to-medium. Single Go binary, YAML config, drop into CI as a lint step;
Microsoft/Google style packs are drop-in. Main cost is authoring custom rules for anything beyond
the shipped styles — and nothing shipped touches semantic opacity.

---

### textlint (JS ecosystem) + retext / unified (remark family)

**What they are:** textlint is a pluggable Markdown/text linter (JS); retext is the prose-analysis
half of the `unified`/`remark` toolchain — same AST pipeline as remark, so it composes naturally
if the source is Markdown. `retext-textlint` bridges the two.
[github.com/textlint/textlint](https://github.com/textlint/textlint) ·
[github.com/retextjs](https://github.com/retextjs)

**retext-readability** — actually tested, not just read about.
[github.com/retextjs/retext-readability](https://github.com/retextjs/retext-readability), v8.0.0.
Applies 7 formulas (Dale–Chall, Automated Readability, Coleman-Liau, Flesch, Gunning-Fog, SMOG,
Spache) **per sentence** (unlike Vale, this one *is* sentence-scoped) and fires when a
configurable fraction agree ("threshold," default `4/7`) the sentence is hard for a configurable
target `age` (default 16).

**Ran it live, two configs:**
- **Default** (age 16, minWords 5, threshold 4/7 — i.e. realistic adult-audience settings): flags
  **only sentence 6** ("5 out of 7 algorithms"). Sentences 1–5 all report "no issues found."
- **Maximally strict** (age 6, minWords 1, threshold 1/7 — i.e. "flag anything a first-grader
  might struggle with"): flags **all six**, sentences 1–5 at "6 out of 7 algorithms," sentence 6
  at "all 7." This setting is unusable in practice — it would also flag nearly all ordinary adult
  technical or literary prose, because the formulas are keyed to vocabulary/syllable difficulty
  for a 6-year-old, not to "does this presuppose an idea the reader doesn't have." It's not
  detecting the target defect; it's detecting *any* adult-level word choice.

This is the cleanest empirical proof of the headline finding: there is no threshold setting
between "misses everything real" and "flags everything indiscriminately" that isolates the actual
defect.

**retext-simplify** — flags wordy multi-word phrases against a simpler-alternative dictionary
(e.g. "in order to" → "to"). Word-substitution list, not semantic.
[npmjs.com/package/retext-simplify](https://www.npmjs.com/package/retext-simplify)

**retext-passive, retext-equality (→ alex)** — passive-voice detection and inclusive-language
detection respectively; same category as write-good/alex below.

**Would they flag the test set?** Same verdict as the empirical run above — retext-readability at
realistic settings: only #6. retext-simplify: none of the six contain its blocklisted wordy
phrases. None of the retext family models coreference/discourse.

**Adoption cost:** Low if the corpus is Markdown already (natural fit with remark pipeline);
requires Node tooling. Actively maintained (Titus Wormer / unified ecosystem, frequent releases).

---

### proselint

**What it is:** Rule-based Python prose linter, rules drawn from published style guides
(Strunk & White, Fowler's, Garner's, etc.) plus its own heuristics — clichés, jargon,
"very"-type weak intensifiers, corporate speak, "there is/are" openers, redundancy.
[github.com/amperser/proselint](https://github.com/amperser/proselint)

**Alive?** v0.16.0 (Nov 2022) is the latest tagged release — over 3 years old at time of writing,
though the repo shows a 5x perf rewrite and JSON output in that release and issue activity
continues. Best characterized as **maintained but slow-moving**, not actively shipping new rule
categories.

**Ran it live:** Installed `proselint==0.16.0`, ran `proselint check` against all six sentences.
**Result: zero warnings, exit code 0, across all six sentences combined.** Not one of proselint's
~30 rule categories (weasel words, "obviously"/"of course" condescension, "very"-hedging, sexism,
redundancy, jargon-from-a-fixed-list, cliché-matching, etc.) matched anything in the test set.
This is the starkest empirical null result in this report.

**Adoption cost:** Trivial — `pip install proselint`, CLI or JSON output, works on plain text.

---

### write-good

**What it is:** "Naive linter for English prose" (its own description). Checks: passive voice,
lexical illusion (doubled words), sentence-initial "so", sentence-initial "there is/are", weasel
words (from a fixed list — "many," "various," "fairly," etc.), weakening adverbs ("really," "very,"
"extremely"), "tooWordy" phrase list, clichés, and (opt-in) E-Prime ("to be" verb) detection.
[github.com/btford/write-good](https://github.com/btford/write-good)

**Ran it live** (npm, current version): flagged something on 4 of 6 sentences, all trivial
style nits, none related to the actual defect:
- #1 "therefore" → wordy
- #2 "are filled" → possible passive voice
- #3 "all of" → wordy
- #4 → **nothing**
- #5 "only" → weakening adverb
- #6 "silently" → weakening adverb

None of these flags bear on why the sentences read as opaque. write-good's checks are
regex/word-list matches; it has no model of sentence meaning at all.

**Adoption cost:** Trivial, npm install, `write-good` CLI or `write-good` npm module for
programmatic use; also available as a Vale-compatible style pack and a coala-bears linter bear.

---

### alex

**What it is:** Catches "insensitive, inconsiderate" language — gendered, ableist, homophobic
etc. — built on `retext-equality`. Not a readability tool at all; listed here because it's part
of the same rule-based-linter family and gets reached for reflexively.
[github.com/get-alex/alex](https://github.com/get-alex/alex)

**Would it flag the test set?** No — none of the six sentences contain flagged terminology.
Out of scope by design.

---

### LanguageTool

**What it is:** Grammar/spelling/style checker, Java-based, self-hostable server, has an
optional stricter **Picky mode** that adds stylistic rules beyond core grammar (redundancy,
some word-choice nudges, punctuation style).
[github.com/languagetool-org/languagetool](https://github.com/languagetool-org/languagetool)

**Alive?** Very actively maintained — v6.8 released May 2026, repo updated as recently as
July 2026, moved to a rolling snapshot release model in March 2025 rather than dated version tags.

**Would it flag the test set?** Grammar/spelling checks find nothing (all six sentences are
grammatical). Picky mode's added stylistic rules are still surface pattern-matches (redundant
phrasing, some clichés, punctuation nits) — same category as write-good/proselint, not semantic.
No evidence found of a coherence/coreference layer in LanguageTool.

**Adoption cost:** Low-medium; self-hostable Docker image, has an HTTP API, editor plugins.

---

### Hemingway Editor

**What it is:** Commercial web/desktop editor. Highlights: sentence length via color-coding
(yellow = hard to read, red = very hard to read), passive voice, unnecessary adverbs, and
"complex words" with simpler-alternative suggestions. Reports a grade-level score, same family
of formula as Flesch-Kincaid.
[hemingwayapp.com](https://hemingwayapp.com/)

**What it does NOT do (their own limitation, confirmed via review sources):** No grammar
checking (misses agreement errors, article mistakes, tense issues) and, same as everything else
here, no semantic/coherence model — it is sentence-length + word-list + passive-voice detection
with a friendlier UI.

**Would it flag the test set?** Same profile as the formula table above — sentences 1, 2, 3, 5
would render mostly un-highlighted (short, simple words); sentence 6 would be flagged red for
length. Not usable for this defect.

---

### Grammarly (Business API), Acrolinx, Expound

**Grammarly:** Ships a documented "vague pronoun reference" category under its Clarity
suggestions in consumer product marketing copy, per third-party writing-center sources that cite
Grammarly's blog content on the topic — but I could not confirm, from Grammarly's own official
help-center documentation, that this is a reliably-firing automated check versus aspirational
product-marketing language, and could not test it directly (no API access in this environment).
**Mark this [C]/unverified** — it's the single closest-sounding shipped feature to "pronoun with
no antecedent" in this whole survey, and it deserves a real test with the actual six sentences
before anyone relies on it. Sentence 5's "It proposes; the other two dispose" is exactly the
shape of construction a vague-pronoun-reference check is meant to catch (what does "It" refer
to two sentences up?) — but "the other two" as an unintroduced definite reference is a distinct
and probably-uncaught failure mode even if the "It" itself resolves grammatically.

**Acrolinx:** Enterprise content-governance platform. Its "Clarity"/readability scoring is
explicitly formula-based (sentence length, syllables, word choice) layered with brand
terminology/tone rules — confirmed via Acrolinx's own blog content. No cohesion/coreference
modeling found. Enterprise pricing, heavy adoption cost, wrong shape of tool for a solo author's
paper pipeline regardless.

**Expound:** Searched specifically for a prose-linting tool by this name — found nothing. Either
it doesn't exist as a shipped tool, is too obscure to surface in search, or the name refers to
something not in this category. Reporting the null result rather than guessing.

---

### Readability formulas and their published critique

Flesch-Kincaid, Gunning Fog, SMOG, Coleman-Liau, ARI, Dale-Chall — all in the same family:
count words, syllables, sentence length, run them through a linear regression fit to human grade
levels decades ago (Flesch's original work was WWII-era Navy training manuals; Dale-Chall is
built around a fixed "familiar word" list from 1948, later revised).

**The critique, found directly in this research (not asserted from memory):**

- These formulas were "developed for children's school books, not adult technical
  documentation; they ignore between-reader differences and the effects of content, layout, and
  retrieval aids on text usefulness" — from the UXmatters "7 Reasons to Avoid Them" piece
  surfaced in this search.
- They are "not intended to directly measure ease of comprehension, but rather readability" —
  i.e. the formulas were validated against oral-reading grade-level norms, not against whether a
  reader extracts the correct meaning.
- Direct, cited comparison found in this research: **"Comparisons indicated that the Coh-Metrix
  formula was significantly more accurate in predicting reading difficulty than the Flesch
  Reading Ease and Flesch-Kincaid Grade Level formulas"** — because Coh-Metrix adds cohesion,
  world-knowledge, and discourse variables the classic formulas ignore entirely.
- textstat's own numbers above make the critique concrete: sentence 4 (genuinely one of the
  more confusing ones — "§4.4 invites the suspicion that the resolver guesses" personifies a
  document section and uses "invites the suspicion" idiomatically) scores *worse* by Dale-Chall
  (14.6, "difficult") than sentence 6 does by that same formula (12.1) — the formula is
  responding to unfamiliar-word-list hits ("resolver," "suspicion"), not to the actual
  comprehension problem, which is structural/referential, not lexical.

**Lexile:** A commercial/education-market framework (MetaMetrics), same formula family
(word frequency + sentence length), used mostly for matching children's/YA books to reading
levels; not positioned or used as a prose-quality linter for technical writing at all.

**textstat / py-readability-metrics (Python):** Implementation libraries, not checkers with
opinions — they compute the same formula family (Flesch, FK grade, Gunning Fog, SMOG,
Coleman-Liau, ARI, Dale-Chall, plus some less common ones like Linsear Write, Fernandez-Huerta,
Szigriszt-Pazos). Used to build a custom Vale/CI gate, but the ceiling is the formula family's
own ceiling — this is what was run directly, live, to produce the numbers table above.
[github.com/textstat/textstat](https://github.com/textstat/textstat) ·
[py-readability-metrics.readthedocs.io](https://py-readability-metrics.readthedocs.io/en/latest/)

**Coh-Metrix — the closest thing academically, and worth understanding precisely:**
Built at University of Memphis (Graesser, McNamara et al.), it computes 100+ measures across
cohesion (referential overlap between sentences, argument overlap, causal/logical connectives,
LSA-based semantic similarity between adjacent sentences), not just surface word/sentence length.
It genuinely targets "does this text hang together for a reader" rather than "are the words
short." **But: it is a research instrument, not a pass/fail linter.** Two free web versions
exist (Coh-Metrix 3.0 at the University of Memphis's hosted tool, and a "CohMetrixCore Web"
instance — [iis.memphis.edu/static/cohmetrix](https://iis.memphis.edu/static/cohmetrix/)) but it
outputs ~100+ numeric indices for a *whole document*, calibrated against corpora of student/
textbook writing — no accept/reject threshold, no per-sentence flag, no CI integration, and one
cited limitation notes findings "could be generalized only to a specific genre of texts"
(academic prose corpora it was validated on). Nobody runs Coh-Metrix as a pre-commit hook. It is
the right *idea* — cohesion over word length — with none of the packaging that would make it
adoptable tomorrow.

---

### Cohesion / coreference / referential clarity — the closest thing to the actual defect

This is the section that matters most, and the honest answer is short: **it does not exist as a
usable shipped tool.** What exists:

- **Entity-grid coherence models** (Barzilay & Lapata, 2008) — represent a document as a grid of
  which entities appear in which grammatical role (subject/object/other) across sentences, and
  score coherence by the entity-transition patterns. This is genuinely the right *shape* of idea
  for "this term was never introduced" / "this pronoun floats" — but it scores *documents* as
  more-or-less-coherent relative to a shuffled-sentence baseline, it does not point at a specific
  sentence and say "this one presupposes a referent the reader doesn't have."
- **"Cohere" toolkit** — a research implementation bundling the classic entity-grid model, a
  graph-based coherence metric (Guinaudeau & Strube 2013), and a syntax-augmented model
  (Louis & Nenkova 2012), built explicitly for benchmarking against shuffled-sentence corpora in
  papers, not for linting a draft. [lrec-conf.org paper](http://www.lrec-conf.org/proceedings/lrec2016/pdf/923_Paper.pdf)
- **spaCy coreference / coreferee** — general-purpose coreference *resolution* libraries (find
  what "it"/"they" points to across a document). These resolve references that CAN be resolved;
  they do not flag references that CANNOT be resolved from context, and even where they attempt
  novelty-detection, that's a research topic (Winograd-schema-style ambiguity), not a shipped
  "no antecedent found → error" linter rule anywhere I found.
- **Grammarly's vague-pronoun-reference marketing claim** is the single closest-sounding shipped
  consumer feature — see above, unverified in this research, worth testing directly.

Net: coreference resolution as a *library capability* exists and is mature (spaCy, coreferee).
Coreference *checking* — the inverse, "flag when resolution fails or is ambiguous, as a prose
defect" — exists only in academic evaluation harnesses (Cohere, entity-grid papers), never
packaged as something you point at a manuscript and get pass/fail on.

---

### Term-first-use checking

This is the one category with a genuinely usable, mechanical, **build-failing** answer — but only
inside LaTeX, and only for acronyms/defined-terms, not general concept-presupposition.

- **`glossaries` package:** Tracks first use per glossary entry; entries that reference an
  undefined glossary term produce build warnings (undefined-reference class of error).
- **`acronym` package** (Oetiker): Explicitly ships an **`error` option** — "lets it throw compile
  errors instead of warnings in case of undefined acronyms" — confirmed from the package's own
  documentation/forum discussion found in this research. This means a LaTeX build *can* be
  configured to hard-fail if an acronym is used before `\acrodef`ining it. This is real,
  adoptable, and directly on-point for "acronym used before defined" — just not for "concept used
  before its meaning was established," which is the harder, prose-level version of the same
  problem the six test sentences actually exhibit.
- **ASD-STE100 Simplified Technical English:** A controlled-language standard (aerospace/defense
  documentation lineage, formerly AECMA Simplified English) that constrains vocabulary to an
  approved dictionary and imposes structural writing rules aimed at reducing ambiguity, not just
  word difficulty. **TechScribe ships a customized LanguageTool instance specifically to check
  ASD-STE100 compliance** — a real, existing checker
  ([simplified-english.co.uk](https://www.simplified-english.co.uk/glossary.html)). This is the
  closest *shipped, checkable* thing to "sentence structure that forces one clear idea per
  sentence" found anywhere in this research — worth a closer look if the goal generalizes beyond
  papers to any technical writing, though it's built for aerospace maintenance manuals, not
  academic argumentation, and its "clarity" is about avoiding ambiguous grammar constructions
  (e.g., banning strings of nouns, restricting verb forms), not about tracking whether a *claim*
  presupposes context.

---

### Academic writing assistants — what journals actually run

- **Writefull:** Language-fluency assistant trained on published journal articles (phrasing,
  paraphrasing, abstract/title generation), integrates with Word/Overleaf. Targets non-native-
  English fluency, not semantic clarity for a general reader — a *more* fluent-sounding sentence
  from Writefull could easily still be one only an insider parses.
  [writefull.com](https://www.writefull.com/)
- **Penelope.ai / Penelope.ci:** Automated manuscript-completeness checker — ethics statements,
  informed consent, data-availability statements, COI disclosures, word counts, reference
  formatting. Explicitly **does not evaluate intellectual quality** of the writing — confirmed
  directly from search results describing it as "highly effective for formal completeness" but
  not content quality.
- **SciScore:** Scores *methods sections* specifically — reagent/resource identifiability, bias
  controls, sample-size/randomization/blinding reporting — a reproducibility-and-rigor checklist
  tool, not a prose-clarity tool at all.
- **StatReviewer:** Statistical-methodology checker — flags wrong test choice, missing info
  needed to replicate, methods susceptible to bias. Also not a prose-clarity tool.

None of these four run on sentence-level readability or semantic opacity at all; they are
adjacent tools solving a different problem (methodological rigor, manuscript completeness,
language fluency for non-native speakers) that happens to sit in the same "things journals bolt
onto submission" category.

---

## (a) Test-sentence × tool table

"✗" = tool ran/would run and did not flag it. "✓" = flagged, with the specific reason. "n/a" =
tool categorically out of scope (not a readability/clarity tool). Blank cells for tools not
directly tested are inferred from documented mechanics, marked accordingly.

| # | proselint (tested) | write-good (tested) | retext-readability @default (tested) | retext-readability @age-6 strict (tested) | textstat/Hemingway-style grade-level | Vale readability (doc-scoped, inferred) | LanguageTool Picky (inferred) | Coh-Metrix (inferred — no threshold exists) | Grammarly vague-pronoun (unverified) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ✗ | ✓ "therefore" wordy (irrelevant) | ✗ | ✓ (6/7, age-6 only) | grade 5 — too low to trip | ✗ | ✗ | would score low cohesion if computed, but no pass/fail exists | untested |
| 2 | ✗ | ✓ "are filled" passive (irrelevant) | ✗ | ✓ (6/7, age-6 only) | grade 5 | ✗ | ✗ | same | untested |
| 3 | ✗ | ✓ "all of" wordy (irrelevant) | ✗ | ✓ (6/7, age-6 only) | grade 2 | ✗ (also: headings often excluded from scope entirely) | ✗ | same | untested |
| 4 | ✗ | ✗ (zero flags) | ✗ | ✓ (6/7, age-6 only) | grade 7.6 — borderline on strict configs | possible, borderline | possible, borderline | same | untested |
| 5 | ✗ | ✓ "only" weakening adverb (irrelevant) | ✗ | ✓ (6/7, age-6 only) | grade 6 | ✗ | ✗ | this is the sentence coreference-checking would target ("It", "the other two") — no tool does it | **plausible target** if the feature is real |
| 6 | ✗ | ✓ "silently" weakening adverb (coincidental) | **✓ (5/7, default settings — real hit)** | ✓ (7/7) | grade 20.6 | **would flag if scoped per-sentence** | likely flags on length | n/a | n/a |

**Reading the table honestly:** the only cell that is a genuine, non-degenerate detection is
retext-readability on sentence 6 at default settings — and it fired because the sentence is long,
not because it strings six unrelated claims together. Every other "✓" in the table required
either an irrelevant trigger (write-good's word-list nits) or an unusably aggressive threshold
(age-6 retext) that would flag most adult prose. Sentences 1–5 — the ones actually called "wtf"
— are structurally invisible to this entire tool category at any setting a working author would
actually run in CI.

## (b) Ranked ADOPT list — deterministic checks worth taking off the shelf tomorrow

Ranked by (catches something real) ÷ (adoption cost), **not** by whether it solves the stated
problem — none of them solve the stated problem, this ranks what's worth having anyway as a cheap
floor beneath the human/LLM cold-read pass:

1. **proselint**, `pip install proselint`, drop into CI or pre-commit. Zero false positives in
   this test (ran clean on all six), catches real hedge/cliché/weasel-word patterns elsewhere in
   a corpus, costs nothing to add. Ceiling: word-list matching only.
2. **retext-readability at default settings (age 16, threshold 4/7)**, if the corpus is Markdown
   (natural fit with an existing remark/unified pipeline). The one tool in this survey that
   actually caught something real (sentence 6) without an unusable threshold. Treat a hit as "this
   sentence is long and worth a manual look," not as proof of a defect and not as proof of its
   absence when it stays quiet.
3. **A custom Vale `existence` rule counting semicolons/em-dashes/commas per sentence** (e.g.
   "flag any sentence with ≥3 semicolons or ≥2 em-dash clauses") — not shipped anywhere found in
   this research, but cheap to author (a few lines of YAML regex) and would catch the shape of
   sentence 6 specifically, as opposed to relying on a readability-formula proxy for it.
4. **LaTeX `acronym` package with the `error` option**, only if the corpus is LaTeX and has
   acronyms — real, build-failing, on-point for its narrow scope (undefined acronym at first
   use), zero cost if already using LaTeX.
5. **write-good**, mainly as a second, differently-tuned word-list pass (catches passive voice
   and weak-adverb patterns proselint's list doesn't cover) — low value on its own given this
   test set (4/6 sentences got an irrelevant flag, the useful information rate is low), but it's
   a 30-second npm install and doesn't cost anything to have running alongside proselint.

Deliberately **not** recommending: Vale's readability rule (wrong scope — document-level, not
sentence-level — for this specific problem, though still fine for its intended purpose of
catching genuinely bloated paragraphs elsewhere); LanguageTool Picky mode (heavier to self-host
than the value it added in this test — mostly grammar, marginal style); Coh-Metrix (right idea,
no pass/fail packaging, would need custom threshold-setting research to turn into a usable gate);
Acrolinx/Grammarly Business (enterprise pricing/workflow mismatch for a solo paper pipeline, and
the one feature that sounds relevant — vague pronoun reference — is unverified).

## (c) What remains irreducibly non-deterministic

The defect in all five "wtf"-tier sentences is the same shape: each sentence is a valid,
economical compression of an idea the *writer* holds fully formed, and the compression relies on
the reader having already built the same mental model — which term of art "the rule" and "its
claim about itself" refer to (sentence 1), what "these files" and "constructions nobody built"
cash out to concretely (sentence 2), what the antecedent of "three answers" even is without the
paragraph before it (sentence 3), and in sentence 5, what noun phrase "the other two" silently
picks up from two clauses earlier. This is **not a property of any individual sentence's tokens**
— it's a property of the relationship between the sentence and a specific reader's prior state,
which is exactly why every tool surveyed here comes up empty: they all operate on the document (or
one sentence) in isolation, scoring vocabulary/length/word-choice, with no model of what the
reader brought into the room. Coh-Metrix gets closest by modeling cross-sentence referential
overlap, but even that is a statistical proxy for cohesion within the *document itself*, not a
model of a specific reader's background knowledge — a term can have perfect referential overlap
with its own prior use three paragraphs up and still be opaque to a reader meeting the paper cold.
Detecting that gap requires actually simulating a reader who does not have the writer's context —
which is a language-understanding task, not a countable-surface-feature task, and is why the
`cold-read-diff` skill's approach (send the diff to a fresh, context-free reader and ask what each
sentence claims) is targeting the right mechanism even though the homegrown metric-based checks
are not: the fix for this class of defect is closer to "add another independent reader" than
"tighten a threshold."
