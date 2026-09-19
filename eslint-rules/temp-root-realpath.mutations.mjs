/**
 * Battery for `local/temp-root-realpath`. Five mutations, five DIFFERENT asserts: the rule
 * must fire, must exempt a resolved root, must not scream at a nested one, must understand
 * the namespaced spelling — and, separately, case 6 must catch a REGRESSION IN THE CORPUS,
 * not just in a made-up string.
 *
 * 🔴 The last mutation is the only thing that makes issue #9's fix guarded. The defect
 * cannot be reproduced on Linux: removing the `realpathSync` wrapper leaves all 52 harnesses
 * green. If removing it turns NOTHING red, then the twenty-four fixes rest entirely on the
 * next author's memory.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "temp-root-realpath.mjs");
const HARNESS = join(HERE, "temp-root-realpath.harness.mjs");
const CORPUS = join(ROOT, "skills", "paper-pipeline", "scripts", "consumer.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the rule stops reporting",
        harness: HARNESS,
        expect: "one finding was expected",
        disables: "the verdict itself — an unresolved root passes silently",
        edits: [[RULE, "context.report({ node, messageId: \"unresolved\" });", "void node;"]],
      },
      {
        name: "the realpathSync exemption is removed",
        harness: HARNESS,
        expect: "the rule must stay silent",
        disables: "the exemption — an already-fixed root starts going red, and for an error-level rule a false positive is worse than a miss",
        edits: [[RULE, "if (isRealpathCall(parent) && parent.arguments[0] === node) return;", "void parent;"]],
      },
      {
        name: "the 'tmpdir() is in the arguments' condition is removed",
        harness: HARNESS,
        expect: "a nested root inherits its spelling from the parent",
        disables: "narrowing the predicate — the rule starts demanding a resolve on nested roots too",
        edits: [[RULE, "if (!mentionsTmpdir(node.arguments)) return;", "void node;"]],
      },
      {
        name: "the namespaced spelling stops being recognized",
        harness: HARNESS,
        expect: "the namespaced spelling must be caught",
        disables: "parsing of `fs.mkdtempSync` — the defect hides behind a dot",
        edits: [[RULE, "if (c.type === \"MemberExpression\" && !c.computed && c.property.type === \"Identifier\")\n    return c.property.name;", "if (false) return \"\";"]],
      },
      {
        name: "🔴 REGRESSION IN THE CORPUS: the wrapper is removed from one real root",
        harness: HARNESS,
        expect: "the corpus must be clean of unresolved roots",
        disables: "the guard over the #9 fix itself — on Linux removing the wrapper does not turn a single behavioral test red",
        edits: [[
          CORPUS,
          "const TMP = realpathSync(mkdtempSync(join(tmpdir(), \"consumer-harness-\")));",
          "const TMP = mkdtempSync(join(tmpdir(), \"consumer-harness-\"));",
        ]],
      },
    ],
  }),
);
