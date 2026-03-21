import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SecurityProfileKey, ClawdbotConfig } from './types.js';
import { PROFILES } from './profiles.js';

export const WORKSPACE_PATH = join(homedir(), 'Desktop', 'OpenClaw_Workspace');
export const CONFIG_FILENAME = 'clawdbot.json';

/**
 * Generates clawdbot.json and writes it to the workspace directory.
 * Pass `overrideConfig` to use custom values instead of the profile defaults.
 */
export async function generateConfig(
  profileKey: SecurityProfileKey,
  apiKey: string,
  overrideConfig?: ClawdbotConfig
): Promise<void> {
  const profile = PROFILES[profileKey];
  if (!profile) throw new Error(`Unknown profile: ${profileKey}`);

  const configData = {
    ...(overrideConfig ?? profile.config),
    api_key: apiKey,
  };

  await mkdir(WORKSPACE_PATH, { recursive: true });
  await writeFile(
    join(WORKSPACE_PATH, CONFIG_FILENAME),
    JSON.stringify(configData, null, 2),
    'utf-8'
  );
}
