# Developer Setup Guide

## Prerequisites

- **Node.js** ≥ 18
- **Docker Desktop** for Mac
- An Anthropic API key (`sk-ant-...`)

## Clone & Install

```bash
git clone <repo-url> && cd claw_zero
npm install
```

## Run Locally

```bash
npm start          # Interactive CLI — walks through profile selection + container boot
npm run dev        # Watch mode (auto-restart on file changes)
npm run build      # Compile TypeScript → dist/
```

## E2E Testing with Playwright

### First-time setup

Playwright and Chromium are installed as dev dependencies. After `npm install`, download the browser binary:

```bash
npx playwright install chromium
```

### Running e2e tests

1. **Start the OpenClaw container first** — run `npm start` and complete the setup flow so the container is running on `http://127.0.0.1:18789`.
2. **Run the tests:**

```bash
npm run test:e2e
```

This launches Chromium (headless) against the running container and verifies:

- Canvas dashboard loads at `/__openclaw__/canvas/`
- HTTP response is 200
- No console errors in the browser

### Debugging tests

```bash
npx playwright test --headed        # Run with visible browser
npx playwright test --debug          # Step-through debugger
npx playwright show-report           # View HTML report after a run
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (entered interactively at runtime) |

## Project Structure

```
src/
├── index.ts        # CLI entry point + UI flow
├── types.ts        # TypeScript types for profiles/config
├── profiles.ts     # Security profile definitions
├── config.ts       # clawdbot.json generation
├── docker.ts       # Docker detection, install, daemon management
├── container.ts    # Container pull, launch, stop
├── workspace.ts    # Workspace directory creation
├── network.ts      # Internet speed check + download manifest
└── logger.ts       # Session log file

tests/
└── e2e/
    └── dashboard.spec.ts   # Playwright e2e test for canvas UI
```
