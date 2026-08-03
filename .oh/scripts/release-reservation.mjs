// Pure UTC CalVer reservation state machine used by the GitHub release bridge.

export class ReleaseReservationError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "ReleaseReservationError";
    this.code = code;
    this.attemptNumber = options.attemptNumber;
    this.version = options.version;
  }
}

export function formatUtcCalVerBase(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new ReleaseReservationError("INVALID_DATE", "release reservation requires a valid Date");
  }
  return `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}`;
}

export function buildUtcCalVerCandidate(baseVersion, collisionCount) {
  if (!/^\d{4}\.[1-9]\d*\.[1-9]\d*$/.test(baseVersion)) {
    throw new ReleaseReservationError(
      "INVALID_CALVER_VERSION",
      `invalid unsuffixed UTC CalVer base ${JSON.stringify(baseVersion)}`,
      { version: baseVersion },
    );
  }
  const [year, month, day] = baseVersion.split(".").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new ReleaseReservationError(
      "INVALID_CALVER_VERSION",
      `invalid unsuffixed UTC CalVer base ${JSON.stringify(baseVersion)}`,
      { version: baseVersion },
    );
  }
  if (!Number.isInteger(collisionCount) || collisionCount < 0) {
    throw new ReleaseReservationError(
      "INVALID_COLLISION_COUNT",
      `collision count must be a non-negative integer: ${collisionCount}`,
      { version: baseVersion },
    );
  }
  return collisionCount === 0 ? baseVersion : `${baseVersion}-${collisionCount}`;
}

export async function reserveReleaseVersion({
  attemptCreate,
  maxForeignCollisions,
  now = new Date(),
}) {
  if (
    maxForeignCollisions !== undefined &&
    (!Number.isInteger(maxForeignCollisions) || maxForeignCollisions < 0)
  ) {
    throw new ReleaseReservationError(
      "INVALID_COLLISION_COUNT",
      `maxForeignCollisions must be a non-negative integer: ${maxForeignCollisions}`,
    );
  }

  const baseVersion = formatUtcCalVerBase(now);
  for (
    let collisionCount = 0;
    maxForeignCollisions === undefined || collisionCount <= maxForeignCollisions;
    collisionCount += 1
  ) {
    const candidateVersion = buildUtcCalVerCandidate(baseVersion, collisionCount);
    let outcome;
    try {
      outcome = await attemptCreate({
        attemptNumber: collisionCount + 1,
        baseVersion,
        candidateVersion,
        collisionCount,
      });
    } catch (cause) {
      throw new ReleaseReservationError(
        "ATTEMPT_FAILED",
        `release reservation attempt failed for ${candidateVersion}`,
        { attemptNumber: collisionCount + 1, cause, version: candidateVersion },
      );
    }

    switch (outcome.kind) {
      case "created":
        return { kind: "created", version: candidateVersion };
      case "same-sha-draft":
        return { kind: "reused-draft", version: candidateVersion };
      case "same-sha-published":
        return { kind: "published-no-op", version: candidateVersion };
      case "foreign-collision":
        continue;
      case "invalid-state":
        throw new ReleaseReservationError(
          "INVALID_ATTEMPT_STATE",
          `invalid release reservation state for ${candidateVersion}: ${outcome.message}`,
          { attemptNumber: collisionCount + 1, version: candidateVersion },
        );
      default:
        throw new ReleaseReservationError(
          "INVALID_ATTEMPT_STATE",
          `unknown release reservation outcome for ${candidateVersion}`,
          { attemptNumber: collisionCount + 1, version: candidateVersion },
        );
    }
  }

  const limit = maxForeignCollisions;
  throw new ReleaseReservationError(
    "MAX_COLLISIONS_EXCEEDED",
    `release reservation exceeded ${limit} foreign collisions for ${baseVersion}`,
    { attemptNumber: limit + 1, version: buildUtcCalVerCandidate(baseVersion, limit) },
  );
}
