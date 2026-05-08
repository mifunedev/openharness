import { describe, expect, it } from "vitest";
import {
  extractPlanItems,
  formatPlanItems,
  isSafeReadOnlyCommand,
  markCompletedSteps,
  normalizeToolNames,
  pickPlanTools,
} from "../plan-mode/utils";

describe("plan-mode utils", () => {
  describe("isSafeReadOnlyCommand", () => {
    it.each([
      "ls -la",
      "rg plan-mode .pi/extensions",
      "git status --short",
      "git diff -- README.md",
      "pnpm list --depth 0",
      "node --version",
      "sed -n '1,20p' README.md",
    ])("allows read-only command: %s", (command) => {
      expect(isSafeReadOnlyCommand(command)).toBe(true);
    });

    it.each([
      "rm -rf /tmp/x",
      "git push origin main",
      "git checkout -b feature",
      "pnpm install",
      "npm ci",
      "echo hi > file.txt",
      "mkdir new-dir",
      "sudo apt update",
      "vim README.md",
    ])("blocks mutating command: %s", (command) => {
      expect(isSafeReadOnlyCommand(command)).toBe(false);
    });
  });

  describe("plan extraction", () => {
    it("extracts a numbered Plan section", () => {
      const items = extractPlanItems(`Analysis first.\n\nPlan:\n1. Read the current Pi extension setup\n2. Add a plan-mode extension\n3. Add tests\n\nThen wait.`);
      expect(items).toEqual([
        { step: 1, text: "Read the current Pi extension setup", completed: false },
        { step: 2, text: "Add a plan-mode extension", completed: false },
        { step: 3, text: "Add tests", completed: false },
      ]);
    });

    it("accepts markdown plan headers and strips markdown emphasis/code", () => {
      const items = extractPlanItems("## Implementation Plan\n1) **Update** `index.ts`\n2) Wire `/plan approve`");
      expect(items.map((item) => item.text)).toEqual(["Update index.ts", "Wire /plan approve"]);
    });

    it("returns no items without an explicit plan header", () => {
      expect(extractPlanItems("1. This is just a list")).toEqual([]);
    });
  });

  describe("completion tracking", () => {
    it("marks steps from DONE markers", () => {
      const items = extractPlanItems("Plan:\n1. First\n2. Second");
      expect(markCompletedSteps("Completed [DONE:2]", items)).toBe(1);
      expect(formatPlanItems(items)).toContain("2. ✓ Second");
    });

    it("does not count duplicate DONE markers as changes", () => {
      const items = extractPlanItems("Plan:\n1. First");
      expect(markCompletedSteps("[DONE:1] [DONE:1]", items)).toBe(1);
      expect(markCompletedSteps("[DONE:1]", items)).toBe(0);
    });
  });

  describe("tool selection", () => {
    it("normalizes tool names from strings and tool objects", () => {
      expect(normalizeToolNames(["read", { name: "edit" }, { label: "missing" }])).toEqual(["read", "edit"]);
    });

    it("picks only read-only tools when available", () => {
      expect(pickPlanTools([{ name: "read" }, { name: "edit" }, { name: "question" }])).toEqual(["read", "question"]);
    });
  });
});
