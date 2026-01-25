/**
 * Translation key types for type-safe i18n
 */

export interface TranslationKeys {
  // Common messages
  common: {
    success: string;
    error: string;
    warning: string;
    info: string;
    loading: string;
    done: string;
    cancelled: string;
    confirm: string;
    yes: string;
    no: string;
    help: string;
    version: string;
    notFound: string;
    invalidInput: string;
    permissionDenied: string;
    networkError: string;
    unknownError: string;
  };

  // Init command messages
  init: {
    description: string;
    starting: string;
    success: string;
    alreadyInitialized: string;
    configCreated: string;
    directoryCreated: string;
    skippingExisting: string;
    selectTemplate: string;
    templateNotFound: string;
    initializingTemplate: string;
    promptOverwrite: string;
    aborted: string;
  };

  // Update command messages
  update: {
    description: string;
    starting: string;
    checking: string;
    success: string;
    noUpdates: string;
    updateAvailable: string;
    updating: string;
    updated: string;
    updateFailed: string;
    currentVersion: string;
    latestVersion: string;
    changelog: string;
    promptUpdate: string;
    skipped: string;
  };

  // List command messages
  list: {
    description: string;
    loading: string;
    noAgents: string;
    agentCount: string;
    name: string;
    type: string;
    status: string;
    version: string;
    path: string;
    enabled: string;
    disabled: string;
    installed: string;
    available: string;
    corrupted: string;
    filterBy: string;
    showAll: string;
  };

  // Doctor command messages
  doctor: {
    description: string;
    running: string;
    checkingConfig: string;
    checkingAgents: string;
    checkingDependencies: string;
    checkingPermissions: string;
    checkingNetwork: string;
    allPassed: string;
    issuesFound: string;
    issue: string;
    fix: string;
    autoFix: string;
    manualFix: string;
    configValid: string;
    configInvalid: string;
    configMissing: string;
    agentsValid: string;
    agentsInvalid: string;
    dependenciesMet: string;
    dependenciesMissing: string;
    permissionsOk: string;
    permissionsIssue: string;
    networkOk: string;
    networkIssue: string;
    repairPrompt: string;
    repairing: string;
    repaired: string;
    repairFailed: string;
  };

  // CLI general messages
  cli: {
    description: string;
    usage: string;
    commands: string;
    options: string;
    examples: string;
    moreInfo: string;
    invalidCommand: string;
    missingArgument: string;
    unknownOption: string;
  };
}

/**
 * Flat translation key paths for t() function
 * e.g., 'common.success', 'init.starting', etc.
 */
export type TranslationKey = FlattenKeys<TranslationKeys>;

/**
 * Helper type to flatten nested object keys into dot notation
 */
type FlattenKeys<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? FlattenKeys<T[K], `${Prefix}${K}.`>
          : `${Prefix}${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Supported languages
 */
export type SupportedLanguage = 'en' | 'ko';

/**
 * Language configuration
 */
export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
