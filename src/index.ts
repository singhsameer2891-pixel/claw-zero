#!/usr/bin/env node
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { Listr } from 'listr2';
import type { SecurityProfileKey } from './types.js';
import { PROFILES } from './profiles.js';
import { generateConfig, WORKSPACE_PATH } from './config.js';
import { execa } from 'execa';
import { checkDocker, installDocker, startDockerDaemon } from './docker.js';
import { createWorkspace } from './workspace.js';
import { pullContainerImage, launchContainer } from './container.js';
import { checkInternetSpeed, buildDownloadManifest, formatManifestTable } from './network.js';
import { initLog, log, getLogPath } from './logger.js';

/** Formats API key for inline confirmation: first 7 + last 4 chars. */
function maskApiKey(key: string): string {
  if (key.length <= 11) return key.slice(0, 3) + '••••' + key.slice(-2);
  return key.slice(0, 7) + '••••' + key.slice(-4);
}

/** Syntax-highlights a JSON object: cyan keys, green strings, purple numbers. */
function highlightJson(obj: object): string {
  return JSON.stringify(obj, null, 2)
    .split('\n')
    .map((line) => {
      return line
        .replace(/"([^"]+)":/g, (_, k) => pc.cyan('"' + k + '"') + ':')
        .replace(/: "([^"]*)"/g, (_, v) => ': ' + pc.green('"' + v + '"'))
        .replace(/: (\d+)/g, (_, n) => ': ' + pc.magenta(n))
        .replace(/: \[/g, ': [')
        .replace(/"(\*|rm|sudo|curl|wget|git push|npm publish|rm -rf)"/g, (_, v) =>
          pc.green('"' + v + '"')
        );
    })
    .join('\n');
}

async function main() {
  // ── 3.2 Welcome intro ───────────────────────────────────────────────────────
  console.clear();
  console.log(pc.dim('──────────────────────────────────────────────'));
  p.intro(`${pc.bgCyan(pc.black(' 🦞 ONE-CLICK CLAW '))}  ${pc.dim('Secure Local Sandbox')}`);
  console.log(pc.dim('──────────────────────────────────────────────'));

  // ── 3.3 API key masked input ────────────────────────────────────────────────
  const apiKey = await p.password({
    message: 'Paste your Anthropic or OpenAI API Key',
    mask: '•',
    validate: (value) => {
      if (!value) return 'API Key is required to power the brain.';
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // Inline confirmation
  console.log(
    `${pc.green('◆')} API Key   ${pc.dim('✓')} ${pc.dim(maskApiKey(apiKey as string))}`
  );

  // ── 3.4 Security profile selection ─────────────────────────────────────────
  const profileKey = await p.select({
    message: 'Select your security profile',
    initialValue: 'pragmatic',
    options: [
      { value: 'fort_knox',  label: 'Fort Knox',          hint: 'Super strict. Read-only.' },
      { value: 'pragmatic',  label: 'The Pragmatic PM',   hint: 'Recommended. Scoped access.' },
      { value: 'cowboy',     label: 'Cowboy Coder',       hint: 'Lenient. Proceed with caution.' },
      { value: 'yolo',       label: 'YOLO Mode',          hint: 'Unrestricted. Good luck.' },
    ],
  });

  if (p.isCancel(profileKey)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  const selectedProfile = PROFILES[profileKey as string];

  // Inline confirmation
  console.log(
    `${pc.green('◆')} Profile   ${pc.yellow(selectedProfile.label)}`
  );

  // ── 3.5 Config preview ──────────────────────────────────────────────────────
  console.log(`\n${pc.dim('◇')} ${pc.dim('Generating clawdbot.json')}`);
  console.log(highlightJson(selectedProfile.config));
  console.log();

  // ── 8.5 Pre-flight gate ──────────────────────────────────────────────────────
  const dockerInstalled = await checkDocker();

  let speedMbps = 0;
  try {
    process.stdout.write(pc.dim('  Measuring download speed...'));
    const speedResult = await checkInternetSpeed();
    speedMbps = speedResult.mbps;
    process.stdout.write(`\r${' '.repeat(40)}\r`); // clear the line
  } catch {
    process.stdout.write(`\r${' '.repeat(40)}\r`);
    // Non-fatal — proceed without estimate
  }

  const manifest = buildDownloadManifest(dockerInstalled);

  if (manifest.length > 0) {
    const table = formatManifestTable(manifest, speedMbps);
    console.log(`\n${pc.dim('◇')} ${pc.bold('Download plan')}`);
    console.log(pc.dim(table));
    console.log();

    if (speedMbps > 0 && speedMbps < 10) {
      console.log(
        pc.yellow(`  ⚠  Slow connection detected (${speedMbps.toFixed(1)} MB/s). Downloads may take a while.`)
      );
      console.log();
    }

    const proceed = await p.confirm({ message: 'Proceed with download?' });
    if (p.isCancel(proceed) || !proceed) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // Initialise session log (workspace may not exist yet — logger handles mkdir)
  const logFilePath = initLog();
  log('INFO', `Profile selected: ${profileKey as string}`);

  // ── 3.6 Sequential install checklist (listr2) ───────────────────────────────
  let dockerVersion = 'Docker';
  let imageSize = '1.2 GB';
  let containerPort = 3845;

  const tasks = new Listr(
    [
      {
        title: 'Checking Docker daemon...',
        task: async (_, task) => {
          log('INFO', 'Task 1 start: Docker check');
          if (!dockerInstalled) {
            task.title = 'Installing Docker via Homebrew...';
            log('INFO', 'Docker not found — starting Homebrew install');
            await installDocker();
            log('INFO', 'Docker installed via Homebrew');
          }
          await startDockerDaemon();
          try {
            const { stdout } = await execa('docker', ['--version']);
            dockerVersion = stdout.trim();
          } catch {
            // version string is cosmetic — don't block
          }
          log('INFO', `Task 1 done: ${dockerVersion} running`);
          task.title = pc.dim(`✔ ${dockerVersion} is running`);
        },
      },
      {
        title: 'Creating workspace directory...',
        task: async (_, task) => {
          log('INFO', 'Task 2 start: create workspace');
          await createWorkspace();
          log('INFO', `Task 2 done: workspace at ${WORKSPACE_PATH}`);
          task.title = pc.dim(`✔ Workspace ready at ${WORKSPACE_PATH}`);
        },
      },
      {
        title: 'Writing clawdbot.json...',
        task: async (_, task) => {
          log('INFO', 'Task 3 start: write clawdbot.json');
          await generateConfig(profileKey as SecurityProfileKey, apiKey as string);
          log('INFO', 'Task 3 done: clawdbot.json written');
          task.title = pc.dim('✔ clawdbot.json written');
        },
      },
      {
        title: 'Pulling OpenClaw container image...',
        task: async (_, task) => {
          log('INFO', 'Task 4 start: docker pull');
          const result = await pullContainerImage();
          imageSize = result.size;
          log('INFO', `Task 4 done: image pulled (${imageSize})`);
          task.title = pc.dim(`✔ Image pulled (${imageSize})`);
        },
      },
      {
        title: 'Booting container...',
        task: async (_, task) => {
          log('INFO', 'Task 5 start: docker run');
          const result = await launchContainer(apiKey as string, profileKey as SecurityProfileKey);
          containerPort = result.port;
          log('INFO', `Task 5 done: container live on port ${containerPort}`);
          task.title = pc.dim(`✔ Container live on port ${containerPort}`);
        },
      },
    ],
    {
      rendererOptions: { collapseErrors: false },
    }
  );

  try {
    await tasks.run();
  } catch (err) {
    const message = (err as Error).message;
    log('ERROR', `Setup failed: ${message}`);
    const lp = getLogPath();
    const logHint = lp ? `\n  Log: ${lp}` : '';
    p.cancel(`Setup failed: ${message}${logHint}`);
    process.exit(1);
  }

  // ── 3.7 Outro ───────────────────────────────────────────────────────────────
  const box = [
    `  ${pc.dim('│')}  ☕  Pouring some coffee for your new AI intern...`,
    `  ${pc.dim('│')}`,
    `  ${pc.dim('│')}  Workspace  →  ${pc.cyan(WORKSPACE_PATH)}`,
    `  ${pc.dim('│')}  Access     →  ${pc.cyan(`localhost:${containerPort}`)}`,
    `  ${pc.dim('│')}  Profile    →  ${pc.yellow(selectedProfile.label)}`,
    `  ${pc.dim('│')}`,
    `  ${pc.dim('│')}  Drop files into the workspace folder to begin.`,
  ].join('\n');

  p.outro(`${pc.green('✔')} Sandbox successfully booted!\n\n${box}`);
}

main().catch((err) => {
  const message = (err as Error).message;
  log('ERROR', `Unexpected error: ${message}`);
  const lp = getLogPath();
  const logHint = lp ? `\n  Log: ${lp}` : '';
  p.cancel(`Unexpected error: ${message}${logHint}`);
  process.exit(1);
});
