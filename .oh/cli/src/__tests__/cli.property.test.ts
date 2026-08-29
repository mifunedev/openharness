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

const { isHelpFlag, isVersionFlag, parseComposeArgs, parseDestroyArgs } =
  await import("../cli.js");

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

describe("parseDestroyArgs — property tests", () => {
  const tokens = fc.array(fc.string(), { maxLength: 5 });

  it("never throws, and never confirms on tokens it did not recognise", () => {
    fc.assert(
      fc.property(tokens, (rest) => {
        const parsed = parseDestroyArgs(rest);
        if (!parsed.ok) return;
        if (parsed.args.yes) {
          expect(rest.some((t) => t === "--yes")).toBe(true);
        }
      }),
    );
  });

  it("only ever accepts --yes and a leading help flag", () => {
    fc.assert(
      fc.property(tokens, (rest) => {
        const parsed = parseDestroyArgs(rest);
        if (!parsed.ok) return;
        if (parsed.args.help) {
          expect(isHelpFlag(rest[0])).toBe(true);
          return;
        }
        expect(rest.every((t) => t === "--yes")).toBe(true);
      }),
    );
  });
});

describe("parseComposeArgs — property tests", () => {
  it("accepts nothing but the config subcommand and a help flag", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 5 }), (rest) => {
        const parsed = parseComposeArgs(rest);
        if (!parsed.ok) return;
        if (parsed.args.subcommand !== undefined) {
          expect(parsed.args.subcommand).toBe("config");
          expect(rest[0]).toBe("config");
          return;
        }
        expect(rest.length === 0 || isHelpFlag(rest[0])).toBe(true);
      }),
    );
  });

  it("only forwards tokens that appeared after a `--` separator", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 5 }), (rest) => {
        const parsed = parseComposeArgs(rest);
        if (!parsed.ok) return;
        for (const token of parsed.args.passthrough) {
          expect(rest.indexOf(token)).toBeGreaterThan(rest.indexOf("--"));
        }
      }),
    );
  });
});
