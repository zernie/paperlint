/**
 * `paperlint new` writes `<paper>/paperlint.json` — from the package's template, or from the
 * project's `<papers>/.template/` when it has one — with no venue chosen yet, which lint then names
 * in one warning instead of staying silent.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newPaper, OVERRIDE_DIR } from "./new-paper.ts";
import { parsePaperSettings } from "./paper-settings.ts";
import { run } from "./cli.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-new-")));
  dirs.push(d);
  return d;
};
const settingsOf = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "paperlint.json"), "utf8")) as Record<
    string,
    unknown
  >;

describe("paperlint new — paperlint.json", () => {
  it("is always written, from the package template: no venue chosen yet, and valid", () => {
    const papers = join(tmp(), "papers");
    const r = newPaper(papers, "demo", "tex");
    expect(r.ok && r.files.find((f) => f.file === "paperlint.json")).toEqual({
      file: "paperlint.json",
      status: "created",
      from: "package",
    });
    const s = settingsOf(join(papers, "demo"));
    expect(s["extends"]).toBeNull();
    expect(String(s["$comment"])).toMatch(/paperlint:agenticdev/);
    expect(parsePaperSettings(s)).toEqual({
      ok: true,
      value: { extends: null, kind: null, pdf: null, rules: null },
    });
  });

  it("comes from the project's <papers>/.template/ when it has one", () => {
    const papers = join(tmp(), "papers");
    mkdirSync(join(papers, OVERRIDE_DIR), { recursive: true });
    writeFileSync(
      join(papers, OVERRIDE_DIR, "paperlint.json"),
      '{ "extends": "paperlint:aisec", "kind": "research" }\n',
    );
    const r = newPaper(papers, "house", "tex");
    expect(r.ok && r.files.find((f) => f.file === "paperlint.json")?.from).toBe(
      "project",
    );
    expect(settingsOf(join(papers, "house"))).toEqual({
      extends: "paperlint:aisec",
      kind: "research",
    });
  });

  it("is never overwritten", () => {
    const papers = join(tmp(), "papers");
    mkdirSync(join(papers, "p"), { recursive: true });
    writeFileSync(
      join(papers, "p", "paperlint.json"),
      '{"extends":"paperlint:aisec"}',
    );
    const r = newPaper(papers, "p", "tex");
    expect(
      r.ok && r.files.find((f) => f.file === "paperlint.json")?.status,
    ).toBe("kept");
    expect(settingsOf(join(papers, "p"))).toEqual({
      extends: "paperlint:aisec",
    });
  });
});

describe("paperlint lint — a paper with no venue preset chosen", () => {
  async function lintNew(extendsValue: string | null) {
    const root = tmp();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "c", private: true }),
    );
    newPaper(join(root, "papers"), "demo", "tex");
    if (extendsValue !== null)
      writeFileSync(
        join(root, "papers", "demo", "paperlint.json"),
        JSON.stringify({ extends: extendsValue, kind: "short" }),
      );
    const out: string[] = [];
    const code = await run(["lint", "--json"], {
      cwd: root,
      log: (s: string) => out.push(s),
      err: () => {},
    });
    const messages = (
      JSON.parse(out.join("\n")) as {
        messages: { ruleId: string; severity: number; message: string }[];
      }[]
    ).flatMap((r) => r.messages);
    return { code, messages };
  }

  it("gets exactly one warning naming the file to set, and exits 0", async () => {
    const { code, messages } = await lintNew(null);
    expect(code).toBe(0);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("pdf/measured");
    expect(messages[0]?.severity).toBe(1);
    expect(messages[0]?.message).toMatch(/names no venue preset yet/);
    expect(messages[0]?.message).toMatch(
      /set "extends" in .*papers\/demo\/paperlint\.json/,
    );
  });

  it("a paper with a real extends does not get it", async () => {
    const { messages } = await lintNew("paperlint:agenticdev");
    expect(messages.map((m) => m.message).join("\n")).not.toMatch(
      /names no venue preset yet/,
    );
  });
});
