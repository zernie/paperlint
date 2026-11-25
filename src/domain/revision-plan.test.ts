/** The line `revision-plan/record` reports for a problem: the field's path, the reason, what to do. */
import { describe, expect, it } from "vitest";
import { planProblemText } from "./revision-plan.ts";

const WHAT_TO_DO =
  "What to do: correct the field; the fields are in the JSON Schema `revision-plan.schema.json` that `paper-pipeline` ships";

describe("planProblemText", () => {
  it("names the field by its path", () => {
    expect(
      planProblemText({
        path: ["remaining", 2, "evidence"],
        message: "missing",
      }),
    ).toBe(`\`remaining.2.evidence\`: missing. ${WHAT_TO_DO}`);
  });

  it("names the whole file as the top", () => {
    expect(
      planProblemText({ path: [], message: "Invalid input: expected object" }),
    ).toBe(`\`(top)\`: Invalid input: expected object. ${WHAT_TO_DO}`);
  });
});
