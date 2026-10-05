/**
 * Home directory helpers
 *
 * Production runs under Node (`src/cli/index.ts` shebang, `--target node`
 * build), where `os.homedir()` returns `""` when `HOME=""` while
 * `os.userInfo().homedir` still reports the passwd entry. Bun freezes
 * `os.homedir()` at process start, so runtime changes to `process.env.HOME`
 * are invisible to it. To behave the same under both runtimes, `HOME` is read
 * from `process.env` on EVERY call (never memoised) and an empty value falls
 * through to the next source instead of being used as-is.
 *
 * Leaf module: depends only on `node:os` and `node:path`.
 */

import { homedir, userInfo } from 'node:os';
import { parse, sep } from 'node:path';

/**
 * Overridable home-directory sources (for tests). Resolved in order:
 * env -> os -> passwd. The first non-empty value wins.
 */
export interface HomeSources {
  /** Reads the HOME environment variable (default: `process.env.HOME`) */
  envHome?: () => string | undefined;
  /** Reads the runtime-reported home (default: `os.homedir()`) */
  osHome?: () => string;
  /** Reads the passwd-entry home (default: `os.userInfo().homedir`) */
  passwdHome?: () => string;
}

/** Default env source: read `process.env.HOME` at call time. */
function readEnvHome(): string | undefined {
  return process.env.HOME;
}

/** Default OS source: `os.homedir()`. */
function readOsHome(): string {
  return homedir();
}

/** Default passwd source: `os.userInfo().homedir`. */
function readPasswdHome(): string {
  return userInfo().homedir;
}

/**
 * Strip trailing path separators, never going below the path's root
 * (`/` stays `/`, `''` stays `''`).
 */
export function stripTrailingSeparators(path: string): string {
  const rootLength = parse(path).root.length;
  let end = path.length;
  while (end > rootLength && (path[end - 1] === '/' || path[end - 1] === sep)) {
    end--;
  }
  return path.slice(0, end);
}

/**
 * Resolve the user's home directory.
 *
 * Returns the first NON-EMPTY of env -> os -> passwd (a throwing source is
 * skipped), with trailing separators removed. Returns `''` only when every
 * source is empty or throws.
 */
export function resolveHomeDir(sources: HomeSources = {}): string {
  const candidates: Array<() => string | undefined> = [
    sources.envHome ?? readEnvHome,
    sources.osHome ?? readOsHome,
    sources.passwdHome ?? readPasswdHome,
  ];

  for (const read of candidates) {
    try {
      const value = read();
      if (value) {
        return stripTrailingSeparators(value);
      }
    } catch {
      // Source unavailable (e.g. no passwd entry) - fall through to the next one
    }
  }
  return '';
}

/**
 * True when `path` equals `base` or lies beneath it on a separator boundary
 * (`/x/homework` is NOT within `/x/home`). An empty base never matches.
 */
export function isPathWithin(path: string, base: string): boolean {
  const strippedBase = stripTrailingSeparators(base);
  if (strippedBase === '') {
    return false;
  }
  const strippedPath = stripTrailingSeparators(path);
  if (strippedPath === strippedBase) {
    return true;
  }
  const prefix =
    strippedBase.endsWith(sep) || strippedBase.endsWith('/') ? strippedBase : strippedBase + sep;
  return path.startsWith(prefix);
}

/**
 * True when `path` is the home directory or lies beneath it.
 * `home` defaults to `resolveHomeDir()`.
 */
export function isUnderHome(path: string, home?: string): boolean {
  return isPathWithin(path, home ?? resolveHomeDir());
}

/**
 * Replace the home prefix with `~` (`~` for home itself, `~/rest` beneath it).
 * Returns the path unchanged when it is outside home or home is empty.
 */
export function shortenHome(path: string, home?: string): string {
  const base = stripTrailingSeparators(home ?? resolveHomeDir());
  if (!isPathWithin(path, base)) {
    return path;
  }
  const strippedPath = stripTrailingSeparators(path);
  if (strippedPath === base) {
    return '~';
  }
  let rest = path.slice(base.length);
  while (rest.startsWith('/') || rest.startsWith(sep)) {
    rest = rest.slice(1);
  }
  return `~${sep}${rest}`;
}
