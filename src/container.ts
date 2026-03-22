import { execa } from 'execa';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SecurityProfileKey } from './types.js';

const CONTAINER_NAME = 'openclaw_sandbox';

const WORKSPACE_PATH = join(homedir(), 'Desktop', 'OpenClaw_Workspace');
const IMAGE = 'ghcr.io/openclaw/openclaw:latest';
const GATEWAY_PORT = 18789; // Serves the canvas UI (/__openclaw__/canvas/) + WebSocket gateway
const OPENCLAW_STATE_DIR = join(WORKSPACE_PATH, '.openclaw');
const OPENCLAW_CONFIG_PATH = join(OPENCLAW_STATE_DIR, 'openclaw.json');

/** Checks if the OpenClaw image already exists locally. */
async function imageExistsLocally(): Promise<boolean> {
  try {
    await execa('docker', ['image', 'inspect', IMAGE], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Pulls the OpenClaw container image if not already present; returns the image size. */
export async function pullContainerImage(): Promise<{ size: string }> {
  const exists = await imageExistsLocally();

  if (!exists) {
    try {
      await execa('docker', ['pull', IMAGE], { stdio: 'pipe', timeout: 600_000 });
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      const lastLine = stderr.trim().split('\n').pop() ?? 'docker pull failed';
      throw new Error(lastLine);
    }
  }

  // Get image size
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
 * - Exposes gateway port 18789 with --bind lan (required for Docker port forwarding)
 * - Passes the API key as ANTHROPIC_API_KEY env var
 */
export async function launchContainer(
  apiKey: string,
  _profileKey: SecurityProfileKey
): Promise<{ port: number; token: string }> {
  // Silently remove any stale container with the same name (exit code 125 conflict fix)
  await execa('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'pipe' }).catch(() => {});

  // Pre-seed OpenClaw config with bind=lan + allowed origins for Docker port forwarding
  await execa('mkdir', ['-p', OPENCLAW_STATE_DIR]);
  const openclawConfig = {
    gateway: {
      bind: 'lan',
      controlUi: {
        allowedOrigins: [`http://127.0.0.1:${GATEWAY_PORT}`, `http://localhost:${GATEWAY_PORT}`],
      },
    },
  };
  await writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(openclawConfig, null, 2));

  try {
    await execa(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name', CONTAINER_NAME,
        '--publish', `${GATEWAY_PORT}:${GATEWAY_PORT}`,
        '--volume', `${WORKSPACE_PATH}:/workspace`,
        '--volume', `${OPENCLAW_STATE_DIR}:/home/node/.openclaw`,
        '--env', `ANTHROPIC_API_KEY=${apiKey}`,
        IMAGE,
      ],
      { stdio: 'ignore', timeout: 30_000 }
    );
  } catch (err: unknown) {
    if ((err as { timedOut?: boolean }).timedOut) {
      throw new Error('docker run timed out after 30s — check your internet connection');
    }
    // Mask API key in any error message before rethrowing
    const raw = err instanceof Error ? err.message : String(err);
    const masked = raw.replaceAll(apiKey, 'sk-***');
    throw new Error(masked);
  }

  // Read the auth token the gateway wrote back to the config
  let token = '';
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const raw = await readFile(OPENCLAW_CONFIG_PATH, 'utf-8');
      const cfg = JSON.parse(raw);
      token = cfg?.gateway?.auth?.token ?? '';
      if (token) break;
    } catch {
      // Config not yet written — retry
    }
  }

  return { port: GATEWAY_PORT, token };
}

/** Stops the running OpenClaw container; no-op if it isn't running. */
export async function stopContainer(): Promise<void> {
  try {
    await execa('docker', ['stop', CONTAINER_NAME], { stdio: 'pipe', timeout: 15_000 });
  } catch {
    // Container not running or already stopped — ignore
  }
}
