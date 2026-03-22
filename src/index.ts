#!/usr/bin/env node
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { Listr } from 'listr2';
import type { SecurityProfileKey, ClawdbotConfig } from './types.js';
import { PROFILES } from './profiles.js';
import { generateConfig, WORKSPACE_PATH } from './config.js';
import { execa } from 'execa';
import { checkDocker, installDocker, isDaemonRunning, launchDockerApp, pollDaemonReady } from './docker.js';
import { createWorkspace } from './workspace.js';
import { pullContainerImage, launchContainer, stopContainer } from './container.js';
import { checkInternetSpeed, buildDownloadManifest, formatManifestTable } from './network.js';
import { initLog, log, logError, getLogPath } from './logger.js';

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

/** Formats a config value for display in the settings table. */
function formatConfigValue(key: string, config: ClawdbotConfig): string {
  switch (key) {
    case 'sandbox.mode':       return config.sandbox.mode;
    case 'workspaceAccess':    return config.workspaceAccess;
    case 'skill_registry_trust': return config.skill_registry_trust;
    case 'max_budget':         return config.max_budget === 0 ? 'unlimited' : String(config.max_budget);
    case 'require_human_approval':
      return config.require_human_approval.length === 0
        ? '(none)'
        : config.require_human_approval.join(', ');
    default: return '';
  }
}

/**
 * Displays the active config as a summary table and optionally lets the user
 * change individual settings. Returns the (possibly updated) config.
 */
async function settingsReview(
  config: ClawdbotConfig,
  profileLabel: string,
  apiKey: string,
  profileKey: SecurityProfileKey,
  currentPort: number,
  currentToken: string
): Promise<{ config: ClawdbotConfig; port: number; token: string }> {
  const SETTINGS = [
    { key: 'sandbox.mode',           label: 'Sandbox mode' },
    { key: 'workspaceAccess',        label: 'Workspace access' },
    { key: 'skill_registry_trust',   label: 'Skill registry trust' },
    { key: 'max_budget',             label: 'Max budget (tokens)' },
    { key: 'require_human_approval', label: 'Require human approval' },
  ];

  const colW = 28;
  const table = [
    pc.dim('  Setting                     Value'),
    pc.dim('  ' + '─'.repeat(44)),
    ...SETTINGS.map((s) =>
      `  ${pc.cyan(s.label.padEnd(colW))} ${pc.white(formatConfigValue(s.key, config))}`
    ),
  ].join('\n');

  console.log(`\n${pc.dim('◇')} ${pc.bold(`Active profile: ${profileLabel}`)}\n${table}\n`);

  const wantChange = await p.confirm({ message: 'Would you like to change any settings?' });
  if (p.isCancel(wantChange) || !wantChange) return { config, port: currentPort, token: currentToken };

  let updated = { ...config, sandbox: { ...config.sandbox } };

  const settingToChange = await p.select({
    message: 'Which setting would you like to change?',
    options: SETTINGS.map((s) => ({
      value: s.key,
      label: s.label,
      hint: formatConfigValue(s.key, config),
    })),
  });
  if (p.isCancel(settingToChange)) return { config, port: currentPort, token: currentToken };

  if (settingToChange === 'sandbox.mode') {
    const val = await p.select({
      message: 'Sandbox mode',
      options: [
        { value: 'all',      label: 'all',      hint: 'Full sandbox — all commands intercepted' },
        { value: 'non-main', label: 'non-main', hint: 'Sandbox non-critical commands only' },
        { value: 'off',      label: 'off',      hint: 'No sandboxing' },
      ],
      initialValue: updated.sandbox.mode,
    });
    if (!p.isCancel(val)) updated.sandbox.mode = val as ClawdbotConfig['sandbox']['mode'];

  } else if (settingToChange === 'workspaceAccess') {
    const val = await p.select({
      message: 'Workspace access',
      options: [
        { value: 'ro',     label: 'ro',     hint: 'Read-only' },
        { value: 'scoped', label: 'scoped', hint: 'Scoped read/write' },
        { value: 'rw',     label: 'rw',     hint: 'Full read/write' },
      ],
      initialValue: updated.workspaceAccess,
    });
    if (!p.isCancel(val)) updated.workspaceAccess = val as ClawdbotConfig['workspaceAccess'];

  } else if (settingToChange === 'skill_registry_trust') {
    const val = await p.select({
      message: 'Skill registry trust',
      options: [
        { value: 'none',          label: 'none',          hint: 'No external skills allowed' },
        { value: 'verified_only', label: 'verified_only', hint: 'Only verified skills' },
        { value: 'all',           label: 'all',           hint: 'All skills allowed' },
      ],
      initialValue: updated.skill_registry_trust,
    });
    if (!p.isCancel(val)) updated.skill_registry_trust = val as ClawdbotConfig['skill_registry_trust'];

  } else if (settingToChange === 'max_budget') {
    const val = await p.text({
      message: 'Max budget (tokens). Enter 0 for unlimited.',
      initialValue: String(updated.max_budget),
      validate: (v) => {
        if (!/^\d+$/.test(v)) return 'Must be a non-negative integer.';
      },
    });
    if (!p.isCancel(val)) updated.max_budget = parseInt(val as string, 10);

  } else if (settingToChange === 'require_human_approval') {
    const val = await p.text({
      message: 'Commands requiring human approval (comma-separated). Leave empty for none.',
      initialValue: updated.require_human_approval.join(', '),
    });
    if (!p.isCancel(val)) {
      updated.require_human_approval = (val as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  // Rewrite clawdbot.json and restart container with updated config
  console.log(pc.dim('\n  Applying changes...'));
  await generateConfig(profileKey, apiKey, updated);
  await stopContainer();
  const { port, token } = await launchContainer(apiKey, profileKey);

  console.log(pc.green('  ✔ Settings applied and container restarted.\n'));
  return { config: updated, port, token };
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

  // ── 9.1 Docker daemon wait with user guidance ────────────────────────────────
  if (dockerInstalled && !(await isDaemonRunning())) {
    await launchDockerApp();
    p.note(
      [
        'Docker Desktop is launching.',
        '',
        '  1.  Complete sign-in or registration in the Docker window.',
        '  2.  Accept the license agreement if prompted.',
        '  3.  Wait for the Docker menu-bar icon to show "Engine running".',
        '',
        'Press Enter below once Docker is fully started.',
      ].join('\n'),
      'Docker setup required'
    );
    const ready = await p.confirm({ message: 'Is Docker running and ready?' });
    if (p.isCancel(ready) || !ready) {
      p.cancel('Setup cancelled — restart once Docker is running.');
      process.exit(0);
    }
    try {
      await pollDaemonReady(30_000);
    } catch (err) {
      logError('Docker daemon poll timed out', err);
      const lp = getLogPath();
      const logHint = lp ? `\n  Log: ${lp}` : '';
      p.cancel(`Docker is not responding. Start Docker Desktop and try again.${logHint}`);
      process.exit(1);
    }
  }

  let speedMbps = 0;
  try {
    process.stdout.write(pc.dim('  Measuring download speed...'));
    const speedResult = await checkInternetSpeed();
    speedMbps = speedResult.mbps;
    process.stdout.write(`\r${' '.repeat(40)}\r`); // clear the line
  } catch (err) {
    logError('Internet speed check failed (non-fatal)', err);
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
  let containerPort = 18789;
  let gatewayToken = '';

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
          gatewayToken = result.token;
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
    logError('Setup failed during install tasks', err);
    const firstLine = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    const lp = getLogPath();
    const logHint = lp ? `\n  Log: ${lp}` : '';
    p.cancel(`Setup failed: ${firstLine}${logHint}`);
    process.exit(1);
  }

  // ── 9.4 Settings review ──────────────────────────────────────────────────────
  const reviewResult = await settingsReview(
    selectedProfile.config,
    selectedProfile.label,
    apiKey as string,
    profileKey as SecurityProfileKey,
    containerPort,
    gatewayToken
  );
  containerPort = reviewResult.port;
  gatewayToken = reviewResult.token;

  // ── 9.5 Outro ────────────────────────────────────────────────────────────────
  const tokenParam = gatewayToken ? `?token=${gatewayToken}` : '';
  const canvasUrl = `http://127.0.0.1:${containerPort}/__openclaw__/canvas/${tokenParam}`;
  const box = [
    `  ${pc.dim('│')}  ☕  Your AI sandbox is ready.`,
    `  ${pc.dim('│')}`,
    `  ${pc.dim('│')}  Workspace  →  ${pc.cyan(WORKSPACE_PATH)}`,
    `  ${pc.dim('│')}  Profile    →  ${pc.yellow(selectedProfile.label)}`,
    `  ${pc.dim('│')}  Control UI →  ${pc.cyan(canvasUrl)}`,
    `  ${pc.dim('│')}`,
    `  ${pc.dim('│')}  ${pc.bold('Next steps')}`,
    `  ${pc.dim('│')}    1. Open the Control UI link above in your browser`,
    `  ${pc.dim('│')}    2. Drop files into the workspace folder to share with the agent`,
    `  ${pc.dim('│')}`,
    `  ${pc.dim('│')}  Health check: ${pc.dim(canvasUrl)}`,
  ].join('\n');

  p.outro(`${pc.green('✔')} Sandbox successfully booted!\n\n${box}`);
}

main().catch((err) => {
  logError('Unexpected top-level error', err);
  const lp = getLogPath();
  const logHint = lp ? `\n  Log: ${lp}` : '';
  p.cancel(`An unexpected error occurred.${logHint}`);
  process.exit(1);
});
