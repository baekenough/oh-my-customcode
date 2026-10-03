/**
 * Migration of cwd-relative oh-my-customcode hook commands (#1767).
 *
 * Old settings carried commands such as `bash .claude/hooks/scripts/x.sh`. Those resolve
 * against the session's current directory, so once the Bash tool leaves the project root
 * every hook fails with exit 127 (a non-blocking error, i.e. fail-open). The new form is
 * anchored: `bash "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/scripts/x.sh"`.
 *
 * This module only REWRITES matching command strings. It never regenerates, adds or
 * removes hooks, so user-authored hooks survive untouched unless they happen to be in the
 * exact omcustom shape (see {@link OLD_HOOK_COMMAND}).
 */

/**
 * Full-string match for an old-form omcustom hook command:
 *   [bash ][./].claude/hooks/[scripts/]<name>.sh
 *
 * Anchored on both ends, so commands with arguments, pipes, quotes, other interpreters
 * (`sh`), nested directories, spaces or absolute paths do NOT match and stay untouched.
 * Already-migrated commands (they contain `${CLAUDE_PROJECT_DIR...}` and quotes) do not
 * match either, which makes the rewrite idempotent.
 *
 * Known, intended side effect: a USER hook written in exactly this shape
 * (`bash .claude/hooks/my-custom.sh`) is rewritten too. It still runs the same file, only
 * anchored to the project root, so the behavior is preserved.
 */
const OLD_HOOK_COMMAND = /^(bash )?(?:\.\/)?\.claude\/hooks\/((?:scripts\/)?[A-Za-z0-9._-]+\.sh)$/;

/**
 * Returns the anchored replacement for an old-form hook command, or `null` when the
 * command does not match (custom, inline, or already migrated).
 */
export function rewriteRelativeHookCommand(command: string): string | null {
  const match = OLD_HOOK_COMMAND.exec(command);
  if (match === null) {
    return null;
  }
  const interpreter = match[1] ?? '';
  return `${interpreter}"\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${match[2]}"`;
}

export interface HookMigrationResult<T extends Record<string, unknown>> {
  /** A new settings object; the input is never mutated. */
  settings: T;
  /** Number of `command` strings that were rewritten. */
  rewritten: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rewriteNode(node: unknown, counter: { count: number }): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => rewriteNode(item, counter));
  }
  if (!isRecord(node)) {
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'command' && typeof value === 'string') {
      const rewritten = rewriteRelativeHookCommand(value);
      if (rewritten !== null) {
        counter.count++;
        out[key] = rewritten;
        continue;
      }
    }
    out[key] = rewriteNode(value, counter);
  }
  return out;
}

/**
 * Rewrites old cwd-relative omcustom hook commands inside `settings.hooks` to the
 * `CLAUDE_PROJECT_DIR`-anchored form. Pure: returns a new object and the rewrite count.
 * All keys outside `hooks` are returned as-is (same references).
 */
export function migrateHookCommands<T extends Record<string, unknown>>(
  settings: T
): HookMigrationResult<T> {
  if (!isRecord(settings.hooks)) {
    return { settings, rewritten: 0 };
  }
  const counter = { count: 0 };
  const hooks = rewriteNode(settings.hooks, counter);
  if (counter.count === 0) {
    return { settings, rewritten: 0 };
  }
  return { settings: { ...settings, hooks }, rewritten: counter.count };
}
