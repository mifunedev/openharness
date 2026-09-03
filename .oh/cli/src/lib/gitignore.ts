import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function appendGitignoreLines(root: string, lines: string[]): string[] {
  const target = join(root, ".gitignore");
  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
  const present = new Set(existing.split("\n").map((line) => line.trimEnd()));

  const added: string[] = [];
  for (const line of lines) {
    const key = line.trimEnd();
    if (key === "" || present.has(key)) continue;
    present.add(key);
    added.push(line);
  }
  if (added.length === 0) return added;

  let output = existing;
  if (output.length > 0 && !output.endsWith("\n")) output += "\n";
  output += `${added.join("\n")}\n`;

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output, "utf8");
  return added;
}
