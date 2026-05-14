import { spawnSync } from "node:child_process";

export function hasSession(name: string): boolean {
  const r = spawnSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
  return r.status === 0;
}

export function killSession(name: string): void {
  spawnSync("tmux", ["kill-session", "-t", name], { stdio: "ignore" });
}

export function newSession(name: string, command: string): void {
  const r = spawnSync("tmux", ["new-session", "-d", "-s", name, command], { stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`tmux new-session -t ${name} failed (exit ${r.status})`);
  }
}

export function capturePane(name: string): string {
  const r = spawnSync("tmux", ["capture-pane", "-t", name, "-p"], { encoding: "utf8" });
  if (r.status !== 0) return "";
  return (r.stdout ?? "") + (r.stderr ?? "");
}

export function isInstalled(): boolean {
  const r = spawnSync("tmux", ["-V"], { stdio: "ignore" });
  return r.status === 0;
}
