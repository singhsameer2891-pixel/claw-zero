# One-Click Claw

A Node.js CLI that installs and sandboxes the [OpenClaw](https://github.com/openclaw/openclaw) AI agent on your local Mac with zero manual configuration.

**What it does in one command:**
- Checks for Docker (installs via Homebrew if missing)
- Creates `~/Desktop/OpenClaw_Workspace`
- Generates a `clawdbot.json` security config based on your chosen profile
- Pulls `ghcr.io/openclaw/openclaw:latest` and boots it on `localhost:3845`

---

## Prerequisites

| Requirement | Notes |
|---|---|
| macOS | Homebrew auto-install is Mac-only for MVP |
| Node.js ≥ 18 | ESModules + native `fetch` |
| Docker Desktop | Auto-installed via Homebrew if absent |
| Anthropic or OpenAI API key | Entered during setup; never stored in plaintext |

---

## Quickstart

```bash
git clone <repo-url> claw_zero
cd claw_zero
npm install
npm start
```

Follow the interactive prompts — the entire setup takes under 2 minutes.

---

## Security Profiles

Choose a profile during setup. The selection writes a `clawdbot.json` to your workspace.

| Profile | Sandbox | Workspace | Human Approval Required | Skill Trust | Budget |
|---|---|---|---|---|---|
| **Fort Knox** | `all` | Read-only | All commands | None | 100k tokens |
| **Pragmatic PM** *(default)* | `non-main` | Scoped | `rm`, `sudo`, `curl`, `wget`, `git push`, `npm publish` | Verified only | 500k tokens |
| **Cowboy Coder** | `off` | Scoped | `sudo`, `rm -rf` | All | 2M tokens |
| **YOLO Mode** | `off` | Read-write | None | All | Unlimited |

---

## Container Details

| Parameter | Value |
|---|---|
| Image | `ghcr.io/openclaw/openclaw:latest` |
| Container name | `openclaw_sandbox` |
| Port | `3845` → `localhost:3845` |
| Volume mount | `~/Desktop/OpenClaw_Workspace:/workspace` |
| API key env var | `ANTHROPIC_API_KEY` |

The container runs with `--detach --rm` — it stops automatically when Docker restarts.

---

## Key Environment Variables

None required at the host level. The API key is collected interactively and passed directly to the container via `--env`.

---

## Project Structure

```
claw_zero/
├── src/
│   ├── index.ts        # Entry point — UI flow
│   ├── types.ts        # TypeScript types
│   ├── profiles.ts     # Security profile config map
│   ├── config.ts       # clawdbot.json generation
│   ├── docker.ts       # Docker detection, install, daemon start
│   ├── workspace.ts    # Workspace directory creation
│   └── container.ts    # Image pull + container launch
├── PRD.md
├── tasks.md
└── architecture.md
```

---

## Scripts

| Command | Action |
|---|---|
| `npm start` | Run the CLI via `tsx` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Same as `start` (alias) |
| `npx tsc --noEmit` | Type-check without emitting |
