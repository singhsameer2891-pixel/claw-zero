import { execa } from 'execa';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SecurityProfileKey } from './types.js';

const WORKSPACE_PATH = join(homedir(), 'Desktop', 'OpenClaw_Workspace');
const IMAGE = 'ghcr.io/openclaw/openclaw:latest';
const PORT = 3845;

/** Pulls the OpenClaw container image; returns the pulled image size. */
export async function pullContainerImage(): Promise<{ size: string }> {
  try {
    await execa('docker', ['pull', IMAGE], { stdio: 'pipe', timeout: 600_000 });
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const lastLine = stderr.trim().split('\n').pop() ?? 'docker pull failed';
    throw new Error(lastLine);
  }

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
  try {
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
      { stdio: 'ignore', timeout: 30_000 }
    );
  } catch (err: unknown) {
    if ((err as { timedOut?: boolean }).timedOut) {
      throw new Error('docker run timed out after 30s — check your internet connection');
    }
    throw err;
  }

  return { port: PORT };
}
