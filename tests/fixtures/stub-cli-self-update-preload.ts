/**
 * Bun preload for CLI subprocess tests of the init self-update wiring (#1946).
 *
 * - src/core/self-update.ts keeps its real code, but `autoSelfUpdate` is replaced by a stand-in
 *   that prints what the real skip logic decides for this process (real argv and env) and the
 *   `skip` option the CLI passed, then returns without touching npm (or throws when
 *   STUB_SELF_UPDATE_THROW is set).
 * - src/core/preflight.ts is replaced by a stub that only prints a marker, so the order of the
 *   two pre-action steps is visible in stdout.
 */
import { readFileSync } from 'node:fs';
import { plugin } from 'bun';

plugin({
  name: 'stub-cli-self-update',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]core[\\/]self-update\.ts$/ }, (args) => {
      const source = readFileSync(args.path, 'utf-8').replace(
        'export function autoSelfUpdate(',
        'function realAutoSelfUpdate('
      );
      return {
        loader: 'ts',
        contents: `${source}
export function autoSelfUpdate(options) {
  if (process.env.STUB_SELF_UPDATE_THROW) throw new Error('boom from self-update');
  console.log(
    'AUTO_SELF_UPDATE=' +
      JSON.stringify({
        command: options.command,
        skipOption: Boolean(options.skip),
        skipped: shouldSkipAutoSelfUpdate(options),
      })
  );
  return 'skipped';
}
`,
      };
    });

    build.onLoad({ filter: /[\\/]src[\\/]core[\\/]preflight\.ts$/ }, () => ({
      loader: 'js',
      contents: `
        export async function runPreflightCheck(options) {
          console.log('PREFLIGHT_RUN skip=' + Boolean(options && options.skip));
          return { tools: [], hasUpdates: false, warnings: [], skipped: true };
        }
        export function formatPreflightWarnings() {
          return '';
        }
      `,
    }));
  },
});
