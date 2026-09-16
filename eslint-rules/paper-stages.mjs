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
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { load } from "js-yaml";

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

/**
 * Does this object name a commit that EXISTS? Not "does the text contain a hex string" —
 * the predecessor asked the second question and passed on a hash that is not in the
 * repository at all (measured 2026-09-16: a paper's scorecard recorded
 * `Final PDF = commit f0ea066`, and `git cat-file` does not resolve it).
 */
function commitExists(sha, cwd) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export default {
  rules: {
    stages: {
      meta: {
        type: "problem",
        docs: {
          description:
            "стадия статьи объявлена полем, и каждое объявление сверено с байтами на диске в обе стороны",
        },
        schema: [],
        messages: {
          badYaml: "фронтматтер не разбирается как YAML: {{reason}}",
          notAList: "`stages` обязано быть СПИСКОМ записей, а не {{got}} — статья может дойти до одной стадии дважды",
          badStage: "неизвестная стадия «{{stage}}» — словарь: {{known}}",
          missingKey: "в записи стадии «{{stage}}» нет поля `{{key}}`",
          badDate: "дата «{{date}}» в записи «{{stage}}» не в формате YYYY-MM-DD",
          declaredNoFile: "объявлена стадия «{{stage}}» ({{date}}), но файла `{{pdf}}` на диске нет",
          bytesDiffer: "«{{stage}}» ({{date}}): объявлено {{want}} байт, на диске {{got}} — это НЕ тот файл",
          fileNotDeclared:
            "`versions/{{file}}` заморожен, но стадия «{{stage}}» на {{date}} не объявлена в `stages` — артефакт обогнал объявление",
        },
      },
      create(context) {
        const dir = dirname(context.filename);
        let declared = null; // null = фронтматтера не было вовсе

        return {
          yaml(node) {
            let data;
            try {
              data = load(node.value ?? "");
            } catch (e) {
              context.report({ node, messageId: "badYaml", data: { reason: String(e.message) } });
              return;
            }
            const raw = data?.stages;
            if (raw === undefined) return;
            if (!Array.isArray(raw)) {
              context.report({
                node,
                messageId: "notAList",
                data: { got: raw === null ? "пусто" : typeof raw },
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
                  context.report({ node, messageId: "missingKey", data: { stage, key } });
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
              declared.push({ stage, date, pdf: String(rec.pdf), bytes: Number(rec.bytes) });

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
                  data: { stage, date, want: String(rec.bytes), got: String(got) },
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
              if (records.some((r) => r.stage === f.stage && r.date === f.date)) continue;
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
     * `paper/source` — a declared stage must be tied to a source the repository can still
     * produce, and the tie must RESOLVE.
     *
     * Separate from `paper/stages` for one reason: SEVERITY. The byte checks are the
     * consumer's gate (error) because a wrong size is mechanical and fixable in the same
     * pass. A missing or dead commit reference is equally binary but only the AUTHOR knows
     * which build actually went to the portal, so failing a build on it would be a gate the
     * author cannot clear — and a gate people cannot clear is a gate they switch off.
     *
     * 🔴 WHAT IS NOT CHECKED, and the omission is deliberate: that the commit is not LATER
     * than the stage date. It reads like a free invariant — source cannot postdate the build
     * it produced — and it is wrong here, because this repository SQUASH-merges: a paper
     * submitted on 22 July has its source in a commit dated 5 August, since the session that
     * carried it was squashed afterwards. The check would fire on correct input, and for a
     * rule that is the one failure mode worse than missing a defect.
     */
    source: {
      meta: {
        type: "problem",
        docs: {
          description:
            "объявленная стадия привязана к коммиту, и этот коммит РЕЗОЛВИТСЯ, а не просто выглядит как хеш",
        },
        schema: [],
        messages: {
          noSource:
            "стадия «{{stage}}» ({{date}}) не привязана ни к коммиту, ни к замороженному исходнику. Git хранит исходник вечно — но только если записано, КАКОЙ",
          deadCommit:
            "стадия «{{stage}}» ({{date}}) ссылается на коммит `{{sha}}`, которого в репозитории НЕТ — привязка мёртвая, сверить сборку не с чем",
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
              return; // `paper/stages` уже отчиталось о нечитаемом YAML
            }
            const raw = data?.stages;
            if (!Array.isArray(raw)) return;
            for (const rec of raw) {
              const stage = String(rec?.stage ?? "");
              if (!STAGES.includes(stage)) continue;
              const date = isoDate(rec?.date);
              const sha = rec?.commit === undefined ? "" : String(rec.commit);
              if (sha !== "") {
                // Каталог статьи, а не `context.cwd`: git сам поднимется до корня
                // репозитория, и правило перестаёт зависеть от того, откуда его позвали.
                if (!commitExists(sha, dir))
                  context.report({ node, messageId: "deadCommit", data: { stage, date, sha } });
                continue;
              }
              // ⚠️ Освобождение, а не дыра: сборка могла идти НЕ из этого репозитория, и тогда
              // доказательством служат сами байты исходника рядом с pdf.
              if (existsSync(join(dir, "versions", `${date}-${stage}.tex`))) continue;
              context.report({ node, messageId: "noSource", data: { stage, date } });
            }
          },
        };
      },
    },
  },
};
