/**
 * `paper/stages` — the stage a paper has reached is an author's CLAIM, so it is a FIELD, and
 * the bytes on disk are the evidence that claim is checked against.
 *
 * ── WHAT THIS REPLACES, and why the replacement is not cosmetic ─────────────────────────
 * The predecessor kept a vocabulary of stage names in a JS const and applied its regexes to
 * the WHOLE of `PIPELINE-STATUS.md`:
 *
 *     { stage: "submitted", declaredBy: /(?<!\bas\s)(?<!\bbe\s)\bsubmitted\b/i }
 *
 * The lookbehinds are not decoration — they were added after the only match in one paper's
 * file turned out to be a reviewer's idiom, "Weak Accept as submitted", which says nothing
 * about submission. The check then demanded a frozen pdf and was RIGHT BY ACCIDENT.
 *
 * 🔴 And it stayed wrong in the other direction, measured 2026-09-16 on the live corpus:
 * `versions/2026-08-29-camera-ready.pdf` had been on disk for 16 days at 616 175 bytes while
 * the `camera-ready` pattern matched ZERO times anywhere in the file. The artefact preceded
 * the declaration, so all three checks gated on that declaration were blind by construction.
 *
 * ── TWO DIRECTIONS, and neither alone is the check ──────────────────────────────────────
 *   declared -> bytes   a record without its file, or with the wrong size, is a false claim
 *   bytes -> declared   a frozen version nobody declared is the case above, and it is also
 *                       what stops the whole rule being switched off by deleting a line
 *
 * Absence of the field is therefore LEGITIMATE — a paper that has shipped nothing owes
 * nothing — without being an escape hatch: the second direction still speaks if bytes exist.
 * That asymmetry is deliberate and is the reason this rule does not copy `doc/fields`, where
 * a missing frontmatter IS the finding.
 *
 * ── WHY A FIELD CANNOT BECOME A TICKED BOX HERE ─────────────────────────────────────────
 * The usual objection to turning a check into a field is that a field gets ticked instead of
 * the work being done. It does not apply, and the reason is the direction of the incentive:
 * a tick normally REMOVES an obligation, while `stages` CREATES them — declare a stage and
 * you owe a pdf of the right size. Nobody writes a line in order to receive findings. The
 * real-world pressure is to UNDER-declare, which is exactly what direction two catches.
 *
 * ── THE FIELD IS THE ONLY MACHINE-READABLE CARRIER ──────────────────────────────────────
 * ⚠️ A paper's status file also carries a `State:` line in its header and one or two
 * scorecard tables. Those are DISPLAY. No consistency check between them is written here on
 * purpose: one paper in the source corpus carries two scorecards in two different column
 * formats, and a rule reconciling them would drown in noise within a day.
 *
 * ── A LIST, NOT A MAP, and that is load-bearing ─────────────────────────────────────────
 * A paper can reach the same stage twice: one in the source corpus was submitted to a venue
 * in August, rejected in September, and is being resubmitted elsewhere in October. A map
 * keyed by stage name holds one. The `versions/<date>-<stage>.pdf` convention already holds
 * many, and the field must not be weaker than the filenames it describes.
 */
import { existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { CORE_SCHEMA, load } from "js-yaml";

/** A real calendar date written as `YYYY-MM-DD` — the shape `paperlint authors` writes. */
export const isIsoDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const STAGES = ["submitted", "camera-ready", "arxiv"];

/**
 * A YAML date without quotes parses to a `Date`, not a string — js-yaml honours YAML 1.1
 * timestamps. Comparing `Date === "2026-08-29"` is silently false, so every date is
 * normalised before it is compared with one taken from a filename.
 */
function isoDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] ?? "";
  return "";
}

/** Frozen versions on disk, as `{name, date, stage}`. */
function frozenPdfs(versionsDir) {
  let names;
  try {
    names = readdirSync(versionsDir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith(".pdf")) continue;
    // ⚠️ A name carrying `STALE` is a version WITHDRAWN on purpose — one such file records
    // that the wrong pdf sat in the folder for a month. Demanding a declaration for it would
    // turn a deliberate record of a mistake into a finding.
    if (name.includes("STALE")) continue;
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.pdf$/.exec(name);
    if (!m) continue;
    if (!STAGES.includes(m[2])) continue;
    out.push({ name, date: m[1], stage: m[2] });
  }
  return out;
}

export default {
  rules: {
    stages: {
      meta: {
        type: "problem",
        docs: {
          description:
            "a paper's stage is declared as a FIELD, and every declaration is checked against the bytes on disk in both directions",
        },
        schema: [],
        messages: {
          badYaml: "the frontmatter does not parse as YAML: {{reason}}",
          notAList:
            "`stages` must be a LIST of entries, not {{got}} — a paper can reach the same stage twice",
          badStage: "unknown stage «{{stage}}» — the vocabulary is: {{known}}",
          missingKey: "the «{{stage}}» entry has no `{{key}}` field",
          badDate:
            "the date «{{date}}» in the «{{stage}}» entry is not YYYY-MM-DD",
          declaredNoFile:
            "stage «{{stage}}» ({{date}}) is declared, but `{{pdf}}` is not on disk",
          bytesDiffer:
            "«{{stage}}» ({{date}}): {{want}} bytes declared, {{got}} on disk — this is NOT that file",
          fileNotDeclared:
            "`versions/{{file}}` is frozen, but no «{{stage}}» stage on {{date}} is declared in `stages` — the artefact ran ahead of the declaration",
        },
      },
      create(context) {
        const dir = dirname(context.filename);
        let declared = null; // null = there was no frontmatter at all

        return {
          yaml(node) {
            let data;
            try {
              data = load(node.value ?? "");
            } catch (e) {
              context.report({
                node,
                messageId: "badYaml",
                data: { reason: String(e.message) },
              });
              return;
            }
            const raw = data?.stages;
            if (raw === undefined) return;
            if (!Array.isArray(raw)) {
              context.report({
                node,
                messageId: "notAList",
                data: { got: raw === null ? "empty" : typeof raw },
              });
              return;
            }
            declared = [];
            for (const rec of raw) {
              const stage = String(rec?.stage ?? "");
              if (!STAGES.includes(stage)) {
                context.report({
                  node,
                  messageId: "badStage",
                  data: { stage, known: STAGES.join(" · ") },
                });
                continue;
              }
              let complete = true;
              for (const key of ["date", "pdf", "bytes"]) {
                if (rec[key] === undefined) {
                  context.report({
                    node,
                    messageId: "missingKey",
                    data: { stage, key },
                  });
                  complete = false;
                }
              }
              if (!complete) continue;
              const date = isoDate(rec.date);
              if (date === "") {
                context.report({
                  node,
                  messageId: "badDate",
                  data: { stage, date: String(rec.date) },
                });
                continue;
              }
              declared.push({
                stage,
                date,
                pdf: String(rec.pdf),
                bytes: Number(rec.bytes),
              });

              // ── direction one: a claim owes its bytes ────────────────────────────────
              const abs = join(dir, String(rec.pdf));
              if (!existsSync(abs)) {
                context.report({
                  node,
                  messageId: "declaredNoFile",
                  data: { stage, date, pdf: String(rec.pdf) },
                });
                continue;
              }
              const got = statSync(abs).size;
              if (got !== Number(rec.bytes)) {
                context.report({
                  node,
                  messageId: "bytesDiffer",
                  data: {
                    stage,
                    date,
                    want: String(rec.bytes),
                    got: String(got),
                  },
                });
              }
            }
          },

          // ── direction two: bytes owe their declaration ────────────────────────────────
          // 🔴 On `root:exit` rather than inside `yaml`, because the case worth catching is
          // precisely the one with NO frontmatter at all — where the `yaml` visitor never runs.
          "root:exit"(node) {
            const records = declared ?? [];
            for (const f of frozenPdfs(join(dir, "versions"))) {
              if (records.some((r) => r.stage === f.stage && r.date === f.date))
                continue;
              context.report({
                node,
                messageId: "fileNotDeclared",
                data: { file: f.name, stage: f.stage, date: f.date },
              });
            }
          },
        };
      },
    },

    /**
     * `paper/source` — a declared stage must have its SOURCE frozen on disk, beside the pdf,
     * and the bytes must match. Not a commit reference. Not a hash of one.
     *
     * ── WHY NOT A COMMIT, measured 2026-09-16 and it is not a close call ──────────────────
     * The predecessor recorded provenance as `commit <sha>` in prose and checked that the sha
     * RESOLVED. Its stated premise was "git holds those bytes immutably, materialising a copy
     * duplicates a guarantee we already have". That premise is false wherever branches are
     * SQUASH-merged: the squash destroys the branch commits, and the next `git gc` removes
     * the objects.
     *
     * 🔴 Measured on the live corpus, inside ninety minutes of ONE session: two recorded shas
     * resolved, then stopped resolving after a routine `gc` following a branch reset. Of the
     * four declared stages in that corpus, THREE had lost their source entirely — including
     * papers already submitted to a venue, which is exactly the case the check existed for
     * (a reviewer cites a line number and there is no layout left to resolve it against).
     *
     * So a sha is not a pointer to bytes; it is a pointer to a pointer, and the outer one
     * evaporates. Checking it verifies that the REFERENCE is alive, which is a different
     * claim from the one anybody wants.
     *
     * ── COST, because "duplicating" was the objection ─────────────────────────────────────
     * A paper source is 57-68 KB of LaTeX beside a pdf of 305-382 KB that is already
     * committed. Freezing it adds under a fifth to what the folder holds anyway, and turns a
     * claim about the world into bytes this rule can actually compare.
     *
     * ── SEVERITY: nudge, and the reason CHANGED ──────────────────────────────────────────
     * Still `warn` at the consumer, but no longer because "only the author knows". Now it is
     * because a stage frozen BEFORE this convention existed cannot be fixed at all — those
     * bytes are gone. Failing a build over unrecoverable history is a gate nobody can clear.
     */
    /**
     * `paper/author-list` — a shipped paper OWES ITSELF a run of the author-list cross-check.
     *
     * The class this cross-check catches is invisible to an existence check on citations: the
     * citation exists, the identifier resolves, and the authors are taken from the PREPRINT
     * while the entry declares a conference. On the live corpus this turned up seven records
     * across three papers, including a DROPPED LIVING PERSON (`schick2023toolformer` — Eric
     * Hambro is missing; the NeurIPS version has nine authors, the preprint has eight). Two of
     * the seven were found on a paper ALREADY SUBMITTED.
     *
     * 🔴 THE RUN IS A RECORD, NOT A WORD IN A TABLE (3.0.0). Until 3.0.0 the rule looked for a
     * `marker` substring ("bib-authors") in the scorecard's table cells, and its message told
     * the user to run a `command` the project had to configure — while the script ships in this
     * very package. Both were conventions standing in for a field. Now the check is paperlint's
     * own command, `npx paperlint authors <paper>`, which runs it and, when the author lists
     * match, writes `authorsVerified: <YYYY-MM-DD>` into this file's frontmatter. The rule reads
     * that field: present and a real date, or a finding.
     *
     * The stage comes from the `stages` FIELD — the same one `paper/stages` checks against the
     * bytes in both directions. A paper that declares no stage owes nothing.
     */
    "author-list": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "a paper that declares a stage records, as `authorsVerified` in its frontmatter, that the author-list check passed",
        },
        schema: [],
        messages: {
          neverRan:
            "stage «{{stages}}» is declared, but the frontmatter has no `authorsVerified` date. Run `npx paperlint authors {{paper}}`: it checks that each entry's authors are those of the version it cites (not the preprint's) and records the date here",
          badDate:
            "`authorsVerified: {{value}}` is not a date (YYYY-MM-DD) — `npx paperlint authors {{paper}}` writes it",
        },
      },
      create(context) {
        return {
          yaml(node) {
            let data;
            try {
              data = load(node.value ?? "", { schema: CORE_SCHEMA });
            } catch {
              return; // `paper/stages` has already reported the unreadable YAML
            }
            const raw = data?.stages;
            if (!Array.isArray(raw)) return;
            const stages = raw.map((r) => r?.stage).filter(Boolean);
            if (stages.length === 0) return; // nothing shipped — nothing is owed
            const paper =
              relative(context.cwd, dirname(context.filename)) || ".";
            const value = data.authorsVerified;
            if (value === undefined || value === null)
              context.report({
                node,
                messageId: "neverRan",
                data: { stages: stages.join("/"), paper },
              });
            else if (!isIsoDate(value))
              context.report({
                node,
                messageId: "badDate",
                data: { value: String(value), paper },
              });
          },
        };
      },
    },

    source: {
      meta: {
        type: "problem",
        docs: {
          description:
            "a declared stage freezes its source beside the pdf and is checked by bytes — not by a commit reference",
        },
        schema: [],
        messages: {
          noSource:
            "stage «{{stage}}» ({{date}}) carries no frozen source. A commit reference will not do: squash and gc destroy it — three of four sources were lost that way in this corpus",
          sourceMissing:
            "«{{stage}}» ({{date}}): source `{{src}}` is declared, but the file is not on disk",
          sourceBytes:
            "«{{stage}}» ({{date}}): the source is declared as {{want}} bytes, {{got}} on disk — this is NOT that file",
          lostAcknowledged:
            "stage «{{stage}}» ({{date}}): the source is declared LOST. There is nothing left to match a build against a reviewer's line — if a copy turns up, put it in versions/ and clear the flag",
        },
      },
      create(context) {
        const dir = dirname(context.filename);
        return {
          yaml(node) {
            let data;
            try {
              data = load(node.value ?? "");
            } catch {
              return; // `paper/stages` has already reported the unreadable YAML
            }
            const raw = data?.stages;
            if (!Array.isArray(raw)) return;
            for (const rec of raw) {
              const stage = String(rec?.stage ?? "");
              if (!STAGES.includes(stage)) continue;
              const date = isoDate(rec?.date);

              // Acknowledging the loss is a RECORD, not an exemption: the rule keeps speaking,
              // because the state stays defective, just unfixable today.
              if (rec?.sourceLost === true) {
                context.report({
                  node,
                  messageId: "lostAcknowledged",
                  data: { stage, date },
                });
                continue;
              }
              const src = rec?.source === undefined ? "" : String(rec.source);
              if (src === "") {
                context.report({
                  node,
                  messageId: "noSource",
                  data: { stage, date },
                });
                continue;
              }
              const abs = join(dir, src);
              if (!existsSync(abs)) {
                context.report({
                  node,
                  messageId: "sourceMissing",
                  data: { stage, date, src },
                });
                continue;
              }
              const got = statSync(abs).size;
              const want = Number(rec?.sourceBytes);
              if (Number.isFinite(want) && got !== want)
                context.report({
                  node,
                  messageId: "sourceBytes",
                  data: { stage, date, want: String(want), got: String(got) },
                });
            }
          },
        };
      },
    },
  },
};
