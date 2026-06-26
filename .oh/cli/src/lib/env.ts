import {
  readFileSync,
  writeFileSync,
  existsSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
} from "node:fs";

export function loadEnvInto(
  envPath: string,
  env: Record<string, string | undefined>,
): void {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "" || /^\s*#/.test(line)) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1);
    if (key === "") continue;
    if (env[key] === undefined) env[key] = value;
  }
}

export function upsertEnvFile(
  envPath: string,
  vars: Record<string, string>,
): void {
  for (const key of Object.keys(vars)) {
    if (key.includes("=") || key.includes("\n") || key.includes("\r")) {
      throw new Error(`upsertEnvFile: invalid key "${key}"`);
    }
  }

  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing.length > 0 ? existing.split("\n") : [];
  const handled = new Set<string>();

  const updatedLines = lines.map((line) => {
    const trimmed = line.trimEnd();
    if (trimmed === "" || /^\s*#/.test(trimmed)) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key in vars) {
      handled.add(key);
      return `${key}=${vars[key]}`;
    }
    return line;
  });

  const endsWithNewline = existing.endsWith("\n") || existing.length === 0;
  const appended = Object.entries(vars)
    .filter(([k]) => !handled.has(k))
    .map(([k, v]) => `${k}=${v}`);

  let output = updatedLines.join("\n");
  if (appended.length > 0) {
    if (!endsWithNewline && output.length > 0) output += "\n";
    output += appended.join("\n") + "\n";
  }

  const tmpPath = `${envPath}.tmp.${process.pid}`;
  let fd: number | undefined;
  try {
    fd = openSync(tmpPath, "w", 0o600);
    writeFileSync(tmpPath, output, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmpPath, envPath);
  } catch (err) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}
