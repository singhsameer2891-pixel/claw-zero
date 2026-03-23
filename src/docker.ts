import { execa, execaSync } from 'execa';
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
 *   'ready'    — .app bundle exists with a valid executable inside
 *   'zombie'   — .app directory exists but the executable is missing (partial uninstall)
 *   'orphaned' — .app is gone but brew still thinks the cask is installed (brew install no-ops)
 *   'missing'  — no .app directory and brew has no record of the cask
 */
export type DockerAppState = 'ready' | 'zombie' | 'orphaned' | 'missing';

export function getDockerAppState(): DockerAppState {
  if (existsSync('/Applications/Docker.app')) {
    // The real executable — if this is gone the bundle is broken
    return existsSync('/Applications/Docker.app/Contents/MacOS/Docker') ? 'ready' : 'zombie';
  }
  // .app is gone — check if brew still has the cask registered (stale metadata)
  try {
    const result = execaSync('brew', ['list', '--cask', 'docker'], { stdio: 'ignore', reject: false });
    return result.exitCode === 0 ? 'orphaned' : 'missing';
  } catch {
    return 'missing';
  }
}

/** @deprecated Use getDockerAppState() instead. */
export function isDockerAppInstalled(): boolean {
  return getDockerAppState() === 'ready';
}

/**
 * Install (or reinstall) Docker Desktop via Homebrew Cask.
 * Pass `reinstall: true` for zombie/orphaned states left behind by a partial uninstall.
 * Uses stdio: 'inherit' so the user sees brew progress and can respond to sudo prompts.
 */
export async function installDocker(opts: { reinstall?: boolean } = {}): Promise<void> {
  const cmd = opts.reinstall ? 'reinstall' : 'install';
  try {
    await execa('brew', [cmd, '--cask', 'docker'], { stdio: 'inherit', timeout: 600_000 });
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const lastLine = stderr.trim().split('\n').pop() ?? `brew ${cmd} failed`;
    throw new Error(lastLine);
  }
}

/**
 * Remove ALL leftover Docker Desktop artifacts so a clean `brew install` can
 * succeed. Covers: brew Caskroom metadata, shell completions, and root-owned
 * symlinks in /usr/local that the cask creates.
 *
 * Must run in an interactive context — uses `sudo rm` (with stdio: 'inherit')
 * for the root-owned paths so the user can provide their password.
 */
export async function cleanOrphanedDockerFiles(): Promise<void> {
  // 1. Brew-owned paths (no sudo needed)
  const brewPaths = [
    '/opt/homebrew/Caskroom/docker-desktop',
    '/opt/homebrew/etc/bash_completion.d/docker',
    '/opt/homebrew/etc/bash_completion.d/docker-compose',
    '/opt/homebrew/share/fish/vendor_completions.d/docker.fish',
    '/opt/homebrew/share/fish/vendor_completions.d/docker-compose.fish',
    '/opt/homebrew/share/zsh/site-functions/_docker',
    '/opt/homebrew/share/zsh/site-functions/_docker-compose',
  ];
  for (const fp of brewPaths) {
    try { execaSync('rm', ['-rf', fp], { stdio: 'ignore' }); } catch { /* best-effort */ }
  }

  // 2. Root-owned symlinks created by the Docker cask (needs sudo)
  //    Derived from `brew info --cask docker` artifact list.
  const sudoPaths = [
    '/usr/local/bin/docker',
    '/usr/local/bin/kubectl.docker',
    '/usr/local/bin/hub-tool',
    '/usr/local/bin/docker-credential-desktop',
    '/usr/local/bin/docker-credential-ecr-login',
    '/usr/local/bin/docker-credential-osxkeychain',
    '/usr/local/cli-plugins/docker-compose',
  ];
  // Filter to only paths that actually exist to avoid unnecessary sudo prompt
  const existing = sudoPaths.filter((fp) => existsSync(fp));
  if (existing.length > 0) {
    try {
      await execa('sudo', ['rm', '-f', ...existing], { stdio: 'inherit' });
    } catch { /* best-effort — install may still succeed if these aren't blocking */ }
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
