import { execa } from 'execa';
import { existsSync } from 'node:fs';

/**
 * Returns true if Docker Desktop is installed OR the docker CLI responds.
 * Checks /Applications/Docker.app first (covers the installed-but-not-launched case)
 * before falling back to `docker --version`.
 */
export async function checkDocker(): Promise<boolean> {
  if (existsSync('/Applications/Docker.app')) return true;
  try {
    await execa('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Install Docker Desktop via Homebrew Cask. Captures output — does not bleed into Listr spinner. */
export async function installDocker(): Promise<void> {
  try {
    await execa('brew', ['install', '--cask', 'docker'], { stdio: 'pipe', timeout: 600_000 });
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const lastLine = stderr.trim().split('\n').pop() ?? 'brew install failed';
    throw new Error(lastLine);
  }
}

/** Open Docker.app and poll `docker info` until daemon is ready (max 60s). */
export async function startDockerDaemon(): Promise<void> {
  // Check if daemon is already running
  try {
    await execa('docker', ['info'], { stdio: 'ignore' });
    return; // Already running
  } catch {
    // Not running — launch it
  }

  await execa('open', ['-a', 'Docker']);

  const POLL_INTERVAL_MS = 2000;
  const MAX_WAIT_MS = 60_000;
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      await execa('docker', ['info'], { stdio: 'ignore' });
      return; // Daemon ready
    } catch {
      // Still starting — keep polling
    }
  }

  throw new Error('open -a Docker timed out after 60s — check your internet connection');
}
