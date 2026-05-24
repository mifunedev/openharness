import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

// cli.ts has a top-level side effect: main(process.argv.slice(2)).then(process.exit).
// vi.mock hoisting ensures this mock is applied before the module executes,
// preventing vitest's process.exit interception from surfacing as an unhandled error.
vi.mock("../cli.js", async (importOriginal) => {
  // Stub process.exit before the module body runs its top-level main() call
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  // Allow a microtask tick for main().then(process.exit) to complete with the stub
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
