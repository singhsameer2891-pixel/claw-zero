import { execa } from 'execa';

/** Silent check — returns true if docker CLI is available. */
export async function checkDocker(): Promise<boolean> {
  try {
    await execa('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Install Docker Desktop via Homebrew Cask. */
export async function installDocker(): Promise<void> {
  await execa('brew', ['install', '--cask', 'docker'], { stdio: 'inherit' });
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

  throw new Error('Docker daemon did not start within 60 seconds.');
}
