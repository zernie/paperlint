/**
 * `local/temp-root-realpath` — a temp root taken from `tmpdir()` that is not resolved to its
 * realpath.
 *
 * ── THE DEFECT THIS RULE WAS WRITTEN FOR (measured from issue #9) ──────────────────
 * On macOS `os.tmpdir()` returns a path under `/var/folders/…`, and `/var` is itself a symlink
 * to `/private/var`. Node resolves a module's `import.meta.url` to the REAL path, while
 * `process.argv[1]` and any path a test composes from the root "as typed" keep the old
 * spelling. The same directory gets two names, and every path comparison starts lying:
 *
 *     meta: "file:///private/var/folders/…/probe.mjs"
 *     argv:            "/var/folders/…/probe.mjs"
 *
 * On `ubuntu-latest` `/tmp` is a real directory, the two spellings coincide, and the same
 * asserts pass. Three harnesses failed on macOS on a CLEAN checkout, while CI only ran Linux,
 * so green there was a statement about Linux and nothing else.
 *
 * 🔴 WHY A RULE, NOT THREE FIXES. The issue's author fixed the three files they named and
 * honestly wrote that they had not audited the rest. FIFTEEN files in this repository set up a
 * root; every next harness sets up a sixteenth. A fix patches today's list, a rule fixes the
 * shape — and, crucially, it is RED ON LINUX, where the defect itself cannot be reproduced.
 * Without it the only guard is a Mac in someone's hands.
 *
 * ── THE PREDICATE, AND WHY IT IS EXACTLY THIS ──────────────────────────────────────
 * Finding: a call to `mkdtempSync` whose ARGUMENTS contain a call to `tmpdir()`, and which is
 * not itself the sole argument of `realpathSync(…)`.
 *
 * ⚠️ `tmpdir()` in the arguments is the load-bearing part, not decoration. A nested root of the
 * shape `mkdtempSync(join(TMP, "repo-"))` is NOT flagged: it inherits its spelling from `TMP`,
 * and `TMP` is caught at its own point of creation. This turns the issue's "resolve each temp
 * root ONCE at creation" into something checkable character by character rather than by
 * judgment: the rule does not try to guess whether a variable is resolved — it demands that
 * exactly the spot where a platform path enters the program is resolved.
 *
 * ⚠️ WHAT THE RULE DOES NOT CATCH, named out loud so it is not mistaken for more. A root
 * assembled around it (`const t = tmpdir(); const d = mkdtempSync(t + "/x")`) will pass: there
 * is no call to `tmpdir()` in `mkdtempSync`'s arguments. On this corpus the defect has exactly
 * one shape — `mkdtempSync(join(tmpdir(), …))` — and a wider predicate would have to be built
 * on interprocedural analysis, whose cost outweighs the benefit across fifteen sites.
 *
 * 🔴 AND WHAT THE RULE DELIBERATELY LEAVES ALONE: `symlinkSync`. A symlink created BY A TEST
 * inside an already-resolved root is exactly the subject three harnesses test, and resolving
 * the root does not cancel that, it makes it the only symlink in the frame. Before the fix
 * there were two: the one the test placed and the one the platform planted — and the test's
 * assertion was about their sum.
 */

/** The called function's name: `f()` and `mod.f()` count as the same name for our purposes. */
const calleeName = (node) => {
  if (node?.type !== "CallExpression") return "";
  const c = node.callee;
  if (c.type === "Identifier") return c.name;
  if (
    c.type === "MemberExpression" &&
    !c.computed &&
    c.property.type === "Identifier"
  )
    return c.property.name;
  return "";
};

/**
 * Whether the subtree contains a call to `tmpdir()`. A walk over nodes, not a substring
 * search: the word `tmpdir` in a comment or a string literal nearby is not a call, and a
 * text-based guard would be forced to exclude itself — exactly the class of check string-based
 * checks are banned for in this repository.
 */
const mentionsTmpdir = (node) => {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(mentionsTmpdir);
  if (typeof node.type !== "string") return false;
  if (calleeName(node) === "tmpdir") return true;
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    if (value !== null && typeof value === "object" && mentionsTmpdir(value))
      return true;
  }
  return false;
};

/** `realpathSync(x)` and `realpathSync.native(x)` — both resolve the path, both count. */
const isRealpathCall = (node) => {
  if (node?.type !== "CallExpression") return false;
  const name = calleeName(node);
  if (name === "realpathSync") return true;
  // `realpathSync.native(…)`: the call's name is `native`, and the object is `realpathSync` itself.
  if (name !== "native") return false;
  const obj =
    node.callee.type === "MemberExpression" ? node.callee.object : null;
  if (obj?.type === "Identifier") return obj.name === "realpathSync";
  return (
    obj?.type === "MemberExpression" &&
    !obj.computed &&
    obj.property.name === "realpathSync"
  );
};

export default {
  rules: {
    "temp-root-realpath": {
      meta: {
        type: "problem",
        docs: {
          description:
            "a temp root taken from tmpdir() is resolved to its realpath at the moment it is created",
        },
        schema: [],
        messages: {
          unresolved:
            "temp root from tmpdir() is not resolved: wrap it as `realpathSync(mkdtempSync(join(tmpdir(), …)))`. " +
            "On macOS /var is a symlink to /private/var, so Node resolves import.meta.url to the realpath " +
            "while process.argv[1] and any path this file composes keep the spelling as typed — the same " +
            "directory under two names, and every path comparison built on it silently compares the two.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (calleeName(node) !== "mkdtempSync") return;
            if (!mentionsTmpdir(node.arguments)) return;
            const parent = node.parent;
            if (isRealpathCall(parent) && parent.arguments[0] === node) return;
            context.report({ node, messageId: "unresolved" });
          },
        };
      },
    },
  },
};
