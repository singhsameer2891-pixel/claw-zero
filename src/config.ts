import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SecurityProfileKey } from './types.js';
import { PROFILES } from './profiles.js';

export const WORKSPACE_PATH = join(homedir(), 'Desktop', 'OpenClaw_Workspace');
export const CONFIG_FILENAME = 'clawdbot.json';

/** Generates clawdbot.json and writes it to the workspace directory. */
export async function generateConfig(
  profileKey: SecurityProfileKey,
  apiKey: string
): Promise<void> {
  const profile = PROFILES[profileKey];
  if (!profile) throw new Error(`Unknown profile: ${profileKey}`);

  const configData = {
    ...profile.config,
    api_key: apiKey,
  };

  await mkdir(WORKSPACE_PATH, { recursive: true });
  await writeFile(
    join(WORKSPACE_PATH, CONFIG_FILENAME),
    JSON.stringify(configData, null, 2),
    'utf-8'
  );
}
