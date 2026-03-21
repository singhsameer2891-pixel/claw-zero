import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const WORKSPACE_PATH = join(homedir(), 'Desktop', 'OpenClaw_Workspace');

let logPath: string | null = null;

/** Creates the log file at ~/Desktop/OpenClaw_Workspace/claw_zero_YYYY-MM-DD_HHMMSS.log */
export function initLog(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
  const filename = `claw_zero_${datePart}_${timePart}.log`;

  // Workspace may not exist yet — create it if needed
  mkdirSync(WORKSPACE_PATH, { recursive: true });

  logPath = join(WORKSPACE_PATH, filename);
  log('INFO', 'claw_zero session started');
  return logPath;
}

/** Appends a timestamped line to the session log. No-op if initLog() hasn't been called. */
export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  if (!logPath) return;
  const time = new Date().toTimeString().slice(0, 8); // HH:MM:SS
  appendFileSync(logPath, `[${time}] [${level}] ${message}\n`);
}

/** Returns the current log file path, or null if not initialised. */
export function getLogPath(): string | null {
  return logPath;
}
