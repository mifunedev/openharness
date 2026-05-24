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
