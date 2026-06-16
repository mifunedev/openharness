import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DOCS_ROOT = path.join(REPO_ROOT, "docs");
const MARKDOWN_ROOT_FILES = [path.join(REPO_ROOT, "README.md")];

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    if (entry.isFile() && entry.name.endsWith(".md")) return [full];
    return [];
  });
}

describe("documented compose files", () => {
  it("references only compose files that exist", () => {
    const refs = new Set<string>();
    const pattern = /\.devcontainer\/docker-compose[\w.-]*\.yml/g;

    for (const file of [...MARKDOWN_ROOT_FILES, ...markdownFiles(DOCS_ROOT)]) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(pattern)) {
        refs.add(match[0]);
      }
    }

    expect(refs.size).toBeGreaterThan(0);

    for (const ref of refs) {
      const target = path.join(REPO_ROOT, ref);
      expect(
        existsSync(target) && statSync(target).isFile(),
        `${ref} is documented but missing`,
      ).toBe(true);
    }
  });
});
