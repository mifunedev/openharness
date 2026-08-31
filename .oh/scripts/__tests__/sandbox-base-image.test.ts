import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dockerfile = readFileSync(path.join(repoRoot, ".devcontainer/Dockerfile"), "utf8");

describe("sandbox base image", () => {
  it("builds from the official Node image on Debian Trixie", () => {
    expect(dockerfile).toMatch(/^FROM node:22-trixie-slim( AS \S+)?$/m);
    expect(dockerfile).not.toContain("debian:bookworm-slim");
    expect(dockerfile).not.toContain("deb.nodesource.com");
  });

  it("derives every stage transitively from the pinned base", () => {
    const froms = dockerfile
      .split("\n")
      .filter((line) => /^FROM\s/.test(line))
      .map((line) => line.trim().split(/\s+/));
    expect(froms.length).toBeGreaterThan(0);

    const defined = new Set<string>();
    const foreign: string[] = [];
    for (const [, image, asKeyword, name] of froms) {
      if (image !== "node:22-trixie-slim" && !defined.has(image)) foreign.push(image);
      if (asKeyword?.toLowerCase() === "as" && name) defined.add(name);
    }
    expect(foreign).toEqual([]);
  });

  it("tracks Trixie for Docker's apt repository", () => {
    expect(dockerfile).toContain("https://download.docker.com/linux/debian trixie stable");
    expect(dockerfile).not.toContain("https://download.docker.com/linux/debian bookworm stable");
  });

  // #906: cloudflared moved out of the image into the tool catalog, which
  // installs a pinned, checksum-verified binary. That deleted the last reason
  // this Dockerfile referenced a non-Trixie apt suite.
  it("no longer carries Cloudflare's apt repository", () => {
    expect(dockerfile).not.toContain("pkg.cloudflare.com");
  });

  it("leaves no suite reference on Bookworm at all", () => {
    const bookwormLines = dockerfile
      .split("\n")
      .filter((line) => /bookworm/i.test(line))
      .filter((line) => !line.trimStart().startsWith("#"));

    expect(bookwormLines).toEqual([]);
  });
});
