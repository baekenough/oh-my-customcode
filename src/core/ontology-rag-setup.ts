/**
 * ontology-rag Python environment setup for the init flow.
 *
 * Responsibilities:
 *  1. Detect python3 and verify >= 3.10
 *  2. Detect uv (preferred) or fall back to python3 -m venv
 *  3. Create .venv/ in the project root
 *  4. Install packages/ontology-rag: editable from a repo checkout, regular
 *     (non-editable) from an npm install so upgrades/uninstalls cannot break the venv
 *  5. Verify .venv/bin/python exists post-install
 *  6. Print a clear summary line
 *
 * All failures are non-fatal — a warning is printed and init continues.
 *
 * Set OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP=1 to bypass all subprocess calls
 * (useful in CI or test environments that do not have Python/uv available).
 */

import { execSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists, getPackageRoot } from '../utils/fs.js';

/** Minimum required Python minor version (3.x, where x >= MIN_PYTHON_MINOR) */
const MIN_PYTHON_MINOR = 10;

/**
 * Timeout in milliseconds for quick tool-detection commands (python3/uv --version).
 * Keeps init responsive when PATH resolution stalls.
 */
const DETECTION_TIMEOUT_MS = 3000;

/**
 * Timeout in milliseconds for venv creation and package installation.
 * Generous enough for a first-time `uv pip install` over a slow network.
 */
const INSTALL_TIMEOUT_MS = 90000;

/** Result returned from the ontology-rag setup step */
export interface OntologyRagSetupResult {
  /** Whether setup completed successfully */
  success: boolean;
  /** Human-readable status line printed during init summary */
  statusLine: string;
  /** Optional reason when skipped or failed */
  reason?: string;
}

/**
 * Parse `python3 --version` output and return [major, minor].
 * Returns null when the version string cannot be parsed.
 */
export function parsePythonVersion(output: string): [number, number] | null {
  const match = /Python\s+(\d+)\.(\d+)/i.exec(output);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

/**
 * Check whether python3 is available and satisfies the minimum version.
 */
export function checkPython3(): { available: boolean; versionOk: boolean; version: string } {
  try {
    // Note: No user input in command — safe to use execSync with fixed string.
    // 2>&1 captures Python 3.4 which prints to stderr.
    const output = execSync('python3 --version 2>&1', {
      stdio: 'pipe',
      timeout: DETECTION_TIMEOUT_MS,
    })
      .toString()
      .trim();
    const parsed = parsePythonVersion(output);
    if (!parsed) {
      return { available: true, versionOk: false, version: output };
    }
    const [major, minor] = parsed;
    const versionOk = major === 3 && minor >= MIN_PYTHON_MINOR;
    return { available: true, versionOk, version: `${major}.${minor}` };
  } catch {
    return { available: false, versionOk: false, version: '' };
  }
}

/**
 * Check whether `uv` is available on PATH.
 */
export function checkUvAvailableForSetup(): boolean {
  try {
    // Note: No user input — safe to use execSync with fixed string.
    execSync('uv --version', { stdio: 'pipe', timeout: DETECTION_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a virtual environment using uv.
 * uv manages the Python version directly; `--python 3.12` requests a
 * compatible interpreter without requiring one pre-installed at that exact patch.
 */
export function createVenvWithUv(targetDir: string): void {
  // Note: No user input — safe to use execSync with fixed string.
  execSync('uv venv --python 3.12 .venv', {
    cwd: targetDir,
    stdio: 'pipe',
    timeout: INSTALL_TIMEOUT_MS,
  });
}

/**
 * Create a virtual environment using the system python3 (fallback path).
 */
export function createVenvWithPython3(targetDir: string): void {
  // Note: No user input — safe to use execSync with fixed string.
  execSync('python3 -m venv .venv', {
    cwd: targetDir,
    stdio: 'pipe',
    timeout: INSTALL_TIMEOUT_MS,
  });
}

/**
 * Whether the package root sits inside a `node_modules` directory, i.e. the CLI
 * runs from an npm install rather than a repository checkout.
 */
export function isNpmInstalledPackageRoot(packageRoot: string): boolean {
  return packageRoot.split(/[\\/]/).includes('node_modules');
}

/** Absolute path of the bundled ontology-rag Python package. */
export function resolveOntologyRagPath(packageRoot: string = getPackageRoot()): string {
  return join(packageRoot, 'packages', 'ontology-rag');
}

/**
 * Install the bundled `packages/ontology-rag` package into the project .venv.
 *
 * The package root is resolved via `getPackageRoot()`. From a repository
 * checkout the install is editable. From an npm install it is a regular
 * (non-editable) install, because an editable install would point the venv at
 * node_modules and break on the next npm upgrade or uninstall.
 */
export function installOntologyRagEditable(
  targetDir: string,
  useUv: boolean,
  packageRoot: string = getPackageRoot()
): void {
  const ontologyPkgPath = resolveOntologyRagPath(packageRoot);
  const editableFlag = isNpmInstalledPackageRoot(packageRoot) ? '' : '-e ';

  if (useUv) {
    // Note: ontologyPkgPath is derived from import.meta.url — no user input.
    // --reinstall-package: the package version stays 0.3.0 across CLI releases and the npm
    // tarball has fixed mtimes, so without it uv can satisfy the install from its cache.
    execSync(
      `uv pip install --python .venv/bin/python --reinstall-package ontology-rag ${editableFlag}"${ontologyPkgPath}"`,
      {
        cwd: targetDir,
        stdio: 'pipe',
        timeout: INSTALL_TIMEOUT_MS,
      }
    );
  } else {
    execSync(`.venv/bin/pip install ${editableFlag}"${ontologyPkgPath}"`, {
      cwd: targetDir,
      stdio: 'pipe',
      timeout: INSTALL_TIMEOUT_MS,
    });
  }
}

/**
 * Run the full ontology-rag venv + install flow.
 *
 * Steps:
 *  1. Verify python3 >= 3.10 is present
 *  2. Prefer uv; fall back to python3 -m venv when uv is missing
 *  3. Create .venv in targetDir
 *  4. Skip (no uv/pip call) when the ontology-rag sources are missing
 *  5. Install packages/ontology-rag
 *  6. Verify .venv/bin/python exists
 *
 * Never throws. Returns a structured result so the caller can print a summary.
 */
export async function setupOntologyRag(targetDir: string): Promise<OntologyRagSetupResult> {
  // Fast-skip: honour opt-out env var (useful in CI and test environments).
  if (process.env.OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP === '1') {
    const statusLine = 'ontology-rag MCP: ⚠ skipped (OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP=1)';
    console.warn(`Warning: ${statusLine}`);
    return { success: false, statusLine, reason: 'skipped via env var' };
  }

  // Step 1: Python availability and version check
  const python = checkPython3();

  if (!python.available) {
    const reason = `python3 not found. Install Python >= 3.${MIN_PYTHON_MINOR} (https://python.org) to enable ontology-rag.`;
    console.warn(`Warning: ${reason}`);
    return {
      success: false,
      statusLine: 'ontology-rag MCP: skipped (python3 not found)',
      reason,
    };
  }

  if (!python.versionOk) {
    const reason =
      `python3 ${python.version} is below the required 3.${MIN_PYTHON_MINOR}. ` +
      `Upgrade Python to enable ontology-rag.`;
    console.warn(`Warning: ${reason}`);
    return {
      success: false,
      statusLine: `ontology-rag MCP: skipped (python3 ${python.version} < 3.${MIN_PYTHON_MINOR})`,
      reason,
    };
  }

  // Step 2: Detect uv availability; warn but do not abort when missing
  const uvAvailable = checkUvAvailableForSetup();
  if (!uvAvailable) {
    console.warn(
      'Warning: uv not found. Falling back to `python3 -m venv` for ontology-rag setup.'
    );
    console.warn('Install uv (https://docs.astral.sh/uv/) for faster Python environment setup.');
  }

  // Step 3: Bail out before touching uv/pip when the bundled sources are absent
  const ontologyPkgPath = resolveOntologyRagPath();
  if (!(await fileExists(join(ontologyPkgPath, 'pyproject.toml')))) {
    const reason =
      `ontology-rag sources not found at ${ontologyPkgPath}. ` +
      'Install manually: uv pip install --python .venv/bin/python <path-to>/packages/ontology-rag';
    console.warn(`Warning: ${reason}`);
    return {
      success: false,
      statusLine: 'ontology-rag MCP: skipped (install failed)',
      reason,
    };
  }

  // Step 4: Create .venv
  try {
    if (uvAvailable) {
      createVenvWithUv(targetDir);
    } else {
      createVenvWithPython3(targetDir);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = `Failed to create .venv: ${msg}`;
    console.warn(`Warning: ${reason}`);
    return {
      success: false,
      statusLine: 'ontology-rag MCP: skipped (venv creation failed)',
      reason,
    };
  }

  // Step 5: Install ontology-rag (editable from a checkout, regular from npm)
  try {
    installOntologyRagEditable(targetDir, uvAvailable);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = `Failed to install ontology-rag: ${msg}`;
    console.warn(`Warning: ${reason}`);
    return {
      success: false,
      statusLine: 'ontology-rag MCP: skipped (install failed)',
      reason,
    };
  }

  // Step 6: Verify .venv/bin/python is present
  const venvPython = join(targetDir, '.venv', 'bin', 'python');
  const venvReady = await fileExists(venvPython);

  if (!venvReady) {
    const reason =
      '.venv/bin/python missing after install — environment may be incomplete. ' +
      'Run `uv pip install -e packages/ontology-rag` manually to complete setup.';
    console.warn(`Warning: ${reason}`);
    return {
      success: false,
      statusLine: 'ontology-rag MCP: skipped (venv incomplete)',
      reason,
    };
  }

  console.log('ontology-rag MCP: ready');
  return {
    success: true,
    statusLine: 'ontology-rag MCP: ready',
  };
}

/**
 * Whether the project `.venv` already has ontology-rag installed — the state `init` leaves
 * behind (a regular or editable install both write an `ontology_rag-*.dist-info`). Local
 * filesystem check only: no subprocess, no network.
 */
export async function isOntologyRagInstalled(targetDir: string): Promise<boolean> {
  try {
    const lib = join(targetDir, '.venv', 'lib');
    if (!(await fileExists(join(targetDir, '.venv', 'bin', 'python')))) return false;
    for (const entry of await readdir(lib)) {
      if (!entry.startsWith('python')) continue;
      const packages = await readdir(join(lib, entry, 'site-packages')).catch(() => [] as string[]);
      if (packages.some((name) => /^ontology_rag-.*\.dist-info$/i.test(name))) return true;
    }
  } catch {
    // no venv or unreadable layout: not installed
  }
  return false;
}

/** Outcome of {@link refreshOntologyRag}. */
export interface OntologyRagRefreshResult {
  status: 'refreshed' | 'would-refresh' | 'skipped' | 'failed';
  reason?: string;
}

/**
 * Re-install the bundled ontology-rag into a project `.venv` that already has it, so `update`
 * delivers the new sources (the package version stays unchanged across CLI releases).
 *
 * Never creates a venv, never prompts, honours OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP=1, only
 * reports in a dry run, and never throws: a failure is returned for the caller to warn about.
 */
export async function refreshOntologyRag(
  targetDir: string,
  options: { dryRun?: boolean } = {}
): Promise<OntologyRagRefreshResult> {
  if (process.env.OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP === '1') {
    return { status: 'skipped', reason: 'OMCUSTOM_SKIP_ONTOLOGY_RAG_SETUP=1' };
  }
  if (!(await isOntologyRagInstalled(targetDir))) {
    return { status: 'skipped', reason: 'ontology-rag is not installed in the project .venv' };
  }
  if (!(await fileExists(join(resolveOntologyRagPath(), 'pyproject.toml')))) {
    return { status: 'skipped', reason: 'bundled ontology-rag sources not found' };
  }
  if (options.dryRun) return { status: 'would-refresh' };
  try {
    installOntologyRagEditable(targetDir, checkUvAvailableForSetup());
    return { status: 'refreshed' };
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}
