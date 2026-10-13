# Labelling-page checklist

Seven rules for a page where a person labels items from a paper's study (gold labels, a blind review of
model outputs, "is this a real boundary case"). Each rule says what to do, why, and how to check it.
They come from four such pages built in one week; each rule is a defect one of them shipped, or a
failure the next answer would have hidden.

The generator beside this file, `example-generator.py`, does rules 2 to 5 and 7 by construction. Rules
1 and 6 are things the agent does. Read the rule before changing the part of the generator that
carries it.

## 1. Test it in the claude.ai phone viewer before sending the link

**Do.** Open the published artifact in the claude.ai viewer at phone width (the person's own phone
is the real test), answer one item, reload, press "Next unanswered", and only then send the link.
If you cannot open the viewer yourself, say so in the hand-over and ask for a one-minute smoke test
(answer one item, reload, check that the answer is still there) before the real run. Then list the
store (`ArtifactData` `list` of `answers`) and confirm the test answer is in it.

**Why.** The viewer can size its frame to the page. A page that grows with its content cannot scroll
itself, so `scrollIntoView` does nothing, and a fixed-position toast can sit outside the visible part
of the frame. A test in a plain browser passes on both and proves nothing about the viewer.

**Check.** The hand-over says what was exercised in the viewer and what was not. "Tested in a
browser" is not that sentence.

## 2. Navigation never relies on in-page scrolling or toasts

**Do.** Make "Next unanswered" a filter. It hides every finished item and every finished group,
leaving only what is left, and a note at the top lists those items and what each still needs
("G004 needs correct?; boundary"). Put every message (saving, saved, failed, missing) inline in the
card it is about. No `scrollIntoView`, no `position: fixed`, no toast, no `100vh` height.

**Why.** Rule 1: in the viewer, jumping to the next item does nothing and a toast may never be seen. A
filter works in any frame, because the next thing to answer is simply the first thing on the page.

**Check.** `grep -E 'scrollIntoView|position: *fixed|100vh|alert\(' page.html` finds nothing.

## 3. An item counts as done only when every question on it is answered

**Do.** Done means all questions answered. The card shows which one is missing ("Still needs:
boundary"). The progress counter counts complete items only, so "7 of 12" means 7 items with every
question answered. A group is finished when all its items are and its familiarity question (rule 5)
is answered.

**Why.** An item with one of two questions answered looks finished on a scan, drops out of the count,
and surfaces weeks later as a gap in the data. A counter that counts partial items reports progress
that the analysis cannot use.

**Check.** Answer one question of a two-question item: the counter stays put and the card names the
other question.

## 4. Blind: the page tells the labeller nothing about the answer or the source

**Do.**

- Neutral ids (`G001`, `G002`, ...). The link from id to source id lives in `key.json`, which is not
  part of the page.
- The order is fixed by a seed and does not follow the input order or the source.
- No model answer, check verdict, difficulty tag or source label on the page.
- The generator refuses to build when an item carries a field outside an allow-list. It does not drop
  the field quietly. A field is added to the allow-list on purpose, after asking whether it tells
  the labeller the answer or the source; this holds for new question wording that rides on an item
  (a `hint`, a `note`) as much as for any other field.
- A source id typed into a visible text is refused as well.

**Why.** A blind page fails by what leaked in, and a field nobody listed is the one nobody thought
of. A deny-list ("never show `verdict`") only covers the leaks someone already imagined; an
allow-list covers the next one, and a refusal is loud where a silent drop is not.

**Check.** Build with a `model_answer` field on one item: the build stops and names it. Then read the
first screen of the page yourself as the labeller would: the allow-list controls fields, not what
the text of an allowed field says.

## 5. Ask only what the labeller can answer

**Do.**

- Restrict the items to the languages and tools the labeller knows (`labeller_knows`). Items of
  other groups are not put on the page and get no id.
- Add one question per group, "how well do you know this language / tool" (well / somewhat / not
  really). It is an analysis filter: the study can report the labels with and without the groups
  the labeller does not know well.
- The per-item judgement "clear-cut or a real boundary case" is the labeller's. The study design
  does not decide it in advance and does not pre-fill it.

**Why.** A label given outside the labeller's competence is noise that looks like data. The familiarity
answer is the only way to find it afterwards. And a boundary case is boundary because a competent
person hesitates; a designer who tags it in advance has measured the design, not the item.

**Check.** The build prints how many items were left out; the export has a familiarity value for
every group.

## 6. Export into the repository right away

**Do.**

- When the labeller says they are done (or stops), export the store at once: one JSON file per
  page, into the study's `data/` folder, named with the export date
  (`<study>-labels-YYYY-MM-DD.json`), and commit it in the same pass.
- Answers the labeller gives in chat go into the same file with `source: "chat"`; answers from the
  page carry `source: "page"`. The two are never mixed up afterwards.
- The build refuses an option without a non-empty `value` and `label`, and records the allowed
  values (each question's options, and the three familiarity values) once, in both the page and
  `key.json`. A stored value counts as an answer only if it is one of them, on the page and in the
  export alike: a typo from a chat answer, or a value from an earlier build's options, shows as
  unanswered on the page and is not counted in the export. The export marks the item (or the group's
  familiarity) incomplete, keeps the raw value under `invalid_answers` (`invalid_familiarity`), and
  the report names the item or group. Fix it in the dump and export again.
- If the page fails, take the last answers in chat. Patch the page blind at most once.

**Why.** The store lives with the artifact: not in the repository, not in the paper's history, and
gone if the artifact is deleted. Labels that exist only there are not part of the study. Patching a
page you cannot see on the person's phone loses more time than asking: each blind fix is another
round trip, and the person's answers are the thing that cannot wait.

**Check.** `data/<study>-labels-<date>.json` is in `git log`, and `complete_items` in it equals the
count the page showed.

## 7. Save each answer on click, show when, survive reload, work without the store

**Do.**

- One tap saves one answer: no submit button, no "save all".
- Each card shows "Saved <time>" once the store confirms, "Saving..." while it waits, and
  "Not saved (<code>)" when the store refuses.
- Reload restores everything from the store; the page keeps no answer only in memory.
- Write to a document one at a time (the next write waits for the previous one), and only on a tap.
  Subscribe to a collection once.
- When the store is unavailable (`claude.use("db")` is `null`, or the subscription fails), the
  page still renders every item, disables the buttons and says in a banner at the top that answers
  cannot be saved in this view.

**Why.** On a phone, a submit button gets forgotten and a session gets interrupted. A per-item
"Saved" is the labeller's only evidence the answer is not lost. A page that renders nothing when
the store is missing hides the real problem (a link opened without access) behind a blank screen.

**Check.** Answer, reload, the answer is there with its time. Open the page where the store does
not run: banner, items readable, buttons off.

---

## Who can answer

A page with the `db` capability opens only for people with access to the artifact: the owner, or a
Contributor. A link sent to someone without access shows "Only people with access" and no page.
Share the artifact with the labeller as a Contributor, or have the labeller open it from their own
account, before you send the link.
