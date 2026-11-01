/**
 * The command line of build-label-page's generator, as a function: one argv in, what it printed and
 * its exit code out. `label-page.ts` runs it on the process's own argv.
 */
import { parseArgs } from "node:util";
import { COMMANDS } from "./label-page-commands.ts";
import {
  CONFIG_SCHEMA,
  exportLabels,
  fail,
  Refusal,
  say,
  takePrinted,
} from "./label-page-core.ts";
import { build } from "./label-page-html.ts";

const USAGE =
  "usage: label-page.js build <items.json> <out-dir> | export <dump.json> <key.json> <data-dir> [--date YYYY-MM-DD] | schema";
const usage = (): never => {
  throw new Refusal(2, USAGE);
};
const today = (): string => {
  const d = new Date();
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
/** How many paths each subcommand takes, and whether it takes `--date`. */
const ARITY: Readonly<
  Record<string, { readonly paths: number; readonly dated: boolean }>
> = {
  [COMMANDS.schema]: { paths: 0, dated: false },
  [COMMANDS.build]: { paths: 2, dated: false },
  [COMMANDS.export]: { paths: 3, dated: true },
};
const parsedArgs = (argv: readonly string[]) => {
  try {
    return parseArgs({
      args: [...argv],
      options: { date: { type: "string" } },
      allowPositionals: true,
    });
  } catch {
    return usage();
  }
};
function exportCommand(
  paths: readonly string[],
  date: string | undefined,
): void {
  const [dump = "", key = "", out = ""] = paths;
  const day = date ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("--date must be YYYY-MM-DD");
  exportLabels(dump, key, out, day);
}
function main(argv: readonly string[]): void {
  const { values, positionals } = parsedArgs(argv);
  const [cmd = "", ...paths] = positionals;
  const arity = ARITY[cmd];
  const fits =
    arity !== undefined &&
    arity.paths === paths.length &&
    (arity.dated || values.date === undefined);
  if (!fits) usage();
  if (cmd === COMMANDS.schema) say(JSON.stringify(CONFIG_SCHEMA, null, 2));
  else if (cmd === COMMANDS.build) build(String(paths[0]), String(paths[1]));
  else exportCommand(paths, values.date);
}

/** One command line: what it printed to stdout and to stderr, and its exit code. */
export function cli(argv: readonly string[]): {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  takePrinted(); // nothing left over from an earlier run in the same process
  try {
    main(argv);
    return { status: 0, stdout: takePrinted(), stderr: "" };
  } catch (e) {
    // An unexpected error (a file that cannot be written) prints its message, not a stack.
    const message = String(Reflect.get(Object(e), "message"));
    const status = e instanceof Refusal ? e.exitCode : 1;
    return { status, stdout: takePrinted(), stderr: `${message}\n` };
  }
}
