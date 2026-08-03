import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildUtcCalVerCandidate,
  formatUtcCalVerBase,
  reserveReleaseVersion,
} from "../release-reservation.mjs";
import {
  githubOutputLines,
  parseReleaseTimestamp,
  reserveGitHubRelease,
} from "../reserve-github-release.mjs";

const ROOT = join(import.meta.dirname, "../../..");
const WORKFLOW = join(ROOT, ".github", "workflows", "release.yml");
const CLI_WORKFLOW = join(ROOT, ".github", "workflows", "publish-cli.yml");
const RELEASE_SHA = "0123456789abcdef0123456789abcdef01234567";
const FOREIGN_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const REPOSITORY = "mifunedev/openharness";

type ExpectedRequest = {
  body?: unknown;
  method: string;
  path: string;
  responseBody?: unknown;
  status: number;
};

function queuedFetch(expected: ExpectedRequest[]): typeof fetch {
  let index = 0;
  const mock = async (input: string | URL | Request, init?: RequestInit) => {
    const next = expected[index++];
    expect(next, `unexpected request ${String(input)}`).toBeDefined();
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const path = `${url.pathname.replace(`/repos/${REPOSITORY}`, "")}${url.search}`;
    expect(init?.method ?? "GET").toBe(next.method);
    expect(path).toBe(next.path);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
    if (Object.hasOwn(next, "body")) {
      expect(JSON.parse(String(init?.body))).toEqual(next.body);
    }
    return new Response(next.status === 204 ? null : JSON.stringify(next.responseBody ?? {}), {
      status: next.status,
      headers: next.status === 204 ? undefined : { "content-type": "application/json" },
    });
  };
  return Object.assign(mock, {
    assertDone: () => expect(index).toBe(expected.length),
  }) as typeof fetch;
}

function assertFetchDone(fetchImpl: typeof fetch) {
  (fetchImpl as typeof fetch & { assertDone(): void }).assertDone();
}

function release(id: number, version: string, draft: boolean) {
  return { id, tag_name: version, draft };
}

function tagRef(sha: string) {
  return { ref: "refs/tags/candidate", object: { type: "commit", sha } };
}

function createRefBody(version: string) {
  return { ref: `refs/tags/${version}`, sha: RELEASE_SHA };
}

function createReleaseBody(version: string) {
  return {
    body: "Image publication is pending.",
    draft: true,
    prerelease: false,
    tag_name: version,
    target_commitish: RELEASE_SHA,
  };
}

function options(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return {
    fetchImpl,
    releaseSha: RELEASE_SHA,
    releaseTimestamp: "2025-03-07T23:59:59.000Z",
    repository: REPOSITORY,
    token: "test-token",
    ...overrides,
  };
}

describe("UTC CalVer reservation", () => {
  it("uses UTC and progresses from the base to -1 and higher", () => {
    expect(formatUtcCalVerBase(new Date("2025-03-07T23:30:00-02:00"))).toBe("2025.3.8");
    expect(buildUtcCalVerCandidate("2025.3.8", 0)).toBe("2025.3.8");
    expect(buildUtcCalVerCandidate("2025.3.8", 1)).toBe("2025.3.8-1");
  });

  it("keeps foreign-collision progression unbounded by default", async () => {
    const result = await reserveReleaseVersion({
      now: new Date("2025-03-07T00:00:00Z"),
      attemptCreate: ({ collisionCount }: { collisionCount: number }) =>
        collisionCount < 30 ? { kind: "foreign-collision" } : { kind: "created" },
    });
    expect(result).toEqual({ kind: "created", version: "2025.3.7-30" });
  });

  it("strictly parses immutable integer epoch seconds and offset timestamps", () => {
    expect(parseReleaseTimestamp("1741391999").toISOString()).toBe("2025-03-07T23:59:59.000Z");
    expect(parseReleaseTimestamp("2025-03-07T23:59:59-02:00").toISOString()).toBe(
      "2025-03-08T01:59:59.000Z",
    );
    expect(() => parseReleaseTimestamp("01741391999")).toThrow(/integer epoch seconds/);
    expect(() => parseReleaseTimestamp("1741391999.5")).toThrow(/integer epoch seconds/);
    expect(() => parseReleaseTimestamp("2025-03-07T23:59:59")).toThrow(/UTC offset/);
    expect(() => parseReleaseTimestamp("2025-02-30T12:00:00Z")).toThrow(/valid ISO/);
  });
});

describe("GitHub reservation bridge", () => {
  it("atomically creates the unsuffixed tag before its draft", async () => {
    const fetchImpl = queuedFetch([
      {
        method: "POST",
        path: "/git/refs",
        status: 201,
        body: createRefBody("2025.3.7"),
        responseBody: tagRef(RELEASE_SHA),
      },
      {
        method: "POST",
        path: "/releases",
        status: 201,
        body: createReleaseBody("2025.3.7"),
        responseBody: release(101, "2025.3.7", true),
      },
    ]);

    const result = await reserveGitHubRelease(options(fetchImpl));
    expect(result).toEqual({
      publishedNoop: false,
      releaseId: 101,
      releaseSha: RELEASE_SHA,
      releaseVersion: "2025.3.7",
      reservationKind: "created",
    });
    expect(githubOutputLines(result)).toContain("releaseVersion=2025.3.7\n");
    assertFetchDone(fetchImpl);
  });

  it("advances a foreign collision to -1", async () => {
    const fetchImpl = queuedFetch([
      { method: "POST", path: "/git/refs", status: 422, body: createRefBody("2025.3.7") },
      {
        method: "GET",
        path: "/git/ref/tags/2025.3.7",
        status: 200,
        responseBody: tagRef(FOREIGN_SHA),
      },
      {
        method: "POST",
        path: "/git/refs",
        status: 201,
        body: createRefBody("2025.3.7-1"),
        responseBody: tagRef(RELEASE_SHA),
      },
      {
        method: "POST",
        path: "/releases",
        status: 201,
        body: createReleaseBody("2025.3.7-1"),
        responseBody: release(102, "2025.3.7-1", true),
      },
    ]);

    const result = await reserveGitHubRelease(options(fetchImpl));
    expect(result.releaseVersion).toBe("2025.3.7-1");
    assertFetchDone(fetchImpl);
  });

  it("recovers an exact same-SHA draft through authenticated pagination", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      release(1_000 + index, `2025.3.6-${index + 1}`, true),
    );
    const fetchImpl = queuedFetch([
      { method: "POST", path: "/git/refs", status: 422, body: createRefBody("2025.3.7") },
      {
        method: "GET",
        path: "/git/ref/tags/2025.3.7",
        status: 200,
        responseBody: tagRef(RELEASE_SHA),
      },
      { method: "GET", path: "/releases/tags/2025.3.7", status: 404 },
      {
        method: "GET",
        path: "/releases?per_page=100&page=1",
        status: 200,
        responseBody: fullPage,
      },
      {
        method: "GET",
        path: "/releases?per_page=100&page=2",
        status: 200,
        responseBody: [release(103, "2025.3.7", true)],
      },
    ]);

    const result = await reserveGitHubRelease(options(fetchImpl));
    expect(result.reservationKind).toBe("reused-draft");
    expect(result.releaseId).toBe(103);
    assertFetchDone(fetchImpl);
  });

  it("treats an already-published same-SHA reservation as a successful no-op", async () => {
    const fetchImpl = queuedFetch([
      { method: "POST", path: "/git/refs", status: 422, body: createRefBody("2025.3.7") },
      {
        method: "GET",
        path: "/git/ref/tags/2025.3.7",
        status: 200,
        responseBody: tagRef(RELEASE_SHA),
      },
      {
        method: "GET",
        path: "/releases/tags/2025.3.7",
        status: 200,
        responseBody: release(104, "2025.3.7", false),
      },
    ]);

    const result = await reserveGitHubRelease(options(fetchImpl));
    expect(result).toMatchObject({
      publishedNoop: true,
      releaseVersion: "2025.3.7",
      reservationKind: "published-no-op",
    });
    assertFetchDone(fetchImpl);
  });
});

describe("release workflow contract", () => {
  const source = readFileSync(WORKFLOW, "utf8");

  it("triggers for main and master without dropping intermediate pushes", () => {
    expect(source).toMatch(/push:\n\s+branches:\n\s+- main\n\s+- master/);
    expect(source).not.toMatch(/^concurrency:/m);
  });

  it("gates the first release mutation on validation and an immutable push timestamp", () => {
    expect(source).toMatch(/reserve:\n[\s\S]*?needs: \[validate, boot-lint, eval-probes\]/);
    expect(source).toMatch(/RELEASE_TIMESTAMP: \$\{\{ github\.event\.repository\.pushed_at \}\}/);
    expect(source).not.toContain("github.event.head_commit.timestamp");
    expect(source.indexOf("jobs:\n")).toBeLessThan(source.indexOf("  reserve:\n"));
    expect(source).not.toMatch(/deleteRelease|deleteRef|method:\s*["']DELETE/);
  });

  it("publishes sha-prefixed immutable tags and promotes latest by digest", () => {
    const immutablePush = source.indexOf("Push immutable CalVer and sha-full-SHA tags");
    const latestPromote = source.indexOf("Promote latest from the canonical branch by digest");
    const cliPublish = source.indexOf("  publish-cli:\n");
    const finalize = source.indexOf("  finalize:\n");
    const freshGithubCheck = source.indexOf("Check canonical branch for GitHub latest-release status");
    const publishDraft = source.indexOf("Publish the draft after image and CLI publication");

    expect(source).toContain("docker buildx build --load");
    expect(source).toContain('docker push "ghcr.io/mifunedev/openharness:${RELEASE_VERSION}"');
    expect(source).toContain('docker push "ghcr.io/mifunedev/openharness:sha-${RELEASE_SHA}"');
    expect(source).not.toContain('openharness:${RELEASE_SHA}"');
    expect(source).toContain(".oh/scripts/promote-release-latest.sh promote");
    expect(source).not.toContain("latest_guard");
    expect(immutablePush).toBeGreaterThan(0);
    expect(latestPromote).toBeGreaterThan(immutablePush);
    expect(cliPublish).toBeGreaterThan(latestPromote);
    expect(finalize).toBeGreaterThan(cliPublish);
    expect(freshGithubCheck).toBeGreaterThan(finalize);
    expect(publishDraft).toBeGreaterThan(freshGithubCheck);
  });

  it("serializes only same-version image publication and gates finalization on CLI success", () => {
    expect(source).not.toMatch(/^concurrency:/m);
    expect(source).toMatch(
      /publish-image:[\s\S]*?concurrency:\n\s+group: release-image-\$\{\{ needs\.reserve\.outputs\.releaseVersion \}\}\n\s+cancel-in-progress: false/,
    );
    expect(source).toMatch(/publish-cli:\n[\s\S]*?needs: \[reserve, publish-image\]/);
    expect(source).toContain("uses: ./.github/workflows/publish-cli.yml");
    expect(source).toContain("ref: ${{ needs.reserve.outputs.releaseSha }}");
    expect(source).toMatch(/needs: \[reserve, publish-image, publish-cli\]/);
    expect(source).toContain("needs.publish-cli.result == 'success'");
    expect(source).toContain("make_latest: process.env.MAKE_LATEST");
    expect(source).toContain("draft: false");
  });
});

describe("CLI publication workflow contract", () => {
  const source = readFileSync(CLI_WORKFLOW, "utf8");

  it("is reusable and manually dispatchable with the exact checkout ref", () => {
    expect(source).toMatch(/workflow_call:\n\s+inputs:\n\s+ref:/);
    expect(source).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+ref:/);
    expect(source).toContain("ref: ${{ inputs.ref }}");
    expect(source).not.toMatch(/push:\n\s+tags:/);
    expect(source).toContain("npm publish --access public --provenance");
  });
});
