// Reserve a retry-safe GitHub draft release by atomically creating its CalVer tag ref.

import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { reserveReleaseVersion } from "./release-reservation.mjs";

const GITHUB_API_VERSION = "2022-11-28";

function errorMessage(body) {
  if (typeof body === "object" && body !== null && "message" in body) {
    return String(body.message);
  }
  return JSON.stringify(body);
}

function assertRelease(value, candidateVersion) {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.id !== "number" ||
    typeof value.draft !== "boolean" ||
    value.tag_name !== candidateVersion
  ) {
    throw new Error(`GitHub returned an invalid release for ${candidateVersion}`);
  }
  return value;
}

export function parseReleaseTimestamp(releaseTimestamp) {
  if (typeof releaseTimestamp !== "string") {
    throw new Error("RELEASE_TIMESTAMP must be integer epoch seconds or an ISO 8601 timestamp");
  }

  if (/^(0|[1-9]\d*)$/.test(releaseTimestamp)) {
    const epochSeconds = Number(releaseTimestamp);
    const parsed = new Date(epochSeconds * 1_000);
    if (!Number.isSafeInteger(epochSeconds) || Number.isNaN(parsed.getTime())) {
      throw new Error("RELEASE_TIMESTAMP epoch seconds are outside the supported range");
    }
    return parsed;
  }

  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?<offset>Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/.exec(
      releaseTimestamp,
    );
  if (!match?.groups) {
    throw new Error(
      "RELEASE_TIMESTAMP must be integer epoch seconds or an ISO 8601 timestamp with a UTC offset",
    );
  }

  const values = [
    match.groups.year,
    match.groups.month,
    match.groups.day,
    match.groups.hour,
    match.groups.minute,
    match.groups.second,
    match.groups.offsetHour ?? "0",
    match.groups.offsetMinute ?? "0",
  ].map((value) => Number.parseInt(value, 10));
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = values;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new Error("RELEASE_TIMESTAMP must be a valid ISO 8601 timestamp");
  }

  const parsed = new Date(releaseTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("RELEASE_TIMESTAMP must be a valid ISO 8601 timestamp");
  }
  return parsed;
}

export async function reserveGitHubRelease({
  apiUrl = "https://api.github.com",
  fetchImpl = fetch,
  maxForeignCollisions,
  releaseSha,
  releaseTimestamp,
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

  // The push event's repository timestamp is stable across workflow retries,
  // so a retry after UTC midnight keeps the original push's CalVer base. It is
  // independent of the commit-authored timestamp.
  const releaseDate = parseReleaseTimestamp(releaseTimestamp);
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

  async function resolveTagCommit(candidateVersion) {
    const result = await request(`/git/ref/tags/${encodeURIComponent(candidateVersion)}`);
    if (result.response.status === 404) return null;
    if (!result.response.ok) {
      throw new Error(
        `failed to inspect candidate tag ${candidateVersion}: ${result.response.status} ${errorMessage(result.body)}`,
      );
    }

    let object = result.body?.object;
    for (let depth = 0; depth < 8; depth += 1) {
      if (!object?.sha || !object.type) {
        throw new Error(`candidate tag ${candidateVersion} has an invalid Git object`);
      }
      if (object.type === "commit") return object.sha;
      if (object.type !== "tag") {
        throw new Error(`candidate tag ${candidateVersion} points to unsupported ${object.type}`);
      }
      const tagResult = await request(`/git/tags/${encodeURIComponent(object.sha)}`);
      if (!tagResult.response.ok) {
        throw new Error(
          `failed to peel candidate tag ${candidateVersion}: ${tagResult.response.status} ${errorMessage(tagResult.body)}`,
        );
      }
      object = tagResult.body?.object;
    }
    throw new Error(`candidate tag ${candidateVersion} exceeds the annotated-tag depth limit`);
  }

  async function getPublishedRelease(candidateVersion) {
    const result = await request(`/releases/tags/${encodeURIComponent(candidateVersion)}`);
    if (result.response.status === 404) return null;
    if (!result.response.ok) {
      throw new Error(
        `failed to inspect published release ${candidateVersion}: ${result.response.status} ${errorMessage(result.body)}`,
      );
    }
    const release = assertRelease(result.body, candidateVersion);
    if (release.draft) {
      throw new Error(`GitHub's published tag endpoint returned a draft for ${candidateVersion}`);
    }
    return release;
  }

  async function findExactDraftRelease(candidateVersion) {
    // GitHub's release-by-tag endpoint excludes drafts. Authenticated listing
    // is used only after the exact tag resolves to releaseSha, never to choose
    // the next version candidate.
    for (let page = 1; ; page += 1) {
      const result = await request(`/releases?per_page=100&page=${page}`);
      if (!result.response.ok) {
        throw new Error(
          `failed to list releases while recovering draft ${candidateVersion}: ${result.response.status} ${errorMessage(result.body)}`,
        );
      }
      if (!Array.isArray(result.body)) {
        throw new Error(`GitHub returned an invalid release list while recovering ${candidateVersion}`);
      }
      const exactDraft = result.body.find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          entry.tag_name === candidateVersion &&
          entry.draft === true,
      );
      if (exactDraft) return assertRelease(exactDraft, candidateVersion);
      if (result.body.length < 100) return null;
    }
  }

  async function recoverExactCandidateRelease(candidateVersion) {
    return (
      (await getPublishedRelease(candidateVersion)) ??
      (await findExactDraftRelease(candidateVersion))
    );
  }

  let selectedRelease = null;

  async function ensureDraftRelease(candidateVersion) {
    const result = await request("/releases", {
      method: "POST",
      body: JSON.stringify({
        body: "Image publication is pending.",
        draft: true,
        prerelease: false,
        tag_name: candidateVersion,
        target_commitish: releaseSha,
      }),
    });
    if (result.response.status === 201) {
      const release = assertRelease(result.body, candidateVersion);
      if (!release.draft) {
        return { kind: "invalid-state", message: "GitHub created a non-draft reservation" };
      }
      selectedRelease = release;
      return { kind: "created" };
    }
    if (result.response.status !== 422) {
      throw new Error(
        `GitHub draft release create failed for ${candidateVersion}: ${result.response.status} ${errorMessage(result.body)}`,
      );
    }

    // Another same-SHA run may win release creation after this run creates or
    // observes the tag. Re-read only this exact candidate.
    const racedRelease = await recoverExactCandidateRelease(candidateVersion);
    if (!racedRelease) {
      return {
        kind: "invalid-state",
        message: `GitHub rejected the draft but no candidate release exists (${errorMessage(result.body)})`,
      };
    }
    selectedRelease = racedRelease;
    return racedRelease.draft ? { kind: "same-sha-draft" } : { kind: "same-sha-published" };
  }

  const reservationOptions = {
    now: releaseDate,
    attemptCreate: async ({ candidateVersion }) => {
      // Creating the exact ref is the atomic version reservation. A crash after
      // this succeeds is recoverable because a retry recognizes the same SHA.
      const createRef = await request("/git/refs", {
        method: "POST",
        body: JSON.stringify({ ref: `refs/tags/${candidateVersion}`, sha: releaseSha }),
      });
      if (createRef.response.status === 201) return ensureDraftRelease(candidateVersion);
      if (createRef.response.status !== 422) {
        throw new Error(
          `GitHub tag ref create failed for ${candidateVersion}: ${createRef.response.status} ${errorMessage(createRef.body)}`,
        );
      }

      const candidateSha = await resolveTagCommit(candidateVersion);
      if (!candidateSha) {
        return {
          kind: "invalid-state",
          message: `GitHub reported a tag collision but the ref is absent (${errorMessage(createRef.body)})`,
        };
      }
      if (candidateSha !== releaseSha) return { kind: "foreign-collision" };

      const candidateRelease = await recoverExactCandidateRelease(candidateVersion);
      if (!candidateRelease) return ensureDraftRelease(candidateVersion);
      selectedRelease = candidateRelease;
      return candidateRelease.draft
        ? { kind: "same-sha-draft" }
        : { kind: "same-sha-published" };
    },
  };
  // Production deliberately has no collision cap. Tests may supply one.
  if (maxForeignCollisions !== undefined) {
    reservationOptions.maxForeignCollisions = maxForeignCollisions;
  }

  const reservation = await reserveReleaseVersion(reservationOptions);
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
  const reservation = await reserveGitHubRelease({
    apiUrl: process.env.GITHUB_API_URL,
    releaseSha: process.env.RELEASE_SHA ?? "",
    releaseTimestamp: process.env.RELEASE_TIMESTAMP ?? "",
    repository: process.env.GITHUB_REPOSITORY ?? "",
    token: process.env.GITHUB_TOKEN ?? "",
  });
  await appendFile(outputPath, githubOutputLines(reservation), "utf8");
  console.log(
    `${reservation.reservationKind}: ${reservation.releaseVersion} at ${reservation.releaseSha}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
