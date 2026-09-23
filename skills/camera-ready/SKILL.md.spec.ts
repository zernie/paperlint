// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "camera-ready",
  description:
    "On acceptance, turn the anonymized-for-review paper into the de-anonymized camera-ready that actually enters the proceedings (ACM DL / IEEE Xplore). Reverses double-blind anonymization, swaps the OSF view-only artifact for a real public repo + an archival DOI, and — for security papers — completes responsible disclosure BEFORE any de-anonymized public release. Use after a notification email says Accept and the venue gives a camera-ready deadline. Compose with submit-paper (upstream) and extend-paper (next).",
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Bash",
    "WebSearch",
    "WebFetch",
  ],
  body: `
# camera-ready — de-anonymize an accepted paper into the final proceedings version

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs camera-ready <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The reviewed PDF was anonymized on purpose. Acceptance flips that: the camera-ready carries your
real name, your real repo, and an archival DOI — and it's the version that gets indexed, so it's the
actual authorship evidence. This skill is the reverse of the anonymization you did at
submission. Work from \`paper-pipeline/references/anonymization.md\` and undo each move it lists.

## 0. Pre-flight
- Confirm the **camera-ready deadline** and the **format instructions** in the acceptance email
  (some venues ship a specific \`acmart\` template version or a copyright block to paste — use theirs).
- Read the reviews once more: camera-ready is your one cheap chance to fold in the must-fix comments
  the meta-review flagged. Do those edits now, not "later."
- **Security papers only**: do not start the public de-anonymized release until §3 (disclosure) is
  logged as complete. The de-anon repo is public and Google-findable the moment you push it.

## 1. Reverse the anonymization
Undo, one by one, everything \`../paper-pipeline/references/anonymization.md\` told you to hide:
- **Class options**: \`\\documentclass[sigconf,review,anonymous]{acmart}\` → \`\\documentclass[sigconf]{acmart}\`.
  Dropping \`review\` also drops line numbers and the review-mode banner; dropping \`anonymous\` un-hides
  the author block.

  🔴 **Dropping \`review\` ARMS a gate that was exempt until this second — run it NOW, in the same
  pass, not at push time:**

  \`\`\`bash
  npx eslint --no-config-lookup --config eslint.config.mjs <paper.tex>
  \`\`\`

  \`tex/future-promise\` exempts review builds deliberately: while a paper is under review, "the
  harness will be released at camera-ready" is true and expected. The moment \`review\` comes off,
  the same sentence becomes a contradiction with the Availability paragraph — and that is exactly
  the defect this rule was created for, on a real submitted paper, where a reviewer had already
  listed the missing artifact as a weakness and the printed camera-ready went on asserting it.

  ⚠️ **Why it must run HERE and not be left to CI** (measured 2026-09-11): the check lives in
  ESLint, and no local hook runs ESLint on \`.tex\` — \`paper-lint.mjs\` stopped carrying it on
  2026-09-07. CI does run it, but CI runs *after a push*, while a camera-ready gets built and
  uploaded to HotCRP before that. Between "dropped \`review\`" and "pushed" the gate does not
  exist. Measured on a fixture: in review mode 0 findings, with \`review\` removed 1 finding —
  the rule flips instantly, so the only question is whether anyone looks.

  ⚠️ And re-run it after the LAST edit to \`paper.tex\`, not once at the start. The original
  defect survived because the promise was swept out of the artifact (\`README\`, \`reproduce.py\`)
  the same day and nobody made the same pass over \`paper.tex\`: one class of defect, two
  carriers, one cleaned.
- **Author block**: replace \`Anonymous Author(s)\` with your real name, affiliation (\`None\` /
  \`Unaffiliated\` if independent — that's honest, not a weakness), city/country, email, and
  \`\\orcid{...}\`. Keep the **ORCID identical** to your prior papers — it's the permanent thread that
  ties every version to one identity regardless of name spelling.
- **Un-blind self-citations**: the "[anonymized for review]" / "our prior work [redacted]" placeholders
  become the real citations. Grep the \`.tex\` for \`anonym\`, \`redact\`, \`blinded\`.
- **"Our tool" naming**: the studied artifact and your own tool get their real names back everywhere —
  title, abstract, figures, captions, artifact README. (For AISec: the anonymized hook names get their
  real names back **only after** disclosure, §3.)
- **Acknowledgements / funding**: add the section that was omitted for blind review (thanks, grant
  numbers, compute credits). None to declare is fine — say nothing rather than invent a funder.

## 2. Swap the artifact: real repo + ARCHIVAL DOI
The review artifact was an OSF anonymized view-only link. The camera-ready needs two things:
- **A real public repo** (your GitHub, de-anonymized, with the generation layer / de-anon code that you
  promised "lands at camera-ready" in the submission README).
- **An archival DOI** — mint it on **Zenodo or Figshare** (GitHub→Zenodo release integration is the
  easy path). A zip sitting in a repo does **not** earn the ACM "Artifacts Available" badge; a DOI'd,
  immutable deposit does. Put the DOI (not just the repo URL) in the Availability section via \`\\url{}\`
  or \`\\doi{}\`.
- Keep the artifact **self-checking** (it still recomputes every headline number and exits non-zero on
  drift) — de-anonymizing it doesn't excuse it from reproducing the paper.

## 3. Responsible disclosure (security papers — BEFORE public release)
For the AISec "Safety Theater" paper the studied hooks are named-but-anonymized, and disclosure to the
maintainers is **owed before** any de-anonymized public release. Do this, in order:
- Identify the named parties (maintainers of each studied hook / tool).
- Send a private disclosure (email / security advisory) with the finding, repro, and a fix suggestion.
  Give a reasonable remediation window (the venue or a 90-day norm).
- **Log it**: who, when, via what channel, and their response — keep the thread. This log is both
  ethics evidence and "impact" material.
- Only after disclosure is sent (and ideally acknowledged) do you push the de-anonymized repo and
  restore real hook names in the camera-ready. If a maintainer needs more time, hold the public release
  and coordinate — the indexed paper can go out with names still generalized if disclosure is pending.

## 4. Re-check the page limit
De-anonymizing **adds lines** — the author block, acknowledgements, un-abbreviated self-cites, real
URLs all grow the paper. Camera-ready page limits are often the same as (or one page more than) review,
and going over is a hard reject at the proceedings stage. Recompile
(\`pdflatex; bibtex; pdflatex; pdflatex\`), confirm 0 undefined refs, and check you're within the limit.
If tight, ACM allows references to spill into the reference-only extra pages.

## 5. Ship
- Rebuild the final PDF, upload to the camera-ready system (often the same HotCRP, or an ACM eRights /
  TAPS pipeline — follow the copyright email).
- Complete the **ACM/IEEE eRights** copyright form → paste the returned copyright block + DOI into the
  \`.tex\` before the final build (ACM validates this).
- Verify the public artifact link resolves and the DOI is live before you submit the final PDF.
- Record the paper's DOI, the artifact DOI, and the ORCID in the paper's HANDOFF — those three IDs are
  the authorship evidence and the anchor the extension (\`extend-paper\`) builds on.

## 6. Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record camera-ready <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record camera-ready <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

**FINDING** — \`<count>\` residual items still open; \`<report-path>\` names them. Add \`--blocking\` for
anything that must not be pushed past: anonymization residue, a dead artifact link, or — on a
security paper — disclosure not yet complete.
**ABSTAINED** — \`no-witness\`: shipped, de-anonymized, DOI live, page limit re-checked, with the DOI
in the note. \`blocked\`: the acceptance notice has not arrived, so there is nothing to make ready.

🔴 That blocking finding is the only one in this pipeline whose consequence is **irreversible**. The
public de-anonymized repo is Google-findable the moment it is pushed, so record it before, not after.

🔴 **There is no PASS**, and on this skill that is not a formality: a stored "shipped" would have
been the one row in the pipeline that could be true of a repo nobody had looked at. The DOI in the
note is the witness. Without it there is nothing to check the row against.

## Compose with
- **submit-paper** (upstream — this reverses what it anonymized).
- **paper-pipeline/references/anonymization.md** — the canonical list of anonymization moves; undo each.
- **extend-paper** (next — the accepted+indexed paper is the base for a second, stronger publication).

## Provenance
Both portfolio papers are anonymized-for-review and **defer de-anonymization + the public artifact to
camera-ready by design**: AgenticDev "Measuring the Wrong Number" (submitted, camera-ready 28 Aug if
accepted) and AISec "Safety Theater" (ships an anonymized artifact; hook names anonymized; responsible
disclosure to named maintainers owed before any de-anonymized public release). ORCID is identical
across both so every indexed version resolves to one researcher.`,
});
