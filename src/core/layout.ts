/**
 * Layout and component mapping (Claude-only)
 */

/**
 * Components that can be installed
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
  rootDir: '.claude';
  entryFile: 'CLAUDE.md';
  entryTemplatePrefix: 'CLAUDE.md';
  manifestFile: 'manifest.json';
  backupDirPrefix: '.claude-backup-';
  directoryStructure: string[];
}

const CLAUDE_LAYOUT: ProviderLayout = {
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
};

export function getProviderLayout(): ProviderLayout {
  return CLAUDE_LAYOUT;
}

export function getEntryTemplateName(language: 'en' | 'ko'): string {
  return `CLAUDE.md.${language}`;
}

export function getComponentPath(component: InstallComponent): string {
  if (component === 'entry-md') {
    return 'CLAUDE.md';
  }

  if (component === 'guides') {
    return 'guides';
  }

  return `.claude/${component}`;
}
