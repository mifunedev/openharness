
export class ReleaseReservationError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "ReleaseReservationError";
    this.code = code;
    this.attemptNumber = options.attemptNumber;
    this.version = options.version;
  }
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSemVer(version) {
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    throw new ReleaseReservationError(
      "INVALID_SEMVER_VERSION",
      `invalid SemVer release version ${JSON.stringify(version)} — expected MAJOR.MINOR.PATCH`,
      { version },
    );
  }
  const [major, minor, patch] = version.split(".").map(Number);
  return { major, minor, patch, version };
}

export async function reserveReleaseVersion({ attemptCreate, version }) {
  const { version: candidateVersion } = parseSemVer(version);

  let outcome;
  try {
    outcome = await attemptCreate({ attemptNumber: 1, candidateVersion });
  } catch (cause) {
    throw new ReleaseReservationError(
      "ATTEMPT_FAILED",
      `release reservation attempt failed for ${candidateVersion}`,
      { attemptNumber: 1, cause, version: candidateVersion },
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
      return { kind: "already-released", version: candidateVersion };
    case "invalid-state":
      throw new ReleaseReservationError(
        "INVALID_ATTEMPT_STATE",
        `invalid release reservation state for ${candidateVersion}: ${outcome.message}`,
        { attemptNumber: 1, version: candidateVersion },
      );
    default:
      throw new ReleaseReservationError(
        "INVALID_ATTEMPT_STATE",
        `unknown release reservation outcome for ${candidateVersion}`,
        { attemptNumber: 1, version: candidateVersion },
      );
  }
}
