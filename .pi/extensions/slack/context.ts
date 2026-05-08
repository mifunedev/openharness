// Slack response helpers and SlackContext factory for the Pi extension.
// Ported from packages/slack/src/main.ts:114-286 (portfolio-advisor vendored copy).
import * as log from "./log.js";
import type { SlackBot, SlackEvent } from "./client.js";

// ============================================================================
// Public interface
// ============================================================================

export interface SlackContext {
	respond(text: string, shouldLog?: boolean): Promise<void>;
	replaceMessage(text: string): Promise<void>;
	respondInThread(text: string): Promise<void>;
	setTyping(isTyping: boolean): Promise<void>;
	uploadFile(filePath: string, title?: string): Promise<void>;
	setWorking(working: boolean): Promise<void>;
	deleteMessage(): Promise<void>;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Build a SlackContext for a single inbound event.
 *
 * Thread routing rule:
 *   const threadParent = event.threadTs ?? (isEvent ? undefined : event.ts);
 *
 * When isEvent=true (cron/synthetic event), we never promote the event's own ts
 * to a thread parent — synthetic events have no real Slack message to anchor to.
 * When isEvent=false (real user message), event.ts becomes the thread parent so
 * the bot replies in-thread rather than top-level.
 */
export function createSlackContext(bot: SlackBot, event: SlackEvent, isEvent: boolean = false): SlackContext {
	let messageTs: string | null = null;
	const threadMessageTs: string[] = [];
	let accumulatedText = "";
	let isWorking = true;
	const workingIndicator = " ...";
	let updatePromise = Promise.resolve();

	// Thread routing: prefer explicit threadTs; for real messages use event.ts;
	// for synthetic events leave undefined so responses go to channel top-level.
	const threadParent = event.threadTs ?? (isEvent ? undefined : event.ts);

	// Extract event filename for status message (only relevant for synthetic events)
	const eventFilename = isEvent ? event.text.match(/^\[EVENT:([^:]+):/)?.[1] : undefined;

	return {
		respond: async (text: string, shouldLog = true) => {
			updatePromise = updatePromise.then(async () => {
				try {
					accumulatedText = accumulatedText ? `${accumulatedText}\n${text}` : text;

					// Truncate accumulated text if too long (Slack limit is 40K, use 35K for safety)
					const MAX_MAIN_LENGTH = 35000;
					const truncationNote = "\n\n_(message truncated, ask me to elaborate on specific parts)_";
					if (accumulatedText.length > MAX_MAIN_LENGTH) {
						accumulatedText =
							accumulatedText.substring(0, MAX_MAIN_LENGTH - truncationNote.length) + truncationNote;
					}

					const displayText = isWorking ? accumulatedText + workingIndicator : accumulatedText;

					if (messageTs) {
						await bot.updateMessage(event.channel, messageTs, displayText);
					} else {
						messageTs = threadParent
							? await bot.postInThread(event.channel, threadParent, displayText)
							: await bot.postMessage(event.channel, displayText);
					}

					if (shouldLog && messageTs) {
						bot.logBotResponse(event.channel, text, messageTs);
					}
				} catch (err) {
					log.logWarning("Slack respond error", err instanceof Error ? err.message : String(err));
				}
			});
			await updatePromise;
		},

		replaceMessage: async (text: string) => {
			updatePromise = updatePromise.then(async () => {
				try {
					// Replace the accumulated text entirely, with truncation
					const MAX_MAIN_LENGTH = 35000;
					const truncationNote = "\n\n_(message truncated, ask me to elaborate on specific parts)_";
					if (text.length > MAX_MAIN_LENGTH) {
						accumulatedText = text.substring(0, MAX_MAIN_LENGTH - truncationNote.length) + truncationNote;
					} else {
						accumulatedText = text;
					}

					const displayText = isWorking ? accumulatedText + workingIndicator : accumulatedText;

					if (messageTs) {
						await bot.updateMessage(event.channel, messageTs, displayText);
					} else {
						messageTs = threadParent
							? await bot.postInThread(event.channel, threadParent, displayText)
							: await bot.postMessage(event.channel, displayText);
					}

					// Log final consolidated response
					if (messageTs) {
						bot.logBotResponse(event.channel, accumulatedText, messageTs);
					}
				} catch (err) {
					log.logWarning("Slack replaceMessage error", err instanceof Error ? err.message : String(err));
				}
			});
			await updatePromise;
		},

		respondInThread: async (text: string) => {
			updatePromise = updatePromise.then(async () => {
				try {
					if (messageTs) {
						// Truncate thread messages if too long (20K limit for safety)
						const MAX_THREAD_LENGTH = 20000;
						let threadText = text;
						if (threadText.length > MAX_THREAD_LENGTH) {
							threadText = `${threadText.substring(0, MAX_THREAD_LENGTH - 50)}\n\n_(truncated)_`;
						}

						const ts = await bot.postInThread(event.channel, messageTs, threadText);
						threadMessageTs.push(ts);
					}
				} catch (err) {
					log.logWarning("Slack respondInThread error", err instanceof Error ? err.message : String(err));
				}
			});
			await updatePromise;
		},

		setTyping: async (isTyping: boolean) => {
			if (isTyping && !messageTs) {
				updatePromise = updatePromise.then(async () => {
					try {
						if (!messageTs) {
							accumulatedText = eventFilename ? `_Starting event: ${eventFilename}_` : "_Thinking_";
							messageTs = threadParent
								? await bot.postInThread(event.channel, threadParent, accumulatedText + workingIndicator)
								: await bot.postMessage(event.channel, accumulatedText + workingIndicator);
						}
					} catch (err) {
						log.logWarning("Slack setTyping error", err instanceof Error ? err.message : String(err));
					}
				});
				await updatePromise;
			}
		},

		uploadFile: async (filePath: string, title?: string) => {
			await bot.uploadFile(event.channel, filePath, title);
		},

		setWorking: async (working: boolean) => {
			updatePromise = updatePromise.then(async () => {
				try {
					isWorking = working;
					if (messageTs) {
						const displayText = isWorking ? accumulatedText + workingIndicator : accumulatedText;
						await bot.updateMessage(event.channel, messageTs, displayText);
					}
				} catch (err) {
					log.logWarning("Slack setWorking error", err instanceof Error ? err.message : String(err));
				}
			});
			await updatePromise;
		},

		deleteMessage: async () => {
			updatePromise = updatePromise.then(async () => {
				// Delete thread messages first (in reverse order)
				for (let i = threadMessageTs.length - 1; i >= 0; i--) {
					try {
						await bot.deleteMessage(event.channel, threadMessageTs[i]);
					} catch {
						// Ignore errors deleting thread messages
					}
				}
				threadMessageTs.length = 0;
				// Then delete main message
				if (messageTs) {
					await bot.deleteMessage(event.channel, messageTs);
					messageTs = null;
				}
			});
			await updatePromise;
		},
	};
}
