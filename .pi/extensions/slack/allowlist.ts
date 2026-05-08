// Fail-safe channel/user allowlist: denies all events if both env vars are unset; grants access only to listed IDs when set.

// Fail-safe: if BOTH SLACK_ALLOW_CHANNELS and SLACK_ALLOW_USERS are unset, isAllowed returns false for everything.
// If at least one is set, a request passes when (channel matches OR allow-channels-unset) AND (user matches OR allow-users-unset).

export interface Allowlist {
	isAllowed(channelId: string, userId: string): boolean;
}

export function createAllowlist(): Allowlist {
	const rawChannels = process.env.SLACK_ALLOW_CHANNELS;
	const rawUsers = process.env.SLACK_ALLOW_USERS;

	// Both unset → deny everything (fail-safe default)
	const bothUnset = rawChannels === undefined && rawUsers === undefined;

	const allowedChannels = rawChannels
		? new Set(rawChannels.split(",").map((s) => s.trim()).filter(Boolean))
		: null; // null means "no channel filter" (allow any channel)

	const allowedUsers = rawUsers
		? new Set(rawUsers.split(",").map((s) => s.trim()).filter(Boolean))
		: null; // null means "no user filter" (allow any user)

	return {
		isAllowed(channelId: string, userId: string): boolean {
			if (bothUnset) return false;

			const channelOk = allowedChannels === null || allowedChannels.has(channelId);
			const userOk = allowedUsers === null || allowedUsers.has(userId);

			return channelOk && userOk;
		},
	};
}
