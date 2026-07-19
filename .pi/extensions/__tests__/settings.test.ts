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
      "npm:@tintinweb/pi-tasks@0.7.0",
      "npm:@narumitw/pi-goal@0.4.2",
      "npm:@narumitw/pi-plan-mode@0.4.2",
      "npm:@narumitw/pi-codex-usage@0.6.2",
      "npm:@tifan/pi-recap@0.4.2",
      "npm:@trevonistrevon/pi-loop@0.5.5",
      "npm:@guwidoe/pi-prompt-suggester@0.3.10",
      "npm:pi-autoresearch@1.6.0",
      "npm:@ff-labs/pi-fff@0.9.5",
      "npm:cc-safety-net@1.0.6",
      "git:github.com/Michaelliv/pi-dynamic-workflows@dbc6800d1f725f7439e51705e2664c59484afcd1",
    ]);
  });
});
