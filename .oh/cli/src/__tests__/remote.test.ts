import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  fetchRemoteSource,
  DEFAULT_REPO_URL,
  DEFAULT_CLONE_TIMEOUT_MS,
  type RemoteRunner,
  type RunResult,
} from "../lib/remote.js";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

const cleanups: string[] = [];

function mkTmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(d);
  return d;
}

afterEach(() => {
  while (cleanups.length > 0) {
    rmSync(cleanups.pop()!, { recursive: true, force: true });
  }
});

/** Run git in a fixture repo with a hermetic identity (argv-array form). */
function git(cwd: string, args: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, stdio: "ignore" },
  );
}

/**
 * Build a local git fixture repo (pinned default branch `main`) with a
 * `marker.txt` commit, plus a `feature-x` branch whose marker differs.
 * Returns its file:// URL — the ONLY transport tests clone over (no network).
 */
function makeFixtureRepo(): string {
  const repo = mkTmp("oh-remote-fixture-");
  git(repo, ["-c", "init.defaultBranch=main", "init"]);
  writeFileSync(join(repo, "marker.txt"), "main-payload\n");
  git(repo, ["add", "marker.txt"]);
  git(repo, ["commit", "-m", "main commit"]);
  git(repo, ["checkout", "-b", "feature-x"]);
  writeFileSync(join(repo, "marker.txt"), "feature-x-payload\n");
  git(repo, ["commit", "-am", "feature commit"]);
  git(repo, ["checkout", "main"]);
  return pathToFileURL(repo).href;
}

/** Fake runner capturing every invocation and returning a canned result. */
function makeFakeRunner(result: RunResult): {
  run: RemoteRunner;
  calls: { cmd: string; args: string[]; env: NodeJS.ProcessEnv; timeoutMs: number }[];
} {
  const calls: { cmd: string; args: string[]; env: NodeJS.ProcessEnv; timeoutMs: number }[] = [];
  const run: RemoteRunner = (cmd, args, opts) => {
    calls.push({ cmd, args, env: opts.env, timeoutMs: opts.timeoutMs });
    return result;
  };
  return { run, calls };
}

// ---------------------------------------------------------------------------
// fetchRemoteSource — behavior contract
// ---------------------------------------------------------------------------

describe("fetchRemoteSource", () => {
  it("clones a file:// fixture into the caller-supplied dir and returns its path", () => {
    const repoUrl = makeFixtureRepo();
    const dest = mkTmp("oh-remote-dest-");

    const got = fetchRemoteSource({ destDir: dest, repoUrl });

    expect(got).toBe(dest);
    expect(readFileSync(join(dest, "marker.txt"), "utf8")).toBe("main-payload\n");
    // Pristine git checkout, not a bare copy.
    expect(existsSync(join(dest, ".git"))).toBe(true);
  });

  it("clones the requested ref via --branch", () => {
    const repoUrl = makeFixtureRepo();
    const dest = mkTmp("oh-remote-dest-");

    fetchRemoteSource({ destDir: dest, repoUrl, ref: "feature-x" });

    expect(readFileSync(join(dest, "marker.txt"), "utf8")).toBe("feature-x-payload\n");
  });

  it("defaults to the public repo URL, omits --branch without a ref, and pins env/timeout", () => {
    const { run, calls } = makeFakeRunner({ status: 0, stderr: "" });
    const dest = mkTmp("oh-remote-dest-");

    fetchRemoteSource({ destDir: dest, run });

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("git");
    expect(calls[0].args).toEqual(["clone", "--depth", "1", "--", DEFAULT_REPO_URL, dest]);
    expect(calls[0].env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(calls[0].timeoutMs).toBe(DEFAULT_CLONE_TIMEOUT_MS);
  });

  it("passes --branch <ref> and an overridden timeout through to the runner", () => {
    const { run, calls } = makeFakeRunner({ status: 0, stderr: "" });
    const dest = mkTmp("oh-remote-dest-");

    fetchRemoteSource({ destDir: dest, ref: "v1.2.3", timeoutMs: 5000, run });

    expect(calls[0].args).toEqual([
      "clone", "--depth", "1", "--branch", "v1.2.3", "--", DEFAULT_REPO_URL, dest,
    ]);
    expect(calls[0].timeoutMs).toBe(5000);
  });

  it("missing git (ENOENT-shaped result) throws an actionable error naming the URL and --from", () => {
    const { run, calls } = makeFakeRunner({
      status: null,
      error: { code: "ENOENT", message: "spawnSync git ENOENT" },
    });
    const dest = mkTmp("oh-remote-dest-");

    expect(() => fetchRemoteSource({ destDir: dest, run })).toThrowError(
      /git is required to fetch https:\/\/github\.com\/mifunedev\/openharness.*--from <dir>/,
    );
    expect(calls).toHaveLength(1);
  });

  it("clone failure surfaces git's stderr, the URL tried, and the --from fallback", () => {
    // Nonexistent file:// path — real git, non-zero exit, zero network I/O.
    const missing = pathToFileURL(join(mkTmp("oh-remote-missing-"), "no-such-repo")).href;
    const dest = mkTmp("oh-remote-dest-");

    let thrown: Error | undefined;
    try {
      fetchRemoteSource({ destDir: dest, repoUrl: missing });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown!.message).toContain(missing);
    expect(thrown!.message).toMatch(/failed \(exit \d+\)/);
    expect(thrown!.message).toContain("--from <dir>");
  });

  it("rejects a leading-dash repoUrl before spawning", () => {
    const { run, calls } = makeFakeRunner({ status: 0 });
    const dest = mkTmp("oh-remote-dest-");

    expect(() =>
      fetchRemoteSource({ destDir: dest, repoUrl: "--upload-pack=evil", run }),
    ).toThrowError(/invalid repo URL "--upload-pack=evil"/);
    expect(calls).toHaveLength(0);
  });

  it("rejects a leading-dash ref before spawning", () => {
    const { run, calls } = makeFakeRunner({ status: 0 });
    const dest = mkTmp("oh-remote-dest-");

    expect(() =>
      fetchRemoteSource({ destDir: dest, ref: "-oops", run }),
    ).toThrowError(/invalid ref "-oops"/);
    expect(calls).toHaveLength(0);
  });

  it("timeout (ETIMEDOUT-shaped result) throws a clean error naming the URL — no real wait", () => {
    const { run } = makeFakeRunner({
      status: null,
      error: { code: "ETIMEDOUT", message: "spawnSync git ETIMEDOUT" },
    });
    const dest = mkTmp("oh-remote-dest-");

    expect(() =>
      fetchRemoteSource({ destDir: dest, repoUrl: "https://example.invalid/repo", timeoutMs: 250, run }),
    ).toThrowError(
      /git clone of https:\/\/example\.invalid\/repo timed out after 250ms.*--from <dir>/,
    );
  });

  it("spawn-level failure with an unrecognized code still names the URL and fallback", () => {
    const { run } = makeFakeRunner({
      status: null,
      error: { code: "EACCES", message: "spawnSync git EACCES" },
    });
    const dest = mkTmp("oh-remote-dest-");

    expect(() =>
      fetchRemoteSource({ destDir: dest, run }),
    ).toThrowError(
      /git clone of https:\/\/github\.com\/mifunedev\/openharness failed to start.*--from <dir>/,
    );
  });
});
