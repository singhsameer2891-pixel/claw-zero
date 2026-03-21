import { execa } from 'execa';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SecurityProfileKey } from './types.js';

const WORKSPACE_PATH = join(homedir(), 'Desktop', 'OpenClaw_Workspace');
const IMAGE = 'ghcr.io/openclaw/openclaw:latest';
const PORT = 3845;

/** Pulls the OpenClaw container image; returns the pulled image size. */
export async function pullContainerImage(): Promise<{ size: string }> {
  await execa('docker', ['pull', IMAGE], { stdio: 'inherit' });

  // Get image size after pull
  const { stdout } = await execa('docker', [
    'image',
    'inspect',
    IMAGE,
    '--format',
    '{{.Size}}',
  ]);
  const bytes = parseInt(stdout.trim(), 10);
  const size = isNaN(bytes) ? 'unknown' : `${(bytes / 1_073_741_824).toFixed(1)} GB`;

  return { size };
}

/**
 * Runs the OpenClaw container:
 * - Mounts ONLY ~/Desktop/OpenClaw_Workspace (never the full home dir)
 * - Exposes port 3845
 * - Passes the API key as ANTHROPIC_API_KEY env var
 */
export async function launchContainer(
  apiKey: string,
  _profileKey: SecurityProfileKey
): Promise<{ port: number }> {
  await execa(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name', 'openclaw_sandbox',
      '--publish', `${PORT}:${PORT}`,
      '--volume', `${WORKSPACE_PATH}:/workspace`,
      '--env', `ANTHROPIC_API_KEY=${apiKey}`,
      IMAGE,
    ],
    { stdio: 'ignore' }
  );

  return { port: PORT };
}
