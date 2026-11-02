/**
 * check_novelty.py — execution tier: a real fixture on disk, no model, no network.
 * Run: npx vigiles test skills/assess-novelty/scripts/check_novelty.harness.ts
 *
 * The fixture (fixtures/novelty/) is shaped after a real review finding: a neighbour's paper (a synthetic
 * excerpt saved as text) took the "first rule finder recall" claim. Each
 * case below copies it and makes ONE change; every failing class has a clean twin that must pass.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "novelty");
const CHECKER = join(here, "check_novelty.py");

// Copy the fixture, apply one change, run the checker; returns {code, out}.
type Files = { json: any; tex: string; claims: string };
type Change = (f: Files) => void;
const run = (change: Change = () => undefined) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "novelty-")));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const jsonPath = join(dir, "siblings", "novelty.json");
    const files = {
      json: JSON.parse(readFileSync(jsonPath, "utf8")),
      tex: readFileSync(join(dir, "paper.tex"), "utf8"),
      claims: readFileSync(join(dir, "CLAIMS.md"), "utf8"),
    };
    change(files);
    writeFileSync(jsonPath, JSON.stringify(files.json, null, 2));
    writeFileSync(join(dir, "paper.tex"), files.tex);
    writeFileSync(join(dir, "CLAIMS.md"), files.claims);
    const r = spawnSync("python3", ["-I", CHECKER, dir], { encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const passes = (change: Change, what: string) => {
  const r = run(change);
  assert.equal(r.code, 0, `must pass: ${what}\n${r.out}`);
  return r.out;
};
const fails = (change: Change, re: RegExp, what: string) => {
  const r = run(change);
  assert.equal(r.code, 1, `must fail: ${what}\n${r.out}`);
  assert.match(r.out, re, `wrong reason for: ${what}\n${r.out}`);
};
const claim = (j: any, id: string) => j.claims.find((c: any) => c.id === id);
const FIRST =
  "This is the first rule finder recall reported in this literature.";

// ── clean fixture: passes, verdicts computed from the cells ────────────────────
{
  const out = passes(() => undefined, "the fixture as committed");
  assert.match(out, /R1\s+🔴/, "Doe has every piece of R1 → taken");
  assert.match(out, /doe26/, "the verdict names who took it");
  assert.match(out, /P5-1\s+🟢/, "Doe misses two pieces of P5-1 → free");
}

// ── 1. a priority sentence in the paper (a finding a review panel made) ─────────
fails(
  (f) => {
    f.tex = f.tex.replace("\\end{document}", `${FIRST}\n\\end{document}`);
  },
  /first rule finder recall/,
  "R3's false 'first' sentence, not mapped",
);
fails(
  (f) => {
    f.tex = f.tex.replace("\\end{document}", `${FIRST}\n\\end{document}`);
    f.json.paper_sentences.push({ quote: FIRST, claim: "R1" });
  },
  /R1.*🔴|not 🟢/,
  "the same sentence mapped to a claim that is taken",
);
fails(
  (f) => {
    f.tex = f.tex.replace(
      "\\end{document}",
      "None of the eight studies counting these files reports it.\n\\end{document}",
    );
  },
  /None of the eight studies/,
  "the panel's second never-claim, not mapped",
);
{
  const TOK =
    "To our knowledge, no prior study checks rules-file prose against the repository's committed lint configuration.";
  fails(
    (f) => {
      f.tex = f.tex.replace("\\end{document}", `${TOK}\n\\end{document}`);
    },
    /To our knowledge/,
    "a to-our-knowledge sentence, not mapped",
  );
  passes((f) => {
    f.tex = f.tex.replace("\\end{document}", `${TOK}\n\\end{document}`);
    f.json.paper_sentences.push({ quote: TOK, claim: "P5-1" });
  }, "the same sentence mapped to a 🟢 claim");
}
// Run 1: the paper's main priority sentence had this shape and slipped past the detector,
// while "it cannot supply a rule nobody wrote" (not about anyone's work) was flagged.
fails(
  (f) => {
    f.tex = f.tex.replace(
      "\\end{document}",
      "What none of them measures is the guards developers actually install.\n\\end{document}",
    );
  },
  /none of them measures/,
  "'none of them measures', not mapped",
);
passes((f) => {
  f.tex = f.tex.replace(
    "\\end{document}",
    "Normalization cannot supply a rule nobody wrote.\n\\end{document}",
  );
}, "'a rule nobody wrote' is not a claim about prior work");
{
  const FP = "No prior study of this corpus was needed to draw the sample.";
  passes((f) => {
    f.tex = f.tex.replace("\\end{document}", `${FP}\n\\end{document}`);
    f.json.paper_sentences.push({
      quote: FP,
      claim: null,
      not_priority: "about our sampling, not about prior work",
    });
  }, "a flagged sentence recorded as not a priority claim, with the reason");
  fails(
    (f) => {
      f.tex = f.tex.replace("\\end{document}", `${FP}\n\\end{document}`);
      f.json.paper_sentences.push({ quote: FP, claim: null });
    },
    /not_priority/,
    "claim null without saying why",
  );
}
// Run 2: the detector caught 0 of a paper's 5 real priority sentences, and flagged one
// that is about our own procedure. The sentences below keep the shapes of the real ones.
for (const s of [
  "No study we know of has measured how often a project's CI enforces the checks that its contributing guide states; that is our first research question.",
  "These studies count whether a guide is present or what it says; none asks whether anything in the project enforces what the guide says.",
  "Each builds its own tests and evaluates them on data it produced; none reports whether the project's existing setup already enforces the requirement.",
  "None of this work checks whether a requirement a guide states is switched on in the same project's CI.",
  "None tests a requirement from the guide against the committed setup of the same project.",
]) {
  fails(
    (f) => {
      f.tex = f.tex.replace("\\end{document}", `${s}\n\\end{document}`);
    },
    /priority sentence not in paper_sentences/,
    `a real-shaped priority sentence: ${s.slice(0, 40)}`,
  );
}
for (const s of [
  "We report RQ2 because its design was committed before the first count; its value is the bound it sets, not a difference it finds.",
  "Before the first count we committed the design: this threshold, the quantities reported below, the result that would refute our hypothesis, and a table fixing where each outcome would be reported.",
]) {
  passes(
    (f) => {
      f.tex = f.tex.replace("\\end{document}", `${s}\n\\end{document}`);
    },
    `about our own procedure, not prior work: ${s.slice(0, 40)}`,
  );
}
// Guards: the fixture already holds "The first row of Table 1" and "None of the 900 prose blocks …"
// (sentences from review findings) and passes above; a detector that flags them fails the clean run.

// ── 2. absence read from an abstract (F2, F6) ──────────────────────────────────
// The table prints "doe26 (abstract)" too, so match the error line itself, not the word.
fails(
  (f) => {
    f.json.neighbours[0].read = "abstract";
  },
  /ERROR P5-1\/doe26\/object: 'no' from a neighbour read only as an abstract/,
  "a 'no' cell on a neighbour read only as an abstract",
);

// ── 3. a quote that is not in the neighbour's text ────────────────────────────
fails(
  (f) => {
    claim(f.json, "R1").cells.doe26.object.quote =
      "our extraction method captured 76.3% of eligible safety rules";
  },
  /not found/,
  "a quote edited away from the source",
);
fails(
  (f) => {
    claim(f.json, "R1").cells.doe26.object.quote = null;
  },
  /quote/,
  "a 'yes' cell without a quote",
);

// ── 4. the ledger disagrees with the computed verdict ─────────────────────────
fails(
  (f) => {
    f.claims = f.claims.replace(
      "| R1 | The first measurement of a rule extractor's recall in this literature | 🔴",
      "| R1 | The first measurement of a rule extractor's recall in this literature | 🟢",
    );
  },
  /R1.*CLAIMS\.md/,
  "CLAIMS.md says 🟢 where the cells say 🔴",
);
fails(
  (f) => {
    claim(f.json, "R1").ledger = "R9";
  },
  /R9/,
  "a ledger row that does not exist",
);
// A design-stage claim (a planned measurement, not in paper.tex yet) has no ledger row until it enters the text:
// "planned": true is the one way to say so. Without it, a missing row is still an error.
fails(
  (f) => {
    delete claim(f.json, "R1").ledger;
  },
  /R1: ledger row None/,
  "a claim with no ledger row and no planned flag",
);
passes((f) => {
  const c = claim(f.json, "R1");
  delete c.ledger;
  c.planned = true;
}, "a planned claim with no ledger row");

// ── 5. one-piece delta and unknown cells ──────────────────────────────────────
{
  const oneNo = (f: Files) => {
    claim(f.json, "R1").cells.doe26.measure = { has: "no", quote: null };
  };
  fails(
    oneNo,
    /🟡/,
    "nearest neighbour misses one piece, ledger still says 🔴",
  );
  const out = passes((f) => {
    oneNo(f);
    f.claims = f.claims.replace(
      "| 🔴 taken (Doe 2026, recall 66.3 %) |",
      "| 🟡 narrowed |",
    );
  }, "one-piece delta with the ledger at 🟡");
  assert.match(out, /R1\s+🟡/);
  assert.match(
    out,
    /measure/,
    "the 🟡 verdict names the one piece that differs",
  );
}
// Run 1: "nearest" must be the neighbour with fewest 'no' and then most 'yes'; it used to be whichever came
// first, which named a neighbour with an unread cell over one matching every other piece.
{
  const out = passes((f) => {
    f.json.neighbours.unshift({ ...f.json.neighbours[0], id: "zz26" });
    const r1 = claim(f.json, "R1");
    r1.cells.doe26.measure = { has: "no", quote: null };
    r1.cells.zz26 = {
      population: r1.cells.doe26.population,
      object: { has: "no", quote: null },
    };
    claim(f.json, "P5-1").cells.zz26 = claim(f.json, "P5-1").cells.doe26;
    f.claims = f.claims.replace(
      "| 🔴 taken (Doe 2026, recall 66.3 %) |",
      "| 🟡 narrowed |",
    );
  }, "two neighbours each missing one piece");
  assert.match(
    out,
    /R1\s+🟡\s+nearest doe26 /,
    "the nearer is doe26 (two yes) over zz26 (one yes, one unread)",
  );
}
{
  const out = run((f) => {
    delete claim(f.json, "R1").cells.doe26.measure;
  });
  assert.match(
    out.out,
    /R1\s+⚪/,
    "two yes and one unread piece could still be taken → unknown",
  );
}

// ── 5b. a neighbour with the same object and measure has the result: never 🟢 ───
// Eval runs 3 and 3b (research/repro/assess-novelty-eval-2026-10-27/): the agent split the recall claim into
// object + measure (Doe: yes, quoted) and setting pieces such as "comparator: public human-segmented gold set"
// and "population: directive-like rules (not only safety rules)" (run-3b/trial-2). Each setting piece marked
// 'no' is one step toward 🟢: two of them made the claim "free" with the checker green, although Doe measured
// the same thing (extractor recall) first. A setting delta over the same result is 🟡 at best.
{
  const split = (f: Files, comparator: any, population: any) => {
    const r1 = claim(f.json, "R1");
    r1.pieces = {
      object: "a rule finder over agent rules files",
      measure: "recall",
      comparator: "public human-segmented gold set",
      population: "directive-like rules (not only safety rules)",
    };
    r1.cells.doe26 = {
      object: {
        has: "yes",
        quote:
          "Rule-word retrieval catches about twothirds of the safety rules in a file.",
      },
      measure: {
        has: "yes",
        quote:
          "it finds 63 of 95 in-scope reference segments, a recall of 66.3%",
      },
      ...(comparator ? { comparator: { has: comparator, quote: null } } : {}),
      ...(population ? { population: { has: population, quote: null } } : {}),
    };
    r1.refutation = {
      by: "fable",
      date: "2026-10-27",
      file: "siblings/2026-10-27-novelty-refutation.md",
      verdict: "holds",
    };
  };
  const ledger = (f: Files, mark: string) => {
    f.claims = f.claims.replace(
      "| 🔴 taken (Doe 2026, recall 66.3 %) |",
      `| ${mark} |`,
    );
  };
  // fires: run-3b/trial-2's own split, with its two unread setting cells marked 'no' and the ledger at 🟢
  fails(
    (f) => {
      split(f, "no", "no");
      ledger(f, "🟢 ours");
    },
    /R1: CLAIMS\.md row R1 says 🟢, the cells give 🟡/,
    "same object and measure as Doe, two setting pieces 'no'",
  );
  {
    const out = passes((f) => {
      split(f, "no", "no");
      ledger(f, "🟡 narrowed");
    }, "the same table with the ledger at 🟡");
    assert.match(
      out,
      /R1\s+🟡\s+doe26 has the object and the measure/,
      "the 🟡 names who has the result",
    );
    assert.match(
      out,
      /comparator, population/,
      "and the setting pieces that differ",
    );
  }
  // unread setting pieces stay ⚪ (could be 🔴), and the line says it cannot be free
  assert.match(
    run((f) => {
      split(f, null, null);
      ledger(f, "⚪ not checked");
    }).out,
    /R1\s+⚪\s+could still be taken by doe26; not free: doe26 has the object and the measure/,
    "run-3b/trial-2 as written: object and measure yes, the rest unread",
  );
  // silent: a neighbour with the measure but not the object (run-3/trial-3's P5-1) stays 🟢
  {
    const out = passes((f) => {
      const p = claim(f.json, "P5-1");
      p.pieces.comparator = "the repository's own linter configuration";
      p.cells.doe26.measure = {
        has: "yes",
        quote:
          "only about 4–16% of the retrieved safety rules had a matching built-in guard",
      };
      p.cells.doe26.comparator = { has: "no", quote: null };
    }, "measure yes, object no: a different result");
    assert.match(out, /P5-1\s+🟢/);
  }
}

// ── 6. the three search sources ───────────────────────────────────────────────
fails(
  (f) => {
    f.json.searched = f.json.searched.filter(
      (s: any) => s.source !== "venue-pc",
    );
  },
  /venue-pc/,
  "no search of the venue's PC",
);
fails(
  (f) => {
    f.json.searched = f.json.searched.filter(
      (s: any) => s.source !== "prev-edition",
    );
  },
  /prev-edition/,
  "no search of the previous edition",
);

// ── 7. a 🟢 claim needs a refutation pass; every claim needs a type and its answer ─
fails(
  (f) => {
    delete claim(f.json, "P5-1").refutation;
  },
  /refutation/,
  "🟢 without a refutation pass",
);
fails(
  (f) => {
    claim(f.json, "P5-1").refutation.file = "siblings/missing.md";
  },
  /missing\.md/,
  "a refutation file that does not exist",
);
fails(
  (f) => {
    delete claim(f.json, "R1").objection_answer;
  },
  /objection_answer/,
  "no answer to the type's objection",
);
fails(
  (f) => {
    claim(f.json, "R1").type = "novel";
  },
  /type/,
  "a type outside the list",
);

// ── 8. a sentence mapped by hand is judged even when the detector misses it ────
// The skill tells the author to add phrasings the detector misses to paper_sentences; the check of such an
// entry used to run only for sentences the detector found, so the hand mapping did nothing.
{
  const UNLIKE =
    "Unlike prior work, we report the recall of a rule finder over agent rules files.";
  fails(
    (f) => {
      f.tex = f.tex.replace("\\end{document}", `${UNLIKE}\n\\end{document}`);
      f.json.paper_sentences.push({ quote: UNLIKE, claim: "R1" });
    },
    /rests on R1, which is 🔴/,
    "a hand-mapped sentence resting on a taken claim",
  );
  passes((f) => {
    f.tex = f.tex.replace("\\end{document}", `${UNLIKE}\n\\end{document}`);
    f.json.paper_sentences.push({ quote: UNLIKE, claim: "P5-1" });
  }, "the same sentence mapped to a 🟢 claim");
}

// ── 9. a 'yes' cell whose quote cannot be checked does not count ───────────────
// An abstract-only neighbour with no saved text skipped the quote check, so an invented quote still made a
// claim 🔴 with exit 0. The fixture is cut to R1 so the abstract's 'no' cells do not fire first.
{
  const abstractOnly = (f: Files, text: string) => {
    f.json.claims = f.json.claims.filter((c: any) => c.id === "R1");
    f.json.one_new_result = { claim: "R1", diluted_by: [] };
    Object.assign(f.json.neighbours[0], { read: "abstract", text });
  };
  fails(
    (f) => {
      abstractOnly(f, "siblings/data/missing.txt");
      for (const cell of Object.values<any>(claim(f.json, "R1").cells.doe26))
        cell.quote = "an invented sentence";
    },
    /R1\/doe26\/\w+: 'yes' but no text to check the quote against/,
    "abstract-only neighbour, text missing",
  );
  passes(
    (f) => abstractOnly(f, "siblings/data/doe-preprint.txt"),
    "abstract-only neighbour whose text is saved",
  );
}

console.log("check_novelty.harness: all cases pass");
