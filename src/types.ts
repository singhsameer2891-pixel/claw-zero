export type SecurityProfileKey = 'fort_knox' | 'pragmatic' | 'cowboy' | 'yolo';

export type SandboxMode = 'all' | 'non-main' | 'off';

export type WorkspaceAccess = 'ro' | 'scoped' | 'rw';

export type SkillRegistryTrust = 'none' | 'verified_only' | 'all';

export interface ClawdbotConfig {
  sandbox: {
    mode: SandboxMode;
  };
  workspaceAccess: WorkspaceAccess;
  require_human_approval: string[];
  skill_registry_trust: SkillRegistryTrust;
  max_budget: number;
}

export interface SecurityProfile {
  key: SecurityProfileKey;
  label: string;
  config: ClawdbotConfig;
}
