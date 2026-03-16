/**
 * Interactive setup wizard for omcustom init command
 */

import * as p from '@clack/prompts';
import i18next from 'i18next';

export interface WizardResult {
  lang: 'en' | 'ko';
  domain: string | undefined;
  teamMode: boolean;
  cancelled: boolean;
}

export interface WizardOptions {
  yes?: boolean;
  lang?: string;
  domain?: string;
}

/**
 * Determine if the wizard should run interactively.
 * Returns false when: --yes flag, non-TTY stdout, CI environment.
 */
export function isInteractiveMode(yes?: boolean): boolean {
  if (yes) return false;
  if (!process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  if (process.env.GITHUB_ACTIONS) return false;
  return true;
}

/**
 * Build a non-interactive default result from CLI options.
 */
export function getDefaultWizardResult(options: WizardOptions): WizardResult {
  return {
    lang: (options.lang as 'en' | 'ko') || 'en',
    domain: options.domain,
    teamMode: false,
    cancelled: false,
  };
}

/** Cancelled sentinel result */
function cancelResult(lang: 'en' | 'ko' = 'en', domain?: string): WizardResult {
  p.outro(i18next.t('cli.init.wizard.cancelled'));
  return { lang, domain: domain ?? undefined, teamMode: false, cancelled: true };
}

/** Step 1: Prompt for language selection */
async function promptLang(options: WizardOptions): Promise<{ lang: 'en' | 'ko' } | null> {
  if (options.lang === 'en' || options.lang === 'ko') {
    return { lang: options.lang };
  }
  const result = await p.select({
    message: i18next.t('cli.init.wizard.langPrompt'),
    options: [
      { value: 'ko', label: '한국어' },
      { value: 'en', label: 'English' },
    ],
  });
  if (p.isCancel(result)) return null;
  return { lang: result as 'en' | 'ko' };
}

/** Step 2: Prompt for domain selection */
async function promptDomain(
  options: WizardOptions
): Promise<{ domain: string | undefined } | null> {
  if (options.domain) {
    return { domain: options.domain === 'all' ? undefined : options.domain };
  }
  const result = await p.select({
    message: i18next.t('cli.init.wizard.domainPrompt'),
    options: [
      { value: 'all', label: i18next.t('cli.init.wizard.domainAll') },
      { value: 'backend', label: i18next.t('cli.init.wizard.domainBackend') },
      { value: 'frontend', label: i18next.t('cli.init.wizard.domainFrontend') },
      { value: 'data-engineering', label: i18next.t('cli.init.wizard.domainDataEngineering') },
      { value: 'devops', label: i18next.t('cli.init.wizard.domainDevops') },
    ],
  });
  if (p.isCancel(result)) return null;
  return { domain: result === 'all' ? undefined : (result as string) };
}

/** Step 3: Prompt for team mode */
async function promptTeamMode(): Promise<{ teamMode: boolean } | null> {
  const result = await p.confirm({
    message: i18next.t('cli.init.wizard.teamModePrompt'),
    initialValue: false,
  });
  if (p.isCancel(result)) return null;
  return { teamMode: result as boolean };
}

/**
 * Run the interactive setup wizard.
 * Falls back to defaults when running non-interactively.
 */
export async function runInitWizard(options: WizardOptions): Promise<WizardResult> {
  if (!isInteractiveMode(options.yes)) {
    return getDefaultWizardResult(options);
  }

  p.intro(i18next.t('cli.init.wizard.welcome'));

  const langStep = await promptLang(options);
  if (!langStep) return cancelResult();
  const { lang } = langStep;

  const domainStep = await promptDomain(options);
  if (!domainStep) return cancelResult(lang);
  const { domain } = domainStep;

  const teamModeStep = await promptTeamMode();
  if (!teamModeStep) return cancelResult(lang, domain);
  const { teamMode } = teamModeStep;

  p.outro(i18next.t('cli.init.wizard.confirm'));
  return { lang, domain, teamMode, cancelled: false };
}
