# Adversarial cold-repro protocol — reviewer-side reproduction of a measurement paper

**Purpose.** Before submitting a measurement paper that ships an artifact, reproduce it _as a hostile
evaluator_. Default stance is **SKEPTIC**: your job is to **refute** the paper, not to confirm it. Rate a
claim **CONFIRMED** only if a cold reproduction _forces_ you to. "The prose says so" and "results.json says
so" are **not** sufficient evidence — both were written by the author you're trying to catch.

Run this once the paper + artifact are drafted, before `submit-paper`. One honest **REFUTED** beats ten
hand-wavy **CONFIRMED**s.

## Protocol

1. **Reproduce cold.** Run the evaluator(s) from a _clean checkout_, capturing output **without reading the
   committed results first**. THEN diff your fresh output against the committed JSON. Never overwrite the
   committed outputs — always run to stdout or a temp file. (Reading the committed numbers first biases you
   into pattern-matching them instead of independently deriving them.)

   **Clean checkout means clean ENVIRONMENT — a self-checking artifact you never ran clean is
   UNVERIFIED.** Unzip the exact `artifact.zip` (or `git clone` fresh) into a scratch dir and follow the
   artifact's own README step-by-step; every self-check must exit 0 and print numbers matching the paper.
   The trap that hides until a reviewer hits it: **missing/uninstalled dependencies** — a harness that
   needs `npm install` / `pip install` / a build step the _release script_ doesn't run, so it crashes with
   `MODULE_NOT_FOUND` on a fresh unzip even though it "passes" in the author's dirty tree (where
   `node_modules` lingers). Fix: make the release/self-check script install deps itself, and make the
   README's quick-start the exact commands you just ran clean. A "functional artifact" that isn't
   functional out of the box is a benchmark-track reject. (Real catch: GateBench's `check-release.sh` ran
   the Node harnesses without `npm install` — green in the dirty tree, `ERR_MODULE_NOT_FOUND` on a clean
   one.)

2. **Three-way reconcile EVERY headline number.** For each number the paper leans on, line up:
   (a) the value in the **paper source** (abstract/intro/results/table),
   (b) the value in **results.json** (or whatever the artifact commits),
   (c) your **fresh re-run**.
   Any drift, off-by-one, or stale number left over from an earlier corpus size is a **finding**. These
   three must agree exactly; if they don't, the paper is inconsistent until fixed.

3. **Attack robustness, not just arithmetic.** Recompute under stress:
   - **The paper's OWN stated caveats, taken STRICTLY** — if it says "excluding X," actually exclude X and
     see if the headline survives.
   - **Dedup / weighting sensitivity** — does the headline move under a plausible alternative aggregation
     (per-item vs per-source, weighted vs unweighted, dedup vs raw)? If a different-but-defensible rollup
     flips the story, the story is fragile.
   - **Convenience-sample sensitivity** — drop the strongest / outlier item(s). Does the narrative hold, or
     was it carried by one datapoint?

4. **Attack the arms reviewers hit hardest.**
   - **Nondeterministic / LLM components** — is any claimed instability _real_, and is the paper careful to
     claim only the _shape_ (e.g. "unstable," "median 2/10, range 0–5") rather than exact per-cell values a
     re-run can't reproduce?
   - **By-construction / "always/never" claims** — are they scoped to a _declared scope_, not stated as
     unconditional absolutes?

5. **Transcription integrity.** If the evaluator transcribes third-party logic (regexes, predicates, rules)
   into your own scorer, spot-check a few items against their **real source**. If there's a validation set
   of corrections, confirm every correction runs in the **claimed direction** (a validation set whose
   "fixes" cut both ways is a red flag). See the live-contract execution method in `SKILL.md` — a blind
   re-derivation only validates transcription-vs-human-reading, not transcription-vs-real-behavior.

## Output — one verdict per claim

For each headline claim, emit:

- **VERDICT: CONFIRMED | REFUTED | NEEDS-FIX**
- The **three numbers** (paper source / results.json / fresh re-run).
- The **single command** that reproduces it from a clean checkout.
- If not CONFIRMED: the **minimal fix** + the exact **source file:line** to change.

Keep it terse and adversarial. The deliverable is the list of findings, not reassurance.
