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

/** Returns true if the Docker daemon is currently responding. */
export async function isDaemonRunning(): Promise<boolean> {
  try {
    await execa('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Open Docker.app without waiting — caller is responsible for waiting via pollDaemonReady(). */
export async function launchDockerApp(): Promise<void> {
  await execa('open', ['-a', 'Docker']);
}

/** Poll `docker info` until the daemon responds or the timeout elapses. */
export async function pollDaemonReady(timeoutMs = 30_000): Promise<void> {
  const POLL_INTERVAL_MS = 2000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      await execa('docker', ['info'], { stdio: 'ignore' });
      return; // Daemon ready
    } catch {
      // Still starting — keep polling
    }
  }

  throw new Error('Docker daemon did not respond within 30s — try again once Docker is fully started');
}

/** @deprecated Use isDaemonRunning() + launchDockerApp() + pollDaemonReady() instead. */
export async function startDockerDaemon(): Promise<void> {
  if (await isDaemonRunning()) return;
  await launchDockerApp();
  await pollDaemonReady();
}
