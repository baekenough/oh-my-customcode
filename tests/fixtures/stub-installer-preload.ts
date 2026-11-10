/**
 * Bun preload for CLI subprocess tests: replaces src/core/installer.ts with a stub whose
 * `install` prints the options it received instead of installing anything. Lets a test
 * exercise the real commander wiring of `omcustom init` without touching the file system,
 * npm, or Codex.
 */
import { plugin } from 'bun';

plugin({
  name: 'stub-installer',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]core[\\/]installer\.ts$/ }, () => ({
      loader: 'js',
      contents: `
        export async function install(options) {
          console.log('INSTALL_OPTIONS=' + JSON.stringify(options));
          return {
            success: true,
            installedPath: options.targetDir,
            installedComponents: [],
            skippedComponents: [],
            backedUpPaths: [],
            warnings: [],
          };
        }
      `,
    }));
  },
});
