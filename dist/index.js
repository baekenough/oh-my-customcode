import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/utils/fs.ts
var exports_fs = {};
__export(exports_fs, {
  writeTextFile: () => writeTextFile,
  writeJsonFile: () => writeJsonFile,
  validatePreserveFilePath: () => validatePreserveFilePath,
  resolveTemplatePath: () => resolveTemplatePath,
  resolvePath: () => resolvePath,
  remove: () => remove,
  readTextFile: () => readTextFile,
  readJsonFile: () => readJsonFile,
  normalizePath: () => normalizePath,
  move: () => move,
  listFiles: () => listFiles,
  isAbsolutePath: () => isAbsolutePath,
  getRelativePath: () => getRelativePath,
  getPackageRoot: () => getPackageRoot,
  getFileStats: () => getFileStats,
  filesAreIdentical: () => filesAreIdentical,
  fileExists: () => fileExists,
  ensureDirectory: () => ensureDirectory,
  createTempDir: () => createTempDir,
  copyFile: () => copyFile,
  copyDirectory: () => copyDirectory,
  calculateChecksum: () => calculateChecksum
});
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
function validatePreserveFilePath(filePath, projectRoot) {
  if (!filePath || filePath.trim() === "") {
    return {
      valid: false,
      reason: "Path cannot be empty"
    };
  }
  if (isAbsolute(filePath)) {
    return {
      valid: false,
      reason: "Absolute paths are not allowed"
    };
  }
  const resolvedPath = resolve(projectRoot, filePath);
  const relativePath = relative(projectRoot, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return {
      valid: false,
      reason: "Path cannot traverse outside project root"
    };
  }
  return { valid: true };
}
async function fileExists(path) {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
async function ensureDirectory(path) {
  const fs = await import("node:fs/promises");
  await fs.mkdir(path, { recursive: true });
}
function shouldSkipEntry(entryName, options) {
  if (options.exclude?.some((pattern) => matchesPattern(entryName, pattern))) {
    return true;
  }
  if (options.include && !options.include.some((pattern) => matchesPattern(entryName, pattern))) {
    return true;
  }
  return false;
}
async function handleSymlink(srcPath, destPath, options, fs) {
  const destExists = await fileExists(destPath);
  if (destExists && !options.overwrite) {
    return;
  }
  if (options.preserveSymlinks !== false) {
    await copyPreservedSymlink(srcPath, destPath, destExists, fs);
  } else {
    await copyFollowedSymlink(srcPath, destPath, destExists, options, fs);
  }
}
async function copyPreservedSymlink(srcPath, destPath, destExists, fs) {
  const linkTarget = await fs.readlink(srcPath);
  if (destExists) {
    await fs.unlink(destPath);
  }
  await fs.symlink(linkTarget, destPath);
}
async function copyFollowedSymlink(srcPath, destPath, destExists, options, fs) {
  const realPath = await fs.realpath(srcPath);
  const stat = await fs.stat(realPath);
  if (stat.isDirectory()) {
    await copyDirectory(realPath, destPath, options);
    return;
  }
  if (destExists) {
    await fs.unlink(destPath);
  }
  await fs.copyFile(realPath, destPath);
}
async function handleFile(srcPath, destPath, options, fs) {
  const destExists = await fileExists(destPath);
  if (destExists && !options.overwrite) {
    return;
  }
  await fs.copyFile(srcPath, destPath);
  if (options.preserveTimestamps) {
    const stats = await fs.stat(srcPath);
    await fs.utimes(destPath, stats.atime, stats.mtime);
  }
}
function shouldSkipPath(destPath, destRoot, skipPaths) {
  if (!skipPaths || skipPaths.length === 0) {
    return false;
  }
  const relativePath = relative(destRoot, destPath);
  for (const skipPath of skipPaths) {
    if (skipPath.endsWith("/")) {
      const dirPath = skipPath.slice(0, -1);
      if (relativePath === dirPath || relativePath.startsWith(dirPath + sep)) {
        return true;
      }
    } else {
      if (relativePath === skipPath) {
        return true;
      }
    }
  }
  return false;
}
async function copyDirectory(src, dest, options = {}) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await ensureDirectory(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name, options)) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (shouldSkipPath(destPath, dest, options.skipPaths)) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      await handleSymlink(srcPath, destPath, options, fs);
    } else if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, options);
    } else if (entry.isFile()) {
      await handleFile(srcPath, destPath, options, fs);
    }
  }
}
async function readJsonFile(path) {
  const fs = await import("node:fs/promises");
  const content = await fs.readFile(path, "utf-8");
  return JSON.parse(content);
}
async function writeJsonFile(path, data) {
  const fs = await import("node:fs/promises");
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(path, content, "utf-8");
}
async function readTextFile(path) {
  const fs = await import("node:fs/promises");
  return fs.readFile(path, "utf-8");
}
async function writeTextFile(path, content) {
  const fs = await import("node:fs/promises");
  await ensureDirectory(dirname(path));
  await fs.writeFile(path, content, "utf-8");
}
async function remove(path) {
  const fs = await import("node:fs/promises");
  const stat = await fs.stat(path);
  if (stat.isDirectory()) {
    await fs.rm(path, { recursive: true, force: true });
  } else {
    await fs.unlink(path);
  }
}
function getPackageRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  return resolve(currentDir, "..", "..");
}
function resolveTemplatePath(relativePath) {
  const packageRoot = getPackageRoot();
  return join(packageRoot, "templates", relativePath);
}
async function listFiles(dir, options = {}) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && options.recursive) {
      const subFiles = await listFiles(fullPath, options);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      if (!options.pattern || matchesPattern(entry.name, options.pattern)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}
async function getFileStats(path) {
  const fs = await import("node:fs/promises");
  const stats = await fs.stat(path);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile()
  };
}
async function copyFile(src, dest) {
  const fs = await import("node:fs/promises");
  await ensureDirectory(dirname(dest));
  await fs.copyFile(src, dest);
}
async function move(src, dest) {
  const fs = await import("node:fs/promises");
  await ensureDirectory(dirname(dest));
  await fs.rename(src, dest);
}
async function createTempDir(prefix = "omcustom-") {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tempBase = os.tmpdir();
  const tempDir = path.join(tempBase, `${prefix}${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}
async function calculateChecksum(path) {
  const fs = await import("node:fs/promises");
  const crypto = await import("node:crypto");
  const content = await fs.readFile(path);
  const hash = crypto.createHash("md5");
  hash.update(content);
  return hash.digest("hex");
}
async function filesAreIdentical(path1, path2) {
  const [checksum1, checksum2] = await Promise.all([
    calculateChecksum(path1),
    calculateChecksum(path2)
  ]);
  return checksum1 === checksum2;
}
function matchesPattern(filename, pattern) {
  const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}
function getRelativePath(basePath, fullPath) {
  return relative(basePath, fullPath);
}
function normalizePath(inputPath) {
  return inputPath.replace(/\\/g, "/");
}
function isAbsolutePath(inputPath) {
  return isAbsolute(inputPath);
}
function resolvePath(...paths) {
  return resolve(...paths);
}
var init_fs = () => {};

// src/core/config.ts
init_fs();
import { join as join2 } from "node:path";

// src/utils/logger.ts
var currentOptions = {
  level: "info",
  colors: true,
  locale: "en",
  timestamps: false
};
var LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var COLORS = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  black: "\x1B[30m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  magenta: "\x1B[35m",
  cyan: "\x1B[36m",
  white: "\x1B[37m",
  brightRed: "\x1B[91m",
  brightGreen: "\x1B[92m",
  brightYellow: "\x1B[93m",
  brightBlue: "\x1B[94m",
  brightMagenta: "\x1B[95m",
  brightCyan: "\x1B[96m"
};
var LEVEL_COLORS = {
  debug: COLORS.dim,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red
};
var LEVEL_ICONS = {
  debug: "\uD83D\uDD0D",
  info: "ℹ️",
  warn: "⚠️",
  error: "❌"
};
var MESSAGES = {
  en: {
    "install.start": "Initializing oh-my-customcode...",
    "install.success": "Successfully initialized!",
    "install.failed": "Installation failed: {{error}}",
    "install.exists": "Existing {{rootDir}} directory found",
    "install.backup": "Backed up existing files to: {{path}}",
    "install.directories_created": "Directory structure created",
    "install.component_skipped": "Skipped {{component}} (already exists)",
    "install.component_installed": "Installed {{component}}",
    "install.template_not_found": "Template not found for {{component}}: {{path}}",
    "install.claude_md_installed": "CLAUDE.md installed ({{language}})",
    "install.claude_md_not_found": "CLAUDE.md template not found for {{language}}",
    "install.entry_md_installed": "{{entry}} installed ({{language}})",
    "install.entry_md_not_found": "{{entry}} template not found for {{language}}",
    "install.entry_md_skipped": "{{entry}} skipped ({{reason}})",
    "install.lockfile_generated": "Lockfile generated ({{files}} files tracked)",
    "install.lockfile_failed": "Failed to generate lockfile: {{error}}",
    "lockfile.not_found": "Lockfile not found: {{path}}",
    "lockfile.invalid_version": "Invalid lockfile version: {{path}}",
    "lockfile.invalid_structure": "Invalid lockfile structure: {{path}}",
    "lockfile.read_failed": "Failed to read lockfile: {{path}} — {{error}}",
    "lockfile.written": "Lockfile written: {{path}}",
    "lockfile.component_dir_missing": "Component directory missing: {{path}}",
    "lockfile.hash_failed": "Failed to hash file: {{path}} — {{error}}",
    "lockfile.entry_added": "Lockfile entry added: {{path}} ({{component}})",
    "update.start": "Checking for updates...",
    "update.success": "Updated from {{from}} to {{to}}",
    "update.components_synced": "Components synced (version {{version}}): {{components}}",
    "update.failed": "Update failed: {{error}}",
    "update.no_updates": "Already up to date",
    "update.backup_created": "Backup created at: {{path}}",
    "update.dry_run": "Would update {{component}}",
    "update.component_updated": "Updated {{component}}",
    "update.file_applied": "Applied update to {{path}}",
    "update.lockfile_regenerated": "Lockfile regenerated ({{files}} files tracked)",
    "update.lockfile_failed": "Failed to regenerate lockfile: {{error}}",
    "config.load_failed": "Failed to load config: {{error}}",
    "config.not_found": "Config not found at {{path}}, using defaults",
    "config.saved": "Config saved to {{path}}",
    "config.deleted": "Config deleted from {{path}}",
    "general.done": "Done!",
    "general.failed": "Failed",
    "general.skipped": "Skipped"
  },
  ko: {
    "install.start": "oh-my-customcode 초기화 중...",
    "install.success": "초기화 완료!",
    "install.failed": "설치 실패: {{error}}",
    "install.exists": "기존 {{rootDir}} 디렉토리 발견",
    "install.backup": "기존 파일 백업 완료: {{path}}",
    "install.directories_created": "디렉토리 구조 생성 완료",
    "install.component_skipped": "{{component}} 건너뜀 (이미 존재)",
    "install.component_installed": "{{component}} 설치 완료",
    "install.template_not_found": "{{component}} 템플릿 없음: {{path}}",
    "install.claude_md_installed": "CLAUDE.md 설치 완료 ({{language}})",
    "install.claude_md_not_found": "{{language}}용 CLAUDE.md 템플릿 없음",
    "install.entry_md_installed": "{{entry}} 설치 완료 ({{language}})",
    "install.entry_md_not_found": "{{language}}용 {{entry}} 템플릿 없음",
    "install.entry_md_skipped": "{{entry}} 건너뜀 ({{reason}})",
    "install.lockfile_generated": "잠금 파일 생성 완료 ({{files}}개 파일 추적)",
    "install.lockfile_failed": "잠금 파일 생성 실패: {{error}}",
    "lockfile.not_found": "잠금 파일 없음: {{path}}",
    "lockfile.invalid_version": "잠금 파일 버전 유효하지 않음: {{path}}",
    "lockfile.invalid_structure": "잠금 파일 구조 유효하지 않음: {{path}}",
    "lockfile.read_failed": "잠금 파일 읽기 실패: {{path}} — {{error}}",
    "lockfile.written": "잠금 파일 기록됨: {{path}}",
    "lockfile.component_dir_missing": "컴포넌트 디렉토리 없음: {{path}}",
    "lockfile.hash_failed": "파일 해시 실패: {{path}} — {{error}}",
    "lockfile.entry_added": "잠금 파일 항목 추가: {{path}} ({{component}})",
    "update.start": "업데이트 확인 중...",
    "update.success": "{{from}}에서 {{to}}로 업데이트 완료",
    "update.components_synced": "컴포넌트 동기화 완료 (버전 {{version}}): {{components}}",
    "update.failed": "업데이트 실패: {{error}}",
    "update.no_updates": "이미 최신 버전입니다",
    "update.backup_created": "백업 생성됨: {{path}}",
    "update.dry_run": "{{component}} 업데이트 예정",
    "update.component_updated": "{{component}} 업데이트 완료",
    "update.file_applied": "{{path}} 업데이트 적용",
    "update.lockfile_regenerated": "잠금 파일 재생성 완료 ({{files}}개 파일 추적)",
    "update.lockfile_failed": "잠금 파일 재생성 실패: {{error}}",
    "config.load_failed": "설정 로드 실패: {{error}}",
    "config.not_found": "{{path}}에 설정 없음, 기본값 사용",
    "config.saved": "설정 저장: {{path}}",
    "config.deleted": "설정 삭제: {{path}}",
    "general.done": "완료!",
    "general.failed": "실패",
    "general.skipped": "건너뜀"
  }
};
function createLogger(options = {}) {
  currentOptions = { ...currentOptions, ...options };
}
function setLogLevel(level) {
  currentOptions.level = level;
}
function setLocale(locale) {
  currentOptions.locale = locale;
}
function getMessage(key, params) {
  const messages = MESSAGES[currentOptions.locale] || MESSAGES.en;
  let message = messages[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      message = message.replace(new RegExp(`{{${k}}}`, "g"), v);
    }
  }
  return message;
}
function formatMessage(level, message) {
  const parts = [];
  if (currentOptions.timestamps) {
    const timestamp = new Date().toISOString().slice(11, 19);
    if (currentOptions.colors) {
      parts.push(`${COLORS.dim}[${timestamp}]${COLORS.reset}`);
    } else {
      parts.push(`[${timestamp}]`);
    }
  }
  if (currentOptions.prefix) {
    if (currentOptions.colors) {
      parts.push(`${COLORS.cyan}[${currentOptions.prefix}]${COLORS.reset}`);
    } else {
      parts.push(`[${currentOptions.prefix}]`);
    }
  }
  if (currentOptions.colors) {
    const color = LEVEL_COLORS[level];
    const icon = LEVEL_ICONS[level];
    parts.push(`${color}${icon}${COLORS.reset}`);
  } else {
    parts.push(`[${level.toUpperCase()}]`);
  }
  if (currentOptions.colors && level === "error") {
    parts.push(`${COLORS.red}${message}${COLORS.reset}`);
  } else if (currentOptions.colors && level === "warn") {
    parts.push(`${COLORS.yellow}${message}${COLORS.reset}`);
  } else {
    parts.push(message);
  }
  return parts.join(" ");
}
function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentOptions.level];
}
function debug(messageKey, params) {
  if (shouldLog("debug")) {
    const message = getMessage(messageKey, params);
    console.debug(formatMessage("debug", message));
  }
}
function info(messageKey, params) {
  if (shouldLog("info")) {
    const message = getMessage(messageKey, params);
    console.info(formatMessage("info", message));
  }
}
function warn(messageKey, params) {
  if (shouldLog("warn")) {
    const message = getMessage(messageKey, params);
    console.warn(formatMessage("warn", message));
  }
}
function error(messageKey, params) {
  if (shouldLog("error")) {
    const message = getMessage(messageKey, params);
    console.error(formatMessage("error", message));
  }
}
function success(messageKey, params) {
  if (shouldLog("info")) {
    const message = getMessage(messageKey, params);
    if (currentOptions.colors) {
      console.info(`${COLORS.green}✓${COLORS.reset} ${message}`);
    } else {
      console.info(`[SUCCESS] ${message}`);
    }
  }
}

// src/core/config.ts
var CONFIG_FILE = ".omcustomrc.json";
var CURRENT_CONFIG_VERSION = 1;
function getDefaultConfig() {
  return {
    configVersion: CURRENT_CONFIG_VERSION,
    version: "0.0.0",
    language: "en",
    installedAt: "",
    lastUpdated: "",
    installedComponents: [],
    componentVersions: {},
    preferences: getDefaultPreferences(),
    sourceRepo: "https://github.com/baekenough/oh-my-customcode",
    autoUpdate: {
      enabled: false,
      checkIntervalHours: 24,
      autoApplyMinor: false
    },
    preserveFiles: [
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".claude/agent-memory/",
      ".claude/agent-memory-local/"
    ],
    customComponents: [],
    domain: undefined,
    teamMode: false
  };
}
function getDefaultPreferences() {
  return {
    logLevel: "info",
    colors: true,
    showProgress: true,
    confirmPrompts: true,
    autoBackup: true
  };
}
function getConfigPath(targetDir) {
  return join2(targetDir, CONFIG_FILE);
}
async function loadConfig(targetDir) {
  const configPath = getConfigPath(targetDir);
  if (await fileExists(configPath)) {
    try {
      const config = await readJsonFile(configPath);
      const merged = mergeConfig(getDefaultConfig(), config, targetDir);
      if (merged.configVersion < CURRENT_CONFIG_VERSION) {
        const migrated = migrateConfig(merged);
        await saveConfig(targetDir, migrated);
        return migrated;
      }
      return merged;
    } catch (err) {
      warn("config.load_failed", { error: String(err) });
      return getDefaultConfig();
    }
  }
  debug("config.not_found", { path: configPath });
  return getDefaultConfig();
}
async function saveConfig(targetDir, config) {
  const configPath = getConfigPath(targetDir);
  await ensureDirectory(targetDir);
  config.lastUpdated = new Date().toISOString();
  await writeJsonFile(configPath, config);
  debug("config.saved", { path: configPath });
}
function deduplicateCustomComponents(components) {
  const seen = new Map;
  for (const c of components) {
    seen.set(c.path, c);
  }
  return [...seen.values()];
}
function mergeConfig(defaults, overrides, targetDir) {
  let mergedPreserveFiles;
  if (overrides.preserveFiles) {
    const allFiles = [...new Set([...defaults.preserveFiles || [], ...overrides.preserveFiles])];
    if (targetDir) {
      const validatedFiles = [];
      for (const filePath of allFiles) {
        const validation = validatePreserveFilePath(filePath, targetDir);
        if (validation.valid) {
          validatedFiles.push(filePath);
        } else {
          warn("config.invalid_preserve_path", {
            path: filePath,
            reason: validation.reason ?? "Invalid path"
          });
        }
      }
      mergedPreserveFiles = validatedFiles;
    } else {
      mergedPreserveFiles = allFiles;
    }
  } else {
    mergedPreserveFiles = defaults.preserveFiles;
  }
  return {
    ...defaults,
    ...overrides,
    preferences: overrides.preferences ? { ...defaults.preferences, ...overrides.preferences } : defaults.preferences,
    autoUpdate: overrides.autoUpdate ? { ...defaults.autoUpdate, ...overrides.autoUpdate } : defaults.autoUpdate,
    componentVersions: {
      ...defaults.componentVersions,
      ...overrides.componentVersions
    },
    agents: defaults.agents || overrides.agents ? {
      ...defaults.agents,
      ...overrides.agents
    } : undefined,
    preserveFiles: mergedPreserveFiles,
    customComponents: overrides.customComponents ? deduplicateCustomComponents([
      ...defaults.customComponents || [],
      ...overrides.customComponents
    ]) : defaults.customComponents
  };
}
function migrateConfig(config) {
  const migrated = { ...config };
  if (config.configVersion < 1) {
    migrated.configVersion = 1;
    migrated.preferences = getDefaultPreferences();
    migrated.autoUpdate = {
      enabled: false,
      checkIntervalHours: 24,
      autoApplyMinor: false
    };
  }
  migrated.configVersion = CURRENT_CONFIG_VERSION;
  return migrated;
}
// src/core/git-workflow.ts
import { execFileSync } from "node:child_process";
function execGit(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined }
    }).trim();
  } catch {
    return "";
  }
}
function isGitRepo(cwd) {
  return execGit(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}
function detectDefaultBranch(cwd) {
  const remoteHead = execGit(["symbolic-ref", "refs/remotes/origin/HEAD"], cwd);
  if (remoteHead) {
    return remoteHead.replace("refs/remotes/origin/", "");
  }
  const branches = getLocalBranches(cwd);
  for (const candidate of ["main", "master", "develop"]) {
    if (branches.includes(candidate)) {
      return candidate;
    }
  }
  const head = execGit(["symbolic-ref", "--short", "HEAD"], cwd);
  if (head) {
    return head;
  }
  return "main";
}
function getLocalBranches(cwd) {
  const output = execGit(["branch", "--format=%(refname:short)"], cwd);
  if (!output)
    return [];
  return output.split(`
`).filter(Boolean);
}
function getRemoteBranches(cwd) {
  const output = execGit(["branch", "-r", "--format=%(refname:short)"], cwd);
  if (!output)
    return [];
  return output.split(`
`).filter(Boolean).map((b) => b.replace(/^origin\//, "")).filter((b) => b !== "HEAD");
}
function detectBranchPatterns(branches) {
  const prefixes = new Set;
  const knownPrefixes = ["feature", "release", "hotfix", "bugfix", "fix", "chore", "docs"];
  for (const branch of branches) {
    const slashIdx = branch.indexOf("/");
    if (slashIdx > 0) {
      const prefix = branch.substring(0, slashIdx);
      if (knownPrefixes.includes(prefix)) {
        prefixes.add(`${prefix}/*`);
      }
    }
  }
  return [...prefixes].sort();
}
function determineWorkflowType(hasDevelop, branchPatterns, allBranches) {
  const hasFlowPatterns = branchPatterns.some((p) => p === "feature/*" || p === "release/*" || p === "hotfix/*");
  if (hasDevelop && hasFlowPatterns) {
    return "git-flow";
  }
  const hasFeatureBranches = allBranches.some((b) => b.includes("/"));
  if (!hasDevelop && hasFeatureBranches) {
    return "github-flow";
  }
  if (!hasDevelop && !hasFeatureBranches) {
    return "trunk-based";
  }
  return "git-flow";
}
function detectGitWorkflow(cwd) {
  if (!isGitRepo(cwd)) {
    return null;
  }
  const localBranches = getLocalBranches(cwd);
  const remoteBranches = getRemoteBranches(cwd);
  const allBranches = [...new Set([...localBranches, ...remoteBranches])];
  const defaultBranch = detectDefaultBranch(cwd);
  const hasDevelop = localBranches.includes("develop") || remoteBranches.includes("develop");
  const branchPatterns = detectBranchPatterns(allBranches);
  const type = determineWorkflowType(hasDevelop, branchPatterns, allBranches);
  return {
    type,
    defaultBranch,
    hasDevelop,
    branchPatterns
  };
}
function renderGitWorkflowEN(result) {
  switch (result.type) {
    case "git-flow":
      return renderGitFlowEN(result);
    case "github-flow":
      return renderGithubFlowEN(result);
    case "trunk-based":
      return renderTrunkBasedEN(result);
  }
}
function renderGitWorkflowKO(result) {
  switch (result.type) {
    case "git-flow":
      return renderGitFlowKO(result);
    case "github-flow":
      return renderGithubFlowKO(result);
    case "trunk-based":
      return renderTrunkBasedKO(result);
  }
}
function renderGitFlowEN(r) {
  const lines = [
    "## Git Workflow (MUST follow)",
    "",
    "| Branch | Purpose |",
    "|--------|---------|",
    `| \`${r.defaultBranch}\` | Main development branch (default) |`
  ];
  if (r.branchPatterns.includes("feature/*")) {
    lines.push(`| \`feature/*\` | New features -> PR to ${r.defaultBranch} |`);
  }
  if (r.branchPatterns.includes("release/*")) {
    lines.push("| `release/*` | Release preparation -> **npm publish here only** |");
  }
  if (r.branchPatterns.includes("hotfix/*")) {
    lines.push(`| \`hotfix/*\` | Critical fixes -> tag -> publish -> merge to ${r.defaultBranch} |`);
  }
  if (r.branchPatterns.includes("bugfix/*")) {
    lines.push(`| \`bugfix/*\` | Bug fixes -> PR to ${r.defaultBranch} |`);
  }
  lines.push("");
  lines.push("**Key rules:**");
  lines.push(`- Create feature branches from \`${r.defaultBranch}\``);
  lines.push("- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`");
  lines.push('- Include "Closes #N" in commit message to auto-close issues');
  return lines.join(`
`);
}
function renderGithubFlowEN(r) {
  const lines = [
    "## Git Workflow (MUST follow)",
    "",
    "| Branch | Purpose |",
    "|--------|---------|",
    `| \`${r.defaultBranch}\` | Production-ready code (default) |`,
    `| \`feature/*\` | New features -> PR to ${r.defaultBranch} |`,
    "",
    "**Key rules:**",
    `- Create feature branches from \`${r.defaultBranch}\``,
    `- All changes go through PR to \`${r.defaultBranch}\``,
    "- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`",
    '- Include "Closes #N" in commit message to auto-close issues'
  ];
  return lines.join(`
`);
}
function renderTrunkBasedEN(r) {
  const lines = [
    "## Git Workflow (MUST follow)",
    "",
    "| Branch | Purpose |",
    "|--------|---------|",
    `| \`${r.defaultBranch}\` | Main trunk (default) |`,
    "",
    "**Key rules:**",
    `- Commit directly to \`${r.defaultBranch}\` or use short-lived branches`,
    "- Keep branches short-lived (merge within 1-2 days)",
    "- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`"
  ];
  return lines.join(`
`);
}
function renderGitFlowKO(r) {
  const lines = [
    "## Git 워크플로우 (반드시 준수)",
    "",
    "| 브랜치 | 용도 |",
    "|--------|------|",
    `| \`${r.defaultBranch}\` | 메인 개발 브랜치 (기본) |`
  ];
  if (r.branchPatterns.includes("feature/*")) {
    lines.push(`| \`feature/*\` | 새 기능 -> ${r.defaultBranch}으로 PR |`);
  }
  if (r.branchPatterns.includes("release/*")) {
    lines.push("| `release/*` | 릴리스 준비 -> **npm 배포는 여기서만** |");
  }
  if (r.branchPatterns.includes("hotfix/*")) {
    lines.push(`| \`hotfix/*\` | 긴급 수정 -> 태그 -> 배포 -> ${r.defaultBranch} 머지 |`);
  }
  if (r.branchPatterns.includes("bugfix/*")) {
    lines.push(`| \`bugfix/*\` | 버그 수정 -> ${r.defaultBranch}으로 PR |`);
  }
  lines.push("");
  lines.push("**핵심 규칙:**");
  lines.push(`- \`${r.defaultBranch}\`에서 feature 브랜치 생성`);
  lines.push("- Conventional commits 사용: `feat:`, `fix:`, `docs:`, `chore:`");
  lines.push('- 커밋 메시지에 "Closes #N" 포함시 이슈 자동 종료');
  return lines.join(`
`);
}
function renderGithubFlowKO(r) {
  const lines = [
    "## Git 워크플로우 (반드시 준수)",
    "",
    "| 브랜치 | 용도 |",
    "|--------|------|",
    `| \`${r.defaultBranch}\` | 프로덕션 준비 코드 (기본) |`,
    `| \`feature/*\` | 새 기능 -> ${r.defaultBranch}으로 PR |`,
    "",
    "**핵심 규칙:**",
    `- \`${r.defaultBranch}\`에서 feature 브랜치 생성`,
    `- 모든 변경은 \`${r.defaultBranch}\`으로 PR을 통해 진행`,
    "- Conventional commits 사용: `feat:`, `fix:`, `docs:`, `chore:`",
    '- 커밋 메시지에 "Closes #N" 포함시 이슈 자동 종료'
  ];
  return lines.join(`
`);
}
function renderTrunkBasedKO(r) {
  const lines = [
    "## Git 워크플로우 (반드시 준수)",
    "",
    "| 브랜치 | 용도 |",
    "|--------|------|",
    `| \`${r.defaultBranch}\` | 메인 트렁크 (기본) |`,
    "",
    "**핵심 규칙:**",
    `- \`${r.defaultBranch}\`에 직접 커밋하거나 단기 브랜치 사용`,
    "- 브랜치는 단기 유지 (1-2일 내 머지)",
    "- Conventional commits 사용: `feat:`, `fix:`, `docs:`, `chore:`"
  ];
  return lines.join(`
`);
}
function getDefaultWorkflow() {
  return {
    type: "github-flow",
    defaultBranch: "main",
    hasDevelop: false,
    branchPatterns: ["feature/*"]
  };
}
// src/core/installer.ts
init_fs();
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  readdir as readdir2,
  rename,
  stat as stat2
} from "node:fs/promises";
import { basename as basename2, join as join5 } from "node:path";

// src/core/file-preservation.ts
init_fs();
import { basename, join as join3 } from "node:path";
var DEFAULT_CRITICAL_FILES = ["settings.json", "settings.local.json"];
var DEFAULT_CRITICAL_DIRECTORIES = ["agent-memory", "agent-memory-local"];
var PROTECTED_FRAMEWORK_FILES = ["CLAUDE.md", "AGENTS.md"];
var PROTECTED_RULE_PATTERNS = ["rules/MUST-*.md"];
function isProtectedFile(relativePath) {
  const basename2 = relativePath.split("/").pop() ?? "";
  if (PROTECTED_FRAMEWORK_FILES.includes(basename2)) {
    return true;
  }
  for (const pattern of PROTECTED_RULE_PATTERNS) {
    if (matchesGlobPattern(relativePath, pattern)) {
      return true;
    }
  }
  return false;
}
function matchesGlobPattern(filePath, pattern) {
  const regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  const regex = new RegExp(`(^|/)${regexStr}$`);
  return regex.test(filePath);
}
async function extractSingleFile(fileName, rootDir, tempDir, result) {
  const srcPath = join3(rootDir, fileName);
  const destPath = join3(tempDir, fileName);
  try {
    if (await fileExists(srcPath)) {
      await copyFile(srcPath, destPath);
      result.extractedFiles.push(fileName);
      debug("preserve.extracted_file", { file: fileName });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    result.failures.push({ path: fileName, reason });
    warn("preserve.extract_failed", { file: fileName, error: reason });
  }
}
async function extractSingleDir(dirName, rootDir, tempDir, result) {
  const srcPath = join3(rootDir, dirName);
  const destPath = join3(tempDir, dirName);
  try {
    if (await fileExists(srcPath)) {
      await copyDirectory(srcPath, destPath, { overwrite: true, preserveTimestamps: true });
      result.extractedDirs.push(dirName);
      debug("preserve.extracted_dir", { dir: dirName });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    result.failures.push({ path: dirName, reason });
    warn("preserve.extract_dir_failed", { dir: dirName, error: reason });
  }
}
async function extractCriticalFiles(rootDir, tempDir, additionalFiles = []) {
  const result = {
    tempDir,
    extractedFiles: [],
    extractedDirs: [],
    failures: []
  };
  await ensureDirectory(tempDir);
  const filesToExtract = [...DEFAULT_CRITICAL_FILES, ...additionalFiles];
  for (const fileName of filesToExtract) {
    await extractSingleFile(fileName, rootDir, tempDir, result);
  }
  for (const dirName of DEFAULT_CRITICAL_DIRECTORIES) {
    await extractSingleDir(dirName, rootDir, tempDir, result);
  }
  return result;
}
async function restoreCriticalFiles(rootDir, preservation) {
  const result = {
    restoredFiles: [],
    restoredDirs: [],
    failures: []
  };
  for (const fileName of preservation.extractedFiles) {
    const preservedPath = join3(preservation.tempDir, fileName);
    const targetPath = join3(rootDir, fileName);
    try {
      if (fileName.endsWith(".json")) {
        await mergeJsonFile(preservedPath, targetPath);
      } else {
        await copyFile(preservedPath, targetPath);
      }
      result.restoredFiles.push(fileName);
      debug("preserve.restored_file", { file: fileName });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      result.failures.push({ path: fileName, reason });
      warn("preserve.restore_failed", { file: fileName, error: reason });
    }
  }
  for (const dirName of preservation.extractedDirs) {
    const preservedPath = join3(preservation.tempDir, dirName);
    const targetPath = join3(rootDir, dirName);
    try {
      await copyDirectory(preservedPath, targetPath, {
        overwrite: false,
        preserveTimestamps: true
      });
      result.restoredDirs.push(dirName);
      debug("preserve.restored_dir", { dir: dirName });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      result.failures.push({ path: dirName, reason });
      warn("preserve.restore_dir_failed", { dir: dirName, error: reason });
    }
  }
  return result;
}
async function mergeJsonFile(preservedPath, targetPath) {
  const preservedData = await readJsonFile(preservedPath);
  if (await fileExists(targetPath)) {
    const targetData = await readJsonFile(targetPath);
    const merged = deepMerge(targetData, preservedData);
    await writeJsonFile(targetPath, merged);
    debug("preserve.merged_json", { file: basename(targetPath) });
  } else {
    await copyFile(preservedPath, targetPath);
    debug("preserve.copied_json", { file: basename(targetPath) });
  }
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (sourceVal !== null && typeof sourceVal === "object" && !Array.isArray(sourceVal) && targetVal !== null && typeof targetVal === "object" && !Array.isArray(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}
async function cleanupPreservation(tempDir) {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(tempDir, { recursive: true, force: true });
    debug("preserve.cleanup", { dir: tempDir });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn("preserve.cleanup_failed", { dir: tempDir, error: reason });
  }
}

// src/core/layout.ts
var CLAUDE_LAYOUT = {
  rootDir: ".claude",
  entryFile: "CLAUDE.md",
  entryTemplatePrefix: "CLAUDE.md",
  manifestFile: "manifest.json",
  backupDirPrefix: ".claude-backup-",
  directoryStructure: [
    ".claude",
    ".claude/rules",
    ".claude/hooks",
    ".claude/contexts",
    ".claude/agents",
    ".claude/skills",
    ".claude/ontology",
    "guides"
  ]
};
function getProviderLayout() {
  return CLAUDE_LAYOUT;
}
function getEntryTemplateName(language) {
  return `CLAUDE.md.${language}`;
}
function getComponentPath(component) {
  if (component === "entry-md") {
    return "CLAUDE.md";
  }
  if (component === "guides") {
    return "guides";
  }
  return `.claude/${component}`;
}

// src/core/lockfile.ts
init_fs();
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join as join4, relative as relative2 } from "node:path";
var LOCKFILE_NAME = ".omcustom.lock.json";
var LOCKFILE_VERSION = 1;
var LOCKFILE_COMPONENTS = [
  "rules",
  "agents",
  "skills",
  "hooks",
  "contexts",
  "ontology",
  "guides"
];
var COMPONENT_PATHS = LOCKFILE_COMPONENTS.map((component) => [getComponentPath(component), component]);
function computeFileHash(filePath) {
  return new Promise((resolve2, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", (err) => {
      reject(err);
    });
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve2(hash.digest("hex"));
    });
  });
}
async function writeLockfile(targetDir, lockfile) {
  const lockfilePath = join4(targetDir, LOCKFILE_NAME);
  await writeJsonFile(lockfilePath, lockfile);
  debug("lockfile.written", { path: lockfilePath });
}
function resolveComponent(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  for (const [prefix, component] of COMPONENT_PATHS) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return component;
    }
  }
  return "unknown";
}
async function collectFiles(dir, projectRoot, isTopLevel) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (isTopLevel && entry.startsWith(".") && entry !== ".claude") {
      continue;
    }
    const fullPath = join4(dir, entry);
    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      continue;
    }
    if (fileStat.isDirectory()) {
      const subFiles = await collectFiles(fullPath, projectRoot, false);
      results.push(...subFiles);
    } else if (fileStat.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}
async function generateLockfile(targetDir, generatorVersion, templateVersion) {
  const files = {};
  const componentRoots = COMPONENT_PATHS.map(([prefix]) => join4(targetDir, prefix));
  for (const componentRoot of componentRoots) {
    const exists = await fileExists(componentRoot);
    if (!exists) {
      debug("lockfile.component_dir_missing", { path: componentRoot });
      continue;
    }
    const allFiles = await collectFiles(componentRoot, targetDir, false);
    for (const absolutePath of allFiles) {
      const relativePath = relative2(targetDir, absolutePath).replace(/\\/g, "/");
      let hash;
      let size;
      try {
        hash = await computeFileHash(absolutePath);
        const fileStat = await stat(absolutePath);
        size = fileStat.size;
      } catch (err) {
        warn("lockfile.hash_failed", { path: absolutePath, error: String(err) });
        continue;
      }
      const component = resolveComponent(relativePath);
      files[relativePath] = {
        templateHash: hash,
        size,
        component
      };
      debug("lockfile.entry_added", { path: relativePath, component });
    }
  }
  return {
    lockfileVersion: LOCKFILE_VERSION,
    generatorVersion,
    generatedAt: new Date().toISOString(),
    templateVersion,
    files
  };
}
async function generateAndWriteLockfileForDir(targetDir) {
  try {
    const packageRoot = getPackageRoot();
    const manifest = await readJsonFile(join4(packageRoot, "templates", "manifest.json"));
    const { version: generatorVersion } = await readJsonFile(join4(packageRoot, "package.json"));
    const lockfile = await generateLockfile(targetDir, generatorVersion, manifest.version);
    await writeLockfile(targetDir, lockfile);
    return { fileCount: Object.keys(lockfile.files).length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { fileCount: 0, warning: `Lockfile generation failed: ${msg}` };
  }
}

// src/core/scope-filter.ts
function getSkillScope(content) {
  const cleaned = content.replace(/^\uFEFF/, "");
  const frontmatter = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter)
    return "core";
  const match = frontmatter[1].match(/^scope:\s*(core|harness|package)\s*$/m);
  return match?.[1] ?? "core";
}
function shouldInstallSkill(scope) {
  return scope !== "package";
}
function getAgentDomain(content) {
  const cleaned = content.replace(/^\uFEFF/, "");
  const frontmatter = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter)
    return "universal";
  const match = frontmatter[1].match(/^domain:\s*(backend|frontend|data-engineering|devops|universal)\s*$/m);
  return match?.[1] ?? "universal";
}
function shouldInstallAgent(agentDomain, filterDomain) {
  if (!filterDomain)
    return true;
  if (agentDomain === "universal")
    return true;
  return agentDomain === filterDomain;
}

// src/core/installer.ts
var DEFAULT_LANGUAGE = "en";
function getTemplateDir() {
  const packageRoot = getPackageRoot();
  return join5(packageRoot, "templates");
}
function createInstallResult(targetDir) {
  return {
    success: false,
    installedPath: targetDir,
    installedComponents: [],
    skippedComponents: [],
    backedUpPaths: [],
    warnings: []
  };
}
async function ensureTargetDirectory(targetDir) {
  const targetExists = await fileExists(targetDir);
  if (!targetExists) {
    await ensureDirectory(targetDir);
  }
}
async function handleBackup(targetDir, shouldBackup, result) {
  if (!shouldBackup)
    return null;
  const layout = getProviderLayout();
  const rootDir = join5(targetDir, layout.rootDir);
  let preservation = null;
  if (await fileExists(rootDir)) {
    const { createTempDir: createTempDir2 } = await Promise.resolve().then(() => (init_fs(), exports_fs));
    const tempDir = await createTempDir2("omcustom-preserve-");
    preservation = await extractCriticalFiles(rootDir, tempDir);
    if (preservation.extractedFiles.length > 0 || preservation.extractedDirs.length > 0) {
      info("install.preserved", {
        files: String(preservation.extractedFiles.length),
        dirs: String(preservation.extractedDirs.length)
      });
    }
  }
  const backupPaths = await backupExistingInstallation(targetDir);
  result.backedUpPaths.push(...backupPaths);
  if (backupPaths.length > 0) {
    info("install.backup", { path: backupPaths[0] });
  }
  return preservation;
}
async function checkAndWarnExisting(targetDir, force, backup, result) {
  if (force || backup)
    return;
  const existingPaths = await checkExistingPaths(targetDir);
  if (existingPaths.length > 0) {
    const layout = getProviderLayout();
    warn("install.exists", { rootDir: layout.rootDir });
    result.warnings.push(`Existing files found: ${existingPaths.join(", ")}. Use --force to overwrite or --backup to backup first.`);
  }
}
async function verifyTemplateDirectory() {
  const templateDir = getTemplateDir();
  if (!await fileExists(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }
}
async function installAllComponents(targetDir, options, result) {
  const components = options.components || getAllComponents();
  for (const component of components) {
    await installSingleComponent(targetDir, component, options, result);
  }
}
async function installSingleComponent(targetDir, component, options, result) {
  try {
    const installed = await installComponent(targetDir, component, options);
    if (installed) {
      result.installedComponents.push(component);
    } else {
      result.skippedComponents.push(component);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Failed to install ${component}: ${message}`);
  }
}
async function installStatusline(targetDir, options, _result) {
  const layout = getProviderLayout();
  const srcPath = resolveTemplatePath(join5(layout.rootDir, "statusline.sh"));
  const destPath = join5(targetDir, layout.rootDir, "statusline.sh");
  if (!await fileExists(srcPath)) {
    debug("install.statusline_not_found", { path: srcPath });
    return;
  }
  if (await fileExists(destPath)) {
    if (!options.force && !options.backup) {
      debug("install.statusline_skipped", { reason: "exists" });
      return;
    }
  }
  await copyFile(srcPath, destPath);
  const fs = await import("node:fs/promises");
  await fs.chmod(destPath, 493);
  debug("install.statusline_installed", {});
}
async function installSettingsLocal(targetDir, result) {
  const layout = getProviderLayout();
  const settingsPath = join5(targetDir, layout.rootDir, "settings.local.json");
  const statusLineConfig = {
    statusLine: {
      type: "command",
      command: ".claude/statusline.sh",
      padding: 0
    }
  };
  if (await fileExists(settingsPath)) {
    try {
      const existing = await readJsonFile(settingsPath);
      if (!existing.statusLine) {
        existing.statusLine = statusLineConfig.statusLine;
        await writeJsonFile(settingsPath, existing);
        debug("install.settings_local_merged", {});
      } else {
        debug("install.settings_local_skipped", { reason: "statusLine exists" });
      }
    } catch {
      result.warnings.push("Failed to parse existing settings.local.json, skipping statusLine config");
    }
    return;
  }
  await writeJsonFile(settingsPath, statusLineConfig);
  debug("install.settings_local_created", {});
}
async function installEntryDocWithTracking(targetDir, options, result) {
  const language = options.language ?? DEFAULT_LANGUAGE;
  const overwrite = !!(options.force || options.backup);
  const installed = await installEntryDoc(targetDir, language, overwrite);
  if (installed) {
    result.installedComponents.push("entry-md");
  } else {
    result.skippedComponents.push("entry-md");
  }
}
async function updateInstallConfig(targetDir, options, installedComponents) {
  const config = await loadConfig(targetDir);
  config.language = options.language ?? DEFAULT_LANGUAGE;
  config.domain = options.domain;
  config.installedAt = new Date().toISOString();
  config.installedComponents = installedComponents;
  await saveConfig(targetDir, config);
}
async function install(options) {
  const result = createInstallResult(options.targetDir);
  try {
    info("install.start", { targetDir: options.targetDir });
    await ensureTargetDirectory(options.targetDir);
    const preservation = await handleBackup(options.targetDir, !!options.backup, result);
    await checkAndWarnExisting(options.targetDir, !!options.force, !!options.backup, result);
    await verifyTemplateDirectory();
    await installAllComponents(options.targetDir, options, result);
    await installStatusline(options.targetDir, options, result);
    await installSettingsLocal(options.targetDir, result);
    await installEntryDocWithTracking(options.targetDir, options, result);
    if (preservation) {
      const layout = getProviderLayout();
      const rootDir = join5(options.targetDir, layout.rootDir);
      const restoration = await restoreCriticalFiles(rootDir, preservation);
      if (restoration.restoredFiles.length > 0 || restoration.restoredDirs.length > 0) {
        info("install.restored", {
          files: String(restoration.restoredFiles.length),
          dirs: String(restoration.restoredDirs.length)
        });
      }
      if (restoration.failures.length > 0) {
        for (const failure of restoration.failures) {
          result.warnings.push(`Failed to restore ${failure.path}: ${failure.reason}`);
        }
      }
      await cleanupPreservation(preservation.tempDir);
    }
    await updateInstallConfig(options.targetDir, options, result.installedComponents);
    const lockfileResult = await generateAndWriteLockfileForDir(options.targetDir);
    if (lockfileResult.warning) {
      result.warnings.push(lockfileResult.warning);
      warn("install.lockfile_failed", { error: lockfileResult.warning });
    } else {
      info("install.lockfile_generated", { files: String(lockfileResult.fileCount) });
    }
    result.success = true;
    success("install.success");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    error("install.failed", { error: message });
  }
  return result;
}
async function copyTemplates(targetDir, templatePath, options) {
  const srcPath = resolveTemplatePath(templatePath);
  const destPath = join5(targetDir, templatePath);
  await copyDirectory(srcPath, destPath, {
    overwrite: options?.overwrite ?? false,
    preserveSymlinks: options?.preserveSymlinks ?? true,
    preserveTimestamps: true
  });
}
async function createDirectoryStructure(targetDir) {
  const layout = getProviderLayout();
  for (const dir of layout.directoryStructure) {
    const fullPath = join5(targetDir, dir);
    await ensureDirectory(fullPath);
  }
}
async function getTemplateManifest() {
  const packageRoot = getPackageRoot();
  const layout = getProviderLayout();
  const manifestPath = join5(packageRoot, "templates", layout.manifestFile);
  if (await fileExists(manifestPath)) {
    return readJsonFile(manifestPath);
  }
  return {
    version: "0.0.0",
    lastUpdated: new Date().toISOString(),
    components: getAllComponents().map((name) => ({
      name,
      path: getComponentPath(name),
      description: `${name} component`,
      files: 0
    })),
    source: "https://github.com/baekenough/oh-my-customcode"
  };
}
function getAllComponents() {
  return ["rules", "agents", "skills", "guides", "hooks", "contexts", "ontology"];
}
async function installSkillsWithScopeFilter(srcPath, destPath, options) {
  await ensureDirectory(destPath);
  const entries = await readdir2(srcPath);
  for (const entry of entries) {
    const entrySrcPath = join5(srcPath, entry);
    if (!(await stat2(entrySrcPath)).isDirectory())
      continue;
    const skillMdPath = join5(entrySrcPath, "SKILL.md");
    if (await fileExists(skillMdPath)) {
      const content = await fsReadFile(skillMdPath, "utf-8");
      const scope = getSkillScope(content);
      if (!shouldInstallSkill(scope)) {
        debug("install.skill_scope_excluded", { skill: entry, scope });
        continue;
      }
    }
    await copyDirectory(entrySrcPath, join5(destPath, entry), {
      overwrite: !!(options.force || options.backup),
      preserveSymlinks: true,
      preserveTimestamps: true
    });
  }
}
async function installAgentsWithDomainFilter(srcPath, destPath, options) {
  await ensureDirectory(destPath);
  const entries = await readdir2(srcPath);
  for (const entry of entries) {
    const entrySrcPath = join5(srcPath, entry);
    const entryStat = await stat2(entrySrcPath);
    if (entryStat.isDirectory()) {
      await copyDirectory(entrySrcPath, join5(destPath, entry), {
        overwrite: !!(options.force || options.backup),
        preserveSymlinks: true,
        preserveTimestamps: true
      });
      continue;
    }
    if (!entry.endsWith(".md"))
      continue;
    if (options.domain) {
      const content = await fsReadFile(entrySrcPath, "utf-8");
      const agentDomain = getAgentDomain(content);
      if (!shouldInstallAgent(agentDomain, options.domain)) {
        debug("install.agent_domain_excluded", { agent: entry, domain: agentDomain });
        continue;
      }
    }
    await copyFile(entrySrcPath, join5(destPath, entry));
  }
}
async function installComponent(targetDir, component, options) {
  if (component === "entry-md") {
    return false;
  }
  const templatePath = getComponentPath(component);
  const destPath = join5(targetDir, templatePath);
  const destExists = await fileExists(destPath);
  if (destExists && !options.force && !options.backup) {
    debug("install.component_skipped", { component });
    return false;
  }
  const srcPath = resolveTemplatePath(templatePath);
  if (!await fileExists(srcPath)) {
    warn("install.template_not_found", { component, path: srcPath });
    return false;
  }
  if (component === "skills") {
    await installSkillsWithScopeFilter(srcPath, destPath, options);
  } else if (component === "agents") {
    await installAgentsWithDomainFilter(srcPath, destPath, options);
  } else {
    await copyDirectory(srcPath, destPath, {
      overwrite: !!(options.force || options.backup),
      preserveSymlinks: true,
      preserveTimestamps: true
    });
  }
  debug("install.component_installed", { component });
  return true;
}
var GIT_WORKFLOW_PLACEHOLDER = "<!-- omcustom:git-workflow -->";
function renderGitWorkflowSection(targetDir, language) {
  const result = detectGitWorkflow(targetDir) ?? getDefaultWorkflow();
  return language === "ko" ? renderGitWorkflowKO(result) : renderGitWorkflowEN(result);
}
async function installEntryDoc(targetDir, language, overwrite = false) {
  const layout = getProviderLayout();
  const templateFile = getEntryTemplateName(language);
  const srcPath = resolveTemplatePath(templateFile);
  const destPath = join5(targetDir, layout.entryFile);
  if (!await fileExists(srcPath)) {
    warn("install.entry_md_not_found", { language, path: srcPath, entry: layout.entryFile });
    return false;
  }
  const destExists = await fileExists(destPath);
  if (destExists && !overwrite) {
    debug("install.entry_md_skipped", { reason: "exists", language, entry: layout.entryFile });
    return false;
  }
  let content = await fsReadFile(srcPath, "utf-8");
  if (content.includes(GIT_WORKFLOW_PLACEHOLDER)) {
    const workflowSection = renderGitWorkflowSection(targetDir, language);
    content = content.replace(GIT_WORKFLOW_PLACEHOLDER, workflowSection);
  }
  await fsWriteFile(destPath, content, "utf-8");
  debug("install.entry_md_installed", { language, entry: layout.entryFile });
  return true;
}
async function backupExisting(sourcePath, backupDir) {
  const name = basename2(sourcePath);
  const backupPath = join5(backupDir, name);
  await rename(sourcePath, backupPath);
  return backupPath;
}
async function checkExistingPaths(targetDir) {
  const layout = getProviderLayout();
  const pathsToCheck = [layout.entryFile, layout.rootDir, "guides"];
  const existingPaths = [];
  for (const relativePath of pathsToCheck) {
    const fullPath = join5(targetDir, relativePath);
    if (await fileExists(fullPath)) {
      existingPaths.push(relativePath);
    }
  }
  return existingPaths;
}
async function backupExistingInstallation(targetDir) {
  const layout = getProviderLayout();
  const existingPaths = await checkExistingPaths(targetDir);
  if (existingPaths.length === 0) {
    return [];
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join5(targetDir, `${layout.backupDirPrefix}${timestamp}`);
  await ensureDirectory(backupDir);
  const backedUpPaths = [];
  for (const relativePath of existingPaths) {
    const fullPath = join5(targetDir, relativePath);
    try {
      const backupPath = await backupExisting(fullPath, backupDir);
      backedUpPaths.push(backupPath);
      debug("install.backed_up", { from: relativePath, to: backupPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn("install.backup_failed", { path: relativePath, error: message });
    }
  }
  return backedUpPaths.length > 0 ? [backupDir] : [];
}
// src/core/provider.ts
async function detectProvider(_options = {}) {
  return {
    provider: "claude",
    source: "default",
    confidence: "high",
    reason: "claude-only"
  };
}
// src/core/updater.ts
import { join as join6 } from "node:path";
// package.json
var package_default = {
  name: "oh-my-customcode",
  workspaces: ["packages/*"],
  version: "0.49.0",
  description: "Batteries-included agent harness for Claude Code",
  type: "module",
  bin: {
    omcustom: "./dist/cli/index.js"
  },
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      import: "./dist/index.js",
      types: "./dist/index.d.ts"
    }
  },
  files: [
    "dist",
    "templates"
  ],
  publishConfig: {
    access: "public",
    registry: "https://registry.npmjs.org/"
  },
  scripts: {
    dev: "bun run src/cli/index.ts",
    build: "bun build src/cli/index.ts --outdir dist/cli --target node && bun build src/index.ts --outdir dist --target node && bun run scripts/sync-source-lockfile.ts",
    test: "bun test",
    "test:unit": "bun test tests/unit",
    "test:integration": "bun test tests/integration",
    "test:e2e": "bun test tests/e2e",
    "test:coverage": "bun test --coverage",
    lint: "biome check src/ tests/ scripts/",
    "lint:fix": "biome check --write src/ tests/ scripts/",
    format: "biome format --write src/ tests/ scripts/",
    typecheck: "tsc --noEmit",
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    prepare: "sh scripts/setup-hooks.sh || true",
    "setup:hooks": "sh scripts/setup-hooks.sh",
    prepublishOnly: "bun run build && bun run test"
  },
  dependencies: {
    "@clack/prompts": "^1.1.0",
    "@inquirer/prompts": "^8.3.2",
    commander: "^14.0.2",
    i18next: "^25.8.0",
    yaml: "^2.8.2"
  },
  devDependencies: {
    "@anthropic-ai/sdk": "^0.78.0",
    "@biomejs/biome": "^2.3.12",
    "@types/bun": "^1.3.6",
    "@types/js-yaml": "^4.0.9",
    "@types/nodemailer": "^7.0.9",
    "js-yaml": "^4.1.0",
    nodemailer: "^8.0.1",
    typescript: "^5.7.3",
    vitepress: "^1.6.4"
  },
  keywords: [
    "claude",
    "claude-code",
    "openai",
    "ai",
    "agent",
    "cli"
  ],
  author: "baekenough",
  license: "MIT",
  repository: {
    type: "git",
    url: "git+https://github.com/baekenough/oh-my-customcode.git"
  },
  bugs: {
    url: "https://github.com/baekenough/oh-my-customcode/issues"
  },
  homepage: "https://github.com/baekenough/oh-my-customcode#readme",
  engines: {
    node: ">=18.0.0"
  },
  overrides: {
    rollup: "^4.59.0",
    esbuild: "^0.25.0"
  }
};

// src/core/updater.ts
init_fs();

// src/core/entry-merger.ts
var MANAGED_START = "<!-- omcustom:start -->";
var MANAGED_END = "<!-- omcustom:end -->";
function isCodeBlockDelimiter(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}
function handleManagedStart(currentLines, sections) {
  if (currentLines.length > 0) {
    sections.push({
      type: "custom",
      content: currentLines.join(`
`)
    });
  }
  return {
    currentSection: { type: "managed", content: "" },
    currentLines: []
  };
}
function handleManagedEnd(currentSection, currentLines, sections) {
  if (currentSection && currentSection.type === "managed") {
    currentSection.content = currentLines.join(`
`);
    sections.push(currentSection);
    return {
      currentSection: null,
      currentLines: []
    };
  }
  return { currentSection, currentLines };
}
function parseEntryDoc(content) {
  const sections = [];
  const lines = content.split(`
`);
  let currentSection = null;
  let currentLines = [];
  let insideCodeBlock = false;
  for (const line of lines) {
    if (isCodeBlockDelimiter(line)) {
      insideCodeBlock = !insideCodeBlock;
    }
    if (!insideCodeBlock) {
      const trimmed = line.trim();
      if (trimmed === MANAGED_START) {
        const result = handleManagedStart(currentLines, sections);
        currentSection = result.currentSection;
        currentLines = result.currentLines;
        continue;
      }
      if (trimmed === MANAGED_END) {
        const result = handleManagedEnd(currentSection, currentLines, sections);
        currentSection = result.currentSection;
        currentLines = result.currentLines;
        continue;
      }
    }
    currentLines.push(line);
  }
  if (currentLines.length > 0) {
    sections.push({
      type: "custom",
      content: currentLines.join(`
`)
    });
  }
  return { sections };
}
function mergeEntryDoc(existingContent, templateContent) {
  const warnings = [];
  const { sections } = parseEntryDoc(existingContent);
  const hasManagedSections = sections.some((s) => s.type === "managed");
  if (!hasManagedSections) {
    const wrapped = wrapInManagedMarkers(templateContent);
    const existingTrimmed = existingContent.trim();
    const content = existingTrimmed ? `${wrapped}

${existingTrimmed}` : wrapped;
    return {
      content,
      managedSections: 1,
      customSections: existingTrimmed ? 1 : 0,
      warnings: existingTrimmed ? [
        "No managed sections found in existing content. Template inserted as managed section, existing content preserved below."
      ] : ["No managed sections found in existing content, wrapping template entirely"]
    };
  }
  const mergedSections = [];
  let managedCount = 0;
  let customCount = 0;
  let templateInserted = false;
  for (const section of sections) {
    if (section.type === "managed") {
      if (!templateInserted) {
        mergedSections.push(MANAGED_START);
        mergedSections.push(templateContent);
        mergedSections.push(MANAGED_END);
        templateInserted = true;
        managedCount++;
      } else {
        warnings.push("Multiple managed sections found, keeping only the first one");
      }
    } else {
      mergedSections.push(section.content);
      customCount++;
    }
  }
  return {
    content: mergedSections.join(`
`),
    managedSections: managedCount,
    customSections: customCount,
    warnings
  };
}
function wrapInManagedMarkers(content) {
  return `${MANAGED_START}
${content}
${MANAGED_END}`;
}

// src/core/updater.ts
var CUSTOMIZATION_MANIFEST_FILE = ".omcustom-customizations.json";
function createUpdateResult() {
  return {
    success: false,
    updatedComponents: [],
    skippedComponents: [],
    preservedFiles: [],
    backedUpPaths: [],
    previousVersion: "",
    newVersion: "",
    warnings: [],
    syncedRootFiles: [],
    removedDeprecatedFiles: []
  };
}
async function handleBackupIfRequested(targetDir, backup, result) {
  if (!backup)
    return;
  const backupPath = await backupInstallation(targetDir);
  result.backedUpPaths.push(backupPath);
  info("update.backup_created", { path: backupPath });
}
async function processComponentUpdate(targetDir, component, updateCheck, customizations, options, result, config) {
  const componentUpdate = updateCheck.updatableComponents.find((c) => c.name === component);
  if (!componentUpdate && !options.force) {
    result.skippedComponents.push(component);
    return;
  }
  if (options.dryRun) {
    debug("update.dry_run", { component });
    result.updatedComponents.push(component);
    return;
  }
  try {
    const preserved = await updateComponent(targetDir, component, customizations, options, config);
    result.updatedComponents.push(component);
    result.preservedFiles.push(...preserved);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Failed to update ${component}: ${message}`);
    result.skippedComponents.push(component);
  }
}
async function updateAllComponents(targetDir, components, updateCheck, customizations, options, result, config) {
  for (const component of components) {
    await processComponentUpdate(targetDir, component, updateCheck, customizations, options, result, config);
  }
}
function getEntryTemplateName2(language) {
  const layout = getProviderLayout();
  const baseName = layout.entryFile.replace(".md", "");
  return language === "ko" ? `${baseName}.md.ko` : `${baseName}.md.en`;
}
async function backupFile(filePath) {
  const fs = await import("node:fs/promises");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.backup-${timestamp}`;
  if (await fileExists(filePath)) {
    await fs.copyFile(filePath, backupPath);
    debug("update.file_backed_up", { path: filePath, backup: backupPath });
  }
}
async function resolveManifestCustomizations(options, targetDir) {
  if (options.forceOverwriteAll) {
    return null;
  }
  if (options.preserveCustomizations === false) {
    return null;
  }
  return loadCustomizationManifest(targetDir);
}
function resolveConfigPreserveFiles(options, config) {
  if (options.forceOverwriteAll) {
    return [];
  }
  const preserveFiles = config.preserveFiles || [];
  const validatedPaths = [];
  for (const filePath of preserveFiles) {
    validatedPaths.push(filePath);
  }
  return validatedPaths;
}
function resolveCustomizations(customizations, configPreserveFiles, targetDir) {
  const validatedManifestFiles = [];
  if (customizations && customizations.preserveFiles.length > 0) {
    for (const filePath of customizations.preserveFiles) {
      const validation = validatePreserveFilePath(filePath, targetDir);
      if (validation.valid) {
        validatedManifestFiles.push(filePath);
      } else {
        warn("preserve_files.invalid_path", {
          path: filePath,
          reason: validation.reason ?? "Invalid path",
          source: "manifest"
        });
      }
    }
  }
  if (validatedManifestFiles.length === 0 && configPreserveFiles.length === 0) {
    return customizations && customizations.modifiedFiles.length > 0 ? customizations : null;
  }
  if (validatedManifestFiles.length > 0 && configPreserveFiles.length > 0) {
    const merged = customizations || {
      modifiedFiles: [],
      preserveFiles: [],
      customComponents: [],
      lastUpdated: new Date().toISOString()
    };
    merged.preserveFiles = [...new Set([...validatedManifestFiles, ...configPreserveFiles])];
    return merged;
  }
  if (configPreserveFiles.length > 0) {
    return {
      modifiedFiles: customizations?.modifiedFiles || [],
      preserveFiles: configPreserveFiles,
      customComponents: customizations?.customComponents || [],
      lastUpdated: new Date().toISOString()
    };
  }
  customizations.preserveFiles = validatedManifestFiles;
  return customizations;
}
async function updateEntryDoc(targetDir, config, options) {
  const layout = getProviderLayout();
  const entryPath = join6(targetDir, layout.entryFile);
  const templateName = getEntryTemplateName2(config.language);
  const templatePath = resolveTemplatePath(templateName);
  if (!await fileExists(templatePath)) {
    warn("update.entry_template_not_found", { template: templateName });
    return;
  }
  const templateContent = await readTextFile(templatePath);
  if (await fileExists(entryPath)) {
    if (options.force) {
      await backupFile(entryPath);
      await writeTextFile(entryPath, templateContent);
      info("update.entry_doc_force_updated", { path: layout.entryFile });
    } else {
      const existingContent = await readTextFile(entryPath);
      const mergeResult = mergeEntryDoc(existingContent, templateContent);
      await writeTextFile(entryPath, mergeResult.content);
      debug("update.entry_doc_merged", {
        path: layout.entryFile,
        managed: String(mergeResult.managedSections),
        custom: String(mergeResult.customSections)
      });
      if (mergeResult.warnings.length > 0) {
        for (const warning of mergeResult.warnings) {
          warn("update.entry_merge_warning", { warning });
        }
      }
    }
  } else {
    await writeTextFile(entryPath, wrapInManagedMarkers(templateContent));
    info("update.entry_doc_created", { path: layout.entryFile });
  }
}
async function runFullUpdatePostProcessing(options, result, config) {
  const isFullUpdate = !options.components || options.components.length === 0;
  if (isFullUpdate) {
    const synced = await syncRootLevelFiles(options.targetDir, options);
    result.syncedRootFiles = synced;
    const removed = await removeDeprecatedFiles(options.targetDir, options);
    result.removedDeprecatedFiles = removed;
    if (!options.dryRun) {
      await updateEntryDoc(options.targetDir, config, options);
    }
  }
  if (!options.dryRun) {
    config.version = result.newVersion;
    config.lastUpdated = new Date().toISOString();
    await saveConfig(options.targetDir, config);
  }
  result.success = true;
  if (result.previousVersion !== result.newVersion) {
    success("update.success", { from: result.previousVersion, to: result.newVersion });
  } else if (result.updatedComponents.length > 0) {
    success("update.components_synced", {
      version: result.newVersion,
      components: result.updatedComponents.join(", ")
    });
  }
}
function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0;i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0)
      return diff;
  }
  return 0;
}
async function update(options) {
  const result = createUpdateResult();
  try {
    info("update.start", { targetDir: options.targetDir });
    const config = await loadConfig(options.targetDir);
    result.previousVersion = config.version;
    const cliVersion = package_default.version;
    if (result.previousVersion !== "0.0.0" && compareSemver(result.previousVersion, cliVersion) > 0) {
      result.success = false;
      result.error = `Downgrade prevented: project has v${result.previousVersion} but CLI is v${cliVersion}. Update the CLI first: npm install -g oh-my-customcode@latest`;
      return result;
    }
    const targetPkgPath = join6(options.targetDir, "package.json");
    if (await fileExists(targetPkgPath)) {
      const targetPkg = await readJsonFile(targetPkgPath);
      if (targetPkg.name === "oh-my-customcode") {
        warn("update.self_update_skipped");
        result.success = true;
        result.warnings.push("Skipped: source project cannot update itself");
        return result;
      }
    }
    const updateCheck = await checkForUpdates(options.targetDir);
    result.newVersion = updateCheck.latestVersion;
    if (!updateCheck.hasUpdates && !options.force) {
      info("update.no_updates");
      result.success = true;
      result.skippedComponents = options.components || getAllUpdateComponents();
      return result;
    }
    await handleBackupIfRequested(options.targetDir, !!options.backup, result);
    const manifestCustomizations = await resolveManifestCustomizations(options, options.targetDir);
    const configPreserveFiles = resolveConfigPreserveFiles(options, config);
    const customizations = resolveCustomizations(manifestCustomizations, configPreserveFiles, options.targetDir);
    const components = options.components || getAllUpdateComponents();
    await updateAllComponents(options.targetDir, components, updateCheck, customizations, options, result, config);
    await runFullUpdatePostProcessing(options, result, config);
    const lockfileResult = await generateAndWriteLockfileForDir(options.targetDir);
    if (lockfileResult.warning) {
      result.warnings.push(lockfileResult.warning);
      warn("update.lockfile_failed", { error: lockfileResult.warning });
    } else {
      debug("update.lockfile_regenerated", {
        files: String(lockfileResult.fileCount)
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    error("update.failed", { error: message });
  }
  return result;
}
async function checkForUpdates(targetDir) {
  const config = await loadConfig(targetDir);
  const currentVersion = config.version;
  const latestVersion = await getLatestVersion();
  const updatableComponents = [];
  for (const component of getAllUpdateComponents()) {
    const hasUpdate = await componentHasUpdate(targetDir, component, config);
    if (hasUpdate) {
      updatableComponents.push({
        name: component,
        currentVersion: config.componentVersions?.[component] || "0.0.0",
        latestVersion
      });
    }
  }
  return {
    hasUpdates: updatableComponents.length > 0 || currentVersion !== latestVersion,
    currentVersion,
    latestVersion,
    updatableComponents,
    checkedAt: new Date().toISOString()
  };
}
async function applyUpdates(targetDir, updates) {
  const fs = await import("node:fs/promises");
  for (const update2 of updates) {
    const fullPath = join6(targetDir, update2.path);
    await ensureDirectory(join6(fullPath, ".."));
    await fs.writeFile(fullPath, update2.content, "utf-8");
    debug("update.file_applied", { path: update2.path });
  }
}
async function preserveCustomizations(targetDir, customizations) {
  const preserved = new Map;
  const fs = await import("node:fs/promises");
  for (const filePath of customizations) {
    const fullPath = join6(targetDir, filePath);
    if (await fileExists(fullPath)) {
      const content = await fs.readFile(fullPath, "utf-8");
      preserved.set(filePath, content);
    }
  }
  return preserved;
}
function getAllUpdateComponents() {
  return ["rules", "agents", "skills", "guides", "hooks", "contexts", "ontology"];
}
async function getLatestVersion() {
  const layout = getProviderLayout();
  const manifestPath = resolveTemplatePath(layout.manifestFile);
  if (await fileExists(manifestPath)) {
    const manifest = await readJsonFile(manifestPath);
    return manifest.version;
  }
  return "0.0.0";
}
async function componentHasUpdate(_targetDir, component, config) {
  const installedVersion = config.componentVersions?.[component];
  if (!installedVersion) {
    return true;
  }
  const latestVersion = await getLatestVersion();
  return installedVersion !== latestVersion;
}
async function collectProtectedSkipPaths(srcPath, destPath, componentPath, forceOverwriteAll) {
  if (forceOverwriteAll) {
    const warnedPaths = await findProtectedFilesInDir(srcPath, componentPath);
    return { skipPaths: [], warnedPaths };
  }
  const protectedRelative = await findProtectedFilesInDir(srcPath, componentPath);
  const path = await import("node:path");
  const skipPaths = protectedRelative.map((p) => path.relative(destPath, join6(destPath, p)));
  return { skipPaths, warnedPaths: protectedRelative };
}
function isEntryProtected(relPath, componentRelativePrefix) {
  if (isProtectedFile(relPath)) {
    return true;
  }
  const componentPrefixed = componentRelativePrefix ? `${componentRelativePrefix}/${relPath}` : relPath;
  return isProtectedFile(componentPrefixed);
}
async function safeReaddir(dir, fs) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
async function findProtectedFilesInDir(dirPath, componentRelativePrefix) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const protected_ = [];
  const queue = [{ dir: dirPath, relDir: "" }];
  while (queue.length > 0) {
    const { dir, relDir } = queue.shift();
    const entries = await safeReaddir(dir, fs);
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push({ dir: fullPath, relDir: relPath });
      } else if (entry.isFile() && isEntryProtected(relPath, componentRelativePrefix)) {
        protected_.push(relPath);
      }
    }
  }
  return protected_;
}
async function updateComponent(targetDir, component, customizations, options, config) {
  const preservedFiles = [];
  const componentPath = getComponentPath2(component);
  const srcPath = resolveTemplatePath(componentPath);
  const destPath = join6(targetDir, componentPath);
  const customComponents = config.customComponents || [];
  const skipPaths = [];
  if (customizations && !options.forceOverwriteAll) {
    const toPreserve = customizations.preserveFiles.filter((f) => f.startsWith(componentPath));
    preservedFiles.push(...toPreserve);
    skipPaths.push(...toPreserve);
  }
  for (const cc of customComponents) {
    if (cc.path.startsWith(componentPath)) {
      skipPaths.push(cc.path);
    }
  }
  const { skipPaths: protectedSkipPaths, warnedPaths: protectedWarnedPaths } = await collectProtectedSkipPaths(srcPath, destPath, componentPath, !!options.forceOverwriteAll);
  for (const protectedPath of protectedWarnedPaths) {
    if (options.forceOverwriteAll) {
      warn("update.protected_file_force_overwrite", {
        file: protectedPath,
        component,
        hint: "File contains AI behavioral constraints. Overwriting because --force-overwrite-all was set."
      });
    } else {
      warn("update.protected_file_skipped", {
        file: protectedPath,
        component,
        hint: "File contains AI behavioral constraints and was not updated. Use --force-overwrite-all to override."
      });
    }
  }
  skipPaths.push(...protectedSkipPaths);
  const path = await import("node:path");
  const normalizedSkipPaths = skipPaths.map((p) => path.relative(destPath, join6(targetDir, p)));
  const uniqueSkipPaths = [...new Set(normalizedSkipPaths)];
  await copyDirectory(srcPath, destPath, {
    overwrite: true,
    skipPaths: uniqueSkipPaths.length > 0 ? uniqueSkipPaths : undefined
  });
  debug("update.component_updated", {
    component,
    skippedPaths: String(uniqueSkipPaths.length),
    protectedSkipped: String(protectedSkipPaths.length)
  });
  return preservedFiles;
}
var ROOT_LEVEL_FILES = ["statusline.sh", "install-hooks.sh", "uninstall-hooks.sh"];
async function syncRootLevelFiles(targetDir, options) {
  if (options.dryRun) {
    return ROOT_LEVEL_FILES;
  }
  const fs = await import("node:fs/promises");
  const layout = getProviderLayout();
  const synced = [];
  for (const fileName of ROOT_LEVEL_FILES) {
    const srcPath = resolveTemplatePath(join6(layout.rootDir, fileName));
    if (!await fileExists(srcPath)) {
      continue;
    }
    const destPath = join6(targetDir, layout.rootDir, fileName);
    await ensureDirectory(join6(destPath, ".."));
    await fs.copyFile(srcPath, destPath);
    if (fileName.endsWith(".sh")) {
      await fs.chmod(destPath, 493);
    }
    synced.push(fileName);
  }
  if (synced.length > 0) {
    debug("update.root_files_synced", { files: synced.join(", ") });
  }
  return synced;
}
async function removeDeprecatedFiles(targetDir, options) {
  const manifestPath = resolveTemplatePath("deprecated-files.json");
  if (!await fileExists(manifestPath)) {
    return [];
  }
  const manifest = await readJsonFile(manifestPath);
  if (!manifest.files || manifest.files.length === 0) {
    return [];
  }
  if (options.dryRun) {
    return manifest.files.map((f) => f.path);
  }
  const fs = await import("node:fs/promises");
  const removed = [];
  for (const entry of manifest.files) {
    const validation = validatePreserveFilePath(entry.path, targetDir);
    if (!validation.valid) {
      warn("update.deprecated_file_invalid_path", {
        path: entry.path,
        reason: validation.reason ?? "Invalid path"
      });
      continue;
    }
    const fullPath = join6(targetDir, entry.path);
    if (await fileExists(fullPath)) {
      await fs.unlink(fullPath);
      removed.push(entry.path);
      info("update.deprecated_file_removed", {
        path: entry.path,
        reason: entry.reason
      });
    }
  }
  if (removed.length > 0) {
    debug("update.deprecated_files_cleaned", { count: String(removed.length) });
  }
  return removed;
}
function getComponentPath2(component) {
  const layout = getProviderLayout();
  if (component === "guides") {
    return "guides";
  }
  return `${layout.rootDir}/${component}`;
}
async function backupInstallation(targetDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join6(targetDir, `.omcustom-backup-${timestamp}`);
  const fs = await import("node:fs/promises");
  await ensureDirectory(backupDir);
  const layout = getProviderLayout();
  const dirsToBackup = [layout.rootDir, "guides"];
  for (const dir of dirsToBackup) {
    const srcPath = join6(targetDir, dir);
    if (await fileExists(srcPath)) {
      const destPath = join6(backupDir, dir);
      await copyDirectory(srcPath, destPath, { overwrite: true });
    }
  }
  const entryPath = join6(targetDir, layout.entryFile);
  if (await fileExists(entryPath)) {
    await fs.copyFile(entryPath, join6(backupDir, layout.entryFile));
  }
  return backupDir;
}
async function loadCustomizationManifest(targetDir) {
  const manifestPath = join6(targetDir, CUSTOMIZATION_MANIFEST_FILE);
  if (await fileExists(manifestPath)) {
    return readJsonFile(manifestPath);
  }
  return null;
}

// src/index.ts
init_fs();
var VERSION = "0.0.0";
var src_default = {
  VERSION
};
export {
  writeJsonFile,
  warn,
  update,
  success,
  setLogLevel,
  setLocale,
  saveConfig,
  resolveTemplatePath,
  renderGitWorkflowKO,
  renderGitWorkflowEN,
  readJsonFile,
  preserveCustomizations,
  mergeConfig,
  loadConfig,
  install,
  info,
  getTemplateManifest,
  getProviderLayout,
  getPackageRoot,
  getDefaultWorkflow,
  getDefaultConfig,
  getConfigPath,
  fileExists,
  error,
  ensureDirectory,
  detectProvider,
  detectGitWorkflow,
  src_default as default,
  debug,
  createLogger,
  createDirectoryStructure,
  copyTemplates,
  copyDirectory,
  checkForUpdates,
  applyUpdates,
  VERSION
};
