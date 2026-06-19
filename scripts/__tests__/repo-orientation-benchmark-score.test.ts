import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "repo-orientation-benchmark-score.mjs");
const MANIFEST = path.join(REPO_ROOT, "evals", "capability", "repo-orientation", "tasks.json");

function run(report: unknown) {
  const tmp = mkdtempSync(path.join(tmpdir(), "repo-orientation-score-"));
  try {
    const reportPath = path.join(tmp, "report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    const result = spawnSync(
      "node",
      [SCRIPT, "--manifest", MANIFEST, "--report", reportPath, "--json"],
      { encoding: "utf-8", cwd: REPO_ROOT },
    );
    return {
      status: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      json: JSON.parse(result.stdout || "{}"),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function manifestTasks(): Array<{ id: string; class: string }> {
  const result = spawnSync("node", ["-e", `const m=require(${JSON.stringify(MANIFEST)}); console.log(JSON.stringify(m.tasks.map(({id, class: klass}) => ({id, class: klass}))));`], {
    encoding: "utf-8",
    cwd: REPO_ROOT,
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

function reportFor(options: { orientationTreatmentTokens: number; noOrientationTreatmentTokens?: number }) {
  const runs = [];
  for (const task of manifestTasks()) {
    const isNoOrientation = task.class === "no-orientation";
    runs.push({
      task: task.id,
      variant: "baseline",
      correct: true,
      inputTokens: isNoOrientation ? 1000 : 9000,
      toolCallsToFirstRelevantFile: isNoOrientation ? 1 : 10,
      elapsedSeconds: isNoOrientation ? 5 : 100,
      poisonPathReads: isNoOrientation ? [] : ["node_modules/example"],
    });
    runs.push({
      task: task.id,
      variant: "treatment",
      correct: true,
      inputTokens: isNoOrientation ? (options.noOrientationTreatmentTokens ?? 1000) : options.orientationTreatmentTokens,
      toolCallsToFirstRelevantFile: isNoOrientation ? 1 : 5,
      elapsedSeconds: isNoOrientation ? 5 : 60,
      poisonPathReads: [],
    });
  }
  return { startupTokens: 3000, runs };
}

describe("repo-orientation-benchmark-score.mjs", () => {
  it("validates the shipped manifest", () => {
    const result = spawnSync("node", [SCRIPT, "--manifest", MANIFEST, "--validate-only", "--json"], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ verdict: "VALID" });
  });

  it("passes when repo-map treatment wins after startup cost", () => {
    const result = run(reportFor({ orientationTreatmentTokens: 2500 }));

    expect(result.status).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.metrics.orientationToolCallDropPct).toBeGreaterThanOrEqual(20);
    expect(result.json.metrics.expectedTokenDelta).toBeLessThanOrEqual(0);
  });

  it("fails when startup cost overwhelms orientation savings", () => {
    const result = run(reportFor({ orientationTreatmentTokens: 7000 }));

    expect(result.status).toBe(1);
    expect(result.json.verdict).toBe("FAIL");
    expect(result.json.reasons.join("\n")).toContain("expected token delta");
  });

  it("returns incomplete when a paired treatment run is missing", () => {
    const complete = reportFor({ orientationTreatmentTokens: 2500 });
    const missingTreatment = {
      ...complete,
      runs: complete.runs.filter((run) => !(run.task === "RO-001" && run.variant === "treatment")),
    };

    const result = run(missingTreatment);

    expect(result.status).toBe(2);
    expect(result.json.verdict).toBe("INCOMPLETE");
    expect(result.json.failures.join("\n")).toContain("RO-001");
  });
});
