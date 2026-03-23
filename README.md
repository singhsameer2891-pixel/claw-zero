# Claw Zero

**Secure AI sandbox in one command.** Docker-isolated [OpenClaw](https://github.com/openclaw/openclaw) agent with zero manual configuration.

```bash
npx claw-zero
```

That's it. Claw Zero handles Docker installation, container setup, security config, and browser launch — all in a single interactive CLI session.

---

## What It Does

```
npx claw-zero
  │
  ├─ Detects Docker state (installed / missing / broken)
  ├─ Installs or repairs Docker Desktop via Homebrew if needed
  ├─ Creates ~/Desktop/OpenClaw_Workspace
  ├─ Generates clawdbot.json (security config based on chosen profile)
  ├─ Pulls ghcr.io/openclaw/openclaw:latest
  ├─ Boots container on localhost
  └─ Opens the Control UI in your browser
```

## Security Profiles

Choose a profile during setup. Each profile writes a `clawdbot.json` that controls what the AI agent can do inside the sandbox.

| Profile | Sandbox | Workspace | Human Approval Required | Skill Trust | Budget |
|---|---|---|---|---|---|
| **Fort Knox** | `all` | Read-only | All commands | None | 100k tokens |
| **Pragmatic PM** *(default)* | `non-main` | Scoped | `rm`, `sudo`, `curl`, `wget`, `git push`, `npm publish` | Verified only | 500k tokens |
| **Cowboy Coder** | `off` | Scoped | `sudo`, `rm -rf` | All | 2M tokens |
| **YOLO Mode** | `off` | Read-write | None | All | Unlimited |

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **macOS** | Homebrew auto-install is Mac-only |
| **Node.js >= 18** | ESModules + native `fetch` |
| **Docker Desktop** | Auto-installed if absent |
| **API key** | Anthropic or OpenAI — entered during setup, never stored in plaintext |

---

## Install & Run

### Option 1: npx (no install)

```bash
npx claw-zero
```

### Option 2: Global install

```bash
npm install -g claw-zero
claw-zero
```

### Option 3: From source

```bash
git clone https://github.com/singhsameer2891-pixel/claw-zero.git
cd claw-zero
npm install
npm start
```

---

## How It Handles Docker

Claw Zero detects four possible Docker states and handles each automatically:

| State | What Claw Zero Sees | Action |
|---|---|---|
| **Installed & running** | `docker info` responds | Proceed directly |
| **Installed, not running** | `.app` exists, daemon offline | Launch Docker Desktop, wait for daemon |
| **Partially uninstalled** | Leftover symlinks/metadata, broken `.app` | Clean artifacts, reinstall via Homebrew |
| **Not installed** | Nothing found | Fresh `brew install --cask docker` |

The CLI runs interactively so you can provide your password if Homebrew needs `sudo` for privileged helpers.

---

## Container Details

| Parameter | Value |
|---|---|
| Image | `ghcr.io/openclaw/openclaw:latest` |
| Container name | `openclaw_sandbox` |
| Port | Auto-assigned → `localhost:<port>` |
| Volume mount | `~/Desktop/OpenClaw_Workspace:/workspace` |
| API key | Passed via `--env`, never written to disk |

The container runs with `--detach --rm` — it stops automatically when Docker restarts.

---

## Project Structure

```
claw-zero/
├── src/
│   ├── index.ts        # Entry point — interactive UI flow
│   ├── docker.ts       # Docker detection, install, repair, daemon management
│   ├── container.ts    # Image pull, container launch, pairing
│   ├── network.ts      # Speed test, download manifest
│   ├── config.ts       # clawdbot.json generation
│   ├── workspace.ts    # Workspace directory creation
│   ├── profiles.ts     # Security profile definitions
│   ├── logger.ts       # Session logging
│   └── types.ts        # TypeScript types
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js + TypeScript (ESModules) |
| CLI UI | [@clack/prompts](https://github.com/natemoo-re/clack) + [picocolors](https://github.com/alexeyraspopov/picocolors) |
| Process exec | [execa](https://github.com/sindresorhus/execa) |
| Containerisation | Docker Desktop via Homebrew |

---

## Author

**Sameer Singh** — [github.com/singhsameer2891-pixel](https://github.com/singhsameer2891-pixel)

---

## License

MIT
