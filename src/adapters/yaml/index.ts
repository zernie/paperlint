/** `ParseYaml` over js-yaml: the one YAML reader of `src/`. A date without quotes reads as a `Date`. */
import { load } from "js-yaml";
import { messageOf } from "../../domain/text.ts";
import { err, ok } from "../../domain/result.ts";
import type { ParseYaml } from "../../ports/yaml.ts";

export const parseYaml: ParseYaml = (text) => {
  try {
    return ok(load(text));
  } catch (e) {
    return err(messageOf(e));
  }
};
