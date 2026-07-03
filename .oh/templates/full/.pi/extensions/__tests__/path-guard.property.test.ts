import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isSensitivePath, SENSITIVE_PATHS } from "../path-guard";

describe("isSensitivePath — no-false-positives property", () => {
  it("returns false for any path that does not match any SENSITIVE_PATHS regex", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !SENSITIVE_PATHS.some((re) => re.test(s))),
        (s) => {
          expect(isSensitivePath(s)).toBe(false);
        },
      ),
    );
  });
});
