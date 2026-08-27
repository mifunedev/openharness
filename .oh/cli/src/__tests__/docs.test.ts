import { describe, expect, it } from "vitest";
import { sourceDocsUrl } from "../lib/docs.js";

describe("sourceDocsUrl", () => {
  it("converts a normalized repository docs path to a durable source URL", () => {
    expect(sourceDocsUrl("docs/lifecycle-commands.md")).toBe(
      "https://github.com/mifunedev/openharness/blob/main/docs/lifecycle-commands.md",
    );
    expect(sourceDocsUrl("docs/a guide.md")).toBe(
      "https://github.com/mifunedev/openharness/blob/main/docs/a%20guide.md",
    );
  });

  it.each([
    "installation.md",
    "/docs/installation.md",
    "docs",
    "docs/../README.md",
    "docs/./installation.md",
    "docs//installation.md",
    "docs\\installation.md",
    "docs/installation.md?raw=1",
    "docs/installation.md#install",
  ])("rejects a non-normalized source path: %s", (docsPath) => {
    expect(() => sourceDocsUrl(docsPath)).toThrow(/normalized docs\/ path/);
  });
});
