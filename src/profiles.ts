import type { SecurityProfile } from './types.js';

export const PROFILES: Record<string, SecurityProfile> = {
  fort_knox: {
    key: 'fort_knox',
    label: 'Fort Knox',
    config: {
      sandbox: { mode: 'all' },
      workspaceAccess: 'ro',
      require_human_approval: ['*'],
      skill_registry_trust: 'none',
      max_budget: 100000,
    },
  },
  pragmatic: {
    key: 'pragmatic',
    label: 'The Pragmatic PM',
    config: {
      sandbox: { mode: 'non-main' },
      workspaceAccess: 'scoped',
      require_human_approval: ['rm', 'sudo', 'curl', 'wget', 'git push', 'npm publish'],
      skill_registry_trust: 'verified_only',
      max_budget: 500000,
    },
  },
  cowboy: {
    key: 'cowboy',
    label: 'Cowboy Coder',
    config: {
      sandbox: { mode: 'off' },
      workspaceAccess: 'scoped',
      require_human_approval: ['sudo', 'rm -rf'],
      skill_registry_trust: 'all',
      max_budget: 2000000,
    },
  },
  yolo: {
    key: 'yolo',
    label: 'YOLO Mode',
    config: {
      sandbox: { mode: 'off' },
      workspaceAccess: 'rw',
      require_human_approval: [],
      skill_registry_trust: 'all',
      max_budget: 0, // 0 = unlimited
    },
  },
};
