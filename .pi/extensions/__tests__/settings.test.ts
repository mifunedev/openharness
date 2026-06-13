import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PiSettings {
  packages?: string[];
}

function readPiSettings(): PiSettings {
  return JSON.parse(readFileSync(".pi/settings.json", "utf8")) as PiSettings;
}

describe("project Pi settings", () => {
  it("pins the default Pi packages used by the harness", () => {
    const settings = readPiSettings();

    expect(settings.packages).toEqual([
      "npm:@tintinweb/pi-subagents@0.7.1",
      "npm:@narumitw/pi-goal@0.4.2",
    ]);
  });
});
