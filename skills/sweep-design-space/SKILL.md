---
name: sweep-design-space
description: Find a real MECHANISM for a problem — sweep the design space across type systems, formal verification, functional programming, capabilities, specification-by-example, data integrity, authoring UX, other professions (aviation/law/audit), and historical ancestors in SE — instead of circling the same two or three obvious options. Use when the deliverable needs a solution rather than a measurement, when the last few proposals all rhymed with each other, or when the user says "your options are stale / you're thinking narrowly / think fresh". Encodes the hard filters that kill most candidates (does it re-require the thing already measured as unworkable? is it occupied? who writes the formalization? does it demand a new format? unrepresentable or merely detectable?) and the ladder pattern for when one mechanism can't cover the range. Distinct from research-ideate (validates ONE idea you already have), map-prior-work (finds competitors for a claim), and analyze-sibling-paper (deep-reads one rival) — this one GENERATES candidate mechanisms and filters them.
context: fork
allowed-tools: [WebSearch, WebFetch, Read, Write, Grep, Glob, Bash, Agent]
---

<!-- vigiles:sha256:1822c8c01e352f42 compiled from skills/sweep-design-space/SKILL.md.spec.ts -->

# sweep-design-space — stop circling, sweep

## Run me

🔴 FIRST, before any other step:

```
node .claude/skills/paper-pipeline/scripts/announce.mjs sweep-design-space <dir>
```

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The `<dir>` argument is **optional in spirit**: this skill can run before a paper directory exists, so
pass whichever directory the work lives in, or `.`. The ledger row is written either way, and a plain
dot is more honest than an invented path.

A model asked for "a solution" returns the three designs nearest its training prior, then variations of
those, then variations of the variations. The user experiences this as *"you are thinking very narrowly"* —
and they are right. The fix is not to think harder in place; it is to **sweep named source domains on
purpose** and filter hard.

Grounding lesson (2026-07-29, `the reference paper`): four consecutive proposals were reformulations of
one idea ("check the prose"), and two of them turned out to be **already shipped in production** by
other people. The design space was never actually swept; it was sampled from memory.

## When it fires

- The task needs a **mechanism**, not a measurement, and the mechanism isn't obvious.
- Your last two or three proposals rhyme with each other.
- The user pushes back with *"your options are stale / you're seeing only old solutions / think fresh"*.
- A measurement phase just finished and the paper/product needs a constructive half.
- 🔴 **You are about to recommend the first design you thought of.** That alone is the trigger.

## How to run it

### 1. State the defect as a STATE, not as a wish
Not "we want rules to be enforced". Write the exact state that must not exist:
> *a rule asserts an enforcement that nothing provides.*

Everything downstream is judged by whether it makes **that state** impossible.

### 2. Write the hard filters BEFORE generating
Filters written after generation get bent to save a favourite. Standard ones — keep the ones that apply:

- **🔴 Does it re-require the thing you already measured as unworkable?** The sharpest filter and the
  easiest to violate. In the grounding case, prose-to-checker synthesis was measured leaking at
  **84–96%** — and half the proposed designs still began with *"parse the prose"*. If your evidence
  says X doesn't work, a design that starts with X is dead **regardless of how elegant the rest is**.
- **Unrepresentable or merely detectable?** "We check for it afterwards" is a different (weaker) claim
  than "it cannot occur". Say which one honestly.
- **Who produces the formalization — a model or a human?** This, not "is a model involved", is what
  predicts leakage. Model-synthesized formalization leaks; human-written formalization does not leak,
  it is merely expensive. Sort candidates by this.
- **Adoption cost.** Does it require a new format, a migration, or a new file? Count the artifacts
  already in the wild that would have to move. A design requiring migration of a large installed base
  has near-zero adoption regardless of merit.
- **Scope honesty.** Which fraction of the real population does it cover, and does it *silently* cover
  nothing for the rest? Force each candidate to say "for class X it is silent."

### 3. Sweep the catalog — the point of this skill
Take the groups below. For each, generate **3 candidates whose MECHANISMS differ** (three phrasings of
one idea is a failed group). Delegate to a subagent with **no thread context** — the thread is exactly
what anchors you — and hand it: the defect state, the hard filters, the measured constraints, and the
**already-considered list**.

🔴 **Hand that list as "considered, and here is exactly why each was set aside" — never as a bare
ban.** A blanket prohibition is the wrong instrument, because some of those options were set aside
for a *bad* reason, and a *modification* of a rejected option is often the best thing in the sweep.
So the instruction to the agent is two-sided:

- returning a considered option **unchanged** is a failure — that is the laziness the list exists to
  prevent;
- returning it **because you can attack the stated reason it was rejected**, or with a modification
  that survives that reason, is a **first-class result** — say so explicitly in the brief.

This shape does something a ban cannot: it surfaces bad rejections. In the grounding session, one
option was discarded with the objection *"the generated file can still be hand-edited"* — an objection
already solved, years earlier, by a checksum on the generated section. Under a bare ban that option
stays dead forever, killed by a wrong reason nobody re-examines. **Record the reason next to every
retired option precisely so it can be attacked later.**

### 4. Occupancy check BEFORE you fall in love
Every surviving candidate goes through a refutation-framed occupancy pass (*"find who already did
this"*, not *"confirm it's free"*). In the grounding case this killed the front-runner: the
`enforced-by:` tag design was **already shipped** — CI blocking PRs, reference resolution in Rust,
across several independent projects. "I don't know of such work" ≠ "no such work". Search GitHub code
search, not only papers: practice ships years before it is written up.

### 5. Red-team the survivor
Separate subagent, framed to **break** it. See the paper corpus's own refutation rules (`CLAUDE.md` beside the papers).

### 6. Save to the repo
A swept design space that lives only in a chat is re-swept from scratch next month. Write the map —
axes, cells, occupancy verdicts, what kills each — as a file, and record **which candidates were
retired and why**, so they are not proposed again.

---

## The catalog — source domains, with constructs named

Do not treat this as exhaustive; it is a floor, so the agent starts from named constructs instead of
inventing the list each time. Add groups when the problem calls for them.

### A. Type systems and language design
Smart constructors · newtype and phantom types · GADTs · **typestate** · linear and affine types
(a permission that is *consumed*) · refinement types · totality checking · effects in the type ·
**parse-don't-validate** · make illegal states unrepresentable · instance resolution as a gate
(the operation *doesn't exist* when there is no backend for it).

### B. Formal verification
Coq · Lean · **TLA+ and Alloy** (model the *process*, not the code) · model checking · SMT ·
**satisfiability as a meaningfulness test** (a constraint that removes no models is vacuous — a
mechanical vacuity check) · refinement (does the implementation refine the spec) · proof-carrying
artifacts · Design-by-Contract · **blame** (Findler & Felleisen — who is at fault at the boundary).

### C. Functional programming
Free monads and DSL-as-data (one AST, many interpreters) · tagless-final · **session types**
(protocols as types — the natural home for "order of operations" rules) · algebraic effects ·
optics · **monoids and folds** (how do rules compose, merge, override?) · lattices and semilattices
(CRDT-style merge without conflict) · catamorphisms · **Curry–Howard** (rule as type, proof as value) ·
property laws · denotational semantics (a rule *is* the set it forbids; empty set = vacuous).

### D. Capabilities and systems
Capability-based security · **reference monitor with complete mediation** · principle of least
authority · object capabilities · **grants instead of prohibitions** (if the file can only *grant*,
"don't do X" has no syntax) · sandboxing · seccomp/eBPF · information-flow control · taint.

### E. Testing and specification by example
Property-based testing · metamorphic relations · golden/approval tests · **mutation testing as an
admission criterion** (a rule that kills no mutant is not admitted) · executable specifications ·
example pairs as the artifact with prose as caption (machine never reads the prose) ·
**A/B measurement of effect** (treat the artifact as opaque and measure whether it changes outcomes —
the one way to take unparseable prose seriously without parsing it).

### F. Data integrity and databases
Constraints · **`ADD CONSTRAINT` validates existing rows** (you cannot add a constraint your current
data violates — near-universal in databases, near-absent everywhere else) · `NOT NULL` + foreign keys ·
schema and migrations · `NOT VALID` with a deadline · provenance and lineage · event sourcing ·
**store the thing as data with the human-readable file as a view**.

### G. Human–system interaction (authoring)
Asymmetric cost (make the strong claim expensive and the weak one one click) · forced choice with no
escape hatch · **changing the default** rather than adding a gate · feedback at the moment of writing
(live "this would have matched: 0") · progressive disclosure · single entry point (the artifact can
only be created *from* an incident, never from imagination) · what code review, commit hooks and IDE
hints actually taught us about compliance.

### H. Other professions — how they make an unenforceable norm unwritable
- **Aviation:** Minimum Equipment List — a defect is permitted only *with* a compensating procedure
  and a **repair deadline** by category; expiry is automatic. Also checklists, and why they work.
- **Law:** *lex imperfecta* — an obligation with no sanction is a recognized category, not an
  oversight. **Rules vs standards** (Kaplow 1992) — the ex-ante/ex-post distinction, half a century old.
  Adjudicator: a standard must name who decides.
- **Audit/finance:** SOX controls — owner + frequency + **evidence artifact**, and two separate tests
  (*design* and *operating effectiveness*). "The control exists" stops being a state; there are three.
- **Medicine:** protocols, contraindications, checklists, and the distinction between guideline and
  protocol.
- **Safety standards:** MISRA (**decidable/undecidable** is an official per-rule label), DO-178C DAL
  A–E, ISO 26262 ASIL, Common Criteria EAL — industries that already formalized *how strongly backed*
  something is.
- **Construction codes, military ROE, accounting standards** — same question, different centuries.

### I. 🔴 Historical ancestors in software engineering
**Assume the problem is old.** In the grounding case, a "novel" controlled-language idea turned out to
be a 1980s aerospace standard, and its ladder had been published in *Computational Linguistics* in 2014.
Look here **before** generating anything:

- **Gradual typing** — the canonical template for coexisting checked and unchecked in one artifact,
  with an explicit boundary and blame, adopted across a huge installed base *because* it did not
  require migration. If your problem is "some items are backed and some are not, and we cannot move
  everyone", this is the closest ancestor that exists.
- **Gradual verification**, gradual refinement types.
- **Design by Contract** (Eiffel) and contract blame (Racket).
- **JML · SPARK Ada · ACSL · Dafny** — and specifically **SPARK's stone → bronze → silver → gold →
  platinum**: a shipped, mechanically-defined ladder of assurance. Steal the shape.
- **Aspect-oriented programming** — cross-cutting requirements declared away from the code, and
  **why it failed** (the failure is more instructive than the successes).
- **lint (Johnson, 1978)** — the original answer to "a rule the compiler does not check".
- **Assertions** (Floyd, Hoare) and how they became normal.
- **Literate programming**, doctest, executable documentation.
- **Requirements engineering** — *testable requirement* as a recognized category, traceability,
  EARS, IEEE 830.

### J. Migration and coexistence strategies
Not a mechanism but a shape most candidates need: strangler fig · feature flags · `NOT VALID`
constraints · gradual typing's boundary · deprecation with deadlines · advisory-then-enforcing rollout
(how linters actually ship a new rule) · opt-in tiers.

---

## The ladder pattern

When no single mechanism covers the range — the usual case — the answer is often a **graded scale**
rather than one gate. A ladder is only worth anything if every rung is:

1. **decided mechanically** — no reading, no judgment, no model interpreting anything;
2. **strictly stronger** than the rung below;
3. **precedented** — name the ancestor (SPARK levels, DAL, MISRA decidable/undecidable, gradual typing's
   typed/untyped boundary). A ladder with invented rungs is a taxonomy, and taxonomies are usually
   occupied.

🔴 And check whether the *ladder itself* is occupied for your object. Controlled-language scales and
assurance levels already exist; the question is whether anyone has carried them to your problem.

---

## Record the verdict

🔴 LAST step, once the deliverable exists:

```
node .claude/skills/paper-pipeline/scripts/ledger.mjs record sweep-design-space <dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record sweep-design-space <dir> ABSTAINED <reason> "<one line>"
```

🔴 **There is no PASS.** A sweep that turns up survivors has not certified anything; it has found
candidates, and candidates are findings.

**FINDING** — the sweep produced something to act on; `<count>` is the number of survivors and
`<report-path>` the sweep, including the groups that yielded nothing. Add `--blocking` when the
whole sweep died on the filters — that is the loudest thing this skill can say.
**ABSTAINED** — `no-witness`: the sweep ran and neither found a survivor nor established that none
exists. `blocked`: there was no problem statement to sweep against.

The skill's own rules already say negative results count. The ledger is how that survives the session:
a recorded finding names the groups that were swept, so the next sweep starts from named constructs
instead of from memory — which is the failure mode this skill exists to break.

## Rules

- **Name the forbidden options in the generation brief.** Without an explicit "do not return these"
  list, a fresh agent returns your stale options with new names.
- **Generate with a context-free subagent.** The thread is the anchor you are trying to escape.
- **Three ideas per group must differ in MECHANISM**, not in phrasing.
- **Apply the "does it re-require the unworkable thing" filter first** — it is the one most often
  violated, including by designs that feel elegant.
- **Occupancy before affection.** Search shipped code, not only literature.
- **Negative results count.** "This group yields nothing here" is a real finding; record it so the
  group is not re-swept.
- **Prefer designs that work without anything understanding anything** — counting, required fields,
  foreign keys, expiry dates, and grants do not leak. Interpretation does.
- **Say what each candidate is silent about.** A design that covers a quarter of the population and
  says nothing about the rest is fine — undeclared silence is not.

## Compose with
- `research-ideate` — validates ONE idea's research value; run after this picks a candidate.
- `map-prior-work` / `analyze-sibling-paper` — occupancy at the level of a paper's contribution.
- `build-benchmark` — once the mechanism exists, this measures it.
- `paper-adversarial-review` / `pc-panel-review` — red-team the survivor.

## Provenance
Built 2026-07-29 during `the reference paper`, after a solution search stalled for hours. Four
consecutive proposals were the same idea reworded; when finally swept properly, a context-free agent
produced 24 candidates across 8 groups, of which the three least obvious came from **capabilities**
(the rule's text exists only as the monitor's refusal message — no prose is stored at all),
**databases** (`ADD CONSTRAINT` refuses when current data already violates), and
**specification-by-example** (measure the artifact's *effect* and never read it). None of the three
was reachable from the thread, and two of the thread's own front-runners turned out to be shipped
already. The catalog exists so the next sweep starts from named constructs instead of from memory.
