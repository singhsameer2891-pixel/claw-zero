import https from 'node:https';
import { existsSync } from 'node:fs';
import { execaSync } from 'execa';

const SPEED_TEST_URL = 'https://speed.cloudflare.com/__down?bytes=10000000';
const SPEED_TEST_SIZE_MB = 10;
const SPEED_TEST_TIMEOUT_MS = 15_000;

export interface SpeedResult {
  mbps: number;
}

/** Downloads 10 MB from Cloudflare and returns measured throughput in MB/s. */
export async function checkInternetSpeed(): Promise<SpeedResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Internet speed check timed out after 15s'));
    }, SPEED_TEST_TIMEOUT_MS);

    const start = Date.now();
    let received = 0;

    const req = https.get(SPEED_TEST_URL, (res) => {
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
      });
      res.on('end', () => {
        clearTimeout(timer);
        const elapsedSec = (Date.now() - start) / 1000;
        const mbps = SPEED_TEST_SIZE_MB / elapsedSec;
        resolve({ mbps });
      });
      res.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        reject(new Error('Internet speed check timed out after 15s'));
      } else {
        reject(err);
      }
    });

    controller.signal.addEventListener('abort', () => {
      req.destroy();
    });
  });
}

export interface DownloadItem {
  name: string;
  source: string;
  sizeMB: number;
}

/** Checks if Homebrew already has the Docker cask DMG cached locally. */
function isDockerCaskCached(): boolean {
  try {
    const { stdout } = execaSync('brew', ['--cache', '--cask', 'docker']);
    return existsSync(stdout.trim());
  } catch {
    return false;
  }
}

/** Returns the list of things that need to be downloaded. */
export function buildDownloadManifest(dockerInstalled: boolean): DownloadItem[] {
  const items: DownloadItem[] = [];

  if (!dockerInstalled) {
    const cached = isDockerCaskCached();
    items.push({
      name: 'Docker Desktop',
      source: cached ? 'brew --cask (cached)' : 'brew --cask',
      sizeMB: cached ? 0 : 1200,
    });
  }

  items.push({
    name: 'OpenClaw image',
    source: 'ghcr.io/openclaw/openclaw:latest',
    sizeMB: 800,
  });

  return items;
}

/** Formats a manifest table with per-item and total time estimates. */
export function formatManifestTable(items: DownloadItem[], speedMbps: number): string {
  if (items.length === 0) return '';

  const COL = { name: 24, source: 42, size: 10, time: 16 };
  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);

  const header =
    pad('Component', COL.name) +
    pad('Source', COL.source) +
    pad('Size', COL.size) +
    pad('Est. Time', COL.time);

  const divider = '─'.repeat(COL.name + COL.source + COL.size + COL.time);

  const rows = items.map((item) => {
    const estSec = speedMbps > 0 ? item.sizeMB / speedMbps : 0;
    const estTime = estSec < 60 ? `~${Math.ceil(estSec)}s` : `~${Math.ceil(estSec / 60)}m`;
    return (
      pad(item.name, COL.name) +
      pad(item.source, COL.source) +
      pad(`${item.sizeMB} MB`, COL.size) +
      pad(estTime, COL.time)
    );
  });

  const totalMB = items.reduce((sum, i) => sum + i.sizeMB, 0);
  const totalSec = speedMbps > 0 ? totalMB / speedMbps : 0;
  const totalTime = totalSec < 60 ? `~${Math.ceil(totalSec)}s` : `~${Math.ceil(totalSec / 60)}m`;
  const totalRow =
    pad('TOTAL', COL.name) +
    pad('', COL.source) +
    pad(`${totalMB} MB`, COL.size) +
    pad(totalTime, COL.time);

  return [header, divider, ...rows, divider, totalRow].join('\n');
}
