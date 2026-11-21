import { describe, expect, it } from "vitest";
import { githubSlug, pluginSteps } from "./plugin.ts";

describe("githubSlug", () => {
  it("reads owner/repo from a GitHub address", () => {
    expect(githubSlug("https://github.com/acme/tool")).toBe("acme/tool");
    expect(githubSlug("https://github.com/acme/tool/")).toBe("acme/tool");
  });

  it("fails the build on an address that is not one GitHub repository", () => {
    expect(() => githubSlug("https://gitlab.com/acme/tool")).toThrow(
      "site: not a GitHub repository address — «https://gitlab.com/acme/tool»",
    );
    expect(() => githubSlug("https://github.com/acme")).toThrow(
      "site: not a GitHub repository address — «https://github.com/acme»",
    );
  });
});

describe("pluginSteps", () => {
  it("adds the repository as a marketplace, then installs the package's plugin from it", () => {
    expect(
      pluginSteps("https://github.com/acme/tool", "tool").map((s) => s.command),
    ).toEqual([
      "/plugin marketplace add acme/tool",
      "/plugin install tool@tool",
    ]);
  });
});
