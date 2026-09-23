---
title: "Occupancy research — reproducible-article and paper-QA tooling (does it already exist?)"
created: 2026-08-06
tags:
  [
    paper-pipeline,
    occupancy-research,
    reproducibility,
    latex-tooling,
    citation-verification,
    tool-survey,
  ]
---

# Occupancy research — reproducible-article and paper-QA tooling

**Question asked:** the homegrown pipeline does page-limit counting, anonymity grep, a
number-provenance registry, citation verification, prose linting, section-justification
notes, and artifact-URL checks. Before continuing to maintain it by hand — what already
ships, from whom, and does it actually close these gaps?

**Method:** every claim below was fetched live (WebSearch + WebFetch on 2026-08-06), not
recalled from training. Dates/stars/versions are what the source showed on that date and
will drift — re-check before trusting a specific number months later. This is a survey,
not a recommendation — no design proposed here.

---

## 1. Reproducible-article pipelines (figure/number ↔ code+data)

### showyourwork (rodluger/showyourwork)

- **What it is:** an open-source scientific-article workflow built on **Snakemake** +
  the **tectonic** typesetting engine + **GitHub Actions**. A repo holds LaTeX
  manuscript files, figure-generating scripts, an environment file, and dataset-download
  instructions; on every push, a GitHub Action rebuilds the article from scratch so "the
  compiled article PDF is always in sync with all of the code used to generate it."
- **The exact mechanism that matches the hand-built number-provenance registry:**
  the `\variable{...}` command. Quoting the docs (`show-your.work/en/latest/latex/`):
  `\variable` is an alias for `\input` that "explicitly marks the file as a dependency
  of the manuscript in the workflow graph, which automatically generates the file if it
  is missing **and re-builds the article whenever the script or rule that generates that
  file is modified**." A number in prose is never hand-typed — it lives in a
  Snakemake-tracked output file, and the build DAG regenerates it whenever the
  generating script or its inputs change.
  - **Caveat, read carefully:** this does NOT implement "type a number, then verify it
    against a fresh computation and fail if it drifted." It implements something
    stronger — the number literally cannot be hand-typed at all; it is always the
    freshly generated file content. There is no drift-detection step because there is no
    manual value to drift from. If your pipeline's actual pattern is "author types `47%`
    in prose, CI recomputes `47%` from data and diffs" — showyourwork doesn't do that
    diff; it removes the need for it by construction, which requires migrating every
    such number into a `\variable{}`-managed script output.
- **Is it alive?** Yes, confirmed by checking commit history directly: **most recent
  commit August 4, 2026**, 30+ commits July–August 2026, multiple contributors. Note the
  docs site itself carries a stale scare-banner ("the last release is 2+ years old") —
  that banner is outdated relative to actual GitHub activity; don't trust the docs
  banner over the commit log. 662 GitHub stars.
- **What it explicitly does NOT cover:** citation verification, anonymity, prose
  linting, page limits — confirmed absent from the docs; it's scoped to computational
  reproducibility of figures/values, nothing else in your list.
- **Adoption cost:** high. It's not a linter you bolt on — it replaces your build with a
  Snakemake DAG (rules per figure/table/variable), pins a conda/pip environment, and
  wants tectonic instead of pdflatex. Migrating an existing homegrown Python-to-LaTeX
  script into this model is a rewrite, not an install.
- **Fetched:** https://show-your.work/en/latest/ , https://show-your.work/en/latest/latex/ ,
  https://github.com/showyourwork/showyourwork/commits/main

### Quarto / knitr–R Markdown (the "inline code" mechanism)

- **What it is:** literate-document engines where prose and code interleave; at render
  time the code executes and its return value is spliced into text.
- **Quarto inline code** (docs quote, `quarto.org/docs/computations/inline-code.html`):
  `` `r mean(x)` `` style inline expressions — _"Inline expressions are **always
  evaluated** when rendering and previewing `.qmd` files."_ Same idea in R
  Markdown/knitr: `` `r format(1234567, big.mark=",")` `` inline in the prose, evaluated
  on every knit.
- **This is the closest shipped analogue to "a number in text must be recomputed from
  data at render time."** Same structural move as showyourwork's `\variable`: the number
  is never manually typed, so there's nothing to drift. Difference from showyourwork:
  Quarto/knitr compute inline in the same document (lighter-weight, no separate
  Snakemake DAG); showyourwork tracks values as separate build-graph artifacts (heavier,
  but works across a whole multi-figure paper with explicit dependency edges).
  - **Caveat:** Quarto's **freeze** feature (caching computed output so CI doesn't
    re-execute code every time) can reintroduce exactly the staleness this mechanism is
    meant to prevent, if a data file changes but the freeze cache isn't invalidated —
    that's a real footgun to watch for if adopting Quarto for this reason. The docs
    fetched didn't cover freeze-vs-inline-code interaction explicitly; treat as an open
    question, not a resolved caveat.
- **MyST / Jupyter Book 2:** same executable-document family (built on the MyST Document
  Engine, a full rewrite replacing the old Sphinx-based Jupyter Book). Status as of
  2026: **Jupyter Book 2 is an active subproject of Project Jupyter**, myst-parser sees
  continued activity; some components (MyST-NB specifically) are explicitly called out
  as "in maintenance mode" — not the whole stack. It provides the same "code executes,
  value gets embedded" mechanism as Quarto/knitr, aimed more at books/docs than
  camera-ready conference PDFs; ACL/ACM/IEEE LaTeX-class output is not its native path.
- **papermill:** parameterizes and executes **Jupyter notebooks** programmatically (tag a
  `parameters` cell, pass values, execute headlessly, save the output notebook). This is
  a batch-execution tool, not a text/number-embedding tool — it doesn't put numbers into
  LaTeX prose. Relevant only as plumbing if your pipeline's "recompute" step is itself a
  notebook.
- **Pweave:** older Python literate-programming tool (Sweave/knitr equivalent for
  Python). Search turned up **no clear current maintenance signal** — recent search
  results returned unrelated "Weave" products (Weaveworks GitOps, weave.ai), not Pweave
  itself. Treat as likely dormant/superseded by Quarto for new work; did not find
  positive evidence of 2025–2026 activity either way — flagging as **unverified**, not
  "confirmed dead," per the retry-before-declaring-dead rule.
- **Adoption cost:** Quarto — moderate (new toolchain, `.qmd` format, but has LaTeX/PDF
  output including some conference templates); knitr/R Markdown — moderate if already
  in the R ecosystem, awkward if the pipeline is Python-native; MyST/Jupyter
  Book — moderate-high, not conference-template-native.
- **Fetched:** https://quarto.org/docs/computations/inline-code.html ,
  R Markdown/knitr inline-code docs (rmarkdown.rstudio.com, rstudio.github.io/rmarkdown),
  https://github.com/jupyter-book/mystmd , https://executablebooks.org/en/latest/blog/2024-05-20-jupyter-book-myst/

---

## 2. Publisher-side format checkers

### aclpubcheck (acl-org/aclpubcheck)

- **What it checks** (README, quoted): "automatically detects **font errors, author
  formatting errors, margin violations, outdated citations** as well as many other
  common formatting errors in papers that are using the LaTeX sty file associated with
  ACL venues." Also: page-numbering/bottom-margin checks, paper-type-specific rules
  (`--paper_type {long,short,other}`).
- **Operates on the built PDF**, not the LaTeX source — you run
  `python3 aclpubcheck/formatchecker.py --paper_type long paper.pdf`.
- **Known false positives** (README, quoted): _"some of the warnings generated for
  citations may be spurious and inaccurate, due to parsing and indexing errors"_; margin
  checks generate spurious errors on line-numbered review-mode PDFs.
- Citation checking uses the **Scholarcy API** against ACL Anthology/DBLP/arXiv — this
  is the same general shape of check as the citation-verification tools in §4, but
  scoped to "is this citation outdated" (e.g., cite the workshop version when a
  conference version now exists), not "does this citation exist at all / does the title
  match."
- **Used by ACL pub chairs themselves** for camera-ready checks, and is explicitly
  recommended for **pre-submission** self-checking too.
- **Superset tooling from other publishers, confirmed to exist:**
  - **IEEE PDF eXpress** — free online service; converts source to PDF or validates an
    author-created PDF against Xplore's compatibility spec, "check author-created PDFs
    and report whether or not they are IEEE Xplore-compatible."
  - **IEEE also ships**: the **IEEE LaTeX Analyzer** (validates LaTeX source) and the
    **IEEE Reference Preparation Assistant** (checks reference-list formatting) —
    separate tools from PDF eXpress.
  - **ACM TAPS** (The ACM Production System, homepage fetched directly): converts
    LaTeX/Word source into PDF+HTML5+XML for the Digital Library. Fetched page confirms
    it checks: LaTeX package-allowlist compliance, required rights-commands presence,
    figure/image file-path validity, citation-style conformance (SIGGRAPH/SIGPLAN
    variants), Word-doc validation status. **Quoted directly: "If the program to which
    you are submitting your content has a page limit associated with the final
    documentation, it is YOUR responsibility to make sure that the generated PDF version
    of your content meets that requirement."** — TAPS explicitly disclaims page-limit
    enforcement, and the page makes no mention of URL-resolution or font-embedding
    checks; a human production editor reviews after the fact for what TAPS misses.
  - **Springer tooling:** not found as a distinct public automated checker in this
    search pass — Springer's LaTeX class + submission portal exist, but no
    Springer-branded pdfcheck/analyzer equivalent to IEEE's or ACM TAPS's surfaced.
    Flagging as **not found**, not confirmed absent (would need a deeper Springer-portal-specific
    pass to call this empty with confidence).
- **Is there a maintained superset of aclpubcheck?** Not found as a single tool — the
  "superset" is really the union of aclpubcheck (ACL-specific) + IEEE's three tools +
  ACM TAPS, each scoped to its own publisher's house style; no cross-publisher
  format-checker exists.
- **Fetched:** https://github.com/acl-org/aclpubcheck ,
  https://homes.cs.washington.edu/~spencer/taps/taps.html ,
  IEEE Author Center pages (journals.ieeeauthorcenter.ieee.org)

---

## 3. LaTeX-source QA tools

| Tool                                      | What it does                                                                                                                                                                                                                              | Anonymity strip?                                                               | Comment strip?                                               | Status                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **chktex**                                | Semantic/style linter — "Lint for LaTeX," catches typographic/spacing mistakes (e.g. unescaped space after abbreviation, `...` vs `\ldots`)                                                                                               | No                                                                             | No                                                           | **Alive** — v1.7.10 released 2026-02-26, "6 - Mature" on Savannah, in TeXLive/CTAN                                        |
| **lacheck**                               | Older, narrower style checker, similar class of checks to chktex                                                                                                                                                                          | No                                                                             | No                                                           | Still shipped in TeX distros; no independent recent-release signal found                                                  |
| **textidote** (sylvainhalle/textidote)    | Wraps LanguageTool for grammar/spelling (12+ languages) over de-macro'd LaTeX text; **also does structural sanity checks**: every figure referenced?, section-title capitalization, `\cite`/`\citep` mixing, hard-coded numbers vs `\ref` | No — explicitly confirmed: does not check anonymity or citation _accuracy_     | No                                                           | 1.1k stars, has a maintained GitHub Action (`textidote-action`)                                                           |
| **latexdiff**                             | Produces a marked-up diff between two LaTeX versions (word-level, not line-level)                                                                                                                                                         | N/A (diff tool)                                                                | N/A                                                          | Standard, shipped in TeX distros                                                                                          |
| **rubber** / **latexmk**                  | Build wrappers (dependency-aware recompilation, bibtex/biber re-runs)                                                                                                                                                                     | N/A                                                                            | N/A                                                          | Both alive — rubber has an active GitLab with 3 maintainers; latexmk ships in TeXLive, "not deprecated," more widely used |
| **CheckMyTex** (d-krupke/CheckMyTex)      | **Aggregator**: bundles aspell/pyspellchecker (spelling), LanguageTool (grammar), chktex (LaTeX smells), proselint (prose advice), plus siunitx-usage and cleveref-usage checks, into one CLI walkthrough                                 | No                                                                             | No                                                           | Alive, PyPI-published, Unix-only                                                                                          |
| **arxiv-latex-cleaner** (google-research) | Strips `%`-comments, `\iffalse...\fi`/`\if0...\fi`/`\begin{comment}` blocks, removes unused `.tex`/image files, compresses images/PDFs, deletes user-specified commands, externalizes TikZ                                                | **No** — confirmed no author-name/affiliation/acknowledgment stripping in docs | **Yes**, for actual `%` comments and `\iffalse`-style blocks | Alive, v1.0.11, 176 commits                                                                                               |
| **ALC-NG** (COMSYS/ALC-NG)                | Extends arxiv-latex-cleaner: handles custom `\if` conditionals, strips EXIF metadata from images/PDFs via exiftool, validates cleaned output is pixel-identical to the original PDF                                                       | **No** — confirmed no anonymization feature                                    | Enhanced (custom conditionals)                               | Backed by a 2026 IEEE S&P paper (arXiv:2604.20927), 45 stars, "experimental, use at your own risk"                        |

**Directly answering the two specific asks:**

- **"He shipped a PDF with working editorial comments typeset into it" — does any tool
  catch this?** Not found. `todonotes`/`mnotes`-style LaTeX packages exist to
  _hide_ comments in a "final" build mode (`mnotes` explicitly has a
  no-comments-in-camera-ready option), but that's an authoring convention the author
  must remember to invoke — **no tool was found that detects a `\todo{}`/margin-note
  macro that rendered visibly into the compiled PDF.** This is a real gap.
- **"He separately shipped a broken `\url`" — does any tool catch this?** chktex/lacheck
  check LaTeX _syntax_ of `\url{}`, not whether the URL _resolves_. That's a distinct,
  network-dependent check — see §4 below (pdf-link-checker) for the tool that actually
  does this, which works on the built PDF, not the LaTeX source.

**Anonymity specifically:** searched directly for automated leak-detection. What exists
is **toggle packages** (`anonymous-acm.sty`, `anonymize.sty`, AAAI's anonymous-submission
instructions) that let an author flip an `\ifAnonCondition` to hide the author block —
these are _authoring conventions_, not _detectors_. **No automated tool was found that
greps a compiled paper's body/acknowledgments/footnotes for identity leaks** (self-cites
in first person, institutional URLs, funded-by statements) — best practice found was a
manual checklist (Nature's double-blind checklist PDF). **This is a genuinely empty
category** — see ranked table.

**Fetched:** https://www.nongnu.org/chktex/ , https://github.com/sylvainhalle/textidote ,
https://github.com/petrhosek/rubber , https://github.com/d-krupke/CheckMyTex ,
https://github.com/google-research/arxiv-latex-cleaner , https://github.com/COMSYS/ALC-NG

---

## 4. Built-PDF-level checks

| Tool                           | What it does                                                                                                                                                                  | Status                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pdfx** (metachris/pdfx)      | Extracts text/metadata/references (embedded PDF refs, URLs, DOIs, arXiv IDs) from a PDF; **"can find broken hyperlinks"**; optional parallel download of every referenced PDF | Established Python/CLI tool, works as library or CLI                                                                                                                                                                                                                                                                |
| **pdf-link-checker** (bootlin) | Parses a PDF, extracts hyperlinks, sends HTTP requests to each, reports broken ones                                                                                           | GPLv2, free software                                                                                                                                                                                                                                                                                                |
| **pdf-link-checker** (a-nau)   | Same idea, packaged as both a **CLI and a GitHub Action** (`v0.2.0`) — this is the one to actually wire into CI                                                               | MIT, 8 stars, 21 commits — small but does the specific job and is CI-ready                                                                                                                                                                                                                                          |
| **qpdf**                       | Structural PDF transform/inspect tool (linearize, decrypt, page manipulation) — general PDF plumbing, not a paper-QA-specific checker                                         | Standard, mature                                                                                                                                                                                                                                                                                                    |
| **veraPDF**                    | Industry-standard **PDF/A / PDF/UA validator** — checks standards conformance including embedded-font compliance via Schematron assertions against a validation profile       | Actively maintained (PDF Association-backed); note a filed issue where **veraPDF flags a LaTeX `pdfx`-package PDF/A output as non-compliant while Adobe Preflight passes it** — i.e. even the standards validators disagree with each other on LaTeX-generated PDFs, worth knowing before trusting a single verdict |

**Directly answers "does font-embedding get checked":** yes — veraPDF does this, but
it's a PDF/A-conformance tool, so adopting it means also caring about (or filtering
around) all the _other_ PDF/A rules that have nothing to do with your paper (color
spaces, XMP metadata, etc.) — it's not a scoped "just check my fonts" tool.

**Fetched:** https://github.com/metachris/pdfx , https://github.com/a-nau/pdf-link-checker ,
https://docs.verapdf.org/validation/ , https://github.com/veraPDF/veraPDF-library/issues/957

---

## 5. Citation / reference verification

This is the section that matters most for **"nine fabricated citation titles with
correct arXiv IDs"** — the specific failure mode where the identifier resolves but the
title/authors attached to it are hallucinated.

| Tool                                                          | Verifies title-vs-DOI/arXiv match?                                                                                                                                                                                                                                                                                                                                                               | Detects fabrication?                                                                               | Status                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rebiber** (yuchenlin/rebiber)                               | **No.** Normalizes bib entries against DBLP/ACL-Anthology official records and replaces stale arXiv-only cites with published-venue info. Confirmed via docs: it does _not_ verify title accuracy or detect fabrication — it assumes the entry is legitimate and just standardizes/upgrades it.                                                                                                  | No                                                                                                 | Alive — v1.2.0 (July 2024), 3,000 stars                                                                                                                                                                                                           |
| **bibtex-tidy** (FlamingTempura/bibtex-tidy)                  | No — pure formatting/dedup tool, no DOI/Crossref lookup                                                                                                                                                                                                                                                                                                                                          | No                                                                                                 | Alive — 1.1k stars, 626 commits, v1.14.0-era, has pre-commit hook + Docker                                                                                                                                                                        |
| **doi2bib** (multiple independent implementations)            | Converts a known-good DOI/arXiv-ID into a BibTeX entry via Crossref — this is generation, not verification of an entry you already have                                                                                                                                                                                                                                                          | No                                                                                                 | Multiple small, independently maintained clones (PauCasanova, vandroogenbroeckmarc, pazner, mseri, bibcure, OpenByteDev) — all narrow single-purpose scripts                                                                                      |
| **fixbibtex** (jaimergp/fixbibtex)                            | **Partial yes.** Queries Crossref with author+title, computes a similarity score; **below 0.75 similarity it falls back to a DOI-based query and updates the entry if the DOI-fetched title matches ≥0.75** — this is a real "does the title match what the identifier actually points to" check                                                                                                 | Partial (via the similarity-threshold fallback)                                                    | Found via search, smaller/less-established than the others                                                                                                                                                                                        |
| **BibTeX Verifier** (merfanian.github.io/Bibtex-Verifier)     | **Yes, explicitly.** Quoted: _"flags entries whose titles don't match any known publication — catching fabricated references from AI-generated bibliographies — by querying both Semantic Scholar and CrossRef."_ Runs client-side in-browser (no upload of the whole .bib, only titles sent to public APIs)                                                                                     | **Yes, this is its stated purpose**                                                                | Open source, MIT-licensed, GitHub-hosted, but a **hosted web app / manual drag-and-drop tool — no CLI or CI integration found**, and its own FAQ admits "arXiv preprints, workshop papers, theses, and very recent publications may not be found" |
| **citecheck** (jhlee0619/citecheck)                           | **Yes.** MCP server + TypeScript CLI; extracts refs from `.bib`/`.tex`/`.md`/`.txt`/`.docx`, validates against **PubMed, Crossref, arXiv, Semantic Scholar**, returns structured correction proposals with "replacement-safety diagnostics." Companion software paper on arXiv (2603.17339), submitted to **JOSS** (under review as of March 2026, tracked at `openjournals/joss-reviews#10224`) | **Yes, core purpose** ("citation hallucinations" from LLMs named explicitly in the paper abstract) | v0.1.12, installed via `npx -y @jhlee0619/citecheck`, no Python toolchain needed — **light adoption cost**. Young project (JOSS review still pending in-progress as of the fetch) — treat as promising but not battle-tested                      |
| **sciwrite-lint** (authentic-research-partners/sciwrite-lint) | **Yes**, and goes further — see below                                                                                                                                                                                                                                                                                                                                                            | **Yes**                                                                                            | See detailed writeup below                                                                                                                                                                                                                        |
| **Crossref / OpenAlex / Semantic Scholar APIs directly**      | These are the data sources every tool above queries. You could write your own thin verifier directly against them (which is arguably what the homegrown pipeline already half-does)                                                                                                                                                                                                              | N/A — raw APIs, no verification logic of their own                                                 | All three actively maintained public APIs                                                                                                                                                                                                         |

### sciwrite-lint — closest single match to the whole described pipeline

This is the most direct occupant of the described problem space, and worth reading in
detail rather than summarizing away.

- **What it is**, quoting its own framing: applies "the linting paradigm from software
  engineering to citation verification: it runs entirely on the researcher's machine,"
  using free public databases, a single consumer GPU, and open-weight local LLMs (no
  cloud API calls).
- **23 automated checks**, spanning categories that map almost one-to-one onto the
  homegrown pipeline:
  - **Reference verification** — existence across CrossRef/OpenAlex/Semantic
    Scholar/Open Library/Library of Congress; metadata accuracy (title/authors/year/venue);
    **retraction detection** against 60,000+ Retraction Watch entries (this is a check
    the homegrown pipeline almost certainly does NOT have); fuzzy matching when no DOI
    present.
  - **Claim support** — downloads full text from 14 open-access sources (arXiv, PMC,
    bioRxiv, NBER, etc.), runs GROBID parsing + section-level embeddings, classifies
    _why_ each citation is used (evidence / contrast / method / attribution / context),
    and checks whether the cited paper's own claims actually support what you say it
    supports. This is a genuinely different, deeper check than any other tool found —
    closer to "does this citation actually say what I claim it says" than "does this
    citation exist."
  - **Manuscript consistency** — cross-section contradiction detection, **number/table
    disagreement checks**, arithmetic and percentage validation, sample-size (N)
    tracking across the paper, causal-language-in-correlational-study flagging,
    abstract-vs-body alignment, p-value-vs-interpretation consistency, "structure
    promises" (does the intro promise something the body doesn't deliver), prose-quality
    scoring per sentence.
  - **Figure analysis** — caption-to-content matching, text-to-figure accuracy, axis
    labels, figure/table cross-agreement.
  - **Deterministic text checks** — dangling `\cite{}` (no matching `.bib` entry),
    dangling `\ref{}` (no matching `\label{}`), unreferenced figures.
- **Explicitly does NOT do** (confirmed absent from its own scope): **page limits,
  anonymity/double-blind stripping, artifact-URL validation** (only in-text footnote
  URLs get verified, not a general "does every URL resolve" sweep), and prose linting
  is limited to grammar/word-choice, not the deeper structural prose work.
- **Adoption cost is real and non-trivial:** requires an **NVIDIA GPU with 16+ GB VRAM**,
  Docker/Podman, CUDA drivers, NVIDIA Container Toolkit, plus a GROBID container for PDF
  parsing. Install via `uv tool install sciwrite-lint --python 3.13` or a manual
  pip+editable-install path. This is not a `pip install` weekend add — it's a local
  ML-inference stack.
- **Status:** MIT license, 24 stars, 3 forks — small, young (arXiv:2604.08501, submitted
  April 2026, author Sergey V. Samsonau). Not battle-tested at scale; the deterministic
  checks (dangling cites/refs) are cheap and safe to adopt regardless of the GPU-heavy
  LLM checks; the claim-support/consistency checks are the valuable-but-expensive part.
- **Fetched:** https://github.com/authentic-research-partners/sciwrite-lint (full README),
  https://arxiv.org/abs/2604.08501

### Adjacent research (not adoptable tools, but worth knowing the field exists)

- **ScientistOne** (arXiv:2605.26340) — a "Numerical Claim Provenance Rate (CPR)"
  concept: an LLM-authoring system annotates every number-bearing sentence with a source
  log-line tag, then a claim verifier checks the written number against the log within a
  5% tolerance. This is architecturally the closest published concept to "number
  provenance registry with drift detection" in the entire search — but it's a research
  paper describing an internal component of an autonomous-research-agent system, **not
  a standalone tool you can install**.
- **PaperTrail** (CHI 2026, arXiv:2602.21045) — a claim-evidence UI for grounding LLM
  scholarly Q&A answers in source documents; adjacent field, not a paper-QA pipeline
  tool.

---

## 6. Whole "paper CI" pipelines

- **latex-action** (xu-cheng/latex-action) — GitHub Action that compiles LaTeX to PDF in
  a full TeXLive Docker container, multiple engines supported. This is **compilation
  only** — no QA checks bundled.
- **paper-maker** (andycasey/paper-maker) — builds a LaTeX manuscript via GitHub Actions
  and pushes the compiled PDF back into the repo. Same scope: build automation, not QA.
- **paperaj** (dermatologist/paperaj) — standalone script or GitHub Action, similar
  build-only scope.
- **No maintained "paper-ci" template repo was found that bundles a battery of QA checks
  (format + anonymity + citations + page-limit + link-check) into one composable CI
  workflow.** The GitHub topics `reproducible-paper` and `academic-paper-template`
  surfaced RMarkdown/Quarto reproducibility templates and generic paper-writing
  templates, but nothing that already wires together aclpubcheck + chktex + a citation
  verifier + a link checker + a page-limit check as one pipeline. **This is the clearest
  fully-empty category in the whole survey** — closest you get is manually chaining
  latex-action (build) → aclpubcheck (format) → a-nau/pdf-link-checker (links) →
  citecheck or sciwrite-lint's deterministic checks (citations) yourself, which is
  functionally what the homegrown pipeline already is.
- **Fetched:** https://github.com/xu-cheng/latex-action , https://github.com/andycasey/paper-maker ,
  GitHub topic pages for `reproducible-paper`, `academic-paper`, `citation-verification`

---

## 7. Page-limit counting

- **texcount** (CTAN package, Perl script) — mature, shipped in every TeX distribution.
  Directly answers the page-limit-counting need: `-char`/`-charws` for character-limit
  venues, `-1` flag prints a bare number for scripting a hard-limit check, `-inc` to
  recurse across included files, `-total` to combine. Drives VS Code LaTeX Workshop's
  status-bar count and TeXstudio/TeXmaker's built-in counters.
- This is squarely **ADOPT** — it's exactly the deterministic check already being
  hand-rolled, already packaged, already in the TeX distro you're already using.
- **Fetched:** CTAN texcount page, app.uio.no/ifi/texcount/

---

## 8. Section-justification notes

Searched directly for any tool/convention matching "a note attached to each section
justifying why it exists, checked mechanically." Found only generic academic-writing
advice (Editage, Duke/UCLA library guides on "how to write a research justification
section") — this is writing-craft advice about a _type of section content_, not a
mechanical process/tool for the _author's own notes about structure_. **Confirmed
genuinely empty** — no shipped tool occupies this at all; it appears to be a bespoke
process invention specific to this pipeline.

---

## Ranked table

| #   | Problem we hand-built                                                                                         | Shipped tool that already does it                                                                                                                                                                                                | Adoption cost                                                                                                           | Verdict                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Page-limit / word-limit counting                                                                              | **texcount**                                                                                                                                                                                                                     | Already in your TeX distro; one CLI flag                                                                                | **ADOPT**                                                                                                                                                                                     |
| 2   | Number-in-text must be recomputed from data, build fails on drift                                             | **showyourwork `\variable{}`** (Snakemake-tracked) or **Quarto/knitr inline code** (`` `r expr` ``) — both eliminate drift by construction rather than detecting it                                                              | High (showyourwork = Snakemake rewrite) / Moderate (Quarto = new doc format, partial LaTeX/conference-template support) | **ADOPT-PARTIAL** — real mechanism exists but requires migrating numeric claims into script-output files or inline code cells; won't slot into the existing Python-to-LaTeX script unmodified |
| 3   | Citation exists / metadata accurate / not fabricated                                                          | **citecheck** (MCP+CLI, npx install, checks Crossref/arXiv/PubMed/S2) or **sciwrite-lint**'s deterministic + reference-verification layer                                                                                        | Low (citecheck) / High for the GPU-based claim-support layer (sciwrite-lint)                                            | **ADOPT** (citecheck for the light case) / **ADOPT-PARTIAL** (sciwrite-lint for the deep case)                                                                                                |
| 4   | Fabricated citation: correct arXiv ID, wrong/hallucinated title                                               | **BibTeX Verifier** (web tool, explicit stated purpose) + **fixbibtex** (similarity-threshold DOI fallback) + **citecheck**/**sciwrite-lint** (same via API cross-check)                                                         | Low–Moderate (no single CLI is dominant; BibTeX Verifier is browser-only, no CI hook)                                   | **ADOPT-PARTIAL** — the check exists in multiple independent tools, none is a clean CI-native single answer yet                                                                               |
| 5   | ACL/venue format compliance (fonts, margins, page numbers, outdated cites)                                    | **aclpubcheck**                                                                                                                                                                                                                  | Low — `pip install`, run on built PDF                                                                                   | **ADOPT** (if ACL-family venue)                                                                                                                                                               |
| 6   | Publisher PDF/Xplore/DL compatibility                                                                         | **IEEE PDF eXpress** / **ACM TAPS**                                                                                                                                                                                              | Low, but venue-specific and often manual/portal-based, not CI-scriptable                                                | **ADOPT-PARTIAL** — exists but not automatable into your own CI, and TAPS explicitly disclaims page-limit checking                                                                            |
| 7   | LaTeX style/semantic lint (typos, spacing, macro misuse)                                                      | **chktex**, **lacheck**, or the aggregator **CheckMyTex**                                                                                                                                                                        | Low                                                                                                                     | **ADOPT**                                                                                                                                                                                     |
| 8   | Prose quality / grammar                                                                                       | **textidote** or **CheckMyTex**'s LanguageTool+proselint bundle                                                                                                                                                                  | Low–Moderate (needs LanguageTool + Aspell installed)                                                                    | **ADOPT**                                                                                                                                                                                     |
| 9   | Comment/anonymity-relevant content stripped before arXiv submission                                           | **arxiv-latex-cleaner** (comments only) / **ALC-NG** (comments + EXIF)                                                                                                                                                           | Low                                                                                                                     | **ADOPT-PARTIAL** — strips comments, does NOT anonymize                                                                                                                                       |
| 10  | Anonymity leak grep (self-cites, institutional URLs, funded-by lines, author names in body)                   | _(only toggle-packages: `anonymous-acm.sty`, `anonymize.sty` — hide-on-render, not detect)_                                                                                                                                      | N/A                                                                                                                     | **GENUINELY EMPTY**                                                                                                                                                                           |
| 11  | Editorial comment/`\todo` macro accidentally left visible in shipped PDF                                      | _(none found)_                                                                                                                                                                                                                   | N/A                                                                                                                     | **GENUINELY EMPTY**                                                                                                                                                                           |
| 12  | Broken `\url` / dead links in the built PDF                                                                   | **a-nau/pdf-link-checker** (CLI + GitHub Action) or **bootlin/pdf-link-checker** or **pdfx**                                                                                                                                     | Low — `pip install`, or drop-in GitHub Action                                                                           | **ADOPT**                                                                                                                                                                                     |
| 13  | Font embedding / PDF standards conformance                                                                    | **veraPDF**                                                                                                                                                                                                                      | Low–Moderate (install + pick a validation profile; verdicts can disagree with Adobe Preflight on LaTeX output)          | **ADOPT-PARTIAL**                                                                                                                                                                             |
| 14  | Artifact-URL checks (does the linked OSF/Zenodo/GitHub artifact actually resolve and is it archived properly) | **pdf-link-checker** covers URL-resolves; **artifact-evaluation committee checklists** (Zenodo/Software Heritage DOI requirements per-venue) cover the archival-quality bar, but that's a human checklist, not automated tooling | Low (link-resolves part) / N/A (archival-quality part is manual per-venue)                                              | **ADOPT-PARTIAL**                                                                                                                                                                             |
| 15  | Section-justification notes (why does this section exist, mechanically checked)                               | _(none found — only generic "how to write a justification section" writing advice)_                                                                                                                                              | N/A                                                                                                                     | **GENUINELY EMPTY**                                                                                                                                                                           |
| 16  | One CI pipeline that bundles all of the above ("paper-ci")                                                    | _(none found — closest are build-only Actions like latex-action/paper-maker, with zero QA bundled)_                                                                                                                              | N/A — would have to be assembled by hand from rows 1–14                                                                 | **GENUINELY EMPTY**                                                                                                                                                                           |

### Bottom line for the "don't reinvent the wheel" instinct

The instinct was **partly right and partly wrong**. Right: page-limit counting (texcount),
LaTeX linting (chktex/CheckMyTex), link-checking (pdf-link-checker), venue-format
checking (aclpubcheck), and citation-existence/fabrication checking (citecheck,
BibTeX Verifier, sciwrite-lint) are all real, shipped, and should replace the equivalent
homegrown pieces outright. Wrong: the **number-provenance-registry mechanism** the
pipeline hand-built has no drop-in replacement — the shipped equivalents
(showyourwork, Quarto/knitr) solve the same underlying problem but by a structurally
different, more invasive route (own the whole document-generation pipeline) rather than
a bolt-on verifier; and **three pieces of the pipeline — anonymity-leak grep,
typeset-comment detection, and section-justification notes — are not occupied by
anyone**, confirmed by direct search, not just by failing to find them. Those three are
the only parts actually worth continuing to hand-build; everything else in the ranked
table above is a wheel that already exists somewhere in this survey.

---

## 🔴 Verified by running it, 2026-08-24 — the note surveyed 7 tools, adopted 0

Measured on the day of the check: `rebiber · citecheck · sciwrite-lint · fixbibtex · bibtex-tidy ·
aclpubcheck` — **zero mentions** outside this file (no skill, no script, no hook). The file itself
is cited only by other research notes. So the research was good and **never once turned into a
decision**.

**And three of the facts above did not survive being run.** This is not a jab at the note's
author — it is about method: the table was built by reading READMEs and APIs, not by executing
anything.

| row above                                                  | what running it on 24.08 showed                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `betterbib` — **missing from the table entirely**          | and it is the most obvious candidate (`sync` against Crossref/**DBLP**/PubMed/arXiv). And it is **NO LONGER OPEN-SOURCE**: `pip install` installs a compiled `.sfc` bundle + `stonefish_license_manager`, the import fails; the vendor's site (texworld) requires buying a license. Not adopting it — but this should have been known beforehand, not after |
| `citecheck` — "v0.1.12", "MCP server **+ TypeScript CLI**" | npm registry: version **0.1.0**, published 2026-04-11, the only `bin` is `citecheck-mcp`. **There is no CLI, it is an MCP server only.** `npx … --help` prints nothing and exits 0                                                                                                                                                                          |
| `rebiber` — "does not verify title accuracy → No"          | the verdict is **right about its stated purpose and wrong in practice**: it does not verify by itself, but **diffing its output against ours** found two real defects on 24.08. A tool should be judged by what its OUTPUT gives you, not by how it advertises itself                                                                                       |

⚠️ Plus a measured limit of `rebiber` itself: its **local DBLP dump** missed
`raji2021benchmark`, which the live DBLP API found immediately. For cross-checking, hit the API.

**What follows from this for our venue (AgenticDev @ ASE = ACM, DOI `10.1145/…`,
ISBN `979-8-4007-…`):** there is no community offline checker for ACM **by design** — the check is
done publisher-side (the HotCRP format checker + TAPS), which lines 138–158 above already
established. The ready-made author-side mechanism for an ACM paper is **`acmart` itself**: on
24.08 it honestly printed three camera-ready blockers to `paper.log` (wrong fonts → silent
Computer Modern; figures missing `\Description`; missing CCS), and none of them was read. Wired
into `render-paper/check-render.sh` — twenty lines of grep, not a new tool.

**The rule this block was added for:** an occupancy note is not closed until every row has a
recorded **ADOPT / REJECT + reason** verdict, and until at least the ADOPT rows have been **run**.
A table of stars and version numbers is not an occupancy check yet — it is its draft.
