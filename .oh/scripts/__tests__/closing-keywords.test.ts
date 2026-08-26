import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(__dirname, "..", "closing-keywords.mjs");

const { parseClosingRefs } = (await import(MODULE_PATH)) as {
  parseClosingRefs: (title?: string | null, body?: string | null) => number[];
};

describe("parseClosingRefs", () => {
  it("reads a closing keyword from the title", () => {
    expect(parseClosingRefs("Closes #841", "")).toEqual([841]);
  });

  it("reads a closing keyword from the body", () => {
    expect(parseClosingRefs("FROM feat/841 TO development", "Closes #841")).toEqual([841]);
  });

  it.each([
    "close",
    "closes",
    "closed",
    "fix",
    "fixes",
    "fixed",
    "resolve",
    "resolves",
    "resolved",
  ])("accepts the keyword %s", (keyword) => {
    expect(parseClosingRefs("", `${keyword} #42`)).toEqual([42]);
  });

  it("ignores keyword case", () => {
    expect(parseClosingRefs("", "CLOSES #1\nReSoLvEd #2")).toEqual([1, 2]);
  });

  it("accepts a colon between the keyword and the reference", () => {
    expect(parseClosingRefs("", "Closes: #5")).toEqual([5]);
  });

  it("returns every uniquely referenced issue", () => {
    expect(parseClosingRefs("Closes #3", "Fixes #7\nResolves #11")).toEqual([3, 7, 11]);
  });

  it("deduplicates repeated references", () => {
    expect(parseClosingRefs("Closes #9", "Fixes #9\nResolved: #9")).toEqual([9]);
  });

  it("ignores a bare issue reference", () => {
    expect(parseClosingRefs("", "Related to #123 and #124")).toEqual([]);
  });

  it("ignores a cross-repository reference", () => {
    expect(parseClosingRefs("", "Closes owner/repo#5")).toEqual([]);
  });

  it("ignores an issue URL", () => {
    expect(parseClosingRefs("", "Closes https://github.com/mifunedev/openharness/issues/5")).toEqual(
      [],
    );
  });

  it("returns nothing when no keyword is present", () => {
    expect(parseClosingRefs("FROM feat/x TO development", "Adds a workflow.")).toEqual([]);
  });

  it("returns nothing for empty input", () => {
    expect(parseClosingRefs(null, undefined)).toEqual([]);
  });

  it("rejects issue number zero", () => {
    expect(parseClosingRefs("", "Closes #0")).toEqual([]);
  });

  it("does not match a keyword glued to another word", () => {
    expect(parseClosingRefs("", "pre-closes #5\nunfixes #6")).toEqual([]);
  });
});
