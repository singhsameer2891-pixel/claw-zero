# Product Requirements Document (PRD): 1-Click OpenClaw Sandbox CLI

## 1. Product Overview
**Name:** One-Click Claw (Placeholder)
**Goal:** Build a Node.js CLI tool that allows users to securely install and sandbox the OpenClaw AI agent on their local machine (Mac/PC) with zero manual configuration. 
**Problem it Solves:** OpenClaw requires complex Docker setups and exposes users to massive security risks (file deletion, prompt injection). This CLI abstracts all of that into a single, beautifully designed terminal command.

## 2. Tech Stack & UI/UX Guidelines
* **Language:** Node.js (TypeScript/ESModules preferred).
* **Terminal UI (Prompts):** `@clack/prompts` (To mimic the clean, connected-line UX of Astro and Vercel).
* **Terminal UI (Colors):** `picocolors` (Stark, high-contrast cyan, green, and dim text).
* **Task Runners:** `listr2` or `@clack/prompts` built-in spinner (For the dynamic, updating checklist during the Docker installation phase).
* **Shell Execution:** `execa` (For safely running bash/zsh commands from Node).

## 3. Security Profiles (The Core Feature)
The CLI must prompt the user to select one of these four security tiers. The selection will dictate the values written to the generated `clawdbot.json` config file.

| Profile | `sandbox.mode` | `workspaceAccess` | `require_human_approval` | `skill_registry_trust` | `max_budget` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fort Knox** | `"all"` | `"ro"` | `["*"]` | `"none"` | `100000` |
| **Pragmatic PM (Default)** | `"non-main"` | `"scoped"` | `["rm", "sudo", "curl", "wget", "git push", "npm publish"]` | `"verified_only"` | `500000` |
| **Cowboy Coder** | `"off"` | `"scoped"` | `["sudo", "rm -rf"]` | `"all"` | `2000000` |
| **YOLO Mode** | `"off"` | `"rw"` | `[]` | `"all"` | `0` (Unlimited) |

## 4. The Installation Flow (Execution Logic)
When the user runs the CLI, the script must perform the following sequence:
1. **Welcome UI:** Display an intro using `@clack/prompts`.
2. **API Key Input:** Securely ask for their Anthropic/OpenAI API key (input must be hidden/masked).
3. **Profile Selection:** Ask them to choose from the 4 Security Profiles.
4. **Environment Check:** Check if Docker is installed. If not, silently install it via Homebrew (`brew install --cask docker`) and launch the daemon.
5. **Workspace Setup:** Create `~/Desktop/OpenClaw_Workspace`.
6. **Config Generation:** Generate the `clawdbot.json` file based on their chosen security profile and save it to the workspace.
7. **Container Launch:** Execute the `docker run` command, mounting ONLY the `OpenClaw_Workspace` folder to the container.

---

## 5. Starting Code Boilerplate (For Claude Code)
*Claude: Please use this as the entry point for `index.js` to establish the visual aesthetic.*

```javascript
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { setTimeout } from 'node:timers/promises';

async function main() {
  console.clear();
  
  p.intro(`${pc.bgCyan(pc.black(' 🦞 ONE-CLICK CLAW '))} Secure Local Sandbox`);

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

  const profile = await p.select({
    message: 'Select your security profile',
    initialValue: 'pragmatic',
    options: [
      { value: 'fort_knox', label: 'Fort Knox', hint: 'Super strict. Read-only.' },
      { value: 'pragmatic', label: 'The Pragmatic PM', hint: 'Recommended. Scoped access.' },
      { value: 'cowboy', label: 'Cowboy Coder', hint: 'Lenient. Proceed with caution.' },
      { value: 'yolo', label: 'YOLO Mode', hint: 'Unrestricted. Good luck.' },
    ],
  });

  if (p.isCancel(profile)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // Visual Setup Checklist
  const s = p.spinner();
  s.start('Initializing your autonomous workspace...');
  
  // Claude: Replace these setTimeouts with actual execa system calls
  await setTimeout(1000);
  s.message('Validating API Key & generating config...');
  
  await setTimeout(1500);
  s.message('Checking Docker Daemon status...');
  
  await setTimeout(2000);
  s.message('Pulling OpenClaw container image & booting sandbox...');
  
  await setTimeout(1500);
  s.stop(pc.green('✔ Sandbox successfully booted!'));

  p.outro(`Hang tight! Pouring some coffee for your new AI intern ☕... \n\nDrop files into ${pc.cyan('~/Desktop/OpenClaw_Workspace')} to begin.`);
}

main().catch(console.error);