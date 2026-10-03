/**
 * User-hook-preserving merge of generated omcustom hook blocks (#1768).
 *
 * `mergeHooksIntoSettings` used to replace the whole `hooks` value, which deleted hooks the
 * user had added to settings. {@link mergeHookBlocks} instead rebuilds the block as
 * "generated omcustom groups + whatever the user owns". It is pure (no I/O, no mutation) and
 * lives in its own module so callers can import it without pulling in hooks-settings.ts.
 *
 * Ownership rules. Something is omcustom-owned (and therefore replaced by the freshly
 * generated groups) only when it is positively recognized:
 *   1. A matcher group whose `description` equals a generated group description or a retired
 *      one ({@link LEGACY_OMCUSTOM_DESCRIPTIONS}). This is the only way prompt/agent hooks and
 *      inline scripts are recognized. Limitation: user commands appended INSIDE an owned
 *      group are lost with it.
 *   2. A single `command` hook that, under the SAME event AND inside a group with the SAME
 *      `matcher` (absent and `''` count as the same), either equals a generated command string
 *      or is a standalone call of a script the generated groups of that event+matcher ship
 *      (`[bash ]<anchored|./|bare>.claude/hooks/<script>.sh`, quotes balanced). Both the old
 *      cwd-relative and the `${CLAUDE_PROJECT_DIR:-.}`-anchored forms are accepted. A user
 *      group reusing a shipped script under another matcher is the user's own wiring and kept.
 * Everything else, including unknown shapes, is kept: user hooks are never deleted on a guess.
 */

/**
 * Descriptions of omcustom groups that were generated in past releases and no longer are.
 * Append-only: a retired group stays recognizable so upgrades do not leave it behind as a
 * "user" hook next to its replacement.
 *
 * Found with (41 tags v1.1.53..v1.1.93; v1.1.53 is the first release that wrote hooks into
 * settings.local.json, #1623): for every tag, `git show <tag>:templates/.claude/hooks/hooks.json`,
 * collect group descriptions and keep those absent from `HEAD`. The SubagentStop prompt hook
 * came from `git log --oneline -S'auto-continue workflow' -- templates/.claude/hooks/hooks.json`
 * (11e33c3e, #556).
 */
export const LEGACY_OMCUSTOM_DESCRIPTIONS: readonly string[] = [
  // SubagentStop incl. the auto-continue `prompt` hook; present in v1.1.53..v1.1.55.
  'Record agent outcomes + auto-continue workflow + R007/R008 drift advisory on subagent completion (autonomous-loop re-entry, #1545)',
  // SessionStart re-inject group; present in v1.1.53..v1.1.56, superseded by a reworded one.
  'Re-inject project CLAUDE.md into model context on session start/resume/clear and compact re-entry — matcher "*" covers all SessionStart sources including "compact" (#1617)',
];

/**
 * Full-string match of a standalone omcustom script call with balanced quotes. Group 1 is
 * the script for the quoted form, group 2 for the unquoted form (`./` or bare relative only).
 * Anchoring on both ends keeps pipelines, arguments, other interpreters and absolute paths out.
 */
const STANDALONE_SCRIPT_COMMAND =
  /^(?:bash )?(?:"(?:\$\{CLAUDE_PROJECT_DIR:-\.\}\/|\.\/)?\.claude\/hooks\/((?:scripts\/)?[A-Za-z0-9._-]+\.sh)"|(?:\.\/)?\.claude\/hooks\/((?:scripts\/)?[A-Za-z0-9._-]+\.sh))$/;

/** Finds every shipped script referenced anywhere inside a generated command string. */
const SCRIPT_REFERENCE = /\.claude\/hooks\/((?:scripts\/)?[A-Za-z0-9._-]+\.sh)/g;

interface MatcherOwnership {
  /** Exact generated command strings of the event+matcher. */
  commands: Set<string>;
  /** Scripts (`scripts/x.sh`) referenced by the generated commands of the event+matcher. */
  scripts: Set<string>;
}

/** Generated command ownership of one event, keyed by {@link matcherKey}. */
type EventOwnership = Map<string, MatcherOwnership>;

interface Ownership {
  /** Generated group descriptions plus {@link LEGACY_OMCUSTOM_DESCRIPTIONS}. */
  descriptions: Set<string>;
  events: Map<string, EventOwnership>;
}

/** Normalizes a group `matcher` so a missing matcher and `''` compare equal. */
function matcherKey(group: Record<string, unknown>): string {
  return typeof group.matcher === 'string' ? group.matcher : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Records the exact command and every referenced shipped script of one generated hook. */
function addHookOwnership(hook: unknown, owned: MatcherOwnership): void {
  if (!isRecord(hook) || typeof hook.command !== 'string') {
    return;
  }
  owned.commands.add(hook.command);
  for (const match of hook.command.matchAll(SCRIPT_REFERENCE)) {
    owned.scripts.add(match[1] as string);
  }
}

/** Records the description and hooks of one generated matcher group; odd shapes own nothing. */
function addGroupOwnership(group: unknown, owned: EventOwnership, descriptions: Set<string>): void {
  if (!isRecord(group)) {
    return;
  }
  const key = matcherKey(group);
  let forMatcher = owned.get(key);
  if (forMatcher === undefined) {
    forMatcher = { commands: new Set(), scripts: new Set() };
    owned.set(key, forMatcher);
  }
  if (typeof group.description === 'string') {
    descriptions.add(group.description);
  }
  if (Array.isArray(group.hooks)) {
    for (const hook of group.hooks) {
      addHookOwnership(hook, forMatcher);
    }
  }
}

function collectOwnership(generated: Record<string, unknown[]>): Ownership {
  const descriptions = new Set<string>(LEGACY_OMCUSTOM_DESCRIPTIONS);
  const events = new Map<string, EventOwnership>();
  for (const [event, groups] of Object.entries(generated)) {
    const owned: EventOwnership = new Map();
    events.set(event, owned);
    for (const group of groups) {
      addGroupOwnership(group, owned, descriptions);
    }
  }
  return { descriptions, events };
}

function isOwnedCommand(hook: unknown, owned: MatcherOwnership | undefined): boolean {
  if (owned === undefined || !isRecord(hook) || hook.type !== 'command') {
    return false;
  }
  const command = hook.command;
  if (typeof command !== 'string') {
    return false;
  }
  if (owned.commands.has(command)) {
    return true;
  }
  const match = STANDALONE_SCRIPT_COMMAND.exec(command);
  const script = match?.[1] ?? match?.[2];
  return script !== undefined && owned.scripts.has(script);
}

/** Returns the part of one existing group that the user owns (0 or 1 group). */
function userResidual(
  group: unknown,
  owned: EventOwnership | undefined,
  ownership: Ownership
): unknown[] {
  if (!isRecord(group) || !Array.isArray(group.hooks)) {
    return [group];
  }
  if (typeof group.description === 'string' && ownership.descriptions.has(group.description)) {
    return [];
  }
  const ownedForMatcher = owned?.get(matcherKey(group));
  const remaining = group.hooks.filter((hook) => !isOwnedCommand(hook, ownedForMatcher));
  if (remaining.length === group.hooks.length) {
    return [group];
  }
  return remaining.length === 0 ? [] : [{ ...group, hooks: remaining }];
}

/**
 * Builds the new `hooks` value: the generated groups of every event (generated order), then
 * the user's residual groups of each existing event appended after them. Events that exist
 * only in `existing` follow the generated events. Idempotent:
 * `merge(merge(x, g), g)` equals `merge(x, g)`.
 *
 * @param existing - The current `settings.hooks` value (any JSON; non-objects are ignored)
 * @param generated - The freshly generated omcustom hooks, event -> matcher groups
 */
export function mergeHookBlocks(
  existing: unknown,
  generated: Record<string, unknown[]>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(generated)) {
    result[event] = [...groups];
  }
  if (!isRecord(existing)) {
    return result;
  }
  const ownership = collectOwnership(generated);
  for (const [event, value] of Object.entries(existing)) {
    if (!Array.isArray(value)) {
      if (!ownership.events.has(event)) {
        result[event] = value;
      }
      continue;
    }
    const owned = ownership.events.get(event);
    const residual = value.flatMap((group) => userResidual(group, owned, ownership));
    if (residual.length === 0) {
      continue;
    }
    const current = result[event];
    result[event] = Array.isArray(current) ? [...current, ...residual] : residual;
  }
  return result;
}
