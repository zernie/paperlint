import { ESLint } from "eslint";
import { map, omit, sumBy } from "remeda";

export const LINT_FORMAT = "stylish";

export function lintResultFor(
  file: string,
  messages: readonly ESLint.LintResult["messages"][number][],
): Readonly<ESLint.LintResult> {
  const errorCount = messages.filter((m) => m.severity === 2).length;
  return {
    filePath: file,
    messages: [...messages],
    suppressedMessages: [],
    errorCount,
    fatalErrorCount: 0,
    warningCount: messages.length - errorCount,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
    usedDeprecatedRules: [],
  };
}

/** Print the venue findings in the same format as the standalone lint command. */
export async function lintText(
  file: string,
  messages: readonly ESLint.LintResult["messages"][number][],
): Promise<string> {
  return (await new ESLint().loadFormatter(LINT_FORMAT)).format([
    lintResultFor(file, messages),
  ]);
}

interface ReportFormat {
  readonly json: boolean;
  readonly structure: readonly ESLint.LintResult[];
  readonly structureText: string;
  readonly log: (line: string) => void;
}

export async function printLintResults(
  eslint: ESLint,
  results: readonly ESLint.LintResult[],
  { json, structure, structureText, log }: ReportFormat,
): Promise<boolean> {
  if (json) {
    log(
      JSON.stringify(
        [...structure, ...map(results, (r) => omit(r, ["stats"]))],
        null,
        1,
      ),
    );
    return false;
  }
  if (structure.length > 0) log(structureText);
  const out = await (
    await eslint.loadFormatter(LINT_FORMAT)
  ).format([...results]);
  const clean = out.trim() === "" && structure.length === 0;
  log(
    out.trim() ||
      (clean ? `✓ ${String(results.length)} file(s) checked, no findings` : ""),
  );
  return clean;
}

export function lintExitCode(
  results: readonly ESLint.LintResult[],
  hasStructureErrors: boolean,
  maxWarnings: number,
  err: (line: string) => void,
): number {
  if (hasStructureErrors || results.some((r) => r.errorCount > 0)) return 1;
  if (maxWarnings < 0) return 0;
  const warnings = sumBy(results, (r) => r.warningCount);
  if (!(warnings > maxWarnings)) return 0;
  err(
    `${String(warnings)} warning(s) exceed the --max-warnings limit of ${String(maxWarnings)}`,
  );
  return 1;
}
