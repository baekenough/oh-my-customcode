/**
 * Provider-specific layout and component mapping
 */

export type LlmProvider = 'claude' | 'codex';
export type ProviderPreference = LlmProvider | 'auto';

/**
 * Components that can be installed
 * Provider-neutral naming (entry-md = CLAUDE.md or AGENTS.md)
 */
export type InstallComponent =
  | 'entry-md'
  | 'rules'
  | 'agents'
  | 'skills'
  | 'guides'
  | 'hooks'
  | 'contexts';

export interface ProviderLayout {
  provider: LlmProvider;
  rootDir: '.claude' | '.codex';
  entryFile: 'CLAUDE.md' | 'AGENTS.md';
  entryTemplatePrefix: 'CLAUDE.md' | 'AGENTS.md';
  manifestFile: 'manifest.json' | 'manifest.codex.json';
  backupDirPrefix: '.claude-backup-' | '.codex-backup-';
  directoryStructure: string[];
}

const PROVIDER_LAYOUTS: Record<LlmProvider, ProviderLayout> = {
  claude: {
    provider: 'claude',
    rootDir: '.claude',
    entryFile: 'CLAUDE.md',
    entryTemplatePrefix: 'CLAUDE.md',
    manifestFile: 'manifest.json',
    backupDirPrefix: '.claude-backup-',
    directoryStructure: [
      '.claude',
      '.claude/rules',
      '.claude/hooks',
      '.claude/contexts',
      '.claude/agents',
      '.claude/skills',
      'guides',
    ],
  },
  codex: {
    provider: 'codex',
    rootDir: '.codex',
    entryFile: 'AGENTS.md',
    entryTemplatePrefix: 'AGENTS.md',
    manifestFile: 'manifest.codex.json',
    backupDirPrefix: '.codex-backup-',
    directoryStructure: [
      '.codex',
      '.codex/rules',
      '.codex/hooks',
      '.codex/contexts',
      '.codex/agents',
      '.codex/skills',
      'guides',
    ],
  },
};

export function getProviderLayout(provider: LlmProvider): ProviderLayout {
  return PROVIDER_LAYOUTS[provider];
}

export function getEntryTemplateName(provider: LlmProvider, language: 'en' | 'ko'): string {
  const layout = getProviderLayout(provider);
  return `${layout.entryTemplatePrefix}.${language}`;
}

export function getComponentPath(provider: LlmProvider, component: InstallComponent): string {
  const layout = getProviderLayout(provider);

  if (component === 'entry-md') {
    return layout.entryFile;
  }

  if (component === 'guides') {
    return 'guides';
  }

  return `${layout.rootDir}/${component}`;
}

export function getDefaultProvider(): LlmProvider {
  return 'claude';
}
