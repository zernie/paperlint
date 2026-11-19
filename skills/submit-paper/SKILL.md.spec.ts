// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";
import type { Flow } from "../../scripts/pipeline.ts";
import cameraReady from "../camera-ready/SKILL.md.spec.ts";
import pcPanelReview from "../pc-panel-review/SKILL.md.spec.ts";

export default experimental_skill({
  name: "submit-paper",
  description:
    'End-to-end playbook for submitting a peer-reviewed paper to a double-blind venue (HotCRP workshops/conferences) — from a hardened draft to "ready for review." Covers building and anonymously hosting a reproduction artifact, HotCRP profile + form mechanics, and double-blind hygiene. Use when the paper is drafted and reviewed and it\'s time to actually submit, and for the HotCRP portal via `paperlint submission`: register the paper, choose its topics and PC conflicts, replace the PDF or abstract, and prove the portal holds the latest build. Compose with pc-panel-review (harden first), and with the venue card (presets/<venue>.md in the paperlint package) for venue specifics.',
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Bash",
    "WebSearch",
    "WebFetch",
    "Skill",
  ],
  body: `
# submit-paper — get a reviewed paper from "done" to "ready for review"

Assumes the paper is already hardened (\`harden-paper\`, after \`paper-pipeline\`'s final review). This skill is the submission mechanics — the part that bit us with
avoidable friction the first time. Distilled from the AgenticDev 2026 submission.

## Venue specifics — a CARD beside the venue's preset, not a skill
The venue-specific facts (deadline, page limits, tracks, PC-member conflict list, blind model, format
quirks, whether a supplementary-upload field exists) live in the venue's **card**, \`presets/<venue>.md\`
in the paperlint package, beside the preset \`presets/<venue>.jsonc\` that the lint rules check a
paper against:
- \`presets/agenticdev-2026.md\` — AgenticDev @ ASE (workshop; ASE workshop proceedings).
- \`presets/aisec-2026.md\` — AISec @ ACM CCS (security workshop; ACM DL; harder bar).
- \`presets/aidc-2026.md\` — AIDC @ IEEE ACSAC (workshop; IEEE template, LLM Usage Statement).
- \`presets/msr-2027.md\` — MSR Technical Papers (conference; IEEE template from 2027, appendices count in the page limit).
- \`presets/realm-2026.md\` — REALM @ EMNLP (ACL family, OpenReview).

**The card is prose; the machine-checked format is the PRESET beside it.** A paper declares its venue
in \`<paper>/paperlint.json\`: \`{ "extends": "paperlint:<venue>", "kind": "<kind>" }\`, and the
\`pdf/*\` lint rules judge the built PDF against that preset (page limit per kind, fonts, page size,
columns, font sizes). The card's last section — what the preset is, its call for papers, the rules it
sets and where each comes from — is generated from the preset, so read the numbers there, not from
memory.

**The pattern (follow it for every new venue):** when you fetch a venue's exact submission
instructions, write the numbers into a preset with their quotes and the rest into a card beside it.
A venue with no shipped preset extends a family — \`paperlint:acm-sigconf\` for an ACM venue — in a
preset of the project's own, \`./venues/<name>.jsonc\`, with its card \`./venues/<name>.md\` next to
it (paperlint's \`docs/rules.md\`, "Writing your own venue preset"). A venue preset declares
\`"type": "venue"\`, the venue's \`name\` and the \`url\` of its call for papers. The *mechanics*
stay here; the card is only the facts.

## Publisher specifics — one level ABOVE the venue
Camera-ready mechanics belong to the **publisher**, not the venue: ACM eRights, the submit-vs-final
preamble swap, the copyright block, CCS 2012 codes and the mandatory Source-files upload are identical
for every ACM venue. They live in \`references/publishers/<publisher>.md\`:
- \`references/publishers/acm.md\` — ACM (AgenticDev @ ASE, AISec @ CCS, and every future ACM venue).

The venue card keeps only what is genuinely its own: dates, page limits, its DOI/ISBN, its copyright
line, its blind model. 🔴 **Filing publisher mechanics under one venue is the mistake this split exists
to prevent** — it was written into \`agenticdev-2026/CAMERA-READY-FORM.md\` first, where AISec could
never find it.

## 0. Pre-flight
- PDF builds clean: \`npx paperlint build\` and the render gate (\`docs/render.md\` in the package), ≤ page limit, 0 undefined refs.
- **De-anon scan the PDF text AND every shipped file** before submitting — author-identifying strings
  must return zero; identifying the *studied* artifact is fine, identifying *you* is a desk-reject.
  **MECHANICAL GATE (run it, don't eyeball) — greps the PDF text + every artifact file + inside any
  \`*.zip\` for the identity deny-list, exit non-zero on a hit:**
  \`\`\`
  bash .claude/skills/submit-paper/check-deanon.sh <paper-dir> [pdf=paper.pdf]
  \`\`\`
  Must PASS (exit 0) for a double-blind submission. Deny-list: \`.claude/skills/submit-paper/deanon-denylist.txt\`
  (edit as handles/repos change). It guards the
  single highest reject-vector (an artifact README naming real maintainers/repos is invisible to a
  paper-only read). Only run it on *double-blind* papers — a de-anonymized single-blind PDF is supposed
  to carry your name and will (correctly) fail. Canonical deny-list rationale → \`paper-pipeline/references/anonymization.md\`.

## 1. Build a reproduction artifact (empirical papers)
The single biggest accept-probability lever for a measurement paper — reviewers reward one they can run.
In short: a stdlib-only script that *recomputes* every headline number from raw data and **exits
non-zero on drift**; honest badge/scope (don't claim "raw N runs" for per-arm aggregates); a README
"what reproduces which number" table + LICENSE; scrubbed of \`__pycache__\` and fingerprints before it
ships. Canonical build checklist → \`paper-pipeline/references/artifact-checklist.md\`.

## 2. Host the artifact ANONYMOUSLY (double-blind)
Many workshop HotCRPs have **no supplementary-upload field** — check first; if none, host externally and
\`\\url{}\` the link in the paper's Availability.
- **OSF (osf.io) — best; self-upload, no repo needed.** Create a **Private** project (title = paper
  title, no name), upload the files/zip, then **Contributors → View-only Links → Add → check
  "Anonymize" → Create**. Keep the project private; the anonymized view-only link is what reviewers get.
  OSF has a REST API + \`osfclient\` (\`OSF_TOKEN\`) → **automatable**: with a personal access token you can
  create the project, upload, and mint the link programmatically. Replacing a file through the API: \`docs/osf-artifact.md\` in the package; whatever uploader you use must read the token
  from the \`OSF_TOKEN\` environment variable and never from a file in the repository. Record each
  minted view-only link in your own notes and REUSE it — a second link for the same paper is a
  second thing reviewers can be handed, and only one of them is the one you cited.
- Alternatives: \`anonymous.4open.science\` (anonymizes a **GitHub repo** — needs a repo, not file upload;
  use a *private* source repo so the original isn't Google-findable); a throwaway identity-free account.
  Avoid Google Drive / Zenodo / Figshare for blind review — they leak the owner name.
- **VERIFY in an incognito window** (logged out): the link must show the files with contributors =
  "Anonymous" and your name nowhere. Then put the URL in Availability via \`\\url{}\` and rebuild.

## 3. HotCRP profile (do this once, before the form)
- **Name = one spelling of your name**, identical on every paper you submit.
- **Affiliation**: \`None\` (or \`Unaffiliated\`) if independent.
- **Country/region = where you actually reside**, not citizenship — this sidesteps ACM/IEEE
  sanctions/payment friction for authors from sanctioned countries.
- **ORCID**: create one (free, 2 min) and reuse it on every paper. It's a permanent ID that ties all
  your work to one identity *regardless of name spelling* — the fix for any name-variant problem.
- **Collaborators / other affiliations (COI)**: \`None\` if you have no recent coauthors/advisors.

## 4. The submission form
- **Title**: exactly as it should appear in the proceedings (ACM DL) — plain text, no markup.
- **Submission**: upload **PDF only**. NEVER upload a source zip of the paper directory — sibling files
  (drafts, READMEs, internal notes) leak identity. Only a scrubbed bundle is safe.
- **Abstract**: HotCRP makes you paste it into its own box even though it's in the PDF (it indexes it
  separately). Paste plain text; convert LaTeX math to unicode (\`~0.6%\`, \`≈\`).
- **Authors (anonymous)**: enter your **real name + email** here — this metadata is hidden from
  reviewers; the *PDF* is what's anonymized. That's how double-blind works; it's correct, not a leak.
- **ACM corresponding author**: default (first author).
- **PC conflicts**: check only genuine COIs (past advisor/student, same affiliation, ≤2-yr coauthor).
  An author with no such ties checks **none** — that's honest.

## 5. Submit
- **Before the PDF goes up — and before every Replace — hand the last check to the author, in plain
  words.** Tell them that paperlint passing is not the venue accepting the format: the preset is
  transcribed from a call that can change, and any check can miss something. Ask them to open the
  exact PDF they are about to upload and check it against the venue's call for papers themselves —
  the page count and what counts toward the limit (appendices, references), the template and its
  class options, anonymity, and that every figure, table and reference renders. Upload once they say
  they have looked. (\`paperlint submission update\` prints the same request before it sends.)
- **Save and submit**, then **mark it "ready for review."** A saved draft alone is NOT evaluated — this
  is the step people miss.
- You can edit until the deadline: use **Replace** on the Submission field to swap the PDF for a late
  fix (e.g. adding the artifact link after you host it). Submit early, upgrade before the deadline.
- When the venue preset declares its HotCRP portal, the form is \`paperlint submission\`: see "The portal" below.

## The portal

When the venue preset declares \`"portal"\`, \`npx paperlint submission new|show|update|topics\`
creates, reads and updates the submission; what each prints and refuses: \`docs/submission.md\` in the
package. What the command cannot decide is yours:

- **The token.** When the command reports a missing, misnamed or refused token, relay its message to
  the author verbatim and stop. Never ask for the token in chat, print it or write it to a file.
- **The authors** in \`paperlint.json\` are written by the author; never fill them in from the paper,
  a profile or memory.
- **Topics and every other recorded field are chosen with the author.** Run \`submission topics\`
  (exit 1: the preset's list is stale, say so), propose topics from the abstract and contribution, and
  ask with \`AskUserQuestion\` (\`multiSelect: true\`, each with one line on why it fits). Write only
  the chosen ones into \`"fields"\`, spelled as listed.
- **A PC-conflict guess** (\`portal says: pc_conflicts: …\`) is shown to the author name by name;
  never mark a conflict from the warning alone.
- **Dry run, then ask, then send.** Before every \`--save\`, ask with \`AskUserQuestion\` ("Yes, send
  it" / "No"), naming the paper folder's full path, the PDF's sha256 and quoting the dry run's venue
  check. One yes covers one send. Where the \`submission-confirm\` hook is installed it stops a send
  without that yes and says what to ask. Never \`--save\` to test, or because a dry run passed.
- **An approved copy** that differs from the source blocks \`--save\`; re-approving with
  \`paperlint versions approve\` is the author's decision, never yours.
- **Prove it landed.** \`show\` must read \`match yes — the portal holds this build\` and the intended
  status; anything else is not done, say so.

## 6. Freeze the version you actually uploaded

🔴 **What the reviewers read is the one version git cannot rebuild for you later** — it was built
outside the repo and lives on the portal. Freeze it at the send.

With an approved copy (\`versions/<cycle>/approved.tex\`), \`--save\` refuses while the source differs from it: what is sent is what was approved.

In a paper that keeps \`cycles\` in \`paperlint.json\`, the send freezes it:
\`paperlint submission update <paper> --save\` (and \`new --save\`) writes the exact PDF it sent and the
source the build read into

\`\`\`
<paper-dir>/versions/<cycle id>/submitted.pdf
<paper-dir>/versions/<cycle id>/submitted.tex
\`\`\`

and records their bytes and sha256 in \`versions/lock.json\` (generated; never edit it). After an
acceptance the same command freezes \`camera-ready.{pdf,tex}\`. An upload made on the portal by hand:
put that PDF and its source there under those names and run \`npx paperlint versions lock <paper>\`.
\`npx paperlint versions\` prints which version is under review and how far \`paper.tex\` has moved.

**This is enforced, not advised** — \`cycle/submitted-frozen\` fails a cycle that has a submission and
no frozen \`submitted.pdf\`, and \`versions/layout\` fails a frozen file that no longer matches the lock.
A paper without \`cycles\` records each stage in \`PIPELINE-STATUS.md\`'s \`stages:\` list instead,
checked by \`paper/stages\` and \`paper/source\`; \`npx paperlint versions migrate\` moves it to the
folders once it keeps \`cycles\`.

**Why it is a step and not hygiene:** \`agenticdev-2026\` kept a folder for exactly this for a month and
the file inside was the wrong build (340 952 B vs the real 352 357 B). It surfaced only when a reviewer
cited \`L. 166\` and there was nothing to resolve the line against. A folder without a checker is a
convention with no reader.

## Compose with
- Harden first: \`harden-paper\` (the submit checklist).
- Publisher mechanics (camera-ready): \`references/publishers/<publisher>.md\`.
- Venue specifics: the venue's card \`presets/<venue>.md\` in the paperlint package (e.g.
  \`presets/agenticdev-2026.md\`) for deadlines, page limits, PC-member conflict lists, and whether a
  supplementary upload exists.
`,
});

export const flow = {
  stage: "submit",
  handsTo: () => [cameraReady],
  calls: () => [pcPanelReview],
} satisfies Flow;
