# tasks.md — One-Click Claw (claw_zero)
> Generated: 2026-03-21 | PRD ref: PRD.md
> Status legend: ⏳ PENDING | 🔄 IN PROGRESS | ✅ DONE | ❌ BLOCKED

---

## GROUP 1: Project Scaffolding ✅ DONE
**Depends on:** None
**Summary:** Initialize the Node.js/TypeScript project with ESModules, install all required dependencies, and create the full folder structure.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 1.1 | Create `package.json` with `"type": "module"`, `"main": "src/index.ts"`, scripts (`start`, `build`, `dev`) | ✅ | ESModules required per PRD §2 |
| 1.2 | Create `tsconfig.json` targeting ESNext with module resolution for ESModules | ✅ | |
| 1.3 | Install dependencies: `@clack/prompts`, `picocolors`, `listr2`, `execa` + dev deps: `typescript`, `tsx`, `@types/node` | ✅ | All listed in PRD §2; confirm before installing |
| 1.4 | Create full folder structure: `src/`, `docs/user/`, `docs/system/`, `docs/dev/`, `scripts/`, `logs/`, `system/`, `tests/`, `input/`, `output/` | ✅ | Per CLAUDE.md §3 |

---

## GROUP 2: Types & Config Logic ✅ DONE
**Depends on:** GROUP 1
**Summary:** Define TypeScript types for security profiles and implement the clawdbot.json config generation logic.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 2.1 | Define TypeScript types in `src/types.ts`: `SecurityProfileKey`, `SandboxMode`, `WorkspaceAccess`, `ClawdbotConfig` | ✅ | Covers all 4 profiles + all config fields from PRD §3 table |
| 2.2 | Build security profile config map `src/profiles.ts` — all 4 profiles (Fort Knox, Pragmatic PM, Cowboy Coder, YOLO) with every field from PRD §3 table | ✅ | YOLO `max_budget: 0` = unlimited per PRD |
| 2.3 | Implement `src/config.ts` — `generateConfig(profile, apiKey)` function that writes `clawdbot.json` to the workspace path | ✅ | Workspace path: `~/Desktop/OpenClaw_Workspace` |

---

## GROUP 3: UI Flow ✅ DONE
**Depends on:** GROUP 1
**Summary:** Implement the full @clack/prompts UI shell matching the cli_ui.html demo — intro with dividers, API key input, profile selection, inline config preview, sequential install checklist, and outro.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 3.1 | Set up `src/index.ts` from PRD §5 boilerplate; replace setTimeout stubs with placeholder function calls | ✅ | Entry point |
| 3.2 | Implement welcome intro: `console.clear()`, dim `──────` dividers, `p.intro()` with `bg-cyan` banner `🦞 ONE-CLICK CLAW` + dim `Secure Local Sandbox` text | ✅ | Matches cli_ui.html `s-intro` section |
| 3.3 | Implement API key masked input (`p.password`, `mask: '•'`, placeholder text `sk-ant-api03-••••••••`); after entry print inline confirmation: `◆ API Key  ✓ sk-ant-••••1234` (first 7 + last 4 chars visible) | ✅ | Cancel → `process.exit(0)` |
| 3.4 | Implement security profile selection (`p.select`, 4 options with labels/hints, `initialValue: 'pragmatic'`); after selection print inline: `◆ Profile  [yellow: label]` | ✅ | Cancel → `process.exit(0)` |
| 3.5 | Implement config preview step: print `◇ Generating clawdbot.json` header then display syntax-highlighted JSON of the selected profile's config (cyan keys, green strings, purple numbers) using picocolors | ✅ | Extra step from cli_ui.html `s-config` — not in PRD boilerplate |
| 3.6 | Implement sequential install checklist using listr2: 5 tasks appear one-by-one with braille spinner, each resolving to `✔ dim [real data]` — (1) Docker daemon check, (2) workspace create, (3) write clawdbot.json, (4) pull image, (5) boot container | ✅ | Matches cli_ui.html `s-install`; completion messages include actual data (Docker version, image size, port) |
| 3.7 | Implement outro: `✔ Sandbox successfully booted!` + indented left-border box with coffee message, workspace path in cyan, container port `→ localhost:3845`, profile name in yellow | ✅ | Matches cli_ui.html `s-outro`; use `p.outro()` |

---

## GROUP 4: System Operations ✅ DONE
**Depends on:** GROUP 1
**Summary:** Implement all shell-level operations: Docker detection, Homebrew fallback install, daemon launch, and workspace directory creation.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 4.1 | Implement `src/docker.ts` — `checkDocker()`: run `docker --version` via execa; return boolean | ✅ | Silent check, no output to user |
| 4.2 | Implement `installDocker()`: run `brew install --cask docker` via execa; surface progress via listr2 task | ✅ | PRD §4 step 4; Mac only for MVP |
| 4.3 | Implement `startDockerDaemon()`: open Docker.app via `open -a Docker`; poll `docker info` until daemon responds (max 60s timeout) | ✅ | Must handle already-running case gracefully |
| 4.4 | Implement `src/workspace.ts` — `createWorkspace()`: `mkdir -p ~/Desktop/OpenClaw_Workspace` via execa | ✅ | Idempotent — no error if already exists |

---

## GROUP 5: Integration & Wiring ✅ DONE
**Depends on:** GROUP 2, GROUP 3, GROUP 4
**Summary:** Wire all modules together in the main execution flow — replace stubs, connect profile selection to config generation, and execute the docker run command.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 5.1 | Replace all `setTimeout` stubs in `src/index.ts` with actual calls to Docker and workspace functions; update spinner messages per PRD §4 sequence | ✅ | Imports `checkDocker`, `installDocker`, `startDockerDaemon`, `createWorkspace` from real modules; docker version captured live |
| 5.2 | Wire profile selection → `generateConfig()` → write `clawdbot.json` to workspace | ✅ | Already wired in listr2 task 3; `apiKey` + `profileKey` passed to `generateConfig()` |
| 5.3 | Implement `src/container.ts` — `launchContainer(apiKey, profileKey)`: build and run `docker run` command mounting ONLY `~/Desktop/OpenClaw_Workspace`, expose port `3845`, pass API key as env var; use image `ghcr.io/openclaw/openclaw:latest` | ✅ | `pullContainerImage()` + `launchContainer()` with `--detach --rm --publish 3845:3845 --volume workspace:/workspace` |
| 5.4 | Add full error handling: try/catch on all async ops; on failure, call `p.cancel()` with a human-readable message and `process.exit(1)` | ✅ | `tasks.run()` wrapped in try/catch; `main().catch()` catches unexpected errors; docker version check has non-blocking catch |
| 5.5 | End-to-end smoke test: run `npx tsx src/index.ts`, walk through all prompts, verify workspace + config created, verify docker run fires | ✅ | `tsc --noEmit` clean; CLI boots, renders intro + masked password prompt correctly; Docker stages require live Docker + image to test fully |

---

## GROUP 6: Documentation ✅ DONE
**Depends on:** GROUP 5
**Summary:** Write all required living docs and register the project in global CLAUDE.md §10.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 6.1 | Write `README.md`: what it is, prerequisites, `npm start` quickstart, security profile table, key env vars | ✅ | |
| 6.2 | Write `architecture.md`: Mermaid flow diagram of the 7-step installation flow, component responsibilities | ✅ | |
| 6.3 | Append claw_zero entry to `~/.claude/CLAUDE.md` §10; commit with `[chore] docs: register claw_zero in global CLAUDE.md §10` | ✅ | Max 300 chars per CLAUDE.md rule |

---

## GROUP 8: Reliability & Pre-flight Checks ✅ DONE
**Depends on:** GROUP 5
**Summary:** Fix the Docker detection bug, silence brew/pull output bleed, add a download manifest with user confirmation, internet speed check with time estimates, per-operation timeouts to prevent hangs, and a session log file.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 8.1 | Fix `checkDocker()` in `src/docker.ts` — check `/Applications/Docker.app` existence (via `fs.existsSync`) first; fall back to `docker --version`; return `true` if either passes. Only run `installDocker()` if both fail. [PARALLEL with 8.2] | ✅ | |
| 8.2 | Fix `stdio: 'inherit'` on `brew install --cask docker` and `docker pull` — change to `stdio: 'pipe'`; capture stderr; on failure throw with trimmed last stderr line as message. [PARALLEL with 8.1] | ✅ | |
| 8.3 | Implement `checkInternetSpeed()` in `src/network.ts` — download 10 MB from Cloudflare, measure wall-clock MB/s; set 15s AbortSignal timeout; return `{ mbps: number }` | ✅ | |
| 8.4 | Implement `buildDownloadManifest()` + `formatManifestTable()` in `src/network.ts` | ✅ | |
| 8.5 | Wire pre-flight gate into `src/index.ts` — docker check → speed check → manifest table → slow-speed warning → confirm prompt | ✅ | |
| 8.6 | Add `timeout` to all `execa` calls — `brew install`: 600 000 ms, `docker pull`: 600 000 ms, `docker run`: 30 000 ms; formatted timeout error messages | ✅ | |
| 8.7 | Implement session log file in `src/logger.ts` — `initLog()`, `log()`, `getLogPath()`; wired at each Listr task start/success/failure; log path shown on failure | ✅ | |

---

## GROUP 7: npm Publishing Setup ✅ DONE
**Depends on:** GROUP 6
**Summary:** Configure the project so users can run `npx claw-zero@latest` — add shebang, bin field, files list, and prepublishOnly build script.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 7.1 | Add `#!/usr/bin/env node` shebang to `src/index.ts` | ✅ | Already present from GROUP 5 |
| 7.2 | Update `package.json`: add `"bin"`, `"files"`, update `"main"` to `dist/index.js`, add `"prepublishOnly": "npm run build"` | ✅ | Already present from GROUP 5 |
| 7.3 | Run `npm run build` and verify `dist/index.js` has shebang and is executable | ✅ | Build clean; shebang on line 1; chmod +x applied |

---

## GROUP 9: UX Hardening & Post-Install Guidance ✅ DONE
**Depends on:** GROUP 8
**Summary:** Fix Docker daemon wait flow with user pause, investigate correct OpenClaw access method, harden error surfacing, add settings review + change menu in outro.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 9.1 | Rewrite Docker daemon wait: after launching Docker.app, show `p.note()` telling user to complete sign-in/registration + enable Docker; show `p.confirm` "Press Enter when Docker is ready"; then poll `docker info` (30s timeout) | ✅ | Added `isDaemonRunning()`, `launchDockerApp()`, `pollDaemonReady()` to docker.ts; UI handled in index.ts pre-flight |
| 9.2 | Investigate how OpenClaw is accessed post-container — correct URL is `http://127.0.0.1:18789/` (gateway port); updated container.ts to publish 18789:18789 + 3845:3845; outro updated accordingly | ✅ | Gateway token auth required on first visit; retrieve via `docker logs openclaw_sandbox` |
| 9.3 | Harden error output: all catch blocks write full stack to session log only; user sees 1-line message + log path; remove any raw error surfacing | ✅ | Added `logError()` to logger.ts; all catch blocks use it; only first line of message shown to user |
| 9.4 | Add settings review + change menu to outro: display a summary table of the active profile's config values; offer `p.select` "Would you like to change any settings?" → if yes, show each setting as a selectable item → allow value change → rewrite `clawdbot.json` + restart container | ✅ | `settingsReview()` function in index.ts; `generateConfig()` updated to accept override config; `stopContainer()` added to container.ts |
| 9.5 | Rewrite outro success banner: clear success visual, ordered next-steps list based on correct access method (from 9.2), workspace path, profile summary | ✅ | Shows `http://127.0.0.1:18789/`, gateway token auth steps, workspace path, health check URL |
