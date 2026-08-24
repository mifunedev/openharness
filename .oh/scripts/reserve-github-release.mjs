// Reserve a retry-safe GitHub draft release by atomically creating its SemVer tag ref.

import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseSemVer, reserveReleaseVersion } from "./release-reservation.mjs";

const GITHUB_API_VERSION = "2022-11-28";

// The single place the `v` prefix is introduced. Every tag-shaped string in this
// module derives from this helper, so the create path and the recovery path
// cannot drift apart. The version itself stays bare everywhere else, including
// the step outputs and the GHCR image tags.
export function releaseTagName(version) {
  return `v${version}`;
}

function errorMessage(body) {
  if (typeof body === "object" && body !== null && "message" in body) {
    return String(body.message);
  }
  return JSON.stringify(body);
}

function assertRelease(value, tagName) {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.id !== "number" ||
    typeof value.draft !== "boolean" ||
    value.tag_name !== tagName
  ) {
    throw new Error(`GitHub returned an invalid release for ${tagName}`);
  }
  return value;
}

export async function reserveGitHubRelease({
  apiUrl = "https://api.github.com",
  fetchImpl = fetch,
  releaseSha,
  releaseVersion,
  repository,
  token,
}) {
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error("RELEASE_SHA must be a full lowercase 40-character commit SHA");
  }
  if (!/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must have owner/repository form");
  }
  if (!token) throw new Error("GITHUB_TOKEN is required");

  // The version comes from root `package.json`, so it is identical across
  // workflow retries and independent of both the push clock and the commit
  // timestamp. Reject a malformed one before any GitHub state is touched.
  parseSemVer(releaseVersion);

  const repositoryUrl = `${apiUrl.replace(/\/$/, "")}/repos/${repository}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "openharness-release-reservation",
    "x-github-api-version": GITHUB_API_VERSION,
  };

  async function request(path, init = {}) {
    const response = await fetchImpl(`${repositoryUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { response, body };
  }

  async function resolveTagCommit(tagName) {
    const result = await request(`/git/ref/tags/${encodeURIComponent(tagName)}`);
    if (result.response.status === 404) return null;
    if (!result.response.ok) {
      throw new Error(
        `failed to inspect candidate tag ${tagName}: ${result.response.status} ${errorMessage(result.body)}`,
      );
    }

    let object = result.body?.object;
    for (let depth = 0; depth < 8; depth += 1) {
      if (!object?.sha || !object.type) {
        throw new Error(`candidate tag ${tagName} has an invalid Git object`);
      }
      if (object.type === "commit") return object.sha;
      if (object.type !== "tag") {
        throw new Error(`candidate tag ${tagName} points to unsupported ${object.type}`);
      }
      const tagResult = await request(`/git/tags/${encodeURIComponent(object.sha)}`);
      if (!tagResult.response.ok) {
        throw new Error(
          `failed to peel candidate tag ${tagName}: ${tagResult.response.status} ${errorMessage(tagResult.body)}`,
        );
      }
      object = tagResult.body?.object;
    }
    throw new Error(`candidate tag ${tagName} exceeds the annotated-tag depth limit`);
  }

  async function getPublishedRelease(tagName) {
    const result = await request(`/releases/tags/${encodeURIComponent(tagName)}`);
    if (result.response.status === 404) return null;
    if (!result.response.ok) {
      throw new Error(
        `failed to inspect published release ${tagName}: ${result.response.status} ${errorMessage(result.body)}`,
      );
    }
    const release = assertRelease(result.body, tagName);
    if (release.draft) {
      throw new Error(`GitHub's published tag endpoint returned a draft for ${tagName}`);
    }
    return release;
  }

  async function findExactDraftRelease(tagName) {
    // GitHub's release-by-tag endpoint excludes drafts. Authenticated listing
    // is used only after the exact tag resolves to releaseSha.
    for (let page = 1; ; page += 1) {
      const result = await request(`/releases?per_page=100&page=${page}`);
      if (!result.response.ok) {
        throw new Error(
          `failed to list releases while recovering draft ${tagName}: ${result.response.status} ${errorMessage(result.body)}`,
        );
      }
      if (!Array.isArray(result.body)) {
        throw new Error(`GitHub returned an invalid release list while recovering ${tagName}`);
      }
      const exactDraft = result.body.find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          entry.tag_name === tagName &&
          entry.draft === true,
      );
      if (exactDraft) return assertRelease(exactDraft, tagName);
      if (result.body.length < 100) return null;
    }
  }

  async function recoverExactCandidateRelease(tagName) {
    return (await getPublishedRelease(tagName)) ?? (await findExactDraftRelease(tagName));
  }

  let selectedRelease = null;

  async function ensureDraftRelease(tagName) {
    const result = await request("/releases", {
      method: "POST",
      body: JSON.stringify({
        body: "Image publication is pending.",
        draft: true,
        prerelease: false,
        tag_name: tagName,
        target_commitish: releaseSha,
      }),
    });
    if (result.response.status === 201) {
      const release = assertRelease(result.body, tagName);
      if (!release.draft) {
        return { kind: "invalid-state", message: "GitHub created a non-draft reservation" };
      }
      selectedRelease = release;
      return { kind: "created" };
    }
    if (result.response.status !== 422) {
      throw new Error(
        `GitHub draft release create failed for ${tagName}: ${result.response.status} ${errorMessage(result.body)}`,
      );
    }

    // Another same-SHA run may win release creation after this run creates or
    // observes the tag. Re-read only this exact candidate.
    const racedRelease = await recoverExactCandidateRelease(tagName);
    if (!racedRelease) {
      return {
        kind: "invalid-state",
        message: `GitHub rejected the draft but no candidate release exists (${errorMessage(result.body)})`,
      };
    }
    selectedRelease = racedRelease;
    return racedRelease.draft ? { kind: "same-sha-draft" } : { kind: "same-sha-published" };
  }

  const reservation = await reserveReleaseVersion({
    version: releaseVersion,
    attemptCreate: async ({ candidateVersion }) => {
      const tagName = releaseTagName(candidateVersion);
      // Creating the exact ref is the atomic version reservation. A crash after
      // this succeeds is recoverable because a retry recognizes the same SHA.
      const createRef = await request("/git/refs", {
        method: "POST",
        body: JSON.stringify({ ref: `refs/tags/${tagName}`, sha: releaseSha }),
      });
      if (createRef.response.status === 201) return ensureDraftRelease(tagName);
      if (createRef.response.status !== 422) {
        throw new Error(
          `GitHub tag ref create failed for ${tagName}: ${createRef.response.status} ${errorMessage(createRef.body)}`,
        );
      }

      const candidateSha = await resolveTagCommit(tagName);
      if (!candidateSha) {
        return {
          kind: "invalid-state",
          message: `GitHub reported a tag collision but the ref is absent (${errorMessage(createRef.body)})`,
        };
      }
      // The tag exists on another commit, so this version already shipped.
      if (candidateSha !== releaseSha) return { kind: "foreign-collision" };

      const candidateRelease = await recoverExactCandidateRelease(tagName);
      if (!candidateRelease) return ensureDraftRelease(tagName);
      selectedRelease = candidateRelease;
      return candidateRelease.draft ? { kind: "same-sha-draft" } : { kind: "same-sha-published" };
    },
  });

  // An already-released version has no release object of this run's own, and
  // there is nothing left to publish. It is a clean skip, not a failure.
  if (reservation.kind === "already-released") {
    return {
      publishedNoop: true,
      releaseId: 0,
      releaseSha,
      releaseVersion: reservation.version,
      reservationKind: reservation.kind,
    };
  }

  if (!selectedRelease) {
    throw new Error(`reservation ${reservation.version} completed without a GitHub Release`);
  }

  return {
    publishedNoop: reservation.kind === "published-no-op",
    releaseId: selectedRelease.id,
    releaseSha,
    releaseVersion: reservation.version,
    reservationKind: reservation.kind,
  };
}

export function githubOutputLines(reservation) {
  return [
    `releaseVersion=${reservation.releaseVersion}`,
    `releaseSha=${reservation.releaseSha}`,
    `releaseId=${reservation.releaseId}`,
    `publishedNoop=${reservation.publishedNoop}`,
    `reservationKind=${reservation.reservationKind}`,
    "",
  ].join("\n");
}

async function main() {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required");
  const releaseVersion = process.env.RELEASE_VERSION ?? "";
  if (!releaseVersion) {
    throw new Error("RELEASE_VERSION is required — the workflow reads it from package.json");
  }
  const reservation = await reserveGitHubRelease({
    apiUrl: process.env.GITHUB_API_URL,
    releaseSha: process.env.RELEASE_SHA ?? "",
    releaseVersion,
    repository: process.env.GITHUB_REPOSITORY ?? "",
    token: process.env.GITHUB_TOKEN ?? "",
  });
  await appendFile(outputPath, githubOutputLines(reservation), "utf8");
  if (reservation.reservationKind === "already-released") {
    console.log(
      `already-released: ${reservation.releaseVersion} is tagged on another commit — ` +
        "bump the version in package.json to cut a new release. Skipping publication.",
    );
    return;
  }
  console.log(
    `${reservation.reservationKind}: ${reservation.releaseVersion} at ${reservation.releaseSha}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
