import { execa } from 'execa';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const WORKSPACE_PATH = join(homedir(), 'Desktop', 'OpenClaw_Workspace');

/** Idempotent — creates workspace directory; no error if it already exists. */
export async function createWorkspace(): Promise<void> {
  await execa('mkdir', ['-p', WORKSPACE_PATH]);
}
