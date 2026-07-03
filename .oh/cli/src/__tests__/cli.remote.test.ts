import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// cli.ts has a top-level side effect: main(process.argv.slice(2)).then(process.exit).
// Same guard as cli.property.test.ts: stub process.exit around the import so the
// module body's main() call cannot terminate the vitest worker.
vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const {
  parseInitArgs,
  parseUpdateArgs,
  resolveInitSource,
  bundledPayloadExists,
  runWithRemoteSource,
} = await import("../cli.js");
const { DEFAULT_REPO_URL } = await import("../lib/remote.js");
const { runInit } = await import("../commands/init.js");

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

function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/**
 * Local git fixture shaped like an OpenHarness checkout: an `.oh/` payload
 * (cli/package.json carrying `version`, a README) plus `.oh/templates/` so a
 * remote-sourced runInit can use BOTH paths. file:// is the only transport —
 * no network I/O.
 */
function makePayloadRepo(version = "9.9.9"): string {
  const repo = mkTmp("oh-cli-remote-fixture-");
  git(repo, ["-c", "init.defaultBranch=main", "init"]);
  writeFile(repo, ".oh/cli/package.json", `${JSON.stringify({ name: "oh", version })}\n`);
  writeFile(repo, ".oh/README.md", "# payload\n");
  writeFile(repo, ".oh/templates/AGENTS.md", "remote-templates-payload\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", "payload"]);
  return repo;
}

const BUNDLED = { sourceOhDir: "/bundled/.oh", templatesDir: "/bundled/.oh/templates" };

// ---------------------------------------------------------------------------
// parseInitArgs
// ---------------------------------------------------------------------------

describe("parseInitArgs", () => {
  it("parses --from-remote and --ref alongside the existing flags", () => {
    const r = parseInitArgs(["--from-remote", "--ref", "v1.2.3", "--yes", "target"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.args.fromRemote).toBe(true);
      expect(r.args.ref).toBe("v1.2.3");
      expect(r.args.yes).toBe(true);
      expect(r.args.targetDir).toBe("target");
    }
  });

  it("keeps the pre-existing flag behavior identical", () => {
    const r = parseInitArgs(["--from", "/x", "--templates", "/t", "--force", "dir"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.args.fromDir).toBe("/x");
      expect(r.args.templatesDir).toBe("/t");
      expect(r.args.force).toBe(true);
      expect(r.args.targetDir).toBe("dir");
      expect(r.args.fromRemote).toBe(false);
    }
    expect(parseInitArgs(["--bogus"])).toEqual({
      ok: false,
      error: 'oh init: unknown flag "--bogus"',
    });
    expect(parseInitArgs(["--from"])).toEqual({
      ok: false,
      error: "oh init: --from requires a directory argument",
    });
    expect(parseInitArgs(["a", "b"])).toEqual({
      ok: false,
      error: 'oh init: unexpected argument "b"',
    });
  });

  it("rejects --from-remote with --from, naming both flags", () => {
    const r = parseInitArgs(["--from-remote", "--from", "/x"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--from-remote");
      expect(r.error).toContain("--from");
    }
  });

  it("rejects --from-remote with --templates, naming both flags", () => {
    const r = parseInitArgs(["--templates", "/t", "--from-remote"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--from-remote");
      expect(r.error).toContain("--templates");
    }
  });

  it("rejects --ref without --from-remote", () => {
    const r = parseInitArgs(["--ref", "v1.2.3"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--ref");
      expect(r.error).toContain("--from-remote");
    }
  });

  it("rejects --ref without a value", () => {
    const r = parseInitArgs(["--from-remote", "--ref"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("--ref requires");
  });
});

// ---------------------------------------------------------------------------
// parseUpdateArgs
// ---------------------------------------------------------------------------

describe("parseUpdateArgs", () => {
  it("parses --from-remote [--ref] and keeps --from/--dry-run/--force behavior", () => {
    const remote = parseUpdateArgs(["--from-remote", "--ref", "main", "--dry-run"]);
    expect(remote.ok).toBe(true);
    if (remote.ok) {
      expect(remote.args.fromRemote).toBe(true);
      expect(remote.args.ref).toBe("main");
      expect(remote.args.dryRun).toBe(true);
    }
    const local = parseUpdateArgs(["--from", "/x", "--force"]);
    expect(local.ok).toBe(true);
    if (local.ok) {
      expect(local.args.fromDir).toBe("/x");
      expect(local.args.force).toBe(true);
      expect(local.args.fromRemote).toBe(false);
    }
  });

  it("rejects --from-remote with --from, naming both flags", () => {
    const r = parseUpdateArgs(["--from", "/x", "--from-remote"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--from-remote");
      expect(r.error).toContain("--from");
    }
  });

  it("rejects --ref without --from-remote", () => {
    const r = parseUpdateArgs(["--from", "/x", "--ref", "main"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--ref");
      expect(r.error).toContain("--from-remote");
    }
  });

  it("no source flags: still errors, naming BOTH --from and --from-remote", () => {
    const r = parseUpdateArgs([]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--from <dir>");
      expect(r.error).toContain("--from-remote");
      // Not a usage mistake → main must not dump the help text (parity with the old behavior).
      expect(r.showHelp).toBeUndefined();
    }
  });

  it("help flag short-circuits; unexpected argument errors with showHelp", () => {
    const help = parseUpdateArgs(["--help"]);
    expect(help.ok).toBe(true);
    if (help.ok) expect(help.args.help).toBe(true);

    const bad = parseUpdateArgs(["bogus"]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toContain('unexpected argument "bogus"');
      expect(bad.showHelp).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveInitSource — the bundled-payload seam + both-paths asymmetry
// ---------------------------------------------------------------------------

describe("resolveInitSource", () => {
  it("asymmetry: --from-remote sets BOTH paths from the checkout; --from sets only sourceOhDir", () => {
    const remote = resolveInitSource(
      { fromRemote: true },
      { ...BUNDLED, exists: () => true },
    );
    expect(remote.kind).toBe("remote");
    if (remote.kind === "remote") {
      const p = remote.paths("/tmp/checkout");
      expect(p.sourceOhDir).toBe(join("/tmp/checkout", ".oh"));
      expect(p.templatesDir).toBe(join("/tmp/checkout", ".oh", "templates"));
    }

    const local = resolveInitSource(
      { fromRemote: false, fromDir: "/somewhere/checkout" },
      { ...BUNDLED, exists: () => true },
    );
    expect(local.kind).toBe("local");
    if (local.kind === "local") {
      expect(local.sourceOhDir).toBe(resolve(join("/somewhere/checkout", ".oh")));
      // Templates stay at the bundled default — --from sets ONE path.
      expect(local.templatesDir).toBe(BUNDLED.templatesDir);
    }
  });

  it("no flags + bundled payload present → local bundled defaults (no notice)", () => {
    const s = resolveInitSource({ fromRemote: false }, { ...BUNDLED, exists: () => true });
    expect(s).toEqual({
      kind: "local",
      sourceOhDir: BUNDLED.sourceOhDir,
      templatesDir: BUNDLED.templatesDir,
    });
  });

  it("auto-fallback: no flags + bundled payload absent → remote with a one-line notice naming URL and ref", () => {
    const s = resolveInitSource({ fromRemote: false }, { ...BUNDLED, exists: () => false });
    expect(s.kind).toBe("remote");
    if (s.kind === "remote") {
      expect(s.notice).toContain(DEFAULT_REPO_URL);
      expect(s.notice).toContain("default branch");
      expect(s.notice?.endsWith("\n")).toBe(true);
      expect(s.notice?.trim().split("\n")).toHaveLength(1);
    }
  });

  it("explicit --from-remote carries no auto-fallback notice", () => {
    const s = resolveInitSource(
      { fromRemote: true, ref: "v1" },
      { ...BUNDLED, exists: () => false },
    );
    expect(s.kind).toBe("remote");
    if (s.kind === "remote") {
      expect(s.notice).toBeUndefined();
      expect(s.ref).toBe("v1");
    }
  });

  it("--templates alone pins the local path (never silently overridden by the fallback)", () => {
    const s = resolveInitSource(
      { fromRemote: false, templatesDir: "/custom" },
      { ...BUNDLED, exists: () => false },
    );
    expect(s.kind).toBe("local");
    if (s.kind === "local") expect(s.templatesDir).toBe("/custom");
  });
});

describe("bundledPayloadExists", () => {
  it("requires the manifest marker AND the templates dir (not the bare parent dir)", () => {
    const probed: string[] = [];
    const allThere = (p: string): boolean => {
      probed.push(p);
      return true;
    };
    expect(bundledPayloadExists(BUNDLED, allThere)).toBe(true);
    // The decision keys off the manifest marker, not the directory itself.
    expect(probed).toContain(join(BUNDLED.sourceOhDir, "manifest.json"));
    expect(probed).toContain(BUNDLED.templatesDir);

    expect(bundledPayloadExists(BUNDLED, () => false)).toBe(false);
    // Parent dir exists (e.g. /usr for an installed binary) but no manifest → absent.
    expect(
      bundledPayloadExists(BUNDLED, (p) => !p.endsWith("manifest.json")),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runWithRemoteSource — fetch → downstream run → guaranteed cleanup
// ---------------------------------------------------------------------------

describe("runWithRemoteSource", () => {
  it("happy path: a file:// fixture flows through a FULL runInit and prints the version-skew line", async () => {
    const repoUrl = pathToFileURL(makePayloadRepo("9.9.9")).href;
    const target = mkTmp("oh-cli-remote-target-");
    const cliOut: string[] = [];
    const io = { stdout: (): void => {}, stderr: (): void => {} };

    let seenCheckout = "";
    const code = await runWithRemoteSource(
      { repoUrl, stdout: (s) => cliOut.push(s) },
      (checkoutDir) => {
        seenCheckout = checkoutDir;
        // The exact both-paths wiring main() applies for --from-remote.
        return runInit(
          {
            targetDir: target,
            templatesDir: join(checkoutDir, ".oh", "templates"),
            sourceOhDir: join(checkoutDir, ".oh"),
            yes: true,
            minimal: true,
          },
          io,
        );
      },
    );

    expect(code).toBe(0);
    // Scaffolded from the FETCHED templates…
    expect(readFileSync(join(target, "AGENTS.md"), "utf8")).toBe(
      "remote-templates-payload\n",
    );
    // …and vendored through the existing copyOhPayload path.
    expect(readFileSync(join(target, ".oh/README.md"), "utf8")).toBe("# payload\n");
    // Version-skew line names the FETCHED payload version and the installed CLI's.
    expect(cliOut.join("")).toContain("fetched payload v9.9.9 (installed CLI v");
    // Temp checkout removed after a successful run.
    expect(seenCheckout).not.toBe("");
    expect(existsSync(seenCheckout)).toBe(false);
  });

  it("cleanup fires when the downstream run throws AFTER a successful fetch", async () => {
    const repoUrl = pathToFileURL(makePayloadRepo()).href;
    let checkout = "";
    await expect(
      runWithRemoteSource({ repoUrl, stdout: () => {} }, (dir) => {
        checkout = dir;
        // Prove the fetch really succeeded before the downstream failure.
        expect(existsSync(join(dir, ".oh", "README.md"))).toBe(true);
        throw new Error("downstream write exploded");
      }),
    ).rejects.toThrow("downstream write exploded");
    expect(checkout).not.toBe("");
    expect(existsSync(checkout)).toBe(false);
  });

  it("cleanup fires even when the fetch itself throws", async () => {
    const made: string[] = [];
    const removed: string[] = [];
    await expect(
      runWithRemoteSource(
        {
          fetch: () => {
            throw new Error("clone failed");
          },
          mkdtemp: () => {
            const d = mkTmp("oh-cli-remote-fetchfail-");
            made.push(d);
            return d;
          },
          rm: (d) => removed.push(d),
          stdout: () => {},
        },
        () => 0,
      ),
    ).rejects.toThrow("clone failed");
    expect(removed).toEqual(made);
  });
});
