/** Reading YAML — the frontmatter of a paper's scorecard, for `paperlint versions migrate`. */
import type { Result } from "../domain/result.ts";

/** YAML text → the value it holds, or why it does not parse. */
export type ParseYaml = (text: string) => Result<unknown, string>;
