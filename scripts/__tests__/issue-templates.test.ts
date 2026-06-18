import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_DIR = path.join(REPO_ROOT, ".github", "ISSUE_TEMPLATE");

function templateFiles(): string[] {
  return readdirSync(TEMPLATE_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(TEMPLATE_DIR, name));
}

describe("GitHub issue templates", () => {
  it("avoid stale application-stack prompts", () => {
    const forbidden = ["Next.js", "PostgreSQL", "- **Browser**"];

    for (const file of templateFiles()) {
      const text = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(text, `${path.basename(file)} must not contain ${token}`).not.toContain(token);
      }
    }
  });

  it("link to the current harness git workflow rule", () => {
    for (const file of templateFiles()) {
      const text = readFileSync(file, "utf8");
      expect(text, `${path.basename(file)} must not link to stale .claude/rules/git.md`).not.toContain(
        ".claude/rules/git.md",
      );
    }
  });
});
