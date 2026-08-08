#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { appendVerification, boundedText, writeBoundedFile } from './evidence.mjs';

const [verificationPath, story, command, startedAtUtc, endedAtUtc, exitCodeText, outputPath] = process.argv.slice(2);
if (!outputPath || !/^[0-9]+$/.test(exitCodeText)) {
  process.stderr.write('usage: record-command.mjs <verification> <story> <command> <start-utc> <end-utc> <exit> <output>\n');
  process.exit(64);
}
const output = boundedText(readFileSync(outputPath, 'utf8'), { worktreeRoot: process.cwd() });
writeBoundedFile(outputPath, output);
appendVerification(verificationPath, {
  kind: 'command',
  story,
  command,
  startedAtUtc,
  endedAtUtc,
  exitCode: Number(exitCodeText),
  stdoutStderr: output,
});
