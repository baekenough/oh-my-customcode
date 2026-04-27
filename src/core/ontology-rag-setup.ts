/**
 * ontology-rag Python environment setup for the init flow.
 *
 * Responsibilities:
 *  1. Detect python3 and verify >= 3.10
 *  2. Detect uv (preferred) or fall back to python3 -m venv
 *  3. Create .venv/ in the project root
 *  4. Install packages/ontology-rag in editable mode
 *  5. Verify .venv/bin/python exists post-install
 *  6. Print a clear summary line
 *
 * All failures are non-fatal — a warning is printed and init continues.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileExists, getPackageRoot } from '../utils/fs.js';

/** Minimum required Python minor version (3.x, where x >= MIN_PYTHON_MINOR) */
const MIN_PYTHON_MINOR = 10;

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
    const output = execSync('python3 --version 2>&1', { stdio: 'pipe' }).toString().trim();
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
    execSync('uv --version', { stdio: 'pipe' });
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
  execSync('uv venv --python 3.12 .venv', { cwd: targetDir, stdio: 'pipe' });
}

/**
 * Create a virtual environment using the system python3 (fallback path).
 */
export function createVenvWithPython3(targetDir: string): void {
  // Note: No user input — safe to use execSync with fixed string.
  execSync('python3 -m venv .venv', { cwd: targetDir, stdio: 'pipe' });
}

/**
 * Install the local `packages/ontology-rag` package in editable mode.
 *
 * The package root is resolved via `getPackageRoot()` so this works both in
 * the monorepo development layout and when installed as an npm package.
 */
export function installOntologyRagEditable(targetDir: string, useUv: boolean): void {
  const packageRoot = getPackageRoot();
  const ontologyPkgPath = join(packageRoot, 'packages', 'ontology-rag');

  if (useUv) {
    // Note: ontologyPkgPath is derived from import.meta.url — no user input.
    execSync(`uv pip install --python .venv/bin/python -e "${ontologyPkgPath}"`, {
      cwd: targetDir,
      stdio: 'pipe',
    });
  } else {
    execSync(`.venv/bin/pip install -e "${ontologyPkgPath}"`, {
      cwd: targetDir,
      stdio: 'pipe',
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
 *  4. Install packages/ontology-rag editable
 *  5. Verify .venv/bin/python exists
 *
 * Never throws. Returns a structured result so the caller can print a summary.
 */
export async function setupOntologyRag(targetDir: string): Promise<OntologyRagSetupResult> {
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

  // Step 3: Create .venv
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

  // Step 4: Install ontology-rag editable
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

  // Step 5: Verify .venv/bin/python is present
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
