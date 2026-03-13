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

    // Config messages
    'config.load_failed': 'Failed to load config: {{error}}',
    'config.not_found': 'Config not found at {{path}}, using defaults',
    'config.saved': 'Config saved to {{path}}',
    'config.deleted': 'Config deleted from {{path}}',

    // General messages
    'general.done': 'Done!',
    'general.failed': 'Failed',
    'general.skipped': 'Skipped',
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

    // Config messages
    'config.load_failed': '설정 로드 실패: {{error}}',
    'config.not_found': '{{path}}에 설정 없음, 기본값 사용',
    'config.saved': '설정 저장: {{path}}',
    'config.deleted': '설정 삭제: {{path}}',

    // General messages
    'general.done': '완료!',
    'general.failed': '실패',
    'general.skipped': '건너뜀',
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
