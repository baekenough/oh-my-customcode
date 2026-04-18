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

// src/core/registry.ts
var exports_registry = {};
__export(exports_registry, {
  unregisterProject: () => unregisterProject,
  registryToList: () => registryToList,
  registerProject: () => registerProject,
  readRegistry: () => readRegistry,
  migrateFromLockfiles: () => migrateFromLockfiles,
  isTempPath: () => isTempPath,
  cleanRegistry: () => cleanRegistry,
  _setRegistryDirForTesting: () => _setRegistryDirForTesting
});
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename as basename3, join as join6, resolve as resolve2, sep as sep2 } from "node:path";
function _setRegistryDirForTesting(dir2) {
  _registryDirOverride = dir2;
}
function isTempPath(projectPath) {
  const normalized = resolve2(projectPath);
  const candidates = new Set;
  candidates.add(resolve2(tmpdir()));
  for (const envKey of ["TMPDIR", "TMP", "TEMP"]) {
    const value = process.env[envKey];
    if (value)
      candidates.add(resolve2(value));
  }
  candidates.add("/tmp");
  candidates.add("/var/tmp");
  candidates.add("/var/folders");
  for (const candidate of candidates) {
    if (normalized === candidate || normalized.startsWith(candidate + sep2)) {
      return true;
    }
  }
  return false;
}
function registryDir() {
  if (_registryDirOverride !== undefined)
    return _registryDirOverride;
  const envOverride = process.env.OMCUSTOM_REGISTRY_DIR;
  if (envOverride)
    return envOverride;
  const home = process.env.HOME ?? homedir();
  return join6(home, ".oh-my-customcode");
}
function registryPath() {
  return join6(registryDir(), "projects.json");
}
async function readRegistryRaw() {
  try {
    const content = await readFile(registryPath(), "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && "projects" in parsed && typeof parsed.projects === "object" && parsed.projects !== null) {
      return parsed;
    }
    return { ...EMPTY_REGISTRY };
  } catch {
    return { ...EMPTY_REGISTRY };
  }
}
async function writeRegistry(registry) {
  const dir2 = registryDir();
  await mkdir(dir2, { recursive: true });
  await writeFile(registryPath(), JSON.stringify(registry, null, 2), "utf-8");
}
async function readRegistry() {
  return readRegistryRaw();
}
async function registerProject(projectPath, version) {
  const normalizedPath = resolve2(projectPath);
  if (!process.env.OMCUSTOM_REGISTRY_DIR && _registryDirOverride === undefined) {
    if (isTempPath(normalizedPath))
      return;
  }
  const registry = await readRegistryRaw();
  const existing = registry.projects[normalizedPath];
  const now = new Date().toISOString();
  registry.projects[normalizedPath] = {
    version,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now
  };
  await writeRegistry(registry);
}
async function unregisterProject(projectPath) {
  const normalizedPath = resolve2(projectPath);
  const registry = await readRegistryRaw();
  if (!(normalizedPath in registry.projects))
    return;
  delete registry.projects[normalizedPath];
  await writeRegistry(registry);
}
async function cleanRegistry() {
  const { access: fsAccess } = await import("node:fs/promises");
  const registry = await readRegistryRaw();
  const paths = Object.keys(registry.projects);
  let removed = 0;
  const purgeTempPaths = !process.env.OMCUSTOM_REGISTRY_DIR && _registryDirOverride === undefined;
  for (const projectPath of paths) {
    if (purgeTempPaths && isTempPath(projectPath)) {
      delete registry.projects[projectPath];
      removed++;
      continue;
    }
    try {
      await fsAccess(projectPath);
    } catch {
      delete registry.projects[projectPath];
      removed++;
    }
  }
  if (removed > 0) {
    await writeRegistry(registry);
  }
  return removed;
}
async function parseLockFile(lockPath) {
  try {
    const content = await readFile(lockPath, "utf-8");
    const lock = JSON.parse(content);
    const version = typeof lock.version === "string" ? lock.version : typeof lock.templateVersion === "string" ? lock.templateVersion : "0.0.0";
    const now = new Date().toISOString();
    return {
      version,
      installedAt: typeof lock.installedAt === "string" ? lock.installedAt : now,
      updatedAt: typeof lock.updatedAt === "string" ? lock.updatedAt : now
    };
  } catch {
    return null;
  }
}
async function migrateFromLockfiles(searchDirs) {
  const { readdir: readdir3 } = await import("node:fs/promises");
  const MAX_DEPTH = 3;
  const discovered = new Map;
  async function scan(dir2, depth) {
    if (depth > MAX_DEPTH || discovered.has(dir2))
      return;
    let entries;
    try {
      entries = await readdir3(dir2, { withFileTypes: true });
    } catch {
      return;
    }
    const entry = await parseLockFile(join6(dir2, ".omcustom.lock.json"));
    if (entry !== null) {
      discovered.set(resolve2(dir2), entry);
      return;
    }
    if (depth < MAX_DEPTH) {
      const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SCAN_SKIP_DIRS.has(e.name));
      await Promise.all(subdirs.map((sub) => scan(join6(dir2, sub.name), depth + 1)));
    }
  }
  await Promise.all(searchDirs.map((dir2) => scan(dir2, 0).catch(() => {})));
  if (discovered.size === 0)
    return 0;
  const registry = await readRegistryRaw();
  let imported = 0;
  for (const [projectPath, entry] of discovered) {
    if (!(projectPath in registry.projects)) {
      registry.projects[projectPath] = entry;
      imported++;
    }
  }
  if (imported > 0) {
    await writeRegistry(registry);
  }
  return imported;
}
function registryToList(registry) {
  return Object.entries(registry.projects).map(([path, entry]) => ({
    name: basename3(path),
    path,
    version: entry.version,
    installedAt: entry.installedAt,
    updatedAt: entry.updatedAt
  }));
}
var _registryDirOverride, EMPTY_REGISTRY, SCAN_SKIP_DIRS;
var init_registry = __esm(() => {
  EMPTY_REGISTRY = { projects: {} };
  SCAN_SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);
});

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
    "update.protected_file_updated": "⟳ Protected file {{file}} in {{component}} updated: {{hint}}",
    "update.namespace_synced": "Namespace synced: {{file}} ({{component}})",
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
    "update.protected_file_updated": "⟳ 보호 파일 {{file}} ({{component}}) 업데이트됨: {{hint}}",
    "update.namespace_synced": "네임스페이스 동기화: {{file}} ({{component}})",
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

// src/core/codex-installer.ts
import { execSync } from "node:child_process";
import { platform } from "node:os";
var defaultDeps = {
  exec: execSync,
  getPlatform: platform
};
function isCodexInstalled(deps = defaultDeps) {
  try {
    deps.exec("which codex", { stdio: "pipe", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
function installCodex(deps = defaultDeps) {
  if (process.env.CI || false || false) {
    return false;
  }
  if (isCodexInstalled(deps)) {
    info("codex.already_installed");
    return true;
  }
  const os = deps.getPlatform();
  try {
    if (os === "darwin") {
      try {
        info("codex.installing_brew");
        deps.exec("brew install openai-codex", {
          stdio: "inherit",
          timeout: 120000
        });
        return isCodexInstalled(deps);
      } catch {
        info("codex.installing_npm");
        deps.exec("npm install -g @openai/codex", {
          stdio: "inherit",
          timeout: 120000
        });
        return isCodexInstalled(deps);
      }
    } else if (os === "linux") {
      info("codex.installing_npm");
      deps.exec("npm install -g @openai/codex", {
        stdio: "inherit",
        timeout: 120000
      });
      return isCodexInstalled(deps);
    } else {
      warn("codex.unsupported_os", { os });
      return false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn("codex.install_failed", { error: message });
    return false;
  }
}

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
async function readLockfile(targetDir) {
  const lockfilePath = join4(targetDir, LOCKFILE_NAME);
  const exists = await fileExists(lockfilePath);
  if (!exists) {
    debug("lockfile.not_found", { path: lockfilePath });
    return null;
  }
  try {
    const data = await readJsonFile(lockfilePath);
    if (typeof data !== "object" || data === null || data.lockfileVersion !== LOCKFILE_VERSION) {
      warn("lockfile.invalid_version", { path: lockfilePath });
      return null;
    }
    const record = data;
    if (typeof record.files !== "object" || record.files === null) {
      warn("lockfile.invalid_structure", { path: lockfilePath });
      return null;
    }
    return data;
  } catch (err) {
    warn("lockfile.read_failed", { path: lockfilePath, error: String(err) });
    return null;
  }
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

// src/core/rtk-installer.ts
import { execSync as execSync2 } from "node:child_process";
import { platform as platform2 } from "node:os";
var defaultDeps2 = {
  exec: execSync2,
  getPlatform: platform2
};
function isRtkInstalled(deps = defaultDeps2) {
  try {
    deps.exec("which rtk", { stdio: "pipe", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
function installRtk(deps = defaultDeps2) {
  if (process.env.CI || false || false) {
    return false;
  }
  if (isRtkInstalled(deps)) {
    info("rtk.already_installed");
    return true;
  }
  const os = deps.getPlatform();
  try {
    if (os === "darwin") {
      try {
        info("rtk.installing_brew");
        deps.exec("brew install rtk-ai/tap/rtk", {
          stdio: "inherit",
          timeout: 120000
        });
        return true;
      } catch {
        info("rtk.installing_curl");
        deps.exec("curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh", {
          stdio: "inherit",
          timeout: 120000
        });
        return isRtkInstalled(deps);
      }
    } else if (os === "linux") {
      info("rtk.installing_curl");
      deps.exec("curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh", {
        stdio: "inherit",
        timeout: 120000
      });
      return isRtkInstalled(deps);
    } else {
      warn("rtk.unsupported_os", { os });
      return false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn("rtk.install_failed", { error: message });
    return false;
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
      padding: 0,
      refreshInterval: 10
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
  const manifest = await getTemplateManifest();
  config.version = manifest.version;
  config.language = options.language ?? DEFAULT_LANGUAGE;
  config.domain = options.domain;
  config.installedAt = new Date().toISOString();
  config.installedComponents = installedComponents;
  await saveConfig(targetDir, config);
}
function installRtkIfNeeded(result) {
  if (!isRtkInstalled()) {
    info("install.rtk_installing");
    const rtkInstalled = installRtk();
    if (rtkInstalled) {
      info("install.rtk_success");
    } else {
      result.warnings.push("RTK installation failed — install manually: brew install rtk-ai/tap/rtk");
    }
  } else {
    info("install.rtk_already");
  }
}
function installCodexIfNeeded(result) {
  if (!isCodexInstalled()) {
    info("install.codex_installing");
    const codexInstalled = installCodex();
    if (codexInstalled) {
      info("install.codex_success");
    } else {
      result.warnings.push("Codex CLI installation failed — install manually: npm install -g @openai/codex");
    }
  } else {
    info("install.codex_already");
  }
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
    installRtkIfNeeded(result);
    installCodexIfNeeded(result);
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
import { join as join7 } from "node:path";
// package.json
var package_default = {
  name: "oh-my-customcode",
  workspaces: [
    "packages/*"
  ],
  version: "0.97.1",
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
    test: "bun test tests/ packages/eval-core/",
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
    i18next: "^26.0.2",
    yaml: "^2.8.2"
  },
  devDependencies: {
    "@anthropic-ai/sdk": "^0.88.0",
    "@biomejs/biome": "^2.3.12",
    "@types/bun": "^1.3.6",
    "@types/js-yaml": "^4.0.9",
    "@types/nodemailer": "^8.0.0",
    "js-yaml": "^4.1.0",
    nodemailer: "^8.0.1",
    typescript: "^6.0.2",
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

// node_modules/.bun/i18next@26.0.2+8e24a2f921b8d7be/node_modules/i18next/dist/esm/i18next.js
var isString = (obj) => typeof obj === "string";
var defer = () => {
  let res;
  let rej;
  const promise = new Promise((resolve2, reject) => {
    res = resolve2;
    rej = reject;
  });
  promise.resolve = res;
  promise.reject = rej;
  return promise;
};
var makeString = (object) => {
  if (object == null)
    return "";
  return String(object);
};
var copy = (a, s, t) => {
  a.forEach((m) => {
    if (s[m])
      t[m] = s[m];
  });
};
var lastOfPathSeparatorRegExp = /###/g;
var cleanKey = (key) => key && key.includes("###") ? key.replace(lastOfPathSeparatorRegExp, ".") : key;
var canNotTraverseDeeper = (object) => !object || isString(object);
var getLastOfPath = (object, path, Empty) => {
  const stack = !isString(path) ? path : path.split(".");
  let stackIndex = 0;
  while (stackIndex < stack.length - 1) {
    if (canNotTraverseDeeper(object))
      return {};
    const key = cleanKey(stack[stackIndex]);
    if (!object[key] && Empty)
      object[key] = new Empty;
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      object = object[key];
    } else {
      object = {};
    }
    ++stackIndex;
  }
  if (canNotTraverseDeeper(object))
    return {};
  return {
    obj: object,
    k: cleanKey(stack[stackIndex])
  };
};
var setPath = (object, path, newValue) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path, Object);
  if (obj !== undefined || path.length === 1) {
    obj[k] = newValue;
    return;
  }
  let e = path[path.length - 1];
  let p = path.slice(0, path.length - 1);
  let last = getLastOfPath(object, p, Object);
  while (last.obj === undefined && p.length) {
    e = `${p[p.length - 1]}.${e}`;
    p = p.slice(0, p.length - 1);
    last = getLastOfPath(object, p, Object);
    if (last?.obj && typeof last.obj[`${last.k}.${e}`] !== "undefined") {
      last.obj = undefined;
    }
  }
  last.obj[`${last.k}.${e}`] = newValue;
};
var pushPath = (object, path, newValue, concat) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path, Object);
  obj[k] = obj[k] || [];
  obj[k].push(newValue);
};
var getPath = (object, path) => {
  const {
    obj,
    k
  } = getLastOfPath(object, path);
  if (!obj)
    return;
  if (!Object.prototype.hasOwnProperty.call(obj, k))
    return;
  return obj[k];
};
var getPathWithDefaults = (data, defaultData, key) => {
  const value = getPath(data, key);
  if (value !== undefined) {
    return value;
  }
  return getPath(defaultData, key);
};
var deepExtend = (target, source, overwrite) => {
  for (const prop in source) {
    if (prop !== "__proto__" && prop !== "constructor") {
      if (prop in target) {
        if (isString(target[prop]) || target[prop] instanceof String || isString(source[prop]) || source[prop] instanceof String) {
          if (overwrite)
            target[prop] = source[prop];
        } else {
          deepExtend(target[prop], source[prop], overwrite);
        }
      } else {
        target[prop] = source[prop];
      }
    }
  }
  return target;
};
var regexEscape = (str) => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
var _entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;"
};
var escape = (data) => {
  if (isString(data)) {
    return data.replace(/[&<>"'\/]/g, (s) => _entityMap[s]);
  }
  return data;
};

class RegExpCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.regExpMap = new Map;
    this.regExpQueue = [];
  }
  getRegExp(pattern) {
    const regExpFromCache = this.regExpMap.get(pattern);
    if (regExpFromCache !== undefined) {
      return regExpFromCache;
    }
    const regExpNew = new RegExp(pattern);
    if (this.regExpQueue.length === this.capacity) {
      this.regExpMap.delete(this.regExpQueue.shift());
    }
    this.regExpMap.set(pattern, regExpNew);
    this.regExpQueue.push(pattern);
    return regExpNew;
  }
}
var chars = [" ", ",", "?", "!", ";"];
var looksLikeObjectPathRegExpCache = new RegExpCache(20);
var looksLikeObjectPath = (key, nsSeparator, keySeparator) => {
  nsSeparator = nsSeparator || "";
  keySeparator = keySeparator || "";
  const possibleChars = chars.filter((c) => !nsSeparator.includes(c) && !keySeparator.includes(c));
  if (possibleChars.length === 0)
    return true;
  const r = looksLikeObjectPathRegExpCache.getRegExp(`(${possibleChars.map((c) => c === "?" ? "\\?" : c).join("|")})`);
  let matched = !r.test(key);
  if (!matched) {
    const ki = key.indexOf(keySeparator);
    if (ki > 0 && !r.test(key.substring(0, ki))) {
      matched = true;
    }
  }
  return matched;
};
var deepFind = (obj, path, keySeparator = ".") => {
  if (!obj)
    return;
  if (obj[path]) {
    if (!Object.prototype.hasOwnProperty.call(obj, path))
      return;
    return obj[path];
  }
  const tokens = path.split(keySeparator);
  let current = obj;
  for (let i = 0;i < tokens.length; ) {
    if (!current || typeof current !== "object") {
      return;
    }
    let next;
    let nextPath = "";
    for (let j = i;j < tokens.length; ++j) {
      if (j !== i) {
        nextPath += keySeparator;
      }
      nextPath += tokens[j];
      next = current[nextPath];
      if (next !== undefined) {
        if (["string", "number", "boolean"].includes(typeof next) && j < tokens.length - 1) {
          continue;
        }
        i += j - i + 1;
        break;
      }
    }
    current = next;
  }
  return current;
};
var getCleanedCode = (code) => code?.replace(/_/g, "-");
var consoleLogger = {
  type: "logger",
  log(args) {
    this.output("log", args);
  },
  warn(args) {
    this.output("warn", args);
  },
  error(args) {
    this.output("error", args);
  },
  output(type, args) {
    console?.[type]?.apply?.(console, args);
  }
};

class Logger {
  constructor(concreteLogger, options = {}) {
    this.init(concreteLogger, options);
  }
  init(concreteLogger, options = {}) {
    this.prefix = options.prefix || "i18next:";
    this.logger = concreteLogger || consoleLogger;
    this.options = options;
    this.debug = options.debug;
  }
  log(...args) {
    return this.forward(args, "log", "", true);
  }
  warn(...args) {
    return this.forward(args, "warn", "", true);
  }
  error(...args) {
    return this.forward(args, "error", "");
  }
  deprecate(...args) {
    return this.forward(args, "warn", "WARNING DEPRECATED: ", true);
  }
  forward(args, lvl, prefix, debugOnly) {
    if (debugOnly && !this.debug)
      return null;
    if (isString(args[0]))
      args[0] = `${prefix}${this.prefix} ${args[0]}`;
    return this.logger[lvl](args);
  }
  create(moduleName) {
    return new Logger(this.logger, {
      ...{
        prefix: `${this.prefix}:${moduleName}:`
      },
      ...this.options
    });
  }
  clone(options) {
    options = options || this.options;
    options.prefix = options.prefix || this.prefix;
    return new Logger(this.logger, options);
  }
}
var baseLogger = new Logger;

class EventEmitter {
  constructor() {
    this.observers = {};
  }
  on(events, listener) {
    events.split(" ").forEach((event) => {
      if (!this.observers[event])
        this.observers[event] = new Map;
      const numListeners = this.observers[event].get(listener) || 0;
      this.observers[event].set(listener, numListeners + 1);
    });
    return this;
  }
  off(event, listener) {
    if (!this.observers[event])
      return;
    if (!listener) {
      delete this.observers[event];
      return;
    }
    this.observers[event].delete(listener);
  }
  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
    return this;
  }
  emit(event, ...args) {
    if (this.observers[event]) {
      const cloned = Array.from(this.observers[event].entries());
      cloned.forEach(([observer, numTimesAdded]) => {
        for (let i = 0;i < numTimesAdded; i++) {
          observer(...args);
        }
      });
    }
    if (this.observers["*"]) {
      const cloned = Array.from(this.observers["*"].entries());
      cloned.forEach(([observer, numTimesAdded]) => {
        for (let i = 0;i < numTimesAdded; i++) {
          observer(event, ...args);
        }
      });
    }
  }
}

class ResourceStore extends EventEmitter {
  constructor(data, options = {
    ns: ["translation"],
    defaultNS: "translation"
  }) {
    super();
    this.data = data || {};
    this.options = options;
    if (this.options.keySeparator === undefined) {
      this.options.keySeparator = ".";
    }
    if (this.options.ignoreJSONStructure === undefined) {
      this.options.ignoreJSONStructure = true;
    }
  }
  addNamespaces(ns) {
    if (!this.options.ns.includes(ns)) {
      this.options.ns.push(ns);
    }
  }
  removeNamespaces(ns) {
    const index = this.options.ns.indexOf(ns);
    if (index > -1) {
      this.options.ns.splice(index, 1);
    }
  }
  getResource(lng, ns, key, options = {}) {
    const keySeparator = options.keySeparator !== undefined ? options.keySeparator : this.options.keySeparator;
    const ignoreJSONStructure = options.ignoreJSONStructure !== undefined ? options.ignoreJSONStructure : this.options.ignoreJSONStructure;
    let path;
    if (lng.includes(".")) {
      path = lng.split(".");
    } else {
      path = [lng, ns];
      if (key) {
        if (Array.isArray(key)) {
          path.push(...key);
        } else if (isString(key) && keySeparator) {
          path.push(...key.split(keySeparator));
        } else {
          path.push(key);
        }
      }
    }
    const result = getPath(this.data, path);
    if (!result && !ns && !key && lng.includes(".")) {
      lng = path[0];
      ns = path[1];
      key = path.slice(2).join(".");
    }
    if (result || !ignoreJSONStructure || !isString(key))
      return result;
    return deepFind(this.data?.[lng]?.[ns], key, keySeparator);
  }
  addResource(lng, ns, key, value, options = {
    silent: false
  }) {
    const keySeparator = options.keySeparator !== undefined ? options.keySeparator : this.options.keySeparator;
    let path = [lng, ns];
    if (key)
      path = path.concat(keySeparator ? key.split(keySeparator) : key);
    if (lng.includes(".")) {
      path = lng.split(".");
      value = ns;
      ns = path[1];
    }
    this.addNamespaces(ns);
    setPath(this.data, path, value);
    if (!options.silent)
      this.emit("added", lng, ns, key, value);
  }
  addResources(lng, ns, resources, options = {
    silent: false
  }) {
    for (const m in resources) {
      if (isString(resources[m]) || Array.isArray(resources[m]))
        this.addResource(lng, ns, m, resources[m], {
          silent: true
        });
    }
    if (!options.silent)
      this.emit("added", lng, ns, resources);
  }
  addResourceBundle(lng, ns, resources, deep, overwrite, options = {
    silent: false,
    skipCopy: false
  }) {
    let path = [lng, ns];
    if (lng.includes(".")) {
      path = lng.split(".");
      deep = resources;
      resources = ns;
      ns = path[1];
    }
    this.addNamespaces(ns);
    let pack = getPath(this.data, path) || {};
    if (!options.skipCopy)
      resources = JSON.parse(JSON.stringify(resources));
    if (deep) {
      deepExtend(pack, resources, overwrite);
    } else {
      pack = {
        ...pack,
        ...resources
      };
    }
    setPath(this.data, path, pack);
    if (!options.silent)
      this.emit("added", lng, ns, resources);
  }
  removeResourceBundle(lng, ns) {
    if (this.hasResourceBundle(lng, ns)) {
      delete this.data[lng][ns];
    }
    this.removeNamespaces(ns);
    this.emit("removed", lng, ns);
  }
  hasResourceBundle(lng, ns) {
    return this.getResource(lng, ns) !== undefined;
  }
  getResourceBundle(lng, ns) {
    if (!ns)
      ns = this.options.defaultNS;
    return this.getResource(lng, ns);
  }
  getDataByLanguage(lng) {
    return this.data[lng];
  }
  hasLanguageSomeTranslations(lng) {
    const data = this.getDataByLanguage(lng);
    const n = data && Object.keys(data) || [];
    return !!n.find((v) => data[v] && Object.keys(data[v]).length > 0);
  }
  toJSON() {
    return this.data;
  }
}
var postProcessor = {
  processors: {},
  addPostProcessor(module) {
    this.processors[module.name] = module;
  },
  handle(processors, value, key, options, translator) {
    processors.forEach((processor) => {
      value = this.processors[processor]?.process(value, key, options, translator) ?? value;
    });
    return value;
  }
};
var PATH_KEY = Symbol("i18next/PATH_KEY");
function createProxy() {
  const state = [];
  const handler = Object.create(null);
  let proxy;
  handler.get = (target, key) => {
    proxy?.revoke?.();
    if (key === PATH_KEY)
      return state;
    state.push(key);
    proxy = Proxy.revocable(target, handler);
    return proxy.proxy;
  };
  return Proxy.revocable(Object.create(null), handler).proxy;
}
function keysFromSelector(selector, opts) {
  const {
    [PATH_KEY]: path
  } = selector(createProxy());
  const keySeparator = opts?.keySeparator ?? ".";
  const nsSeparator = opts?.nsSeparator ?? ":";
  if (path.length > 1 && nsSeparator) {
    const ns = opts?.ns;
    const nsArray = Array.isArray(ns) ? ns : null;
    if (nsArray && nsArray.length > 1 && nsArray.slice(1).includes(path[0])) {
      return `${path[0]}${nsSeparator}${path.slice(1).join(keySeparator)}`;
    }
  }
  return path.join(keySeparator);
}
var shouldHandleAsObject = (res) => !isString(res) && typeof res !== "boolean" && typeof res !== "number";

class Translator extends EventEmitter {
  constructor(services, options = {}) {
    super();
    copy(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], services, this);
    this.options = options;
    if (this.options.keySeparator === undefined) {
      this.options.keySeparator = ".";
    }
    this.logger = baseLogger.create("translator");
    this.checkedLoadedFor = {};
  }
  changeLanguage(lng) {
    if (lng)
      this.language = lng;
  }
  exists(key, o = {
    interpolation: {}
  }) {
    const opt = {
      ...o
    };
    if (key == null)
      return false;
    const resolved = this.resolve(key, opt);
    if (resolved?.res === undefined)
      return false;
    const isObject = shouldHandleAsObject(resolved.res);
    if (opt.returnObjects === false && isObject) {
      return false;
    }
    return true;
  }
  extractFromKey(key, opt) {
    let nsSeparator = opt.nsSeparator !== undefined ? opt.nsSeparator : this.options.nsSeparator;
    if (nsSeparator === undefined)
      nsSeparator = ":";
    const keySeparator = opt.keySeparator !== undefined ? opt.keySeparator : this.options.keySeparator;
    let namespaces = opt.ns || this.options.defaultNS || [];
    const wouldCheckForNsInKey = nsSeparator && key.includes(nsSeparator);
    const seemsNaturalLanguage = !this.options.userDefinedKeySeparator && !opt.keySeparator && !this.options.userDefinedNsSeparator && !opt.nsSeparator && !looksLikeObjectPath(key, nsSeparator, keySeparator);
    if (wouldCheckForNsInKey && !seemsNaturalLanguage) {
      const m = key.match(this.interpolator.nestingRegexp);
      if (m && m.length > 0) {
        return {
          key,
          namespaces: isString(namespaces) ? [namespaces] : namespaces
        };
      }
      const parts = key.split(nsSeparator);
      if (nsSeparator !== keySeparator || nsSeparator === keySeparator && this.options.ns.includes(parts[0]))
        namespaces = parts.shift();
      key = parts.join(keySeparator);
    }
    return {
      key,
      namespaces: isString(namespaces) ? [namespaces] : namespaces
    };
  }
  translate(keys, o, lastKey) {
    let opt = typeof o === "object" ? {
      ...o
    } : o;
    if (typeof opt !== "object" && this.options.overloadTranslationOptionHandler) {
      opt = this.options.overloadTranslationOptionHandler(arguments);
    }
    if (typeof opt === "object")
      opt = {
        ...opt
      };
    if (!opt)
      opt = {};
    if (keys == null)
      return "";
    if (typeof keys === "function")
      keys = keysFromSelector(keys, {
        ...this.options,
        ...opt
      });
    if (!Array.isArray(keys))
      keys = [String(keys)];
    keys = keys.map((k) => typeof k === "function" ? keysFromSelector(k, {
      ...this.options,
      ...opt
    }) : String(k));
    const returnDetails = opt.returnDetails !== undefined ? opt.returnDetails : this.options.returnDetails;
    const keySeparator = opt.keySeparator !== undefined ? opt.keySeparator : this.options.keySeparator;
    const {
      key,
      namespaces
    } = this.extractFromKey(keys[keys.length - 1], opt);
    const namespace = namespaces[namespaces.length - 1];
    let nsSeparator = opt.nsSeparator !== undefined ? opt.nsSeparator : this.options.nsSeparator;
    if (nsSeparator === undefined)
      nsSeparator = ":";
    const lng = opt.lng || this.language;
    const appendNamespaceToCIMode = opt.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
    if (lng?.toLowerCase() === "cimode") {
      if (appendNamespaceToCIMode) {
        if (returnDetails) {
          return {
            res: `${namespace}${nsSeparator}${key}`,
            usedKey: key,
            exactUsedKey: key,
            usedLng: lng,
            usedNS: namespace,
            usedParams: this.getUsedParamsDetails(opt)
          };
        }
        return `${namespace}${nsSeparator}${key}`;
      }
      if (returnDetails) {
        return {
          res: key,
          usedKey: key,
          exactUsedKey: key,
          usedLng: lng,
          usedNS: namespace,
          usedParams: this.getUsedParamsDetails(opt)
        };
      }
      return key;
    }
    const resolved = this.resolve(keys, opt);
    let res = resolved?.res;
    const resUsedKey = resolved?.usedKey || key;
    const resExactUsedKey = resolved?.exactUsedKey || key;
    const noObject = ["[object Number]", "[object Function]", "[object RegExp]"];
    const joinArrays = opt.joinArrays !== undefined ? opt.joinArrays : this.options.joinArrays;
    const handleAsObjectInI18nFormat = !this.i18nFormat || this.i18nFormat.handleAsObject;
    const needsPluralHandling = opt.count !== undefined && !isString(opt.count);
    const hasDefaultValue = Translator.hasDefaultValue(opt);
    const defaultValueSuffix = needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, opt) : "";
    const defaultValueSuffixOrdinalFallback = opt.ordinal && needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, {
      ordinal: false
    }) : "";
    const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
    const defaultValue = needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] || opt[`defaultValue${defaultValueSuffix}`] || opt[`defaultValue${defaultValueSuffixOrdinalFallback}`] || opt.defaultValue;
    let resForObjHndl = res;
    if (handleAsObjectInI18nFormat && !res && hasDefaultValue) {
      resForObjHndl = defaultValue;
    }
    const handleAsObject = shouldHandleAsObject(resForObjHndl);
    const resType = Object.prototype.toString.apply(resForObjHndl);
    if (handleAsObjectInI18nFormat && resForObjHndl && handleAsObject && !noObject.includes(resType) && !(isString(joinArrays) && Array.isArray(resForObjHndl))) {
      if (!opt.returnObjects && !this.options.returnObjects) {
        if (!this.options.returnedObjectHandler) {
          this.logger.warn("accessing an object - but returnObjects options is not enabled!");
        }
        const r = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(resUsedKey, resForObjHndl, {
          ...opt,
          ns: namespaces
        }) : `key '${key} (${this.language})' returned an object instead of string.`;
        if (returnDetails) {
          resolved.res = r;
          resolved.usedParams = this.getUsedParamsDetails(opt);
          return resolved;
        }
        return r;
      }
      if (keySeparator) {
        const resTypeIsArray = Array.isArray(resForObjHndl);
        const copy2 = resTypeIsArray ? [] : {};
        const newKeyToUse = resTypeIsArray ? resExactUsedKey : resUsedKey;
        for (const m in resForObjHndl) {
          if (Object.prototype.hasOwnProperty.call(resForObjHndl, m)) {
            const deepKey = `${newKeyToUse}${keySeparator}${m}`;
            if (hasDefaultValue && !res) {
              copy2[m] = this.translate(deepKey, {
                ...opt,
                defaultValue: shouldHandleAsObject(defaultValue) ? defaultValue[m] : undefined,
                ...{
                  joinArrays: false,
                  ns: namespaces
                }
              });
            } else {
              copy2[m] = this.translate(deepKey, {
                ...opt,
                ...{
                  joinArrays: false,
                  ns: namespaces
                }
              });
            }
            if (copy2[m] === deepKey)
              copy2[m] = resForObjHndl[m];
          }
        }
        res = copy2;
      }
    } else if (handleAsObjectInI18nFormat && isString(joinArrays) && Array.isArray(res)) {
      res = res.join(joinArrays);
      if (res)
        res = this.extendTranslation(res, keys, opt, lastKey);
    } else {
      let usedDefault = false;
      let usedKey = false;
      if (!this.isValidLookup(res) && hasDefaultValue) {
        usedDefault = true;
        res = defaultValue;
      }
      if (!this.isValidLookup(res)) {
        usedKey = true;
        res = key;
      }
      const missingKeyNoValueFallbackToKey = opt.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey;
      const resForMissing = missingKeyNoValueFallbackToKey && usedKey ? undefined : res;
      const updateMissing = hasDefaultValue && defaultValue !== res && this.options.updateMissing;
      if (usedKey || usedDefault || updateMissing) {
        this.logger.log(updateMissing ? "updateKey" : "missingKey", lng, namespace, key, updateMissing ? defaultValue : res);
        if (keySeparator) {
          const fk = this.resolve(key, {
            ...opt,
            keySeparator: false
          });
          if (fk && fk.res)
            this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
        }
        let lngs = [];
        const fallbackLngs = this.languageUtils.getFallbackCodes(this.options.fallbackLng, opt.lng || this.language);
        if (this.options.saveMissingTo === "fallback" && fallbackLngs && fallbackLngs[0]) {
          for (let i = 0;i < fallbackLngs.length; i++) {
            lngs.push(fallbackLngs[i]);
          }
        } else if (this.options.saveMissingTo === "all") {
          lngs = this.languageUtils.toResolveHierarchy(opt.lng || this.language);
        } else {
          lngs.push(opt.lng || this.language);
        }
        const send = (l, k, specificDefaultValue) => {
          const defaultForMissing = hasDefaultValue && specificDefaultValue !== res ? specificDefaultValue : resForMissing;
          if (this.options.missingKeyHandler) {
            this.options.missingKeyHandler(l, namespace, k, defaultForMissing, updateMissing, opt);
          } else if (this.backendConnector?.saveMissing) {
            this.backendConnector.saveMissing(l, namespace, k, defaultForMissing, updateMissing, opt);
          }
          this.emit("missingKey", l, namespace, k, res);
        };
        if (this.options.saveMissing) {
          if (this.options.saveMissingPlurals && needsPluralHandling) {
            lngs.forEach((language) => {
              const suffixes = this.pluralResolver.getSuffixes(language, opt);
              if (needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] && !suffixes.includes(`${this.options.pluralSeparator}zero`)) {
                suffixes.push(`${this.options.pluralSeparator}zero`);
              }
              suffixes.forEach((suffix) => {
                send([language], key + suffix, opt[`defaultValue${suffix}`] || defaultValue);
              });
            });
          } else {
            send(lngs, key, defaultValue);
          }
        }
      }
      res = this.extendTranslation(res, keys, opt, resolved, lastKey);
      if (usedKey && res === key && this.options.appendNamespaceToMissingKey) {
        res = `${namespace}${nsSeparator}${key}`;
      }
      if ((usedKey || usedDefault) && this.options.parseMissingKeyHandler) {
        res = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${namespace}${nsSeparator}${key}` : key, usedDefault ? res : undefined, opt);
      }
    }
    if (returnDetails) {
      resolved.res = res;
      resolved.usedParams = this.getUsedParamsDetails(opt);
      return resolved;
    }
    return res;
  }
  extendTranslation(res, key, opt, resolved, lastKey) {
    if (this.i18nFormat?.parse) {
      res = this.i18nFormat.parse(res, {
        ...this.options.interpolation.defaultVariables,
        ...opt
      }, opt.lng || this.language || resolved.usedLng, resolved.usedNS, resolved.usedKey, {
        resolved
      });
    } else if (!opt.skipInterpolation) {
      if (opt.interpolation)
        this.interpolator.init({
          ...opt,
          ...{
            interpolation: {
              ...this.options.interpolation,
              ...opt.interpolation
            }
          }
        });
      const skipOnVariables = isString(res) && (opt?.interpolation?.skipOnVariables !== undefined ? opt.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
      let nestBef;
      if (skipOnVariables) {
        const nb = res.match(this.interpolator.nestingRegexp);
        nestBef = nb && nb.length;
      }
      let data = opt.replace && !isString(opt.replace) ? opt.replace : opt;
      if (this.options.interpolation.defaultVariables)
        data = {
          ...this.options.interpolation.defaultVariables,
          ...data
        };
      res = this.interpolator.interpolate(res, data, opt.lng || this.language || resolved.usedLng, opt);
      if (skipOnVariables) {
        const na = res.match(this.interpolator.nestingRegexp);
        const nestAft = na && na.length;
        if (nestBef < nestAft)
          opt.nest = false;
      }
      if (!opt.lng && resolved && resolved.res)
        opt.lng = this.language || resolved.usedLng;
      if (opt.nest !== false)
        res = this.interpolator.nest(res, (...args) => {
          if (lastKey?.[0] === args[0] && !opt.context) {
            this.logger.warn(`It seems you are nesting recursively key: ${args[0]} in key: ${key[0]}`);
            return null;
          }
          return this.translate(...args, key);
        }, opt);
      if (opt.interpolation)
        this.interpolator.reset();
    }
    const postProcess = opt.postProcess || this.options.postProcess;
    const postProcessorNames = isString(postProcess) ? [postProcess] : postProcess;
    if (res != null && postProcessorNames?.length && opt.applyPostProcessor !== false) {
      res = postProcessor.handle(postProcessorNames, res, key, this.options && this.options.postProcessPassResolved ? {
        i18nResolved: {
          ...resolved,
          usedParams: this.getUsedParamsDetails(opt)
        },
        ...opt
      } : opt, this);
    }
    return res;
  }
  resolve(keys, opt = {}) {
    let found;
    let usedKey;
    let exactUsedKey;
    let usedLng;
    let usedNS;
    if (isString(keys))
      keys = [keys];
    if (Array.isArray(keys))
      keys = keys.map((k) => typeof k === "function" ? keysFromSelector(k, {
        ...this.options,
        ...opt
      }) : k);
    keys.forEach((k) => {
      if (this.isValidLookup(found))
        return;
      const extracted = this.extractFromKey(k, opt);
      const key = extracted.key;
      usedKey = key;
      let namespaces = extracted.namespaces;
      if (this.options.fallbackNS)
        namespaces = namespaces.concat(this.options.fallbackNS);
      const needsPluralHandling = opt.count !== undefined && !isString(opt.count);
      const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
      const needsContextHandling = opt.context !== undefined && (isString(opt.context) || typeof opt.context === "number") && opt.context !== "";
      const codes = opt.lngs ? opt.lngs : this.languageUtils.toResolveHierarchy(opt.lng || this.language, opt.fallbackLng);
      namespaces.forEach((ns) => {
        if (this.isValidLookup(found))
          return;
        usedNS = ns;
        if (!this.checkedLoadedFor[`${codes[0]}-${ns}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(usedNS)) {
          this.checkedLoadedFor[`${codes[0]}-${ns}`] = true;
          this.logger.warn(`key "${usedKey}" for languages "${codes.join(", ")}" won't get resolved as namespace "${usedNS}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
        }
        codes.forEach((code) => {
          if (this.isValidLookup(found))
            return;
          usedLng = code;
          const finalKeys = [key];
          if (this.i18nFormat?.addLookupKeys) {
            this.i18nFormat.addLookupKeys(finalKeys, key, code, ns, opt);
          } else {
            let pluralSuffix;
            if (needsPluralHandling)
              pluralSuffix = this.pluralResolver.getSuffix(code, opt.count, opt);
            const zeroSuffix = `${this.options.pluralSeparator}zero`;
            const ordinalPrefix = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
            if (needsPluralHandling) {
              if (opt.ordinal && pluralSuffix.startsWith(ordinalPrefix)) {
                finalKeys.push(key + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
              }
              finalKeys.push(key + pluralSuffix);
              if (needsZeroSuffixLookup) {
                finalKeys.push(key + zeroSuffix);
              }
            }
            if (needsContextHandling) {
              const contextKey = `${key}${this.options.contextSeparator || "_"}${opt.context}`;
              finalKeys.push(contextKey);
              if (needsPluralHandling) {
                if (opt.ordinal && pluralSuffix.startsWith(ordinalPrefix)) {
                  finalKeys.push(contextKey + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
                }
                finalKeys.push(contextKey + pluralSuffix);
                if (needsZeroSuffixLookup) {
                  finalKeys.push(contextKey + zeroSuffix);
                }
              }
            }
          }
          let possibleKey;
          while (possibleKey = finalKeys.pop()) {
            if (!this.isValidLookup(found)) {
              exactUsedKey = possibleKey;
              found = this.getResource(code, ns, possibleKey, opt);
            }
          }
        });
      });
    });
    return {
      res: found,
      usedKey,
      exactUsedKey,
      usedLng,
      usedNS
    };
  }
  isValidLookup(res) {
    return res !== undefined && !(!this.options.returnNull && res === null) && !(!this.options.returnEmptyString && res === "");
  }
  getResource(code, ns, key, options = {}) {
    if (this.i18nFormat?.getResource)
      return this.i18nFormat.getResource(code, ns, key, options);
    return this.resourceStore.getResource(code, ns, key, options);
  }
  getUsedParamsDetails(options = {}) {
    const optionsKeys = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"];
    const useOptionsReplaceForData = options.replace && !isString(options.replace);
    let data = useOptionsReplaceForData ? options.replace : options;
    if (useOptionsReplaceForData && typeof options.count !== "undefined") {
      data.count = options.count;
    }
    if (this.options.interpolation.defaultVariables) {
      data = {
        ...this.options.interpolation.defaultVariables,
        ...data
      };
    }
    if (!useOptionsReplaceForData) {
      data = {
        ...data
      };
      for (const key of optionsKeys) {
        delete data[key];
      }
    }
    return data;
  }
  static hasDefaultValue(options) {
    const prefix = "defaultValue";
    for (const option in options) {
      if (Object.prototype.hasOwnProperty.call(options, option) && option.startsWith(prefix) && options[option] !== undefined) {
        return true;
      }
    }
    return false;
  }
}

class LanguageUtil {
  constructor(options) {
    this.options = options;
    this.supportedLngs = this.options.supportedLngs || false;
    this.logger = baseLogger.create("languageUtils");
  }
  getScriptPartFromCode(code) {
    code = getCleanedCode(code);
    if (!code || !code.includes("-"))
      return null;
    const p = code.split("-");
    if (p.length === 2)
      return null;
    p.pop();
    if (p[p.length - 1].toLowerCase() === "x")
      return null;
    return this.formatLanguageCode(p.join("-"));
  }
  getLanguagePartFromCode(code) {
    code = getCleanedCode(code);
    if (!code || !code.includes("-"))
      return code;
    const p = code.split("-");
    return this.formatLanguageCode(p[0]);
  }
  formatLanguageCode(code) {
    if (isString(code) && code.includes("-")) {
      let formattedCode;
      try {
        formattedCode = Intl.getCanonicalLocales(code)[0];
      } catch (e) {}
      if (formattedCode && this.options.lowerCaseLng) {
        formattedCode = formattedCode.toLowerCase();
      }
      if (formattedCode)
        return formattedCode;
      if (this.options.lowerCaseLng) {
        return code.toLowerCase();
      }
      return code;
    }
    return this.options.cleanCode || this.options.lowerCaseLng ? code.toLowerCase() : code;
  }
  isSupportedCode(code) {
    if (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) {
      code = this.getLanguagePartFromCode(code);
    }
    return !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.includes(code);
  }
  getBestMatchFromCodes(codes) {
    if (!codes)
      return null;
    let found;
    codes.forEach((code) => {
      if (found)
        return;
      const cleanedLng = this.formatLanguageCode(code);
      if (!this.options.supportedLngs || this.isSupportedCode(cleanedLng))
        found = cleanedLng;
    });
    if (!found && this.options.supportedLngs) {
      codes.forEach((code) => {
        if (found)
          return;
        const lngScOnly = this.getScriptPartFromCode(code);
        if (this.isSupportedCode(lngScOnly))
          return found = lngScOnly;
        const lngOnly = this.getLanguagePartFromCode(code);
        if (this.isSupportedCode(lngOnly))
          return found = lngOnly;
        found = this.options.supportedLngs.find((supportedLng) => {
          if (supportedLng === lngOnly)
            return true;
          if (!supportedLng.includes("-") && !lngOnly.includes("-"))
            return false;
          if (supportedLng.includes("-") && !lngOnly.includes("-") && supportedLng.slice(0, supportedLng.indexOf("-")) === lngOnly)
            return true;
          if (supportedLng.startsWith(lngOnly) && lngOnly.length > 1)
            return true;
          return false;
        });
      });
    }
    if (!found)
      found = this.getFallbackCodes(this.options.fallbackLng)[0];
    return found;
  }
  getFallbackCodes(fallbacks, code) {
    if (!fallbacks)
      return [];
    if (typeof fallbacks === "function")
      fallbacks = fallbacks(code);
    if (isString(fallbacks))
      fallbacks = [fallbacks];
    if (Array.isArray(fallbacks))
      return fallbacks;
    if (!code)
      return fallbacks.default || [];
    let found = fallbacks[code];
    if (!found)
      found = fallbacks[this.getScriptPartFromCode(code)];
    if (!found)
      found = fallbacks[this.formatLanguageCode(code)];
    if (!found)
      found = fallbacks[this.getLanguagePartFromCode(code)];
    if (!found)
      found = fallbacks.default;
    return found || [];
  }
  toResolveHierarchy(code, fallbackCode) {
    const fallbackCodes = this.getFallbackCodes((fallbackCode === false ? [] : fallbackCode) || this.options.fallbackLng || [], code);
    const codes = [];
    const addCode = (c) => {
      if (!c)
        return;
      if (this.isSupportedCode(c)) {
        codes.push(c);
      } else {
        this.logger.warn(`rejecting language code not found in supportedLngs: ${c}`);
      }
    };
    if (isString(code) && (code.includes("-") || code.includes("_"))) {
      if (this.options.load !== "languageOnly")
        addCode(this.formatLanguageCode(code));
      if (this.options.load !== "languageOnly" && this.options.load !== "currentOnly")
        addCode(this.getScriptPartFromCode(code));
      if (this.options.load !== "currentOnly")
        addCode(this.getLanguagePartFromCode(code));
    } else if (isString(code)) {
      addCode(this.formatLanguageCode(code));
    }
    fallbackCodes.forEach((fc) => {
      if (!codes.includes(fc))
        addCode(this.formatLanguageCode(fc));
    });
    return codes;
  }
}
var suffixesOrder = {
  zero: 0,
  one: 1,
  two: 2,
  few: 3,
  many: 4,
  other: 5
};
var dummyRule = {
  select: (count) => count === 1 ? "one" : "other",
  resolvedOptions: () => ({
    pluralCategories: ["one", "other"]
  })
};

class PluralResolver {
  constructor(languageUtils, options = {}) {
    this.languageUtils = languageUtils;
    this.options = options;
    this.logger = baseLogger.create("pluralResolver");
    this.pluralRulesCache = {};
  }
  clearCache() {
    this.pluralRulesCache = {};
  }
  getRule(code, options = {}) {
    const cleanedCode = getCleanedCode(code === "dev" ? "en" : code);
    const type = options.ordinal ? "ordinal" : "cardinal";
    const cacheKey = JSON.stringify({
      cleanedCode,
      type
    });
    if (cacheKey in this.pluralRulesCache) {
      return this.pluralRulesCache[cacheKey];
    }
    let rule;
    try {
      rule = new Intl.PluralRules(cleanedCode, {
        type
      });
    } catch (err) {
      if (typeof Intl === "undefined") {
        this.logger.error("No Intl support, please use an Intl polyfill!");
        return dummyRule;
      }
      if (!code.match(/-|_/))
        return dummyRule;
      const lngPart = this.languageUtils.getLanguagePartFromCode(code);
      rule = this.getRule(lngPart, options);
    }
    this.pluralRulesCache[cacheKey] = rule;
    return rule;
  }
  needsPlural(code, options = {}) {
    let rule = this.getRule(code, options);
    if (!rule)
      rule = this.getRule("dev", options);
    return rule?.resolvedOptions().pluralCategories.length > 1;
  }
  getPluralFormsOfKey(code, key, options = {}) {
    return this.getSuffixes(code, options).map((suffix) => `${key}${suffix}`);
  }
  getSuffixes(code, options = {}) {
    let rule = this.getRule(code, options);
    if (!rule)
      rule = this.getRule("dev", options);
    if (!rule)
      return [];
    return rule.resolvedOptions().pluralCategories.sort((pluralCategory1, pluralCategory2) => suffixesOrder[pluralCategory1] - suffixesOrder[pluralCategory2]).map((pluralCategory) => `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${pluralCategory}`);
  }
  getSuffix(code, count, options = {}) {
    const rule = this.getRule(code, options);
    if (rule) {
      return `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${rule.select(count)}`;
    }
    this.logger.warn(`no plural rule found for: ${code}`);
    return this.getSuffix("dev", count, options);
  }
}
var deepFindWithDefaults = (data, defaultData, key, keySeparator = ".", ignoreJSONStructure = true) => {
  let path = getPathWithDefaults(data, defaultData, key);
  if (!path && ignoreJSONStructure && isString(key)) {
    path = deepFind(data, key, keySeparator);
    if (path === undefined)
      path = deepFind(defaultData, key, keySeparator);
  }
  return path;
};
var regexSafe = (val) => val.replace(/\$/g, "$$$$");

class Interpolator {
  constructor(options = {}) {
    this.logger = baseLogger.create("interpolator");
    this.options = options;
    this.format = options?.interpolation?.format || ((value) => value);
    this.init(options);
  }
  init(options = {}) {
    if (!options.interpolation)
      options.interpolation = {
        escapeValue: true
      };
    const {
      escape: escape$1,
      escapeValue,
      useRawValueToEscape,
      prefix,
      prefixEscaped,
      suffix,
      suffixEscaped,
      formatSeparator,
      unescapeSuffix,
      unescapePrefix,
      nestingPrefix,
      nestingPrefixEscaped,
      nestingSuffix,
      nestingSuffixEscaped,
      nestingOptionsSeparator,
      maxReplaces,
      alwaysFormat
    } = options.interpolation;
    this.escape = escape$1 !== undefined ? escape$1 : escape;
    this.escapeValue = escapeValue !== undefined ? escapeValue : true;
    this.useRawValueToEscape = useRawValueToEscape !== undefined ? useRawValueToEscape : false;
    this.prefix = prefix ? regexEscape(prefix) : prefixEscaped || "{{";
    this.suffix = suffix ? regexEscape(suffix) : suffixEscaped || "}}";
    this.formatSeparator = formatSeparator || ",";
    this.unescapePrefix = unescapeSuffix ? "" : unescapePrefix || "-";
    this.unescapeSuffix = this.unescapePrefix ? "" : unescapeSuffix || "";
    this.nestingPrefix = nestingPrefix ? regexEscape(nestingPrefix) : nestingPrefixEscaped || regexEscape("$t(");
    this.nestingSuffix = nestingSuffix ? regexEscape(nestingSuffix) : nestingSuffixEscaped || regexEscape(")");
    this.nestingOptionsSeparator = nestingOptionsSeparator || ",";
    this.maxReplaces = maxReplaces || 1000;
    this.alwaysFormat = alwaysFormat !== undefined ? alwaysFormat : false;
    this.resetRegExp();
  }
  reset() {
    if (this.options)
      this.init(this.options);
  }
  resetRegExp() {
    const getOrResetRegExp = (existingRegExp, pattern) => {
      if (existingRegExp?.source === pattern) {
        existingRegExp.lastIndex = 0;
        return existingRegExp;
      }
      return new RegExp(pattern, "g");
    };
    this.regexp = getOrResetRegExp(this.regexp, `${this.prefix}(.+?)${this.suffix}`);
    this.regexpUnescape = getOrResetRegExp(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`);
    this.nestingRegexp = getOrResetRegExp(this.nestingRegexp, `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`);
  }
  interpolate(str, data, lng, options) {
    let match;
    let value;
    let replaces;
    const defaultData = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {};
    const handleFormat = (key) => {
      if (!key.includes(this.formatSeparator)) {
        const path = deepFindWithDefaults(data, defaultData, key, this.options.keySeparator, this.options.ignoreJSONStructure);
        return this.alwaysFormat ? this.format(path, undefined, lng, {
          ...options,
          ...data,
          interpolationkey: key
        }) : path;
      }
      const p = key.split(this.formatSeparator);
      const k = p.shift().trim();
      const f = p.join(this.formatSeparator).trim();
      return this.format(deepFindWithDefaults(data, defaultData, k, this.options.keySeparator, this.options.ignoreJSONStructure), f, lng, {
        ...options,
        ...data,
        interpolationkey: k
      });
    };
    this.resetRegExp();
    const missingInterpolationHandler = options?.missingInterpolationHandler || this.options.missingInterpolationHandler;
    const skipOnVariables = options?.interpolation?.skipOnVariables !== undefined ? options.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
    const todos = [{
      regex: this.regexpUnescape,
      safeValue: (val) => regexSafe(val)
    }, {
      regex: this.regexp,
      safeValue: (val) => this.escapeValue ? regexSafe(this.escape(val)) : regexSafe(val)
    }];
    todos.forEach((todo) => {
      replaces = 0;
      while (match = todo.regex.exec(str)) {
        const matchedVar = match[1].trim();
        value = handleFormat(matchedVar);
        if (value === undefined) {
          if (typeof missingInterpolationHandler === "function") {
            const temp = missingInterpolationHandler(str, match, options);
            value = isString(temp) ? temp : "";
          } else if (options && Object.prototype.hasOwnProperty.call(options, matchedVar)) {
            value = "";
          } else if (skipOnVariables) {
            value = match[0];
            continue;
          } else {
            this.logger.warn(`missed to pass in variable ${matchedVar} for interpolating ${str}`);
            value = "";
          }
        } else if (!isString(value) && !this.useRawValueToEscape) {
          value = makeString(value);
        }
        const safeValue = todo.safeValue(value);
        str = str.replace(match[0], safeValue);
        if (skipOnVariables) {
          todo.regex.lastIndex += value.length;
          todo.regex.lastIndex -= match[0].length;
        } else {
          todo.regex.lastIndex = 0;
        }
        replaces++;
        if (replaces >= this.maxReplaces) {
          break;
        }
      }
    });
    return str;
  }
  nest(str, fc, options = {}) {
    let match;
    let value;
    let clonedOptions;
    const handleHasOptions = (key, inheritedOptions) => {
      const sep2 = this.nestingOptionsSeparator;
      if (!key.includes(sep2))
        return key;
      const c = key.split(new RegExp(`${regexEscape(sep2)}[ ]*{`));
      let optionsString = `{${c[1]}`;
      key = c[0];
      optionsString = this.interpolate(optionsString, clonedOptions);
      const matchedSingleQuotes = optionsString.match(/'/g);
      const matchedDoubleQuotes = optionsString.match(/"/g);
      if ((matchedSingleQuotes?.length ?? 0) % 2 === 0 && !matchedDoubleQuotes || (matchedDoubleQuotes?.length ?? 0) % 2 !== 0) {
        optionsString = optionsString.replace(/'/g, '"');
      }
      try {
        clonedOptions = JSON.parse(optionsString);
        if (inheritedOptions)
          clonedOptions = {
            ...inheritedOptions,
            ...clonedOptions
          };
      } catch (e) {
        this.logger.warn(`failed parsing options string in nesting for key ${key}`, e);
        return `${key}${sep2}${optionsString}`;
      }
      if (clonedOptions.defaultValue && clonedOptions.defaultValue.includes(this.prefix))
        delete clonedOptions.defaultValue;
      return key;
    };
    while (match = this.nestingRegexp.exec(str)) {
      let formatters = [];
      clonedOptions = {
        ...options
      };
      clonedOptions = clonedOptions.replace && !isString(clonedOptions.replace) ? clonedOptions.replace : clonedOptions;
      clonedOptions.applyPostProcessor = false;
      delete clonedOptions.defaultValue;
      const keyEndIndex = /{.*}/.test(match[1]) ? match[1].lastIndexOf("}") + 1 : match[1].indexOf(this.formatSeparator);
      if (keyEndIndex !== -1) {
        formatters = match[1].slice(keyEndIndex).split(this.formatSeparator).map((elem) => elem.trim()).filter(Boolean);
        match[1] = match[1].slice(0, keyEndIndex);
      }
      value = fc(handleHasOptions.call(this, match[1].trim(), clonedOptions), clonedOptions);
      if (value && match[0] === str && !isString(value))
        return value;
      if (!isString(value))
        value = makeString(value);
      if (!value) {
        this.logger.warn(`missed to resolve ${match[1]} for nesting ${str}`);
        value = "";
      }
      if (formatters.length) {
        value = formatters.reduce((v, f) => this.format(v, f, options.lng, {
          ...options,
          interpolationkey: match[1].trim()
        }), value.trim());
      }
      str = str.replace(match[0], value);
      this.regexp.lastIndex = 0;
    }
    return str;
  }
}
var parseFormatStr = (formatStr) => {
  let formatName = formatStr.toLowerCase().trim();
  const formatOptions = {};
  if (formatStr.includes("(")) {
    const p = formatStr.split("(");
    formatName = p[0].toLowerCase().trim();
    const optStr = p[1].slice(0, -1);
    if (formatName === "currency" && !optStr.includes(":")) {
      if (!formatOptions.currency)
        formatOptions.currency = optStr.trim();
    } else if (formatName === "relativetime" && !optStr.includes(":")) {
      if (!formatOptions.range)
        formatOptions.range = optStr.trim();
    } else {
      const opts = optStr.split(";");
      opts.forEach((opt) => {
        if (opt) {
          const [key, ...rest] = opt.split(":");
          const val = rest.join(":").trim().replace(/^'+|'+$/g, "");
          const trimmedKey = key.trim();
          if (!formatOptions[trimmedKey])
            formatOptions[trimmedKey] = val;
          if (val === "false")
            formatOptions[trimmedKey] = false;
          if (val === "true")
            formatOptions[trimmedKey] = true;
          if (!isNaN(val))
            formatOptions[trimmedKey] = parseInt(val, 10);
        }
      });
    }
  }
  return {
    formatName,
    formatOptions
  };
};
var createCachedFormatter = (fn) => {
  const cache = {};
  return (v, l, o) => {
    let optForCache = o;
    if (o && o.interpolationkey && o.formatParams && o.formatParams[o.interpolationkey] && o[o.interpolationkey]) {
      optForCache = {
        ...optForCache,
        [o.interpolationkey]: undefined
      };
    }
    const key = l + JSON.stringify(optForCache);
    let frm = cache[key];
    if (!frm) {
      frm = fn(getCleanedCode(l), o);
      cache[key] = frm;
    }
    return frm(v);
  };
};
var createNonCachedFormatter = (fn) => (v, l, o) => fn(getCleanedCode(l), o)(v);

class Formatter {
  constructor(options = {}) {
    this.logger = baseLogger.create("formatter");
    this.options = options;
    this.init(options);
  }
  init(services, options = {
    interpolation: {}
  }) {
    this.formatSeparator = options.interpolation.formatSeparator || ",";
    const cf = options.cacheInBuiltFormats ? createCachedFormatter : createNonCachedFormatter;
    this.formats = {
      number: cf((lng, opt) => {
        const formatter = new Intl.NumberFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      }),
      currency: cf((lng, opt) => {
        const formatter = new Intl.NumberFormat(lng, {
          ...opt,
          style: "currency"
        });
        return (val) => formatter.format(val);
      }),
      datetime: cf((lng, opt) => {
        const formatter = new Intl.DateTimeFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      }),
      relativetime: cf((lng, opt) => {
        const formatter = new Intl.RelativeTimeFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val, opt.range || "day");
      }),
      list: cf((lng, opt) => {
        const formatter = new Intl.ListFormat(lng, {
          ...opt
        });
        return (val) => formatter.format(val);
      })
    };
  }
  add(name, fc) {
    this.formats[name.toLowerCase().trim()] = fc;
  }
  addCached(name, fc) {
    this.formats[name.toLowerCase().trim()] = createCachedFormatter(fc);
  }
  format(value, format, lng, options = {}) {
    if (!format)
      return value;
    if (value == null)
      return value;
    const formats = format.split(this.formatSeparator);
    if (formats.length > 1 && formats[0].indexOf("(") > 1 && !formats[0].includes(")") && formats.find((f) => f.includes(")"))) {
      const lastIndex = formats.findIndex((f) => f.includes(")"));
      formats[0] = [formats[0], ...formats.splice(1, lastIndex)].join(this.formatSeparator);
    }
    const result = formats.reduce((mem, f) => {
      const {
        formatName,
        formatOptions
      } = parseFormatStr(f);
      if (this.formats[formatName]) {
        let formatted = mem;
        try {
          const valOptions = options?.formatParams?.[options.interpolationkey] || {};
          const l = valOptions.locale || valOptions.lng || options.locale || options.lng || lng;
          formatted = this.formats[formatName](mem, l, {
            ...formatOptions,
            ...options,
            ...valOptions
          });
        } catch (error2) {
          this.logger.warn(error2);
        }
        return formatted;
      } else {
        this.logger.warn(`there was no format function for ${formatName}`);
      }
      return mem;
    }, value);
    return result;
  }
}
var removePending = (q, name) => {
  if (q.pending[name] !== undefined) {
    delete q.pending[name];
    q.pendingCount--;
  }
};

class Connector extends EventEmitter {
  constructor(backend, store, services, options = {}) {
    super();
    this.backend = backend;
    this.store = store;
    this.services = services;
    this.languageUtils = services.languageUtils;
    this.options = options;
    this.logger = baseLogger.create("backendConnector");
    this.waitingReads = [];
    this.maxParallelReads = options.maxParallelReads || 10;
    this.readingCalls = 0;
    this.maxRetries = options.maxRetries >= 0 ? options.maxRetries : 5;
    this.retryTimeout = options.retryTimeout >= 1 ? options.retryTimeout : 350;
    this.state = {};
    this.queue = [];
    this.backend?.init?.(services, options.backend, options);
  }
  queueLoad(languages, namespaces, options, callback) {
    const toLoad = {};
    const pending = {};
    const toLoadLanguages = {};
    const toLoadNamespaces = {};
    languages.forEach((lng) => {
      let hasAllNamespaces = true;
      namespaces.forEach((ns) => {
        const name = `${lng}|${ns}`;
        if (!options.reload && this.store.hasResourceBundle(lng, ns)) {
          this.state[name] = 2;
        } else if (this.state[name] < 0)
          ;
        else if (this.state[name] === 1) {
          if (pending[name] === undefined)
            pending[name] = true;
        } else {
          this.state[name] = 1;
          hasAllNamespaces = false;
          if (pending[name] === undefined)
            pending[name] = true;
          if (toLoad[name] === undefined)
            toLoad[name] = true;
          if (toLoadNamespaces[ns] === undefined)
            toLoadNamespaces[ns] = true;
        }
      });
      if (!hasAllNamespaces)
        toLoadLanguages[lng] = true;
    });
    if (Object.keys(toLoad).length || Object.keys(pending).length) {
      this.queue.push({
        pending,
        pendingCount: Object.keys(pending).length,
        loaded: {},
        errors: [],
        callback
      });
    }
    return {
      toLoad: Object.keys(toLoad),
      pending: Object.keys(pending),
      toLoadLanguages: Object.keys(toLoadLanguages),
      toLoadNamespaces: Object.keys(toLoadNamespaces)
    };
  }
  loaded(name, err, data) {
    const s = name.split("|");
    const lng = s[0];
    const ns = s[1];
    if (err)
      this.emit("failedLoading", lng, ns, err);
    if (!err && data) {
      this.store.addResourceBundle(lng, ns, data, undefined, undefined, {
        skipCopy: true
      });
    }
    this.state[name] = err ? -1 : 2;
    if (err && data)
      this.state[name] = 0;
    const loaded = {};
    this.queue.forEach((q) => {
      pushPath(q.loaded, [lng], ns);
      removePending(q, name);
      if (err)
        q.errors.push(err);
      if (q.pendingCount === 0 && !q.done) {
        Object.keys(q.loaded).forEach((l) => {
          if (!loaded[l])
            loaded[l] = {};
          const loadedKeys = q.loaded[l];
          if (loadedKeys.length) {
            loadedKeys.forEach((n) => {
              if (loaded[l][n] === undefined)
                loaded[l][n] = true;
            });
          }
        });
        q.done = true;
        if (q.errors.length) {
          q.callback(q.errors);
        } else {
          q.callback();
        }
      }
    });
    this.emit("loaded", loaded);
    this.queue = this.queue.filter((q) => !q.done);
  }
  read(lng, ns, fcName, tried = 0, wait = this.retryTimeout, callback) {
    if (!lng.length)
      return callback(null, {});
    if (this.readingCalls >= this.maxParallelReads) {
      this.waitingReads.push({
        lng,
        ns,
        fcName,
        tried,
        wait,
        callback
      });
      return;
    }
    this.readingCalls++;
    const resolver = (err, data) => {
      this.readingCalls--;
      if (this.waitingReads.length > 0) {
        const next = this.waitingReads.shift();
        this.read(next.lng, next.ns, next.fcName, next.tried, next.wait, next.callback);
      }
      if (err && data && tried < this.maxRetries) {
        setTimeout(() => {
          this.read(lng, ns, fcName, tried + 1, wait * 2, callback);
        }, wait);
        return;
      }
      callback(err, data);
    };
    const fc = this.backend[fcName].bind(this.backend);
    if (fc.length === 2) {
      try {
        const r = fc(lng, ns);
        if (r && typeof r.then === "function") {
          r.then((data) => resolver(null, data)).catch(resolver);
        } else {
          resolver(null, r);
        }
      } catch (err) {
        resolver(err);
      }
      return;
    }
    return fc(lng, ns, resolver);
  }
  prepareLoading(languages, namespaces, options = {}, callback) {
    if (!this.backend) {
      this.logger.warn("No backend was added via i18next.use. Will not load resources.");
      return callback && callback();
    }
    if (isString(languages))
      languages = this.languageUtils.toResolveHierarchy(languages);
    if (isString(namespaces))
      namespaces = [namespaces];
    const toLoad = this.queueLoad(languages, namespaces, options, callback);
    if (!toLoad.toLoad.length) {
      if (!toLoad.pending.length)
        callback();
      return null;
    }
    toLoad.toLoad.forEach((name) => {
      this.loadOne(name);
    });
  }
  load(languages, namespaces, callback) {
    this.prepareLoading(languages, namespaces, {}, callback);
  }
  reload(languages, namespaces, callback) {
    this.prepareLoading(languages, namespaces, {
      reload: true
    }, callback);
  }
  loadOne(name, prefix = "") {
    const s = name.split("|");
    const lng = s[0];
    const ns = s[1];
    this.read(lng, ns, "read", undefined, undefined, (err, data) => {
      if (err)
        this.logger.warn(`${prefix}loading namespace ${ns} for language ${lng} failed`, err);
      if (!err && data)
        this.logger.log(`${prefix}loaded namespace ${ns} for language ${lng}`, data);
      this.loaded(name, err, data);
    });
  }
  saveMissing(languages, namespace, key, fallbackValue, isUpdate, options = {}, clb = () => {}) {
    if (this.services?.utils?.hasLoadedNamespace && !this.services?.utils?.hasLoadedNamespace(namespace)) {
      this.logger.warn(`did not save key "${key}" as the namespace "${namespace}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
      return;
    }
    if (key === undefined || key === null || key === "")
      return;
    if (this.backend?.create) {
      const opts = {
        ...options,
        isUpdate
      };
      const fc = this.backend.create.bind(this.backend);
      if (fc.length < 6) {
        try {
          let r;
          if (fc.length === 5) {
            r = fc(languages, namespace, key, fallbackValue, opts);
          } else {
            r = fc(languages, namespace, key, fallbackValue);
          }
          if (r && typeof r.then === "function") {
            r.then((data) => clb(null, data)).catch(clb);
          } else {
            clb(null, r);
          }
        } catch (err) {
          clb(err);
        }
      } else {
        fc(languages, namespace, key, fallbackValue, clb, opts);
      }
    }
    if (!languages || !languages[0])
      return;
    this.store.addResource(languages[0], namespace, key, fallbackValue);
  }
}
var get = () => ({
  debug: false,
  initAsync: true,
  ns: ["translation"],
  defaultNS: ["translation"],
  fallbackLng: ["dev"],
  fallbackNS: false,
  supportedLngs: false,
  nonExplicitSupportedLngs: false,
  load: "all",
  preload: false,
  keySeparator: ".",
  nsSeparator: ":",
  pluralSeparator: "_",
  contextSeparator: "_",
  partialBundledLanguages: false,
  saveMissing: false,
  updateMissing: false,
  saveMissingTo: "fallback",
  saveMissingPlurals: true,
  missingKeyHandler: false,
  missingInterpolationHandler: false,
  postProcess: false,
  postProcessPassResolved: false,
  returnNull: false,
  returnEmptyString: true,
  returnObjects: false,
  joinArrays: false,
  returnedObjectHandler: false,
  parseMissingKeyHandler: false,
  appendNamespaceToMissingKey: false,
  appendNamespaceToCIMode: false,
  overloadTranslationOptionHandler: (args) => {
    let ret = {};
    if (typeof args[1] === "object")
      ret = args[1];
    if (isString(args[1]))
      ret.defaultValue = args[1];
    if (isString(args[2]))
      ret.tDescription = args[2];
    if (typeof args[2] === "object" || typeof args[3] === "object") {
      const options = args[3] || args[2];
      Object.keys(options).forEach((key) => {
        ret[key] = options[key];
      });
    }
    return ret;
  },
  interpolation: {
    escapeValue: true,
    prefix: "{{",
    suffix: "}}",
    formatSeparator: ",",
    unescapePrefix: "-",
    nestingPrefix: "$t(",
    nestingSuffix: ")",
    nestingOptionsSeparator: ",",
    maxReplaces: 1000,
    skipOnVariables: true
  },
  cacheInBuiltFormats: true
});
var transformOptions = (options) => {
  if (isString(options.ns))
    options.ns = [options.ns];
  if (isString(options.fallbackLng))
    options.fallbackLng = [options.fallbackLng];
  if (isString(options.fallbackNS))
    options.fallbackNS = [options.fallbackNS];
  if (options.supportedLngs && !options.supportedLngs.includes("cimode")) {
    options.supportedLngs = options.supportedLngs.concat(["cimode"]);
  }
  return options;
};
var noop = () => {};
var bindMemberFunctions = (inst) => {
  const mems = Object.getOwnPropertyNames(Object.getPrototypeOf(inst));
  mems.forEach((mem) => {
    if (typeof inst[mem] === "function") {
      inst[mem] = inst[mem].bind(inst);
    }
  });
};

class I18n extends EventEmitter {
  constructor(options = {}, callback) {
    super();
    this.options = transformOptions(options);
    this.services = {};
    this.logger = baseLogger;
    this.modules = {
      external: []
    };
    bindMemberFunctions(this);
    if (callback && !this.isInitialized && !options.isClone) {
      if (!this.options.initAsync) {
        this.init(options, callback);
        return this;
      }
      setTimeout(() => {
        this.init(options, callback);
      }, 0);
    }
  }
  init(options = {}, callback) {
    this.isInitializing = true;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options.defaultNS == null && options.ns) {
      if (isString(options.ns)) {
        options.defaultNS = options.ns;
      } else if (!options.ns.includes("translation")) {
        options.defaultNS = options.ns[0];
      }
    }
    const defOpts = get();
    this.options = {
      ...defOpts,
      ...this.options,
      ...transformOptions(options)
    };
    this.options.interpolation = {
      ...defOpts.interpolation,
      ...this.options.interpolation
    };
    if (options.keySeparator !== undefined) {
      this.options.userDefinedKeySeparator = options.keySeparator;
    }
    if (options.nsSeparator !== undefined) {
      this.options.userDefinedNsSeparator = options.nsSeparator;
    }
    if (typeof this.options.overloadTranslationOptionHandler !== "function") {
      this.options.overloadTranslationOptionHandler = defOpts.overloadTranslationOptionHandler;
    }
    const createClassOnDemand = (ClassOrObject) => {
      if (!ClassOrObject)
        return null;
      if (typeof ClassOrObject === "function")
        return new ClassOrObject;
      return ClassOrObject;
    };
    if (!this.options.isClone) {
      if (this.modules.logger) {
        baseLogger.init(createClassOnDemand(this.modules.logger), this.options);
      } else {
        baseLogger.init(null, this.options);
      }
      let formatter;
      if (this.modules.formatter) {
        formatter = this.modules.formatter;
      } else {
        formatter = Formatter;
      }
      const lu = new LanguageUtil(this.options);
      this.store = new ResourceStore(this.options.resources, this.options);
      const s = this.services;
      s.logger = baseLogger;
      s.resourceStore = this.store;
      s.languageUtils = lu;
      s.pluralResolver = new PluralResolver(lu, {
        prepend: this.options.pluralSeparator
      });
      if (formatter) {
        s.formatter = createClassOnDemand(formatter);
        if (s.formatter.init)
          s.formatter.init(s, this.options);
        this.options.interpolation.format = s.formatter.format.bind(s.formatter);
      }
      s.interpolator = new Interpolator(this.options);
      s.utils = {
        hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
      };
      s.backendConnector = new Connector(createClassOnDemand(this.modules.backend), s.resourceStore, s, this.options);
      s.backendConnector.on("*", (event, ...args) => {
        this.emit(event, ...args);
      });
      if (this.modules.languageDetector) {
        s.languageDetector = createClassOnDemand(this.modules.languageDetector);
        if (s.languageDetector.init)
          s.languageDetector.init(s, this.options.detection, this.options);
      }
      if (this.modules.i18nFormat) {
        s.i18nFormat = createClassOnDemand(this.modules.i18nFormat);
        if (s.i18nFormat.init)
          s.i18nFormat.init(this);
      }
      this.translator = new Translator(this.services, this.options);
      this.translator.on("*", (event, ...args) => {
        this.emit(event, ...args);
      });
      this.modules.external.forEach((m) => {
        if (m.init)
          m.init(this);
      });
    }
    this.format = this.options.interpolation.format;
    if (!callback)
      callback = noop;
    if (this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
      const codes = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
      if (codes.length > 0 && codes[0] !== "dev")
        this.options.lng = codes[0];
    }
    if (!this.services.languageDetector && !this.options.lng) {
      this.logger.warn("init: no languageDetector is used and no lng is defined");
    }
    const storeApi = ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"];
    storeApi.forEach((fcName) => {
      this[fcName] = (...args) => this.store[fcName](...args);
    });
    const storeApiChained = ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"];
    storeApiChained.forEach((fcName) => {
      this[fcName] = (...args) => {
        this.store[fcName](...args);
        return this;
      };
    });
    const deferred = defer();
    const load = () => {
      const finish = (err, t) => {
        this.isInitializing = false;
        if (this.isInitialized && !this.initializedStoreOnce)
          this.logger.warn("init: i18next is already initialized. You should call init just once!");
        this.isInitialized = true;
        if (!this.options.isClone)
          this.logger.log("initialized", this.options);
        this.emit("initialized", this.options);
        deferred.resolve(t);
        callback(err, t);
      };
      if (this.languages && !this.isInitialized)
        return finish(null, this.t.bind(this));
      this.changeLanguage(this.options.lng, finish);
    };
    if (this.options.resources || !this.options.initAsync) {
      load();
    } else {
      setTimeout(load, 0);
    }
    return deferred;
  }
  loadResources(language, callback = noop) {
    let usedCallback = callback;
    const usedLng = isString(language) ? language : this.language;
    if (typeof language === "function")
      usedCallback = language;
    if (!this.options.resources || this.options.partialBundledLanguages) {
      if (usedLng?.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0))
        return usedCallback();
      const toLoad = [];
      const append = (lng) => {
        if (!lng)
          return;
        if (lng === "cimode")
          return;
        const lngs = this.services.languageUtils.toResolveHierarchy(lng);
        lngs.forEach((l) => {
          if (l === "cimode")
            return;
          if (!toLoad.includes(l))
            toLoad.push(l);
        });
      };
      if (!usedLng) {
        const fallbacks = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
        fallbacks.forEach((l) => append(l));
      } else {
        append(usedLng);
      }
      this.options.preload?.forEach?.((l) => append(l));
      this.services.backendConnector.load(toLoad, this.options.ns, (e) => {
        if (!e && !this.resolvedLanguage && this.language)
          this.setResolvedLanguage(this.language);
        usedCallback(e);
      });
    } else {
      usedCallback(null);
    }
  }
  reloadResources(lngs, ns, callback) {
    const deferred = defer();
    if (typeof lngs === "function") {
      callback = lngs;
      lngs = undefined;
    }
    if (typeof ns === "function") {
      callback = ns;
      ns = undefined;
    }
    if (!lngs)
      lngs = this.languages;
    if (!ns)
      ns = this.options.ns;
    if (!callback)
      callback = noop;
    this.services.backendConnector.reload(lngs, ns, (err) => {
      deferred.resolve();
      callback(err);
    });
    return deferred;
  }
  use(module) {
    if (!module)
      throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
    if (!module.type)
      throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
    if (module.type === "backend") {
      this.modules.backend = module;
    }
    if (module.type === "logger" || module.log && module.warn && module.error) {
      this.modules.logger = module;
    }
    if (module.type === "languageDetector") {
      this.modules.languageDetector = module;
    }
    if (module.type === "i18nFormat") {
      this.modules.i18nFormat = module;
    }
    if (module.type === "postProcessor") {
      postProcessor.addPostProcessor(module);
    }
    if (module.type === "formatter") {
      this.modules.formatter = module;
    }
    if (module.type === "3rdParty") {
      this.modules.external.push(module);
    }
    return this;
  }
  setResolvedLanguage(l) {
    if (!l || !this.languages)
      return;
    if (["cimode", "dev"].includes(l))
      return;
    for (let li = 0;li < this.languages.length; li++) {
      const lngInLngs = this.languages[li];
      if (["cimode", "dev"].includes(lngInLngs))
        continue;
      if (this.store.hasLanguageSomeTranslations(lngInLngs)) {
        this.resolvedLanguage = lngInLngs;
        break;
      }
    }
    if (!this.resolvedLanguage && !this.languages.includes(l) && this.store.hasLanguageSomeTranslations(l)) {
      this.resolvedLanguage = l;
      this.languages.unshift(l);
    }
  }
  changeLanguage(lng, callback) {
    this.isLanguageChangingTo = lng;
    const deferred = defer();
    this.emit("languageChanging", lng);
    const setLngProps = (l) => {
      this.language = l;
      this.languages = this.services.languageUtils.toResolveHierarchy(l);
      this.resolvedLanguage = undefined;
      this.setResolvedLanguage(l);
    };
    const done = (err, l) => {
      if (l) {
        if (this.isLanguageChangingTo === lng) {
          setLngProps(l);
          this.translator.changeLanguage(l);
          this.isLanguageChangingTo = undefined;
          this.emit("languageChanged", l);
          this.logger.log("languageChanged", l);
        }
      } else {
        this.isLanguageChangingTo = undefined;
      }
      deferred.resolve((...args) => this.t(...args));
      if (callback)
        callback(err, (...args) => this.t(...args));
    };
    const setLng = (lngs) => {
      if (!lng && !lngs && this.services.languageDetector)
        lngs = [];
      const fl = isString(lngs) ? lngs : lngs && lngs[0];
      const l = this.store.hasLanguageSomeTranslations(fl) ? fl : this.services.languageUtils.getBestMatchFromCodes(isString(lngs) ? [lngs] : lngs);
      if (l) {
        if (!this.language) {
          setLngProps(l);
        }
        if (!this.translator.language)
          this.translator.changeLanguage(l);
        this.services.languageDetector?.cacheUserLanguage?.(l);
      }
      this.loadResources(l, (err) => {
        done(err, l);
      });
    };
    if (!lng && this.services.languageDetector && !this.services.languageDetector.async) {
      setLng(this.services.languageDetector.detect());
    } else if (!lng && this.services.languageDetector && this.services.languageDetector.async) {
      if (this.services.languageDetector.detect.length === 0) {
        this.services.languageDetector.detect().then(setLng);
      } else {
        this.services.languageDetector.detect(setLng);
      }
    } else {
      setLng(lng);
    }
    return deferred;
  }
  getFixedT(lng, ns, keyPrefix) {
    const fixedT = (key, opts, ...rest) => {
      let o;
      if (typeof opts !== "object") {
        o = this.options.overloadTranslationOptionHandler([key, opts].concat(rest));
      } else {
        o = {
          ...opts
        };
      }
      o.lng = o.lng || fixedT.lng;
      o.lngs = o.lngs || fixedT.lngs;
      o.ns = o.ns || fixedT.ns;
      if (o.keyPrefix !== "")
        o.keyPrefix = o.keyPrefix || keyPrefix || fixedT.keyPrefix;
      const selectorOpts = {
        ...this.options,
        ...o
      };
      if (typeof o.keyPrefix === "function")
        o.keyPrefix = keysFromSelector(o.keyPrefix, selectorOpts);
      const keySeparator = this.options.keySeparator || ".";
      let resultKey;
      if (o.keyPrefix && Array.isArray(key)) {
        resultKey = key.map((k) => {
          if (typeof k === "function")
            k = keysFromSelector(k, selectorOpts);
          return `${o.keyPrefix}${keySeparator}${k}`;
        });
      } else {
        if (typeof key === "function")
          key = keysFromSelector(key, selectorOpts);
        resultKey = o.keyPrefix ? `${o.keyPrefix}${keySeparator}${key}` : key;
      }
      return this.t(resultKey, o);
    };
    if (isString(lng)) {
      fixedT.lng = lng;
    } else {
      fixedT.lngs = lng;
    }
    fixedT.ns = ns;
    fixedT.keyPrefix = keyPrefix;
    return fixedT;
  }
  t(...args) {
    return this.translator?.translate(...args);
  }
  exists(...args) {
    return this.translator?.exists(...args);
  }
  setDefaultNamespace(ns) {
    this.options.defaultNS = ns;
  }
  hasLoadedNamespace(ns, options = {}) {
    if (!this.isInitialized) {
      this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages);
      return false;
    }
    if (!this.languages || !this.languages.length) {
      this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages);
      return false;
    }
    const lng = options.lng || this.resolvedLanguage || this.languages[0];
    const fallbackLng = this.options ? this.options.fallbackLng : false;
    const lastLng = this.languages[this.languages.length - 1];
    if (lng.toLowerCase() === "cimode")
      return true;
    const loadNotPending = (l, n) => {
      const loadState = this.services.backendConnector.state[`${l}|${n}`];
      return loadState === -1 || loadState === 0 || loadState === 2;
    };
    if (options.precheck) {
      const preResult = options.precheck(this, loadNotPending);
      if (preResult !== undefined)
        return preResult;
    }
    if (this.hasResourceBundle(lng, ns))
      return true;
    if (!this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages)
      return true;
    if (loadNotPending(lng, ns) && (!fallbackLng || loadNotPending(lastLng, ns)))
      return true;
    return false;
  }
  loadNamespaces(ns, callback) {
    const deferred = defer();
    if (!this.options.ns) {
      if (callback)
        callback();
      return Promise.resolve();
    }
    if (isString(ns))
      ns = [ns];
    ns.forEach((n) => {
      if (!this.options.ns.includes(n))
        this.options.ns.push(n);
    });
    this.loadResources((err) => {
      deferred.resolve();
      if (callback)
        callback(err);
    });
    return deferred;
  }
  loadLanguages(lngs, callback) {
    const deferred = defer();
    if (isString(lngs))
      lngs = [lngs];
    const preloaded = this.options.preload || [];
    const newLngs = lngs.filter((lng) => !preloaded.includes(lng) && this.services.languageUtils.isSupportedCode(lng));
    if (!newLngs.length) {
      if (callback)
        callback();
      return Promise.resolve();
    }
    this.options.preload = preloaded.concat(newLngs);
    this.loadResources((err) => {
      deferred.resolve();
      if (callback)
        callback(err);
    });
    return deferred;
  }
  dir(lng) {
    if (!lng)
      lng = this.resolvedLanguage || (this.languages?.length > 0 ? this.languages[0] : this.language);
    if (!lng)
      return "rtl";
    try {
      const l = new Intl.Locale(lng);
      if (l && l.getTextInfo) {
        const ti = l.getTextInfo();
        if (ti && ti.direction)
          return ti.direction;
      }
    } catch (e) {}
    const rtlLngs = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"];
    const languageUtils = this.services?.languageUtils || new LanguageUtil(get());
    if (lng.toLowerCase().indexOf("-latn") > 1)
      return "ltr";
    return rtlLngs.includes(languageUtils.getLanguagePartFromCode(lng)) || lng.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
  }
  static createInstance(options = {}, callback) {
    const instance = new I18n(options, callback);
    instance.createInstance = I18n.createInstance;
    return instance;
  }
  cloneInstance(options = {}, callback = noop) {
    const forkResourceStore = options.forkResourceStore;
    if (forkResourceStore)
      delete options.forkResourceStore;
    const mergedOptions = {
      ...this.options,
      ...options,
      ...{
        isClone: true
      }
    };
    const clone = new I18n(mergedOptions);
    if (options.debug !== undefined || options.prefix !== undefined) {
      clone.logger = clone.logger.clone(options);
    }
    const membersToCopy = ["store", "services", "language"];
    membersToCopy.forEach((m) => {
      clone[m] = this[m];
    });
    clone.services = {
      ...this.services
    };
    clone.services.utils = {
      hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
    };
    if (forkResourceStore) {
      const clonedData = Object.keys(this.store.data).reduce((prev, l) => {
        prev[l] = {
          ...this.store.data[l]
        };
        prev[l] = Object.keys(prev[l]).reduce((acc, n) => {
          acc[n] = {
            ...prev[l][n]
          };
          return acc;
        }, prev[l]);
        return prev;
      }, {});
      clone.store = new ResourceStore(clonedData, mergedOptions);
      clone.services.resourceStore = clone.store;
    }
    if (options.interpolation) {
      const defOpts = get();
      const mergedInterpolation = {
        ...defOpts.interpolation,
        ...this.options.interpolation,
        ...options.interpolation
      };
      const mergedForInterpolator = {
        ...mergedOptions,
        interpolation: mergedInterpolation
      };
      clone.services.interpolator = new Interpolator(mergedForInterpolator);
    }
    clone.translator = new Translator(clone.services, mergedOptions);
    clone.translator.on("*", (event, ...args) => {
      clone.emit(event, ...args);
    });
    clone.init(mergedOptions, callback);
    clone.translator.options = mergedOptions;
    clone.translator.backendConnector.services.utils = {
      hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
    };
    return clone;
  }
  toJSON() {
    return {
      options: this.options,
      store: this.store,
      language: this.language,
      languages: this.languages,
      resolvedLanguage: this.resolvedLanguage
    };
  }
}
var instance = I18n.createInstance();
var createInstance = instance.createInstance;
var dir = instance.dir;
var init = instance.init;
var loadResources = instance.loadResources;
var reloadResources = instance.reloadResources;
var use = instance.use;
var changeLanguage = instance.changeLanguage;
var getFixedT = instance.getFixedT;
var t = instance.t;
var exists = instance.exists;
var setDefaultNamespace = instance.setDefaultNamespace;
var hasLoadedNamespace = instance.hasLoadedNamespace;
var loadNamespaces = instance.loadNamespaces;
var loadLanguages = instance.loadLanguages;
// src/i18n/types.ts
var DEFAULT_LANGUAGE2 = "en";
// src/i18n/index.ts
var i18n = {
  t(key, options) {
    return instance.t(key, options);
  },
  async changeLanguage(language) {
    await instance.changeLanguage(language);
  },
  get language() {
    return instance.language || DEFAULT_LANGUAGE2;
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
    removedDeprecatedFiles: [],
    namespaceSynced: []
  };
}
async function handleBackupIfRequested(targetDir, backup, result) {
  if (!backup)
    return;
  const backupPath = await backupInstallation(targetDir);
  result.backedUpPaths.push(backupPath);
  info("update.backup_created", { path: backupPath });
}
async function processComponentUpdate(targetDir, component, updateCheck, customizations, options, result, config, lockfile) {
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
    const preserved = await updateComponent(targetDir, component, customizations, options, config, lockfile);
    result.updatedComponents.push(component);
    result.preservedFiles.push(...preserved);
    if (options.hard) {
      const synced = await applyNamespaceSync(targetDir, component, lockfile);
      result.namespaceSynced.push(...synced);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Failed to update ${component}: ${message}`);
    result.skippedComponents.push(component);
  }
}
async function updateAllComponents(targetDir, components, updateCheck, customizations, options, result, config, lockfile) {
  for (const component of components) {
    await processComponentUpdate(targetDir, component, updateCheck, customizations, options, result, config, lockfile);
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
  const entryPath = join7(targetDir, layout.entryFile);
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
function checkAndInstallRtkAfterUpdate() {
  if (!isRtkInstalled()) {
    warn("update.rtk_missing");
    console.log(i18n.t("cli.update.rtkMissing"));
    const rtkInstalled = installRtk();
    if (rtkInstalled) {
      console.log(i18n.t("cli.update.rtkInstalled"));
    }
  }
}
async function updateProjectRegistry(targetDir, newVersion) {
  try {
    const { registerProject: registerProject2 } = await Promise.resolve().then(() => (init_registry(), exports_registry));
    await registerProject2(targetDir, newVersion);
  } catch {}
}
async function regenerateLockfile(targetDir, result) {
  const lockfileResult = await generateAndWriteLockfileForDir(targetDir);
  if (lockfileResult.warning) {
    result.warnings.push(lockfileResult.warning);
    warn("update.lockfile_failed", { error: lockfileResult.warning });
  } else {
    debug("update.lockfile_regenerated", {
      files: String(lockfileResult.fileCount)
    });
  }
}
async function shouldSkipSelfUpdate(targetDir, result) {
  const targetPkgPath = join7(targetDir, "package.json");
  if (await fileExists(targetPkgPath)) {
    const targetPkg = await readJsonFile(targetPkgPath);
    if (targetPkg.name === "oh-my-customcode") {
      warn("update.self_update_skipped");
      result.success = true;
      result.skippedSource = true;
      result.warnings.push("Skipped: source project cannot update itself");
      return true;
    }
  }
  return false;
}
function checkAndInstallCodexAfterUpdate() {
  if (!isCodexInstalled()) {
    warn("update.codex_missing");
    console.log(i18n.t("cli.update.codexMissing"));
    const codexInstalled = installCodex();
    if (codexInstalled) {
      console.log(i18n.t("cli.update.codexInstalled"));
    }
  }
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
    if (await shouldSkipSelfUpdate(options.targetDir, result)) {
      return result;
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
    const lockfile = await readLockfile(options.targetDir);
    const components = options.components || getAllUpdateComponents();
    await updateAllComponents(options.targetDir, components, updateCheck, customizations, options, result, config, lockfile);
    await runFullUpdatePostProcessing(options, result, config);
    await regenerateLockfile(options.targetDir, result);
    checkAndInstallRtkAfterUpdate();
    checkAndInstallCodexAfterUpdate();
    if (result.success && !options.dryRun) {
      await updateProjectRegistry(options.targetDir, result.newVersion);
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
    const fullPath = join7(targetDir, update2.path);
    await ensureDirectory(join7(fullPath, ".."));
    await fs.writeFile(fullPath, update2.content, "utf-8");
    debug("update.file_applied", { path: update2.path });
  }
}
async function preserveCustomizations(targetDir, customizations) {
  const preserved = new Map;
  const fs = await import("node:fs/promises");
  for (const filePath of customizations) {
    const fullPath = join7(targetDir, filePath);
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
async function shouldSkipProtectedFile(targetFilePath, lockfileKey, lockfile) {
  if (!lockfile) {
    return true;
  }
  const lockfileEntry = lockfile.files[lockfileKey];
  if (!lockfileEntry) {
    return false;
  }
  if (!await fileExists(targetFilePath)) {
    return false;
  }
  try {
    const currentHash = await computeFileHash(targetFilePath);
    return currentHash !== lockfileEntry.templateHash;
  } catch {
    return true;
  }
}
async function collectProtectedSkipPaths(srcPath, destPath, componentPath, forceOverwriteAll, lockfile, targetDir) {
  if (forceOverwriteAll) {
    const warnedPaths2 = await findProtectedFilesInDir(srcPath, componentPath);
    return { skipPaths: [], warnedPaths: warnedPaths2, updatedPaths: [] };
  }
  const protectedRelative = await findProtectedFilesInDir(srcPath, componentPath);
  const path = await import("node:path");
  const skipPaths = [];
  const warnedPaths = [];
  const updatedPaths = [];
  for (const p of protectedRelative) {
    const targetFilePath = join7(targetDir, componentPath, p);
    const lockfileKey = `${componentPath}/${p}`.replace(/\\/g, "/");
    const shouldSkip = await shouldSkipProtectedFile(targetFilePath, lockfileKey, lockfile);
    if (shouldSkip) {
      skipPaths.push(path.relative(destPath, join7(destPath, p)));
      warnedPaths.push(p);
    } else {
      updatedPaths.push(p);
    }
  }
  return { skipPaths, warnedPaths, updatedPaths };
}
function isEntryProtected(relPath, componentRelativePrefix) {
  if (isProtectedFile(relPath)) {
    return true;
  }
  const componentPrefixed = componentRelativePrefix ? `${componentRelativePrefix}/${relPath}` : relPath;
  return isProtectedFile(componentPrefixed);
}
async function safeReaddir(dir2, fs) {
  try {
    return await fs.readdir(dir2, { withFileTypes: true });
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
    const { dir: dir2, relDir } = queue.shift();
    const entries = await safeReaddir(dir2, fs);
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullPath = path.join(dir2, entry.name);
      if (entry.isDirectory()) {
        queue.push({ dir: fullPath, relDir: relPath });
      } else if (entry.isFile() && isEntryProtected(relPath, componentRelativePrefix)) {
        protected_.push(relPath);
      }
    }
  }
  return protected_;
}
async function updateComponent(targetDir, component, customizations, options, config, lockfile) {
  const preservedFiles = [];
  const componentPath = getComponentPath2(component);
  const srcPath = resolveTemplatePath(componentPath);
  const destPath = join7(targetDir, componentPath);
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
  const {
    skipPaths: protectedSkipPaths,
    warnedPaths: protectedWarnedPaths,
    updatedPaths: protectedUpdatedPaths
  } = await collectProtectedSkipPaths(srcPath, destPath, componentPath, !!options.forceOverwriteAll, lockfile, targetDir);
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
        hint: "File was modified by user and preserved. Use --force-overwrite-all to override."
      });
    }
  }
  for (const updatedPath of protectedUpdatedPaths) {
    info("update.protected_file_updated", {
      file: updatedPath,
      component,
      hint: "Protected file updated (unmodified by user, matches lockfile hash)."
    });
  }
  skipPaths.push(...protectedSkipPaths);
  const path = await import("node:path");
  const normalizedSkipPaths = skipPaths.map((p) => path.relative(destPath, join7(targetDir, p)));
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
    const srcPath = resolveTemplatePath(join7(layout.rootDir, fileName));
    if (!await fileExists(srcPath)) {
      continue;
    }
    const destPath = join7(targetDir, layout.rootDir, fileName);
    await ensureDirectory(join7(destPath, ".."));
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
    const fullPath = join7(targetDir, entry.path);
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
function extractFrontmatterName(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match)
    return null;
  const nameMatch = match[1].match(/^name:\s*(.+)$/m);
  if (!nameMatch)
    return null;
  return nameMatch[1].trim().replace(/^["']|["']$/g, "");
}
async function syncNamespaceInFile(targetFilePath, upstreamFilePath) {
  const targetContent = await readTextFile(targetFilePath);
  const upstreamContent = await readTextFile(upstreamFilePath);
  const upstreamName = extractFrontmatterName(upstreamContent);
  const targetName = extractFrontmatterName(targetContent);
  if (!upstreamName || !targetName || upstreamName === targetName)
    return false;
  const safeUpstreamName = upstreamName.replace(/\$/g, "$$$$");
  const updated = targetContent.replace(/^(name:\s*).+$/m, `$1${safeUpstreamName}`);
  if (updated === targetContent)
    return false;
  await writeTextFile(targetFilePath, updated);
  return true;
}
async function processNamespaceSyncEntry(entry, relPath, fullSrcPath, destPath, componentPath, lockfile) {
  if (!entry.isFile() || !entry.name.endsWith(".md"))
    return null;
  const targetFilePath = join7(destPath, relPath);
  const lockfileKey = `${componentPath}/${relPath}`.replace(/\\/g, "/");
  const shouldSkip = await shouldSkipProtectedFile(targetFilePath, lockfileKey, lockfile);
  if (shouldSkip)
    return null;
  if (!await fileExists(targetFilePath))
    return null;
  const didSync = await syncNamespaceInFile(targetFilePath, fullSrcPath);
  return didSync ? `${componentPath}/${relPath}` : null;
}
async function applyNamespaceSync(targetDir, component, lockfile) {
  if (!lockfile)
    return [];
  const componentPath = getComponentPath2(component);
  const srcPath = resolveTemplatePath(componentPath);
  const destPath = join7(targetDir, componentPath);
  const fs = await import("node:fs/promises");
  const synced = [];
  const queue = [{ dir: srcPath, relDir: "" }];
  while (queue.length > 0) {
    const { dir: dir2, relDir } = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir2, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullSrcPath = join7(dir2, entry.name);
      if (entry.isDirectory()) {
        queue.push({ dir: fullSrcPath, relDir: relPath });
        continue;
      }
      const syncedPath = await processNamespaceSyncEntry(entry, relPath, fullSrcPath, destPath, componentPath, lockfile);
      if (syncedPath) {
        synced.push(syncedPath);
        info("update.namespace_synced", { file: relPath, component });
      }
    }
  }
  return synced;
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
  const backupDir = join7(targetDir, `.omcustom-backup-${timestamp}`);
  const fs = await import("node:fs/promises");
  await ensureDirectory(backupDir);
  const layout = getProviderLayout();
  const dirsToBackup = [layout.rootDir, "guides"];
  for (const dir2 of dirsToBackup) {
    const srcPath = join7(targetDir, dir2);
    if (await fileExists(srcPath)) {
      const destPath = join7(backupDir, dir2);
      await copyDirectory(srcPath, destPath, { overwrite: true });
    }
  }
  const entryPath = join7(targetDir, layout.entryFile);
  if (await fileExists(entryPath)) {
    await fs.copyFile(entryPath, join7(backupDir, layout.entryFile));
  }
  return backupDir;
}
async function loadCustomizationManifest(targetDir) {
  const manifestPath = join7(targetDir, CUSTOMIZATION_MANIFEST_FILE);
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
