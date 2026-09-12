/**
 * THE GREEN-ZERO GUARD over an ESLint JSON report.
 *
 * 🔴 WHY THIS EXISTS. `eslint` prints findings and exits 0 when there are none — and "no findings"
 * is byte-identical to "not one rule was handed a single file". A rule whose glob matched nothing is
 * never invoked, and a rule that is never invoked physically cannot report that. A CI job built on
 * the exit code alone therefore passes loudest exactly when it measured nothing.
 *
 * WHAT IT DOES AND DOES NOT CLAIM. It answers one question that needs no knowledge of the caller's
 * config: *was anything linted at all*. It does NOT audit per-rule coverage — a run can lint a
 * thousand files while one rule still sees none. That is `npm run check:globs`, which reads this
 * package's own config and cannot read yours.
 *
 * 🔴 IT LIVES IN A FILE, NOT INSIDE `action.yml`. An inline `node -e` blob in a composite step is
 * unreachable from a test: the only way to exercise it is to run the whole action on a runner. This
 * file is called by the action and by `action.harness.mjs` with the same arguments, so the harness
 * proves the BEHAVIOUR rather than the presence of a string in YAML.
 *
 * Usage: node scripts/eslint-report-guard.mjs <report.json> <eslint-rc> [paths] [config]
 * Exit:  1 when nothing was measured (unparsable report, or zero files linted)
 *        otherwise ESLint's own return code, passed through untouched
 */
import { readFileSync } from "node:fs";

/** @returns {{ code: number, lines: string[] }} — never throws, so the caller decides how to exit. */
export function guard(reportPath, eslintRc, { paths = ".", config = "eslint.config.mjs" } = {}) {
  const lines = [];
  let res;
  try {
    res = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    lines.push(
      `::error::ESLint wrote no parsable report to ${reportPath} (rc=${eslintRc}). Nothing was measured.`,
    );
    return { code: 1, lines };
  }
  if (!Array.isArray(res)) {
    lines.push(`::error::The report at ${reportPath} is not an ESLint result array. Nothing was measured.`);
    return { code: 1, lines };
  }
  // THE GUARD. Not "were there findings" — "was anything linted at all".
  if (res.length === 0) {
    lines.push(
      "::error::ESLint linted ZERO files. In the exit code this is indistinguishable from a clean " +
        `run, and it means the paths or the config matched nothing. paths=${paths} config=${config}`,
    );
    return { code: 1, lines };
  }
  const msgs = res.flatMap((f) => f.messages ?? []);
  const errors = msgs.filter((m) => m.severity === 2);
  for (const f of res)
    for (const m of f.messages ?? [])
      lines.push(
        `${m.severity === 2 ? "error" : "warning"} ${f.filePath}:${m.line}:${m.column}  ` +
          `${m.ruleId ?? "(no rule)"}  ${m.message}`,
      );
  lines.push(
    `\nlinted ${res.length} file(s) · ${msgs.length} finding(s) · ${errors.length} error(s) · ` +
      `${msgs.length - errors.length} warning(s)`,
  );
  return { code: eslintRc, lines };
}

// Guarded by realpath, not by `import.meta.url === \`file://${process.argv[1]}\``: through a symlink
// `import.meta.url` is the REALPATH while `argv[1]` is the link, so that idiom compares false and the
// CLI silently does nothing. Consumers reach this package through a symlinked tree.
if (process.argv[1] && (await import("node:fs")).realpathSync(process.argv[1]) === (await import("node:url")).fileURLToPath(import.meta.url)) {
  const [report, rc, paths, config] = process.argv.slice(2);
  const { code, lines } = guard(report, Number(rc), { paths, config });
  for (const l of lines) console.log(l);
  process.exit(code);
}
