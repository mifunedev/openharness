import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseCronFile } from "../cron-runtime";

describe("parseCronFile — property: never throws", () => {
  it("never throws for any arbitrary string content and filePath", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (content, filePath) => {
        expect(() => parseCronFile(content, filePath)).not.toThrow();
      }),
    );
  });
});

describe("parseCronFile — property: forward-compatibility (unknown keys ignored)", () => {
  it("returns non-null with correct schedule when arbitrary unknown keys are appended", () => {
    const keyArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
    const valueArb = fc.stringMatching(/^[^\n:#]+$/);
    const extraPairsArb = fc.array(fc.tuple(keyArb, valueArb), {
      minLength: 1,
      maxLength: 5,
    });

    fc.assert(
      fc.property(extraPairsArb, (extraPairs) => {
        const baseline = `---\nschedule: "* * * * *"\n`;
        const extras = extraPairs.map(([k, v]) => `${k}: ${v}`).join("\n");
        const extendedContent = `${baseline}${extras}\n---\nbody text\n`;

        const result = parseCronFile(extendedContent, "test.md");

        expect(result).not.toBeNull();
        expect(result!.schedule).toBe("* * * * *");
      }),
    );
  });
});
