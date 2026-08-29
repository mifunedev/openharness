import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dockerfile = readFileSync(path.join(repoRoot, ".devcontainer/Dockerfile"), "utf8");

describe("sandbox base image", () => {
  it("builds from the official Node image on Debian Trixie", () => {
    expect(dockerfile).toMatch(/^FROM node:22-trixie-slim$/m);
    expect(dockerfile).not.toContain("debian:bookworm-slim");
    expect(dockerfile).not.toContain("deb.nodesource.com");
  });

  it("tracks Trixie for Docker's apt repository", () => {
    expect(dockerfile).toContain("https://download.docker.com/linux/debian trixie stable");
    expect(dockerfile).not.toContain("https://download.docker.com/linux/debian bookworm stable");
  });

  it("keeps Cloudflare's apt repository on Bookworm", () => {
    expect(dockerfile).toContain("https://pkg.cloudflare.com/cloudflared bookworm main");
    expect(dockerfile).not.toContain("https://pkg.cloudflare.com/cloudflared trixie main");
  });

  it("explains the Cloudflare Bookworm exception next to that repository", () => {
    const lines = dockerfile.split("\n");
    const suiteLine = lines.findIndex((line) => line.includes("pkg.cloudflare.com/cloudflared bookworm main"));
    expect(suiteLine).toBeGreaterThan(-1);

    const preamble = lines.slice(Math.max(0, suiteLine - 8), suiteLine).join("\n");
    expect(preamble).toMatch(/^#.*trixie/mi);
    expect(preamble).toContain("404");
  });

  it("leaves every other suite reference off Bookworm", () => {
    const bookwormLines = dockerfile
      .split("\n")
      .filter((line) => /bookworm/i.test(line))
      .filter((line) => !line.trimStart().startsWith("#"));

    expect(bookwormLines).toEqual([
      expect.stringContaining("https://pkg.cloudflare.com/cloudflared bookworm main"),
    ]);
  });
});
