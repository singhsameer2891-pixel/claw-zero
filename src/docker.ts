import { execa } from 'execa';
import { existsSync } from 'node:fs';

/**
 * Returns true if the `docker` CLI is callable.
 * The .app bundle may exist without the CLI being on PATH (fresh Homebrew install
 * that hasn't been launched yet), so we always verify the binary responds.
 */
export async function checkDocker(): Promise<boolean> {
  try {
    await execa('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Docker Desktop install states:
 *   'ready'   — .app bundle exists with a valid executable inside
 *   'zombie'  — .app directory exists but the executable is missing (partial uninstall)
 *   'missing' — no .app directory at all
 */
export type DockerAppState = 'ready' | 'zombie' | 'missing';

export function getDockerAppState(): DockerAppState {
  if (!existsSync('/Applications/Docker.app')) return 'missing';
  // The real executable — if this is gone the bundle is broken
  if (!existsSync('/Applications/Docker.app/Contents/MacOS/Docker')) return 'zombie';
  return 'ready';
}

/** @deprecated Use getDockerAppState() instead. */
export function isDockerAppInstalled(): boolean {
  return getDockerAppState() === 'ready';
}

/**
 * Install (or reinstall) Docker Desktop via Homebrew Cask.
 * Pass `reinstall: true` for zombie .app bundles left behind by a partial uninstall.
 * Captures output — does not bleed into Listr spinner.
 */
export async function installDocker(opts: { reinstall?: boolean } = {}): Promise<void> {
  const cmd = opts.reinstall ? 'reinstall' : 'install';
  try {
    await execa('brew', [cmd, '--cask', 'docker'], { stdio: 'pipe', timeout: 600_000 });
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const lastLine = stderr.trim().split('\n').pop() ?? `brew ${cmd} failed`;
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
  // Use the full path instead of `-a Docker` so macOS LaunchServices
  // doesn't need to have indexed the app yet (matters on fresh installs).
  await execa('open', ['/Applications/Docker.app']);
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
