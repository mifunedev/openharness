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

const {
  isHelpFlag,
  isVersionFlag,
  parseComposeArgs,
  parseConfigArgs,
  parseDestroyArgs,
  parseSecretArgs,
} = await import("../cli.js");

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

  it("only ever accepts --yes, one sandbox name and a leading help flag", () => {
    fc.assert(
      fc.property(tokens, (rest) => {
        const parsed = parseDestroyArgs(rest);
        if (!parsed.ok) return;
        if (parsed.args.help) {
          expect(isHelpFlag(rest[0])).toBe(true);
          return;
        }
        expect(rest.every((t) => t === "--yes" || t === parsed.args.name)).toBe(true);
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

const withoutSandboxFlag = (rest: string[]): string[] => {
  const kept: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--sandbox") i++;
    else kept.push(rest[i]);
  }
  return kept;
};

describe("parseConfigArgs — property tests", () => {
  it("never reports both a verb and an integration", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 4 }), (input) => {
        const rest = withoutSandboxFlag(input);
        const parsed = parseConfigArgs(input);
        if (!parsed.ok) return;
        const { verb, integration } = parsed.args;
        expect(verb !== undefined && integration !== undefined).toBe(false);
        if (verb === "set") {
          expect(parsed.args.key).toBe(rest[1]);
          expect(parsed.args.value).toBe(rest[2]);
        }
      }),
    );
  });
});

describe("parseSecretArgs — property tests", () => {
  it("never carries a value alongside the key", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 4 }), (input) => {
        const rest = withoutSandboxFlag(input);
        const parsed = parseSecretArgs(input);
        if (!parsed.ok) return;
        if (parsed.args.verb === "set") {
          expect(parsed.args.key).toBe(rest[1]);
          expect(rest).toHaveLength(2);
        }
        expect(Object.keys(parsed.args)).not.toContain("value");
      }),
    );
  });
});
