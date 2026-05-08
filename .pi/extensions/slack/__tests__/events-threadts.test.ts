import { describe, expect, it } from "vitest";
import { buildSyntheticEvent, parseEventContent } from "../events.js";
import type { ImmediateEvent, OneShotEvent, PeriodicEvent } from "../events.js";

describe("parseEventContent", () => {
	describe("immediate events", () => {
		it("parses without threadTs", () => {
			const json = JSON.stringify({ type: "immediate", channelId: "C123", text: "hello" });
			const result = parseEventContent(json, "test.json") as ImmediateEvent;
			expect(result).toEqual({ type: "immediate", channelId: "C123", text: "hello", threadTs: undefined });
		});

		it("parses with threadTs", () => {
			const json = JSON.stringify({
				type: "immediate",
				channelId: "C123",
				text: "hello",
				threadTs: "1234567890.123456",
			});
			const result = parseEventContent(json, "test.json") as ImmediateEvent;
			expect(result.threadTs).toBe("1234567890.123456");
		});
	});

	describe("one-shot events", () => {
		it("parses without threadTs", () => {
			const json = JSON.stringify({
				type: "one-shot",
				channelId: "C123",
				text: "hello",
				at: "2026-01-01T00:00:00Z",
			});
			const result = parseEventContent(json, "test.json") as OneShotEvent;
			expect(result.type).toBe("one-shot");
			expect(result.threadTs).toBeUndefined();
		});

		it("parses with threadTs", () => {
			const json = JSON.stringify({
				type: "one-shot",
				channelId: "C123",
				text: "hello",
				at: "2026-01-01T00:00:00Z",
				threadTs: "1234567890.123456",
			});
			const result = parseEventContent(json, "test.json") as OneShotEvent;
			expect(result.threadTs).toBe("1234567890.123456");
		});

		it("throws when missing at field", () => {
			const json = JSON.stringify({ type: "one-shot", channelId: "C123", text: "hello" });
			expect(() => parseEventContent(json, "test.json")).toThrow("Missing 'at' field");
		});
	});

	describe("periodic events", () => {
		it("parses without threadTs", () => {
			const json = JSON.stringify({
				type: "periodic",
				channelId: "C123",
				text: "hello",
				schedule: "0 * * * *",
				timezone: "UTC",
			});
			const result = parseEventContent(json, "test.json") as PeriodicEvent;
			expect(result.type).toBe("periodic");
			expect(result.threadTs).toBeUndefined();
		});

		it("parses with threadTs", () => {
			const json = JSON.stringify({
				type: "periodic",
				channelId: "C123",
				text: "hello",
				schedule: "0 * * * *",
				timezone: "UTC",
				threadTs: "1234567890.123456",
			});
			const result = parseEventContent(json, "test.json") as PeriodicEvent;
			expect(result.threadTs).toBe("1234567890.123456");
		});
	});

	describe("validation", () => {
		it("throws on missing required fields", () => {
			const json = JSON.stringify({ type: "immediate" });
			expect(() => parseEventContent(json, "test.json")).toThrow("Missing required fields");
		});

		it("throws on unknown type", () => {
			const json = JSON.stringify({ type: "unknown", channelId: "C123", text: "hello" });
			expect(() => parseEventContent(json, "test.json")).toThrow("Unknown event type");
		});
	});
});

describe("buildSyntheticEvent", () => {
	it("creates SlackEvent without threadTs", () => {
		const event: ImmediateEvent = { type: "immediate", channelId: "C123", text: "run task" };
		const result = buildSyntheticEvent("task.json", event);

		expect(result.type).toBe("mention");
		expect(result.channel).toBe("C123");
		expect(result.user).toBe("EVENT");
		expect(result.text).toContain("[EVENT:task.json:immediate:immediate]");
		expect(result.text).toContain("run task");
		expect(result.threadTs).toBeUndefined();
	});

	it("passes threadTs through to SlackEvent", () => {
		const event: ImmediateEvent = {
			type: "immediate",
			channelId: "C123",
			text: "run task",
			threadTs: "1234567890.123456",
		};
		const result = buildSyntheticEvent("task.json", event);

		expect(result.threadTs).toBe("1234567890.123456");
	});

	it("includes schedule info for one-shot events", () => {
		const event: OneShotEvent = {
			type: "one-shot",
			channelId: "C123",
			text: "run once",
			at: "2026-01-01T00:00:00Z",
			threadTs: "9999.9999",
		};
		const result = buildSyntheticEvent("once.json", event);

		expect(result.text).toContain("one-shot:2026-01-01T00:00:00Z");
		expect(result.threadTs).toBe("9999.9999");
	});

	it("includes schedule info for periodic events", () => {
		const event: PeriodicEvent = {
			type: "periodic",
			channelId: "C123",
			text: "check status",
			schedule: "0 * * * *",
			timezone: "UTC",
		};
		const result = buildSyntheticEvent("cron.json", event);

		expect(result.text).toContain("periodic:0 * * * *");
	});

	it("produces valid Slack timestamp format (seconds.microseconds)", () => {
		const event: ImmediateEvent = { type: "immediate", channelId: "C123", text: "test" };
		const result = buildSyntheticEvent("fmt.json", event);

		// Slack timestamps are "seconds.microseconds" — e.g., "1712931200.000000"
		expect(result.ts).toMatch(/^\d+\.\d{6}$/);
		// Must NOT be a raw millisecond epoch like "1712931200000"
		expect(result.ts).not.toMatch(/^\d{13,}$/);
	});

	it("sets user to EVENT (sentinel for synthetic events)", () => {
		const event: ImmediateEvent = { type: "immediate", channelId: "C456", text: "cron task" };
		const result = buildSyntheticEvent("cron.json", event);
		expect(result.user).toBe("EVENT");
	});
});
