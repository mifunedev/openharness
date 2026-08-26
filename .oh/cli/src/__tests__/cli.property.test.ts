import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { isHelpFlag, isVersionFlag } = await import("../cli.js");

const stringOrUndefined = fc.oneof(fc.string(), fc.constant(undefined));

describe("isHelpFlag — property tests", () => {
  it("is deterministic: same input always returns same result", () => {
    fc.assert(
      fc.property(stringOrUndefined, (s) => {
        expect(isHelpFlag(s)).toBe(isHelpFlag(s));
      }),
    );
  });
});

describe("isVersionFlag — property tests", () => {
  it("is deterministic: same input always returns same result", () => {
    fc.assert(
      fc.property(stringOrUndefined, (s) => {
        expect(isVersionFlag(s)).toBe(isVersionFlag(s));
      }),
    );
  });
});

describe("CLI flag functions — no-throw property", () => {
  it("neither isHelpFlag nor isVersionFlag throws on any input", () => {
    fc.assert(
      fc.property(stringOrUndefined, (s) => {
        expect(() => isHelpFlag(s)).not.toThrow();
        expect(() => isVersionFlag(s)).not.toThrow();
      }),
    );
  });
});
