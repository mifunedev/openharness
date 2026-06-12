import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseCronFile, loadCrons } from "../cron-runtime";

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

describe("loadCrons — property: ordering-stability (alphabetical regardless of write order)", () => {
  it("returns entries in ascending alphabetical order even when files are written in reverse order", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}\.md$/), {
          minLength: 2,
          maxLength: 8,
        }),
        (filenames) => {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-prop-"));
          try {
            // Write files in REVERSE-alphabetical order to exercise the sort invariant
            const reversed = [...filenames].sort().reverse();
            for (const filename of reversed) {
              fs.writeFileSync(
                path.join(tmpDir, filename),
                '---\nschedule: "* * * * *"\n---\n',
              );
            }

            const entries = loadCrons(tmpDir);
            const returnedFilePaths = entries.map((e) => e.filePath);

            // Assert returned order is ascending alphabetical sort of input filenames
            // filePath is now dir-qualified (path.join(dir, f)) so compare against full paths
            const expectedOrder = [...filenames].sort().map((f) => path.join(tmpDir, f));
            expect(returnedFilePaths).toEqual(expectedOrder);
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        },
      ),
    );
  });
});
