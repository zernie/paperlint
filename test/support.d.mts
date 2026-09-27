// Types for test/support.mjs (see the module).
export declare function useTempDir(prefix?: string): string;
export declare function writeTree(
  root: string,
  files: Record<string, string>,
): string;
export interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
export declare function runNode(
  script: string,
  args?: readonly string[],
  options?: { cwd?: string; env?: Record<string, string>; input?: string },
): ScriptResult;
