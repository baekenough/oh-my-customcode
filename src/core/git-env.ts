/**
 * Environment for git child processes that must inspect a directory's own repository (#1983).
 *
 * A parent git process (a hook run by `git commit`, or `git -c k=v …`) exports variables that
 * relocate git to another repository or inject configuration. A child git process that inherits
 * them answers for the wrong repository; `gitChildEnv` (lockfile) also drops env-injected config,
 * which would otherwise apply the wrong ignore rules. This module has no imports so every git
 * caller can use it.
 */

/**
 * The location variables (listed below). Not every location variable
 * in `man git` ENVIRONMENT (git 2.52.0): `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`
 * and `GIT_NAMESPACE` are kept.
 */
export const GIT_LOCATION_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
] as const;

/**
 * Environment variables carrying one-off `git -c` configuration from a parent git process (a
 * hook run under `git -c core.excludesFile=… commit`). `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`
 * and `GIT_CONFIG_NOSYSTEM` are the user's own environment and are kept: global excludes still
 * apply, as they do for a plain `git` run by the user.
 */
export const GIT_INJECTED_CONFIG_ENV_KEYS = ['GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT'] as const;

/** Prefixes of the numbered `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` pairs. */
export const GIT_INJECTED_CONFIG_ENV_PREFIXES = ['GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_'] as const;

/**
 * Copy of `source` without `GIT_LOCATION_ENV_KEYS`; injected configuration is kept, so an
 * env-supplied `safe.directory` still lets git open a foreign-owned repository
 * (`GIT_TEST_ASSUME_DIFFERENT_OWNER=1`, git 2.52.0). Used by backup-layout and git-workflow.
 * `source` is read when the function is called (the default is the current `process.env`) and is
 * never modified.
 */
export function gitChildEnvLocationOnly(
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source };
  for (const key of GIT_LOCATION_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

/**
 * Copy of `source` without `GIT_LOCATION_ENV_KEYS` and the injected-config variables, so git
 * resolves the repository and its configuration from the child's cwd. Used by lockfile. `source`
 * is read when the function is called (the default is the current `process.env`) and is never
 * modified.
 */
export function gitChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = gitChildEnvLocationOnly(source);
  for (const key of GIT_INJECTED_CONFIG_ENV_KEYS) {
    delete env[key];
  }
  for (const key of Object.keys(env)) {
    if (GIT_INJECTED_CONFIG_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete env[key];
    }
  }
  return env;
}
