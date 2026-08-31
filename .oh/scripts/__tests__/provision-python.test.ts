import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh/scripts/provision-python.sh");
const DOCKERFILE = join(ROOT, ".devcontainer/Dockerfile");
const ENTRYPOINT = join(ROOT, ".devcontainer/entrypoint.sh");

const script = () => readFileSync(SCRIPT, "utf8");
const dockerfile = () => readFileSync(DOCKERFILE, "utf8");
const entrypoint = () => readFileSync(ENTRYPOINT, "utf8");

describe("provision-python.sh", () => {
  it("parses as valid bash", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow();
  });

  it("drops from root to the sandbox user with HOME pinned", () => {
    const text = script();
    expect(text).toContain('if [ "$(id -u)" = "0" ]; then');
    expect(text).toContain('exec gosu "$SANDBOX_USER" env HOME="$USER_HOME"');
    expect(text).toContain("HOME='$USER_HOME'");
  });

  it("creates every level of the uv tree explicitly, parents first", () => {
    const text = script();
    const dirs = text.slice(text.indexOf('install -d -o "$SANDBOX_USER"'));
    const uvIdx = dirs.indexOf('"$USER_HOME/.local/share/uv" \\');
    const toolsIdx = dirs.indexOf('"$USER_HOME/.local/share/uv/tools"');
    const pythonIdx = dirs.indexOf('"$USER_HOME/.local/share/uv/python"');
    expect(uvIdx).toBeGreaterThan(-1);
    expect(toolsIdx).toBeGreaterThan(uvIdx);
    expect(pythonIdx).toBeGreaterThan(uvIdx);
    expect(dirs).toContain('"$USER_HOME/.cache"');
  });

  it("pins uv state to user-scoped paths and never to /root", () => {
    const text = script();
    expect(text).toContain('export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$HOME/.local/share/uv/python}"');
    expect(text).toContain('export UV_CACHE_DIR="${UV_CACHE_DIR:-$HOME/.cache/uv}"');
    expect(text).toContain("/root/*) die");
    expect(text).not.toMatch(/^\s*sudo uv/m);
  });

  it("runs uv python install unconditionally so the install dir is exercised", () => {
    const text = script();
    const install = text.indexOf('uv python install "$PY_VERSION"');
    expect(install).toBeGreaterThan(-1);
    expect(text).toContain('uv python find --managed-python "$PY_VERSION"');
  });

  it("emits an actionable error instead of a bare permission denial", () => {
    const text = script();
    expect(text).toContain("is not writable by");
    expect(text).toContain("do not work around this with 'sudo uv'");
    expect(text).toContain("chown -R $SANDBOX_USER:$SANDBOX_USER");
  });

  it("verifies ipykernel before reporting success", () => {
    const text = script();
    expect(text).toContain('"$KERNEL_PYTHON" -c "import ipykernel"');
    expect(text).toContain("kernel environment is incomplete");
  });

  it("supports verify-only and print-env modes", () => {
    const text = script();
    expect(text).toContain("--verify)    MODE=\"verify\"");
    expect(text).toContain("--print-env) MODE=\"print-env\"");
    const out = execFileSync("bash", [SCRIPT, "--print-env"], {
      encoding: "utf8",
      env: { ...process.env, HOME: "/home/sandbox" },
    });
    expect(out).toContain("export UV_PYTHON_INSTALL_DIR=");
    expect(out).toContain("export UV_CACHE_DIR=");
    expect(out).not.toContain("/root/");
  });
});

describe("Dockerfile uv ownership", () => {
  it("names each uv directory level so no parent is left root-owned", () => {
    const text = dockerfile();
    const block = text.slice(text.indexOf("ENV UV_TOOL_DIR="), text.indexOf("# Pi self-updates"));
    for (const dir of [
      "/home/sandbox/.local/share/uv",
      "/home/sandbox/.cache",
    ]) {
      expect(block).toContain(`      ${dir} \\`);
    }
    expect(block).toContain('"$UV_PYTHON_INSTALL_DIR" "$UV_CACHE_DIR"');
  });

  it("pins the uv python install and cache dirs into the image env", () => {
    const text = dockerfile();
    expect(text).toContain("ENV UV_PYTHON_INSTALL_DIR=/home/sandbox/.local/share/uv/python");
    expect(text).toContain("ENV UV_CACHE_DIR=/home/sandbox/.cache/uv");
  });

  it("provisions Python as the sandbox user, not root", () => {
    const text = dockerfile();
    expect(text).toContain("ARG INSTALL_PYTHON_KERNEL=true");
    expect(text).toContain('su - sandbox -c "OH_PYTHON_VERSION=');
    expect(text).toContain("/opt/oh-seed/.oh/scripts/provision-python.sh");
  });

  it("sources the generated python env from login shells", () => {
    expect(dockerfile()).toContain('$HOME/.local/share/oh/python-env.sh');
  });
});

describe("entrypoint uv ownership repair", () => {
  it("repairs the uv tree on every boot", () => {
    const text = entrypoint();
    expect(text).toContain("/home/sandbox/.local/share/uv/python");
    expect(text).toContain("/home/sandbox/.cache/uv");
    expect(text).toContain('find /home/sandbox -path "$OH_PROJECT_ROOT" -prune -o');
    expect(text).toContain('-exec chown -h "$owner" {} +');
  });

  it("runs provisioning after provider links and does not abort boot on failure", () => {
    const text = entrypoint();
    const links = text.indexOf('link-providers.sh" --init');
    const provision = text.indexOf('.oh/scripts/provision-python.sh"; then');
    expect(provision).toBeGreaterThan(links);
    expect(text).toContain('"${OH_PROVISION_PYTHON:-true}" = "true"');
    expect(text).toContain("WARNING: Python provisioning did not complete");
  });
});
