import type { ToolDefinition } from "../types.js";
import { listTool } from "./list.js";
import { runTool } from "./run.js";
import { shellTool } from "./shell.js";
import { stopTool } from "./stop.js";
import { cleanTool } from "./clean.js";
import { sandboxTool } from "./sandbox.js";
import { worktreeTool } from "./worktree.js";
import { onboardTool } from "./onboard.js";
import { portsTool } from "./ports.js";
import { exposeTool } from "./expose.js";
import { unexposeTool } from "./unexpose.js";
import { openTool } from "./open.js";

export const sandboxTools: ToolDefinition[] = [
  listTool,
  sandboxTool,
  runTool,
  shellTool,
  stopTool,
  cleanTool,
  worktreeTool,
  onboardTool,
  portsTool,
  exposeTool,
  unexposeTool,
  openTool,
];

export {
  listTool,
  runTool,
  shellTool,
  stopTool,
  cleanTool,
  sandboxTool,
  worktreeTool,
  onboardTool,
  portsTool,
  exposeTool,
  unexposeTool,
  openTool,
};
