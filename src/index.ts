#!/usr/bin/env node
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { SecurityProfileKey, ClawdbotConfig } from './types.js';
import { PROFILES } from './profiles.js';
import { generateConfig, WORKSPACE_PATH } from './config.js';
import { execa } from 'execa';
import { checkDocker, installDocker, getDockerAppState, cleanOrphanedDockerFiles, isDaemonRunning, launchDockerApp, pollDaemonReady } from './docker.js';
import type { DockerAppState } from './docker.js';
import { createWorkspace } from './workspace.js';
import { pullContainerImage, launchContainer, stopContainer, autoApprovePairing, waitForGateway } from './container.js';
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: PKG_VERSION } = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);

async function main() {
  // ── 3.2 Welcome intro ───────────────────────────────────────────────────────
  console.clear();
  const logo = [
    '',
    `                    ${pc.red('  ██  ') + pc.dim('·') + pc.red('  ██')}`,
    `                    ${pc.red(' ██▓█   ██▓█')}`,
    `                    ${pc.red('  ▓██▓▓▓██▓')}`,
    `                    ${pc.red('   ▓█████▓')}`,
    `                    ${pc.red('    ▓███▓')}`,
    '',
    `    ${pc.cyan('██████╗')} ${pc.cyan('██╗')}      ${pc.cyan('█████╗')}  ${pc.cyan('██╗')}    ${pc.cyan('██╗')}    ${pc.bold(pc.white('╺━━━━━━━━━╸'))}`,
    `    ${pc.cyan('██╔═══╝')} ${pc.cyan('██║')}     ${pc.cyan('██╔══██╗')} ${pc.cyan('██║')}    ${pc.cyan('██║')}    ${pc.bold(pc.white('Z  E  R  O'))}`,
    `    ${pc.cyan('██║')}     ${pc.cyan('██║')}     ${pc.cyan('███████║')} ${pc.cyan('██║ █╗ ██║')}    ${pc.bold(pc.white('╺━━━━━━━━━╸'))}`,
    `    ${pc.cyan('██║')}     ${pc.cyan('██║')}     ${pc.cyan('██╔══██║')} ${pc.cyan('██║███╗██║')}`,
    `    ${pc.cyan('██████╗')} ${pc.cyan('██████╗')} ${pc.cyan('██║  ██║')} ${pc.cyan('╚███╔███╔╝')}`,
    `    ${pc.cyan('╚═════╝')} ${pc.cyan('╚═════╝')} ${pc.cyan('╚═╝  ╚═╝')}  ${pc.cyan('╚══╝╚══╝')}`,
    '',
    `    ${pc.dim('─────────────────────────────────────────────────────')}`,
    `    ${pc.dim('Secure AI Sandbox  ·  One Command  ·  Zero Config')}`,
    `    ${pc.dim(`v${PKG_VERSION}`)}  ${pc.dim('·')}  ${pc.cyan('Sameer Singh')}  ${pc.dim('· github.com/singhsameer2891-pixel')}`,
    `    ${pc.dim('─────────────────────────────────────────────────────')}`,
    '',
  ];
  console.log(logo.join('\n'));

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
  let dockerInstalled = await checkDocker();
  let appState: DockerAppState = getDockerAppState();
  const needsDockerInstall = !dockerInstalled && appState !== 'ready';

  // ── 8.6 Download manifest ──────────────────────────────────────────────────
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

  // ── 8.7 Docker install/repair (interactive — brew cask needs sudo) ──────────
  if (needsDockerInstall) {
    console.log(`\n${pc.cyan('●')}  Installing Docker Desktop via Homebrew...`);
    console.log(pc.dim('   You may be prompted for your password.\n'));
    // Always clean leftover artifacts — root-owned symlinks in /usr/local/bin
    // and stale Caskroom metadata can block `brew install` even in 'missing' state.
    await cleanOrphanedDockerFiles();
    await installDocker();
    // Re-check after install
    dockerInstalled = await checkDocker();
    appState = getDockerAppState();
  }

  // ── 9.1 Docker daemon wait with user guidance ────────────────────────────────
  if (appState === 'ready' && !(await isDaemonRunning())) {
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

  // Initialise session log (workspace may not exist yet — logger handles mkdir)
  const logFilePath = initLog();
  log('INFO', `Profile selected: ${profileKey as string}`);

  // ── 3.6 Sequential setup tasks ──────────────────────────────────────────────
  let dockerVersion = 'Docker';
  let imageSize = '1.2 GB';
  let containerPort = 18789;
  let gatewayToken = '';

  const s = p.spinner();

  try {
    // Task 1: Docker daemon
    s.start('Starting Docker daemon...');
    log('INFO', 'Task 1 start: Docker check');
    if (!(await isDaemonRunning())) {
      s.message('Launching Docker Desktop...');
      log('INFO', 'Launching Docker Desktop');
      await launchDockerApp();
      await pollDaemonReady(60_000);
      log('INFO', 'Docker daemon ready');
    }
    try {
      const { stdout } = await execa('docker', ['--version']);
      dockerVersion = stdout.trim();
    } catch { /* cosmetic */ }
    log('INFO', `Task 1 done: ${dockerVersion} running`);
    s.stop(`${dockerVersion} is running`);

    // Task 2: Workspace
    s.start('Creating workspace directory...');
    log('INFO', 'Task 2 start: create workspace');
    await createWorkspace();
    log('INFO', `Task 2 done: workspace at ${WORKSPACE_PATH}`);
    s.stop(`Workspace ready at ${WORKSPACE_PATH}`);

    // Task 3: Config
    s.start('Writing clawdbot.json...');
    log('INFO', 'Task 3 start: write clawdbot.json');
    await generateConfig(profileKey as SecurityProfileKey, apiKey as string);
    log('INFO', 'Task 3 done: clawdbot.json written');
    s.stop('clawdbot.json written');

    // Task 4: Image pull
    s.start('Pulling OpenClaw container image...');
    log('INFO', 'Task 4 start: docker pull');
    const pullResult = await pullContainerImage();
    imageSize = pullResult.size;
    log('INFO', `Task 4 done: image pulled (${imageSize})`);
    s.stop(`Image pulled (${imageSize})`);

    // Task 5: Boot container
    s.start('Booting container...');
    log('INFO', 'Task 5 start: docker run');
    const runResult = await launchContainer(apiKey as string, profileKey as SecurityProfileKey);
    containerPort = runResult.port;
    gatewayToken = runResult.token;
    log('INFO', `Task 5 done: container live on port ${containerPort}`);
    s.stop(`Container live on port ${containerPort}`);
  } catch (err) {
    s.stop('Failed', 1);
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
  const dashboardUrl = `http://127.0.0.1:${containerPort}/#token=${gatewayToken}`;

  // Wait for gateway + open browser + auto-pair — all under one spinner
  s.start('Opening Control UI in your browser...');
  await waitForGateway(containerPort);
  await execa('open', [dashboardUrl]).catch(() => {});

  // Auto-approve device pairing — Docker port forwarding makes the browser
  // appear non-local (192.168.65.x), preventing the gateway's silent auto-pair.
  const approved = await autoApprovePairing(gatewayToken, 30_000);

  // After approval, refresh the browser so it reconnects with the paired device.
  if (approved) {
    await new Promise((r) => setTimeout(r, 1_000));
    await execa('osascript', [
      '-e', 'tell application "System Events" to keystroke "r" using command down',
    ]).catch(() => {});
  }
  s.stop('Control UI opened');

  const box = [
    '',
    `  ${pc.dim('│')}  ☕  Your AI sandbox is ready.`,
    `  ${pc.dim('│')}`,
    `  ${pc.dim('│')}  Workspace  →  ${pc.cyan(WORKSPACE_PATH)}`,
    `  ${pc.dim('│')}  Profile    →  ${pc.yellow(selectedProfile.label)}`,
    `  ${pc.dim('│')}  Control UI →  ${pc.cyan(dashboardUrl)}`,
    `  ${pc.dim('│')}`,
    `  ${pc.dim('│')}  ${pc.bold('Next steps')}`,
    `  ${pc.dim('│')}    1. The Control UI should already be open in your browser`,
    `  ${pc.dim('│')}    2. Drop files into the workspace folder to share with the agent`,
  ].join('\n');

  p.outro(`${pc.green('✔')} Sandbox successfully booted!${box}`);
  process.exit(0);
}

main().catch((err) => {
  logError('Unexpected top-level error', err);
  const lp = getLogPath();
  const logHint = lp ? `\n  Log: ${lp}` : '';
  p.cancel(`An unexpected error occurred.${logHint}`);
  process.exit(1);
});
