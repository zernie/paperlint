# grade-paper-writing — what the rubric missed, and the rules it left

Read by `grade-paper-writing` (section "What the rubric missed" of its `SKILL.md`). Each section below is a
defect the rubric and the stall pass let through on a real paper, with the rule that came out of it: the
citation tricolon, contrast framing, a caveat welded into its claim, a phrase pointing at an unstated
alternative, and the stricter scale for the abstract and the conclusion.

## 🔴 The tell that says a machine wrote it: three findings in one sentence

The single most reliable marker of LLM prose in a paper is **the citation tricolon** — separate
findings packed into one sentence with a reference hung off each:

> *Adherence has been measured directly more than once: it decays as a session proceeds [6], and
> agents that undertake to follow a process frequently do not [7] — while a factorial study of the
> file's own structure, varying size, position and ordering, found no effect at all [4].*

Three unrelated results, one sentence, 48 words, a colon, a comma-splice and an em-dash contrast. It
reads fluently and nothing survives it. Its cousin is the **noun pile with no verb**, which exists
only to carry citations:

> *Censuses, taxonomies and labellings of what these files contain [3, 11, 12, 18–20, 25, 34].*

**Rule: one finding, one sentence.** If three works said three things, that is three sentences, and
each says what the work found rather than that it exists. A citation group belongs to a claim, not to
a list. When the related work genuinely is a survey, say what the surveys share and cite them once.

Mechanical leg: `paper-lint`'s plain-language pass flags any sentence carrying three or more separate
citation groups, or five or more reference numbers in under 45 words. It cannot judge whether the
prose is *good*; it reliably catches this one shape, which is the shape that recurs.

**And the words themselves, not only the sentences.** *Utilise* means *use*. The "Jargon discipline"
dimension (#6 of the rubric) does not catch this, because the word looks perfectly at home — judgment slides right
past it. What catches it is a list: `paper-lint` carries ~30 words with a plainer equivalent (utilise ·
constitutes · prior to · necessitates · facilitates · leverage · albeit · in order to …) and names the
replacement in the nudge.

🔴 **The swap is two-sided: replace a word only when the plain word stays in academic register.**
*Utilise → use* and *in order to → to* pass: the replacement is what the venue's own papers write.
*Adherence → following*, *demonstrates → shows* in a results sentence, *methodology → how we did it*
do not pass when the reference papers of dimension #10 use the first form — there the plain word is a
step toward a blog post, and the finding is withdrawn. Keep the list narrow — only words where the swap
changes neither meaning nor register — and never rewrite a cited work's title to obey it.

**Signposting is the register, not a tic, and this skill never removes it on style grounds.** Frame
markers and relation words — *we show*, *this section*, *first … finally*, *in contrast*, *therefore*,
*however* — are how academic prose tells the reader what kind of claim comes next and how it relates to
the last one. Relation words are a floor: `tex/relation-markers` reports a body below the band its
venue's accepted papers set (AIDC: 25.4 per 10,000 words; the paper reviewers called a blog post stood
at 19.1, and never wrote *however* once, where every accepted ACSAC paper writes it 6–11 times). Frame
markers do not separate a draft from accepted papers in either direction (see "Contrast framing"
below). Flag a connective only when it asserts a relation the two sentences do not have (a *therefore*
that does not follow), or when it is empty filler (*it is worth noting that*). Never flag one for being
academic.

**Other markers worth a pass:** nominalisation density (*an honest accounting of what the construction
costs* — abstract nouns doing the work verbs should do) and statistics chained through a paragraph
instead of sitting in a table. Numbers belong in a table the moment there are more than about six of
them in one paragraph.


## 🔴 The class the rubric could not see, and why it kept coming back (2026-08-04)

The author of `compile-rules-2026` read the built abstract and wrote: *«what the f\*** does that
even mean, no human would write it like that»*. He had said the same thing about the same paper
**repeatedly**. Nine rubric axes, a persona cold-read at 5.9 stalls/page, an AI-tells counter and
three tighten passes all scored the text and **none of them named the defect**, because every one of
them measures words and sentences. The defect is not in the words.

**The specimen, verbatim, and it passed every check we own:**

> "Two findings about the agent come first, because they bind whatever else you build. Asked the
> same question twice with identical inputs, a frontier model changes its verdict on 21.5% of rows,
> so no harness that has a model adjudicate its own instructions can use one as the gate."

Two separable failures:

### 1. Contrast framing, and a frame that carries nothing

**What separates this corpus from accepted papers is contrast, not signposting — and a rule counts
it.** `tex/contrast-frames` counts every form (*X, not Y* · *not X but Y* · *rather than* ·
*instead of* · *as opposed to*) per 10,000 words against the band the venue preset's anchors set: the
five accepted ACSAC papers measure 1.3–5.5, AIDC's band is 0–10.4, and the paper reviewers called a blog
post measured 101 before its rewrite and 28 after it. Every sentence that defines its point by what
it is not is a sentence whose point the reader must reconstruct. **Rewrite heuristic:** state the
thing and name the relation; move the rejected alternative to its own sentence, or drop it if nobody
proposed it. Swapping one form for another (*, not* → *rather than*) moves nothing — the rule counts
both, and so does a reviewer.

**Frame markers do not separate us from accepted papers, and are not a target in either direction.**
Hyland's *frame markers* (*this paper · this section · we show · first … finally · in what follows*)
measured 0.76–3.1 per 1,000 words on those five accepted papers (median 1.46); the lowest accepted
paper measured is 0.76, and ours sat inside that range. So neither "remove signposting" nor "add
signposting to reach a number" is a fix. A published average from a different counter (Hyland's
~5 per 1,000) says nothing about where a venue's floor lies.

What IS a defect is a frame that carries nothing. *"Two findings come first, because they bind
whatever else you build"* says nothing about rules files, agents, or repositories: the frame is
there, and the claim it announces is not. List the frames whose announced content never arrives
within the next two sentences; those are the findings. **Rewrite heuristic:** keep the frame and make
it carry the claim. *"Two findings come first, because they bind whatever else you build. Asked the
same question twice…"* → *"We first report two properties of the model that constrain any harness
built on it. Asked the same question twice with identical inputs, it changed its verdict on 21.5% of
rows (Section 4.5)."* The frame now names what follows, and the sentence after it says whose
measurement it is.

⚠️ **Vocabulary lists are not a register signal.** *robust*, *significant*, *comprehensive* and the
rest of the AI-tells vocabulary fire on every one of the five accepted papers. Flag such a word only
when it is empty in its sentence, never as evidence of a machine or of the wrong register.

### 2. The qualification eats the claim

*"…though that cell does not survive our own correction for multiplicity and we report it as
suggestive (Appendix A.2)"* is 20 words of hedge welded onto a 20-word finding. Each hedge was
added honestly, by a different review round, and none was wrong. Their **placement** is the defect, and no single round can see it.

🔴 **The obvious diagnosis is wrong, and it was measured.** Peer review does **not** ratchet hedge
words in. Keserlioglu, Kilicoglu & ter Riet (2019, *Research Integrity and Peer Review*, n = 446
manuscript–publication pairs across 28 journals) found hedge density moving 2.06% → 2.13% — and
non-significant after adjusting for journal characteristics. What review adds is **standalone
limitation sentences**: 2.48 → 3.87 per paper. So the published norm is that qualification enters a
good paper **as its own sentence**, not as particles inside a claim sentence. `compile-rules-2026`
ran at **0.37%** hedge words against that 2.13% norm — it was never over-hedged by count. It was
mis-**placed**: the caveat was welded into the result sentence, where it competes with the result for
the stress position and wins.

**Countable.** Caveats that are grammatically independent sentences versus caveats embedded as
subordinate clauses (*though · while · although · albeit*) inside a sentence that also states a
result. Target: all standalone. Also count sentences ending on a cross-reference, citation or hedge
while the sentence's own number sits earlier — Gopen & Swan's stress position, spent on a pointer.

**Rewrite heuristic — the order matters:** state the finding as a whole sentence, then qualify it in
the **next** sentence. Never inside it. *"Violations went from 17% to 100%, back to the rate with no
file at all. That is one cell of five, and it does not clear the multiplicity correction we
pre-registered (Appendix A.2)."* Same words, same honesty, and the claim survives the reading.

### 3. Phrases that reference an unstated alternative

*"So we left the sentences alone"* — the reader has not been told what else might have been done to
them, so "left alone" refers to nothing. Same author reaction, same day. **Check:** any *instead of ·
rather than · left alone · we did not · not X but Y* whose rejected alternative is not stated within
one sentence.

### 🎯 The abstract and the conclusion are graded on a different scale

They are the only two sections most readers finish, and the abstract is the only one every reviewer
reads before forming a view. Grade them **separately and harder**:

- no frame that announces a claim and then does not make it; *"We show that…"* naming the authors'
  own result is the register of an abstract, not a defect;
- first sentence is about the world, never about the document;
- no number arrives without the unit it counts (*"21.5% of rows"* — rows of what?) or without its
  owner — the authors' measurement, a cited work, or a named population;
- the last sentence of each is a **conclusion**, not an announcement of one;
- nothing may refer forward to a section the reader has not read.

A body section may be merely clear. These two have to be **sharp**, and if the abstract survives a
tighten pass marked `KEEP` three rounds running, that is evidence it was never really read — this
one did, and it was the worst section in the paper by measured density both times.

### What is NOT mechanizable here

Whether a frame marker carries its claim (*"we claim nothing there"* genuinely scopes one), whether a
hedge is honest or defensive, whether a given contrast frame is the one a reader needs, and whether a
rewrite kept every claim at its strength. The mechanical legs that do exist: `tex/claim-provenance`
reports every sentence of the body that holds a number and no owner, and `tex/contrast-frames`,
`tex/claim-emphasis` and `tex/relation-markers` report a body outside its venue's band. Count them,
surface them, and leave the verdict to a reader. The counter's job is that nobody can say afterwards
they did not know.
