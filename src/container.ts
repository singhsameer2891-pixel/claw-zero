import { randomBytes } from 'node:crypto';
import { execa } from 'execa';
import { writeFile } from 'node:fs/promises';
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
      const lastLine = stderr.trim().split('\n').pop() || `docker pull failed: ${IMAGE}`;
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

  // Generate a gateway token and pre-seed config: bind=lan + token auth + allowed origins
  await execa('mkdir', ['-p', OPENCLAW_STATE_DIR]);
  const gatewayToken = randomBytes(24).toString('hex');
  const openclawConfig = {
    gateway: {
      bind: 'lan',
      auth: { mode: 'token', token: gatewayToken },
      controlUi: {
        allowedOrigins: [`http://127.0.0.1:${GATEWAY_PORT}`, `http://localhost:${GATEWAY_PORT}`],
        allowInsecureAuth: true,
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

  return { port: GATEWAY_PORT, token: gatewayToken };
}

/**
 * Polls for pending device pairing requests and auto-approves them.
 * Docker port forwarding makes the client appear non-local (192.168.65.x),
 * which prevents the gateway's silent auto-pairing. This compensates by
 * approving pending requests from inside the container.
 *
 * Polls every 2s for up to `maxWaitMs` (default 120s). Resolves `true` once
 * a device is approved, `false` on timeout. Runs fire-and-forget from the CLI.
 */
export async function autoApprovePairing(
  gatewayToken: string,
  maxWaitMs = 120_000
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  const interval = 2_000;

  while (Date.now() < deadline) {
    try {
      const { stdout } = await execa(
        'docker',
        [
          'exec', CONTAINER_NAME,
          'npx', 'openclaw', 'devices', 'approve',
          '--latest',
          '--token', gatewayToken,
          '--json',
        ],
        { stdio: 'pipe', timeout: 10_000 }
      );
      // If we get here without throwing, a device was approved
      if (stdout.includes('"ok"') || stdout.includes('"approved"') || !stdout.includes('"error"')) {
        return true;
      }
    } catch {
      // No pending requests yet — wait and retry
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/** Waits for the gateway HTTP server to be ready (accepting connections). */
export async function waitForGateway(port: number, maxWaitMs = 15_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (resp.ok || resp.status === 401) return; // server is up
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Stops the running OpenClaw container; no-op if it isn't running. */
export async function stopContainer(): Promise<void> {
  try {
    await execa('docker', ['stop', CONTAINER_NAME], { stdio: 'pipe', timeout: 15_000 });
  } catch {
    // Container not running or already stopped — ignore
  }
}
