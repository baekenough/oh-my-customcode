/**
 * CI detection shared by the CLI commands.
 */

/** CI variables whose value marks a CI run (any value except empty, `false` and `0`). */
const CI_ENV_VARS = ['CI', 'GITHUB_ACTIONS', 'TF_BUILD'] as const;

/**
 * Whether one CI variable marks a CI run: set and not empty, `false` or `0` (case-insensitive,
 * surrounding spaces ignored), so `CI=1`, `CI=True` or `CI=woodpecker` count while `CI=false`
 * or `CI=0` on a developer machine do not.
 */
export function isCiFlagSet(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized !== '' && normalized !== 'false' && normalized !== '0';
}

/** Whether `env` describes a CI run (`CI`, `GITHUB_ACTIONS` or `TF_BUILD`, see {@link isCiFlagSet}). */
export function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return CI_ENV_VARS.some((name) => isCiFlagSet(env[name]));
}
