#!/usr/bin/env node
// Score the repo-orientation A/B benchmark described by CB-004.
// Usage: node scripts/repo-orientation-benchmark-score.mjs --manifest <tasks.json> --report <runs.json>

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function usage(exitCode = 64) {
  const out = exitCode === 0 ? process.stdout : process.stderr;
  out.write(
    "usage: repo-orientation-benchmark-score.mjs --manifest <tasks.json> [--report <runs.json>] [--validate-only] [--json]\n",
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    manifest: "evals/capability/repo-orientation/tasks.json",
    report: "",
    validateOnly: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--manifest":
        args.manifest = argv[++i] ?? "";
        break;
      case "--report":
        args.report = argv[++i] ?? "";
        break;
      case "--validate-only":
        args.validateOnly = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        process.stderr.write(`unknown arg: ${arg}\n`);
        usage(64);
    }
  }
  if (!args.manifest) usage(64);
  return args;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`could not read JSON ${file}: ${err.message}`);
  }
}

function assertArray(value, label, failures) {
  if (!Array.isArray(value)) {
    failures.push(`${label} must be an array`);
    return [];
  }
  return value;
}

function validateManifest(manifest, manifestPath) {
  const failures = [];
  if (manifest.version !== 1) failures.push("version must be 1");
  if (manifest.id !== "repo-orientation-efficiency") {
    failures.push("id must be repo-orientation-efficiency");
  }

  const thresholds = manifest.thresholds ?? {};
  const minTasks = Number(thresholds.minTasks ?? 0);
  const maxRepoMapBytes = Number(thresholds.maxRepoMapBytes ?? 0);
  const minToolDrop = Number(thresholds.minOrientationToolCallDropPct ?? -1);
  const minTimeDrop = Number(thresholds.minOrientationTimeDropPct ?? -1);
  if (!Number.isFinite(minTasks) || minTasks < 5) failures.push("thresholds.minTasks must be >= 5");
  if (!Number.isFinite(maxRepoMapBytes) || maxRepoMapBytes < 1) failures.push("thresholds.maxRepoMapBytes must be positive");
  if (!Number.isFinite(minToolDrop) || minToolDrop < 0) failures.push("thresholds.minOrientationToolCallDropPct must be >= 0");
  if (!Number.isFinite(minTimeDrop) || minTimeDrop < 0) failures.push("thresholds.minOrientationTimeDropPct must be >= 0");

  const mix = assertArray(manifest.workloadMix, "workloadMix", failures);
  const mixClasses = new Set();
  let weightSum = 0;
  for (const entry of mix) {
    if (!entry || typeof entry !== "object") {
      failures.push("each workloadMix entry must be an object");
      continue;
    }
    if (typeof entry.class !== "string" || entry.class.length === 0) {
      failures.push("each workloadMix entry needs a class");
    } else {
      mixClasses.add(entry.class);
    }
    const weight = Number(entry.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      failures.push(`workloadMix.${entry.class ?? "?"}.weight must be positive`);
    } else {
      weightSum += weight;
    }
  }
  if (mix.length > 0 && Math.abs(weightSum - 1) > 0.001) {
    failures.push(`workloadMix weights must sum to 1.0, got ${weightSum.toFixed(3)}`);
  }
  for (const required of ["no-orientation", "light-orientation", "deep-orientation"]) {
    if (!mixClasses.has(required)) failures.push(`workloadMix missing required class ${required}`);
  }

  const tasks = assertArray(manifest.tasks, "tasks", failures);
  const ids = new Set();
  const classCounts = new Map();
  for (const task of tasks) {
    if (!task || typeof task !== "object") {
      failures.push("each task must be an object");
      continue;
    }
    if (typeof task.id !== "string" || !/^RO-[0-9]{3}$/.test(task.id)) {
      failures.push(`task id must match RO-NNN: ${task.id ?? "<missing>"}`);
    } else if (ids.has(task.id)) {
      failures.push(`duplicate task id ${task.id}`);
    } else {
      ids.add(task.id);
    }
    if (typeof task.prompt !== "string" || task.prompt.length < 10) {
      failures.push(`${task.id ?? "task"}: prompt must be a useful string`);
    }
    if (typeof task.class !== "string" || !mixClasses.has(task.class)) {
      failures.push(`${task.id ?? "task"}: class must exist in workloadMix`);
    } else {
      classCounts.set(task.class, (classCounts.get(task.class) ?? 0) + 1);
    }
    if (!Array.isArray(task.expected_paths)) failures.push(`${task.id ?? "task"}: expected_paths must be an array`);
    if (!Array.isArray(task.forbidden_patterns) || task.forbidden_patterns.length === 0) {
      failures.push(`${task.id ?? "task"}: forbidden_patterns must be a non-empty array`);
    }
    if (task.class !== "no-orientation" && (!Array.isArray(task.expected_paths) || task.expected_paths.length === 0)) {
      failures.push(`${task.id ?? "task"}: orientation tasks need at least one expected path`);
    }
  }
  if (tasks.length < minTasks) failures.push(`tasks length ${tasks.length} below threshold ${minTasks}`);
  for (const required of ["no-orientation", "light-orientation", "deep-orientation"]) {
    if ((classCounts.get(required) ?? 0) === 0) failures.push(`tasks missing class ${required}`);
  }

  const repoRoot = path.resolve(path.dirname(manifestPath), "../../..");
  const startupPath = manifest.startupContext?.path ?? "context/REPO_MAP.md";
  const startupAbs = path.resolve(repoRoot, startupPath);
  try {
    const bytes = statSync(startupAbs).size;
    if (bytes > maxRepoMapBytes) {
      failures.push(`${startupPath} is ${bytes} bytes, above budget ${maxRepoMapBytes}`);
    }
  } catch (err) {
    failures.push(`could not stat startup context ${startupPath}: ${err.message}`);
  }

  return { ok: failures.length === 0, failures };
}

function median(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (nums.length === 0) return NaN;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

function mean(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (nums.length === 0) return NaN;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function pctDrop(baseline, treatment) {
  if (!Number.isFinite(baseline) || !Number.isFinite(treatment) || baseline <= 0) return NaN;
  return ((baseline - treatment) / baseline) * 100;
}

function summarizeRuns(runs) {
  return {
    count: runs.length,
    correctnessRate: mean(runs.map((run) => (run.correct === true ? 1 : 0))),
    inputTokens: mean(runs.map((run) => Number(run.inputTokens))),
    toolCalls: mean(runs.map((run) => Number(run.toolCallsToFirstRelevantFile))),
    elapsedSeconds: mean(runs.map((run) => Number(run.elapsedSeconds))),
    poisonReads: mean(runs.map((run) => Array.isArray(run.poisonPathReads) ? run.poisonPathReads.length : 0)),
  };
}

function scoreReport(manifest, manifestPath, report) {
  const failures = [];
  const tasksById = new Map(manifest.tasks.map((task) => [task.id, task]));
  const runs = assertArray(report.runs, "report.runs", failures);
  const startupTokens = Number(
    report.startupTokens ??
      Math.ceil(statSync(path.resolve(path.dirname(manifestPath), "../../..", manifest.startupContext?.path ?? "context/REPO_MAP.md")).size / 4),
  );
  if (!Number.isFinite(startupTokens) || startupTokens < 0) failures.push("startupTokens must be >= 0");

  const grouped = new Map();
  for (const run of runs) {
    if (!run || typeof run !== "object") {
      failures.push("each report run must be an object");
      continue;
    }
    if (!tasksById.has(run.task)) failures.push(`unknown task in report: ${run.task ?? "<missing>"}`);
    if (!["baseline", "treatment"].includes(run.variant)) {
      failures.push(`${run.task ?? "run"}: variant must be baseline or treatment`);
      continue;
    }
    for (const key of ["inputTokens", "toolCallsToFirstRelevantFile", "elapsedSeconds"]) {
      const value = Number(run[key]);
      if (!Number.isFinite(value) || value < 0) failures.push(`${run.task ?? "run"}: ${key} must be >= 0`);
    }
    if (typeof run.correct !== "boolean") failures.push(`${run.task ?? "run"}: correct must be boolean`);
    const key = `${run.task}\u0000${run.variant}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(run);
  }
  if (failures.length > 0) return { verdict: "INVALID", exitCode: 2, failures };

  const paired = [];
  for (const task of manifest.tasks) {
    const baseline = grouped.get(`${task.id}\u0000baseline`) ?? [];
    const treatment = grouped.get(`${task.id}\u0000treatment`) ?? [];
    if (baseline.length > 0 || treatment.length > 0) {
      if (baseline.length === 0 || treatment.length === 0) {
        failures.push(`${task.id}: report needs both baseline and treatment runs`);
      } else {
        paired.push({ task, baseline: summarizeRuns(baseline), treatment: summarizeRuns(treatment) });
      }
    }
  }

  const thresholds = manifest.thresholds;
  if (paired.length < thresholds.minTasks) {
    failures.push(`paired task count ${paired.length} below threshold ${thresholds.minTasks}`);
  }
  for (const required of ["no-orientation", "light-orientation", "deep-orientation"]) {
    if (!paired.some((entry) => entry.task.class === required)) {
      failures.push(`paired report missing class ${required}`);
    }
  }
  if (failures.length > 0) return { verdict: "INCOMPLETE", exitCode: 2, failures };

  const baselineCorrect = mean(paired.map((entry) => entry.baseline.correctnessRate));
  const treatmentCorrect = mean(paired.map((entry) => entry.treatment.correctnessRate));
  const baselinePoison = paired.reduce((sum, entry) => sum + entry.baseline.poisonReads, 0);
  const treatmentPoison = paired.reduce((sum, entry) => sum + entry.treatment.poisonReads, 0);

  const orientationPairs = paired.filter((entry) => entry.task.class !== "no-orientation");
  const baselineTools = median(orientationPairs.map((entry) => entry.baseline.toolCalls));
  const treatmentTools = median(orientationPairs.map((entry) => entry.treatment.toolCalls));
  const baselineTime = median(orientationPairs.map((entry) => entry.baseline.elapsedSeconds));
  const treatmentTime = median(orientationPairs.map((entry) => entry.treatment.elapsedSeconds));
  const toolDropPct = pctDrop(baselineTools, treatmentTools);
  const timeDropPct = pctDrop(baselineTime, treatmentTime);

  const classWeights = new Map(manifest.workloadMix.map((entry) => [entry.class, Number(entry.weight)]));
  const deltasByClass = new Map();
  for (const entry of paired) {
    const treatmentTotalTokens = entry.treatment.inputTokens + startupTokens;
    const delta = treatmentTotalTokens - entry.baseline.inputTokens;
    if (!deltasByClass.has(entry.task.class)) deltasByClass.set(entry.task.class, []);
    deltasByClass.get(entry.task.class).push(delta);
  }
  let expectedTokenDelta = 0;
  for (const [klass, weight] of classWeights) {
    expectedTokenDelta += weight * mean(deltasByClass.get(klass) ?? []);
  }

  const reasons = [];
  if (treatmentCorrect < baselineCorrect) reasons.push("treatment correctness is below baseline");
  if (toolDropPct < thresholds.minOrientationToolCallDropPct) {
    reasons.push(`orientation tool-call drop ${toolDropPct.toFixed(1)}% below threshold ${thresholds.minOrientationToolCallDropPct}%`);
  }
  if (timeDropPct < thresholds.minOrientationTimeDropPct) {
    reasons.push(`orientation time drop ${timeDropPct.toFixed(1)}% below threshold ${thresholds.minOrientationTimeDropPct}%`);
  }
  if (expectedTokenDelta > thresholds.maxExpectedTokenDelta) {
    reasons.push(`expected token delta ${expectedTokenDelta.toFixed(1)} above threshold ${thresholds.maxExpectedTokenDelta}`);
  }
  const poisonDelta = treatmentPoison - baselinePoison;
  if (poisonDelta > thresholds.maxPoisonPathReadDelta) {
    reasons.push(`poison-path read delta ${poisonDelta.toFixed(1)} above threshold ${thresholds.maxPoisonPathReadDelta}`);
  }

  const metrics = {
    pairedTasks: paired.length,
    startupTokens,
    baselineCorrectness: Number(baselineCorrect.toFixed(3)),
    treatmentCorrectness: Number(treatmentCorrect.toFixed(3)),
    baselineOrientationToolCallsMedian: baselineTools,
    treatmentOrientationToolCallsMedian: treatmentTools,
    orientationToolCallDropPct: Number(toolDropPct.toFixed(1)),
    baselineOrientationTimeMedian: baselineTime,
    treatmentOrientationTimeMedian: treatmentTime,
    orientationTimeDropPct: Number(timeDropPct.toFixed(1)),
    baselinePoisonReads: baselinePoison,
    treatmentPoisonReads: treatmentPoison,
    poisonPathReadDelta: poisonDelta,
    expectedTokenDelta: Number(expectedTokenDelta.toFixed(1)),
  };

  return {
    verdict: reasons.length === 0 ? "PASS" : "FAIL",
    exitCode: reasons.length === 0 ? 0 : 1,
    reasons,
    metrics,
  };
}

function printResult(result, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`verdict: ${result.verdict}\n`);
  if (result.metrics) {
    for (const [key, value] of Object.entries(result.metrics)) {
      process.stdout.write(`${key}: ${value}\n`);
    }
  }
  const problems = result.failures ?? result.reasons ?? [];
  for (const problem of problems) process.stdout.write(`- ${problem}\n`);
}

const args = parseArgs(process.argv.slice(2));
let manifest;
try {
  manifest = readJson(args.manifest);
  const validation = validateManifest(manifest, args.manifest);
  if (!validation.ok) {
    printResult({ verdict: "INVALID", failures: validation.failures }, args.json);
    process.exit(2);
  }
  if (args.validateOnly) {
    printResult({ verdict: "VALID", tasks: manifest.tasks.length }, args.json);
    process.exit(0);
  }
  if (!args.report) usage(64);
  const report = readJson(args.report);
  const result = scoreReport(manifest, args.manifest, report);
  printResult(result, args.json);
  process.exit(result.exitCode);
} catch (err) {
  printResult({ verdict: "ERROR", failures: [err.message] }, args.json);
  process.exit(2);
}
