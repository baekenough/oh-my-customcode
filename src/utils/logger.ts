/**
 * Logging utilities with i18n support
 */

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger options
 */
export interface LoggerOptions {
  /** Minimum log level to display */
  level: LogLevel;
  /** Whether to use colors */
  colors: boolean;
  /** Locale for i18n messages */
  locale: 'en' | 'ko';
  /** Custom prefix for all messages */
  prefix?: string;
  /** Whether to show timestamps */
  timestamps?: boolean;
}

/** Current logger options */
let currentOptions: LoggerOptions = {
  level: 'info',
  colors: true,
  locale: 'en',
  timestamps: false,
};

/** Log level priorities */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** ANSI color codes */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
};

/** Level-specific colors */
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.dim,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
};

/** Level-specific icons */
const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

/** i18n messages */
const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    // Install messages
    'install.start': 'Initializing oh-my-customcode...',
    'install.success': 'Successfully initialized!',
    'install.failed': 'Installation failed: {{error}}',
    'install.exists': 'Existing {{rootDir}} directory found',
    'install.backup': 'Backed up existing files to: {{path}}',
    'install.directories_created': 'Directory structure created',
    'install.component_skipped': 'Skipped {{component}} (already exists)',
    'install.component_installed': 'Installed {{component}}',
    'install.template_not_found': 'Template not found for {{component}}: {{path}}',
    'install.claude_md_installed': 'CLAUDE.md installed ({{language}})',
    'install.claude_md_not_found': 'CLAUDE.md template not found for {{language}}',
    'install.entry_md_installed': '{{entry}} installed ({{language}})',
    'install.entry_md_not_found': '{{entry}} template not found for {{language}}',
    'install.entry_md_skipped': '{{entry}} skipped ({{reason}})',
    'install.lockfile_generated': 'Lockfile generated ({{files}} files tracked)',
    'install.lockfile_failed': 'Failed to generate lockfile: {{error}}',
    'install.hook_commands_migrated':
      'Migrated {{rewritten}} hook/statusLine command(s) in settings.local.json',
    'install.hook_commands_migration_failed':
      'Failed to migrate hook commands in settings.local.json: {{error}}',

    // Lockfile internal messages
    'lockfile.not_found': 'Lockfile not found: {{path}}',
    'lockfile.invalid_version': 'Invalid lockfile version: {{path}}',
    'lockfile.invalid_structure': 'Invalid lockfile structure: {{path}}',
    'lockfile.read_failed': 'Failed to read lockfile: {{path}} — {{error}}',
    'lockfile.written': 'Lockfile written: {{path}}',
    'lockfile.component_dir_missing': 'Component directory missing: {{path}}',
    'lockfile.hash_failed': 'Failed to hash file: {{path}} — {{error}}',
    'lockfile.entry_added': 'Lockfile entry added: {{path}} ({{component}})',
    'lockfile.entry_git_excluded': 'Lockfile entry skipped (not in git listing): {{path}}',

    // Update messages
    'update.start': 'Checking for updates...',
    'update.success': 'Updated from {{from}} to {{to}}',
    'update.components_synced': 'Components synced (version {{version}}): {{components}}',
    'update.failed': 'Update failed: {{error}}',
    'update.no_updates': 'Already up to date',
    'update.backup_created': 'Backup created at: {{path}}',
    'update.dry_run': 'Would update {{component}}',
    'update.component_updated': 'Updated {{component}}',
    'update.file_applied': 'Applied update to {{path}}',
    'update.lockfile_regenerated': 'Lockfile regenerated ({{files}} files tracked)',
    'update.lockfile_failed': 'Failed to regenerate lockfile: {{error}}',
    'update.protected_file_updated': '⟳ Protected file {{file}} in {{component}} updated: {{hint}}',
    'update.namespace_synced': 'Namespace synced: {{file}} ({{component}})',
    'update.hook_commands_migrated':
      'Migrated {{count}} hook/statusLine command(s) to CLAUDE_PROJECT_DIR-anchored paths',
    'update.hook_commands_migration_failed': 'Failed to migrate hook commands in {{path}}',

    // Config messages
    'config.load_failed': 'Failed to load config: {{error}}',
    'config.not_found': 'Config not found at {{path}}, using defaults',
    'config.saved': 'Config saved to {{path}}',
    'config.deleted': 'Config deleted from {{path}}',
    'config.invalid_preserve_path': 'Ignored invalid preserve path: {{path}} ({{reason}})',

    // Info/warn messages (#1771) — keys used by info()/warn() call sites
    'codex.already_installed': 'Codex CLI is already installed',
    'codex.installing_brew': 'Installing Codex CLI via Homebrew...',
    'codex.installing_npm': 'Installing Codex CLI via npm...',
    'codex.install_failed': 'Failed to install Codex CLI: {{error}}',
    'codex.unsupported_os': 'Codex CLI auto-install is not supported on {{os}}',
    'rtk.already_installed': 'RTK is already installed',
    'rtk.installing_brew': 'Installing RTK via Homebrew...',
    'rtk.installing_curl': 'Installing RTK via install script...',
    'rtk.install_failed': 'Failed to install RTK: {{error}}',
    'rtk.unsupported_os': 'RTK auto-install is not supported on {{os}}',
    'mcp.ontology_rag_configured': 'ontology-rag MCP server configured successfully',
    'install.codex_installing': 'Installing Codex CLI...',
    'install.codex_success': 'Codex CLI installed successfully',
    'install.codex_already': 'Codex CLI is already installed',
    'install.rtk_installing': 'Installing RTK...',
    'install.rtk_success': 'RTK installed successfully',
    'install.rtk_already': 'RTK is already installed',
    'install.preserved':
      'Preserved {{files}} file(s) and {{dirs}} directory(ies) from the existing installation',
    'install.restored': 'Restored {{files}} file(s) and {{dirs}} directory(ies) after installation',
    'install.backup_failed': 'Failed to back up {{path}}: {{error}}',
    'install.hooks_settings_failed': 'Failed to merge hooks into settings.local.json: {{error}}',
    'preserve.cleanup_failed': 'Failed to clean up preservation directory {{dir}}: {{error}}',
    'preserve.extract_dir_failed': 'Failed to preserve directory {{dir}}: {{error}}',
    'preserve.extract_failed': 'Failed to preserve file {{file}}: {{error}}',
    'preserve.restore_dir_failed': 'Failed to restore directory {{dir}}: {{error}}',
    'preserve.restore_failed': 'Failed to restore file {{file}}: {{error}}',
    'preserve_files.invalid_path':
      'Ignored invalid preserve_files entry from {{source}}: {{path}} ({{reason}})',
    'update.codex_missing': 'Codex CLI is not installed',
    'update.rtk_missing': 'RTK is not installed',
    'update.self_update_skipped': 'Skipped update: source project cannot update itself',
    'update.deprecated_file_invalid_path':
      'Skipped deprecated file with invalid path: {{path}} ({{reason}})',
    'update.deprecated_file_removed': 'Removed deprecated file: {{path}} ({{reason}})',
    'update.entry_doc_created': 'Entry document created: {{path}}',
    'update.entry_doc_force_updated': 'Entry document force-updated: {{path}}',
    'update.entry_merge_warning': 'Entry document merge warning: {{warning}}',
    'update.entry_template_not_found': 'Entry document template not found: {{template}}',
    'update.protected_file_force_overwrite':
      'Protected file {{file}} in {{component}} overwritten: {{hint}}',
    'update.protected_file_skipped': 'Protected file {{file}} in {{component}} skipped: {{hint}}',
    'update.settings_local_backfill_failed':
      'Failed to backfill statusLine refreshInterval in {{path}}',

    // General messages
    'general.done': 'Done!',
    'general.failed': 'Failed',
    'general.skipped': 'Skipped',

    // Debug messages (#1771) — keys used by debug() call sites
    'install.agent_domain_excluded': 'Excluded agent {{agent}} (domain: {{domain}})',
    'install.backed_up': 'Backed up {{from}} to {{to}}',
    'install.hooks_settings_merged': 'Merged hooks wiring into settings.local.json',
    'install.hooks_settings_skipped': 'Skipped hooks wiring in settings.local.json: {{reason}}',
    'install.schemas_not_found': 'schemas/tool-inputs.json template not found: {{path}}',
    'install.schemas_skipped': 'Skipped schemas/tool-inputs.json: {{reason}}',
    'install.schemas_installed': 'Installed schemas/tool-inputs.json',
    'install.settings_local_created': 'Created settings.local.json',
    'install.settings_local_merged': 'Merged statusLine into settings.local.json',
    'install.settings_local_refreshInterval_added':
      'Added statusLine refreshInterval to settings.local.json',
    'install.settings_local_skipped': 'Skipped settings.local.json statusLine: {{reason}}',
    'install.settings_local_statusline_migrated':
      'Re-anchored default statusLine command in settings.local.json',
    'install.skill_scope_excluded': 'Excluded skill {{skill}} (scope: {{scope}})',
    'install.statusline_installed': 'Installed statusline.sh',
    'install.statusline_not_found': 'statusline.sh template not found: {{path}}',
    'install.statusline_skipped': 'Skipped statusline.sh: {{reason}}',
    'install.tests_config_installed': 'Installed tests/tsconfig.json',
    'install.tests_config_not_found': 'tests/tsconfig.json template not found: {{path}}',
    'install.tests_config_skipped': 'Skipped tests/tsconfig.json: {{reason}}',
    'preserve.cleanup': 'Cleaned up preservation directory: {{dir}}',
    'preserve.copied_json': 'Copied JSON file: {{file}}',
    'preserve.extracted_dir': 'Preserved directory: {{dir}}',
    'preserve.extracted_file': 'Preserved file: {{file}}',
    'preserve.merged_json': 'Merged JSON file: {{file}}',
    'preserve.restored_dir': 'Restored directory: {{dir}}',
    'preserve.restored_file': 'Restored file: {{file}}',
    'update.deprecated_files_cleaned': 'Removed {{count}} deprecated file(s)',
    'update.entry_doc_merged':
      'Entry document merged: {{path}} ({{managed}} managed, {{custom}} custom sections)',
    'update.file_backed_up': 'Backed up {{path}} to {{backup}}',
    'update.root_files_synced': 'Root-level files synced: {{files}}',
    'update.settings_local_refreshInterval_backfilled':
      'Backfilled statusLine refreshInterval in settings.local.json',
  },
  ko: {
    // Install messages
    'install.start': 'oh-my-customcode 초기화 중...',
    'install.success': '초기화 완료!',
    'install.failed': '설치 실패: {{error}}',
    'install.exists': '기존 {{rootDir}} 디렉토리 발견',
    'install.backup': '기존 파일 백업 완료: {{path}}',
    'install.directories_created': '디렉토리 구조 생성 완료',
    'install.component_skipped': '{{component}} 건너뜀 (이미 존재)',
    'install.component_installed': '{{component}} 설치 완료',
    'install.template_not_found': '{{component}} 템플릿 없음: {{path}}',
    'install.claude_md_installed': 'CLAUDE.md 설치 완료 ({{language}})',
    'install.claude_md_not_found': '{{language}}용 CLAUDE.md 템플릿 없음',
    'install.entry_md_installed': '{{entry}} 설치 완료 ({{language}})',
    'install.entry_md_not_found': '{{language}}용 {{entry}} 템플릿 없음',
    'install.entry_md_skipped': '{{entry}} 건너뜀 ({{reason}})',
    'install.lockfile_generated': '잠금 파일 생성 완료 ({{files}}개 파일 추적)',
    'install.lockfile_failed': '잠금 파일 생성 실패: {{error}}',
    'install.hook_commands_migrated':
      'settings.local.json의 훅/상태줄 명령 {{rewritten}}개를 마이그레이션했습니다',
    'install.hook_commands_migration_failed':
      'settings.local.json의 훅 명령 마이그레이션에 실패했습니다: {{error}}',

    // Lockfile internal messages
    'lockfile.not_found': '잠금 파일 없음: {{path}}',
    'lockfile.invalid_version': '잠금 파일 버전 유효하지 않음: {{path}}',
    'lockfile.invalid_structure': '잠금 파일 구조 유효하지 않음: {{path}}',
    'lockfile.read_failed': '잠금 파일 읽기 실패: {{path}} — {{error}}',
    'lockfile.written': '잠금 파일 기록됨: {{path}}',
    'lockfile.component_dir_missing': '컴포넌트 디렉토리 없음: {{path}}',
    'lockfile.hash_failed': '파일 해시 실패: {{path}} — {{error}}',
    'lockfile.entry_added': '잠금 파일 항목 추가: {{path}} ({{component}})',
    'lockfile.entry_git_excluded': '잠금 파일 항목 제외 (git 목록에 없음): {{path}}',

    // Update messages
    'update.start': '업데이트 확인 중...',
    'update.success': '{{from}}에서 {{to}}로 업데이트 완료',
    'update.components_synced': '컴포넌트 동기화 완료 (버전 {{version}}): {{components}}',
    'update.failed': '업데이트 실패: {{error}}',
    'update.no_updates': '이미 최신 버전입니다',
    'update.backup_created': '백업 생성됨: {{path}}',
    'update.dry_run': '{{component}} 업데이트 예정',
    'update.component_updated': '{{component}} 업데이트 완료',
    'update.file_applied': '{{path}} 업데이트 적용',
    'update.lockfile_regenerated': '잠금 파일 재생성 완료 ({{files}}개 파일 추적)',
    'update.lockfile_failed': '잠금 파일 재생성 실패: {{error}}',
    'update.protected_file_updated': '⟳ 보호 파일 {{file}} ({{component}}) 업데이트됨: {{hint}}',
    'update.namespace_synced': '네임스페이스 동기화: {{file}} ({{component}})',
    'update.hook_commands_migrated':
      'CLAUDE_PROJECT_DIR 기준 경로로 훅/상태줄 명령 {{count}}개를 마이그레이션했습니다',
    'update.hook_commands_migration_failed': '{{path}}의 훅 명령 마이그레이션에 실패했습니다',

    // Config messages
    'config.load_failed': '설정 로드 실패: {{error}}',
    'config.not_found': '{{path}}에 설정 없음, 기본값 사용',
    'config.saved': '설정 저장: {{path}}',
    'config.deleted': '설정 삭제: {{path}}',
    'config.invalid_preserve_path': '유효하지 않은 보존 경로를 무시했습니다: {{path}} ({{reason}})',

    // Info/warn messages (#1771) — keys used by info()/warn() call sites
    'codex.already_installed': 'Codex CLI가 이미 설치되어 있습니다',
    'codex.installing_brew': 'Homebrew로 Codex CLI를 설치합니다...',
    'codex.installing_npm': 'npm으로 Codex CLI를 설치합니다...',
    'codex.install_failed': 'Codex CLI 설치에 실패했습니다: {{error}}',
    'codex.unsupported_os': '{{os}}에서는 Codex CLI 자동 설치를 지원하지 않습니다',
    'rtk.already_installed': 'RTK가 이미 설치되어 있습니다',
    'rtk.installing_brew': 'Homebrew로 RTK를 설치합니다...',
    'rtk.installing_curl': '설치 스크립트로 RTK를 설치합니다...',
    'rtk.install_failed': 'RTK 설치에 실패했습니다: {{error}}',
    'rtk.unsupported_os': '{{os}}에서는 RTK 자동 설치를 지원하지 않습니다',
    'mcp.ontology_rag_configured': 'ontology-rag MCP 서버 구성을 완료했습니다',
    'install.codex_installing': 'Codex CLI를 설치합니다...',
    'install.codex_success': 'Codex CLI를 설치했습니다',
    'install.codex_already': 'Codex CLI가 이미 설치되어 있습니다',
    'install.rtk_installing': 'RTK를 설치합니다...',
    'install.rtk_success': 'RTK를 설치했습니다',
    'install.rtk_already': 'RTK가 이미 설치되어 있습니다',
    'install.preserved': '기존 설치에서 파일 {{files}}개와 디렉토리 {{dirs}}개를 보존했습니다',
    'install.restored': '설치 후 파일 {{files}}개와 디렉토리 {{dirs}}개를 복원했습니다',
    'install.backup_failed': '{{path}} 백업에 실패했습니다: {{error}}',
    'install.hooks_settings_failed': 'settings.local.json에 훅을 병합하지 못했습니다: {{error}}',
    'preserve.cleanup_failed': '보존 디렉토리 {{dir}} 정리에 실패했습니다: {{error}}',
    'preserve.extract_dir_failed': '디렉토리 {{dir}} 보존에 실패했습니다: {{error}}',
    'preserve.extract_failed': '파일 {{file}} 보존에 실패했습니다: {{error}}',
    'preserve.restore_dir_failed': '디렉토리 {{dir}} 복원에 실패했습니다: {{error}}',
    'preserve.restore_failed': '파일 {{file}} 복원에 실패했습니다: {{error}}',
    'preserve_files.invalid_path':
      '{{source}}의 유효하지 않은 preserve_files 항목을 무시했습니다: {{path}} ({{reason}})',
    'update.codex_missing': 'Codex CLI가 설치되어 있지 않습니다',
    'update.rtk_missing': 'RTK가 설치되어 있지 않습니다',
    'update.self_update_skipped':
      '업데이트를 건너뜁니다: 소스 프로젝트는 스스로 업데이트할 수 없습니다',
    'update.deprecated_file_invalid_path':
      '경로가 유효하지 않아 지원 중단 파일을 건너뜁니다: {{path}} ({{reason}})',
    'update.deprecated_file_removed': '지원 중단 파일을 삭제했습니다: {{path}} ({{reason}})',
    'update.entry_doc_created': '진입 문서를 생성했습니다: {{path}}',
    'update.entry_doc_force_updated': '진입 문서를 강제로 업데이트했습니다: {{path}}',
    'update.entry_merge_warning': '진입 문서 병합 경고: {{warning}}',
    'update.entry_template_not_found': '진입 문서 템플릿을 찾을 수 없습니다: {{template}}',
    'update.protected_file_force_overwrite':
      '{{component}}의 보호 파일 {{file}}을(를) 덮어썼습니다: {{hint}}',
    'update.protected_file_skipped':
      '{{component}}의 보호 파일 {{file}}을(를) 건너뜁니다: {{hint}}',
    'update.settings_local_backfill_failed':
      '{{path}}의 statusLine refreshInterval 보충에 실패했습니다',

    // General messages
    'general.done': '완료!',
    'general.failed': '실패',
    'general.skipped': '건너뜀',

    // Debug messages (#1771) — keys used by debug() call sites
    'install.agent_domain_excluded': '에이전트 {{agent}}을(를) 제외했습니다 (도메인: {{domain}})',
    'install.backed_up': '{{from}}을(를) {{to}}(으)로 백업했습니다',
    'install.hooks_settings_merged': 'settings.local.json에 훅 연결을 병합했습니다',
    'install.hooks_settings_skipped': 'settings.local.json의 훅 연결을 건너뜁니다: {{reason}}',
    'install.schemas_not_found': 'schemas/tool-inputs.json 템플릿을 찾을 수 없습니다: {{path}}',
    'install.schemas_skipped': 'schemas/tool-inputs.json 설치를 건너뜁니다: {{reason}}',
    'install.schemas_installed': 'schemas/tool-inputs.json을 설치했습니다',
    'install.settings_local_created': 'settings.local.json을 생성했습니다',
    'install.settings_local_merged': 'settings.local.json에 statusLine을 병합했습니다',
    'install.settings_local_refreshInterval_added':
      'settings.local.json에 statusLine refreshInterval을 추가했습니다',
    'install.settings_local_skipped': 'settings.local.json의 statusLine을 건너뜁니다: {{reason}}',
    'install.settings_local_statusline_migrated':
      'settings.local.json의 기본 statusLine 명령을 프로젝트 루트 기준으로 변경했습니다',
    'install.skill_scope_excluded': '스킬 {{skill}}을(를) 제외했습니다 (범위: {{scope}})',
    'install.statusline_installed': 'statusline.sh를 설치했습니다',
    'install.statusline_not_found': 'statusline.sh 템플릿을 찾을 수 없습니다: {{path}}',
    'install.statusline_skipped': 'statusline.sh 설치를 건너뜁니다: {{reason}}',
    'install.tests_config_installed': 'tests/tsconfig.json을 설치했습니다',
    'install.tests_config_not_found': 'tests/tsconfig.json 템플릿을 찾을 수 없습니다: {{path}}',
    'install.tests_config_skipped': 'tests/tsconfig.json 설치를 건너뜁니다: {{reason}}',
    'preserve.cleanup': '보존 디렉토리를 정리했습니다: {{dir}}',
    'preserve.copied_json': 'JSON 파일을 복사했습니다: {{file}}',
    'preserve.extracted_dir': '디렉토리를 보존했습니다: {{dir}}',
    'preserve.extracted_file': '파일을 보존했습니다: {{file}}',
    'preserve.merged_json': 'JSON 파일을 병합했습니다: {{file}}',
    'preserve.restored_dir': '디렉토리를 복원했습니다: {{dir}}',
    'preserve.restored_file': '파일을 복원했습니다: {{file}}',
    'update.deprecated_files_cleaned': '지원 중단 파일 {{count}}개를 삭제했습니다',
    'update.entry_doc_merged':
      '진입 문서를 병합했습니다: {{path}} (관리 섹션 {{managed}}개, 사용자 섹션 {{custom}}개)',
    'update.file_backed_up': '{{path}}을(를) {{backup}}(으)로 백업했습니다',
    'update.root_files_synced': '루트 수준 파일을 동기화했습니다: {{files}}',
    'update.settings_local_refreshInterval_backfilled':
      'settings.local.json의 statusLine refreshInterval을 보충했습니다',
  },
};

/**
 * Create a new logger with custom options
 */
export function createLogger(options: Partial<LoggerOptions> = {}): void {
  currentOptions = { ...currentOptions, ...options };
}

/**
 * Set the current log level
 */
export function setLogLevel(level: LogLevel): void {
  currentOptions.level = level;
}

/**
 * Set the current locale
 */
export function setLocale(locale: 'en' | 'ko'): void {
  currentOptions.locale = locale;
}

/**
 * Set whether colors are enabled
 */
export function setColors(enabled: boolean): void {
  currentOptions.colors = enabled;
}

/**
 * Get i18n message
 */
function getMessage(key: string, params?: Record<string, string>): string {
  const messages = MESSAGES[currentOptions.locale] || MESSAGES.en;
  let message = messages[key] || key;

  // Replace template variables
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      message = message.replace(new RegExp(`{{${k}}}`, 'g'), v);
    }
  }

  return message;
}

/**
 * Format a log message with colors and level
 */
function formatMessage(level: LogLevel, message: string): string {
  const parts: string[] = [];

  // Add timestamp if enabled
  if (currentOptions.timestamps) {
    const timestamp = new Date().toISOString().slice(11, 19);
    if (currentOptions.colors) {
      parts.push(`${COLORS.dim}[${timestamp}]${COLORS.reset}`);
    } else {
      parts.push(`[${timestamp}]`);
    }
  }

  // Add prefix if set
  if (currentOptions.prefix) {
    if (currentOptions.colors) {
      parts.push(`${COLORS.cyan}[${currentOptions.prefix}]${COLORS.reset}`);
    } else {
      parts.push(`[${currentOptions.prefix}]`);
    }
  }

  // Add level indicator
  if (currentOptions.colors) {
    const color = LEVEL_COLORS[level];
    const icon = LEVEL_ICONS[level];
    parts.push(`${color}${icon}${COLORS.reset}`);
  } else {
    parts.push(`[${level.toUpperCase()}]`);
  }

  // Add message
  if (currentOptions.colors && level === 'error') {
    parts.push(`${COLORS.red}${message}${COLORS.reset}`);
  } else if (currentOptions.colors && level === 'warn') {
    parts.push(`${COLORS.yellow}${message}${COLORS.reset}`);
  } else {
    parts.push(message);
  }

  return parts.join(' ');
}

/**
 * Check if a log level should be displayed
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentOptions.level];
}

/**
 * Log a debug message
 */
export function debug(messageKey: string, params?: Record<string, string>): void {
  if (shouldLog('debug')) {
    const message = getMessage(messageKey, params);
    console.debug(formatMessage('debug', message));
  }
}

/**
 * Log an info message
 */
export function info(messageKey: string, params?: Record<string, string>): void {
  if (shouldLog('info')) {
    const message = getMessage(messageKey, params);
    console.info(formatMessage('info', message));
  }
}

/**
 * Log a warning message
 */
export function warn(messageKey: string, params?: Record<string, string>): void {
  if (shouldLog('warn')) {
    const message = getMessage(messageKey, params);
    console.warn(formatMessage('warn', message));
  }
}

/**
 * Log an error message
 */
export function error(messageKey: string, params?: Record<string, string>): void {
  if (shouldLog('error')) {
    const message = getMessage(messageKey, params);
    console.error(formatMessage('error', message));
  }
}

/**
 * Log a success message (always shown, uses info level)
 */
export function success(messageKey: string, params?: Record<string, string>): void {
  if (shouldLog('info')) {
    const message = getMessage(messageKey, params);
    if (currentOptions.colors) {
      console.info(`${COLORS.green}✓${COLORS.reset} ${message}`);
    } else {
      console.info(`[SUCCESS] ${message}`);
    }
  }
}

/**
 * Log a raw message without formatting (respects log level)
 */
export function raw(level: LogLevel, message: string): void {
  if (shouldLog(level)) {
    console.log(message);
  }
}

/**
 * Create a progress indicator
 */
export function progress(current: number, total: number, message?: string): void {
  if (!shouldLog('info')) return;

  const percentage = Math.round((current / total) * 100);
  const barLength = 20;
  const filled = Math.round((current / total) * barLength);
  const empty = barLength - filled;

  let bar: string;
  if (currentOptions.colors) {
    bar = `${COLORS.green}${'█'.repeat(filled)}${COLORS.dim}${'░'.repeat(empty)}${COLORS.reset}`;
  } else {
    bar = `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
  }

  const text = message ? ` ${message}` : '';
  process.stdout.write(`\r${bar} ${percentage}%${text}`);

  if (current === total) {
    process.stdout.write('\n');
  }
}

/**
 * Create a spinner (returns stop function)
 */
export function spinner(message: string): () => void {
  if (!shouldLog('info') || !currentOptions.colors) {
    console.log(message);
    return () => {};
  }

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;

  const interval = setInterval(() => {
    const frame = frames[frameIndex];
    process.stdout.write(`\r${COLORS.cyan}${frame}${COLORS.reset} ${message}`);
    frameIndex = (frameIndex + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(interval);
    process.stdout.write(`\r${COLORS.green}✓${COLORS.reset} ${message}\n`);
  };
}

/**
 * Log a table of data
 */
export function table(
  headers: string[],
  rows: string[][],
  options: { padding?: number } = {}
): void {
  if (!shouldLog('info')) return;

  const padding = options.padding || 2;

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map((r) => (r[i] || '').length));
    return Math.max(h.length, maxRowWidth);
  });

  // Format header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i] + padding)).join('');

  const separator = widths.map((w) => '-'.repeat(w + padding)).join('');

  // Output
  if (currentOptions.colors) {
    console.log(`${COLORS.bold}${headerLine}${COLORS.reset}`);
  } else {
    console.log(headerLine);
  }
  console.log(separator);

  for (const row of rows) {
    const line = row.map((cell, i) => (cell || '').padEnd(widths[i] + padding)).join('');
    console.log(line);
  }
}

/**
 * Add a message to i18n dictionary (for extensions)
 */
export function addMessages(locale: 'en' | 'ko', messages: Record<string, string>): void {
  Object.assign(MESSAGES[locale], messages);
}

/**
 * Get current logger options
 */
export function getLoggerOptions(): LoggerOptions {
  return { ...currentOptions };
}
