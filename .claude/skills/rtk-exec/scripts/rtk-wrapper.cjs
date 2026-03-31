#!/usr/bin/env node

/**
 * rtk-wrapper.cjs
 *
 * Node.js wrapper for RTK (Rust Token Killer) CLI proxy.
 * Executes shell commands through RTK for token-optimized compressed output.
 *
 * Usage:
 *   node rtk-wrapper.cjs --command "git status" [options]
 *   node rtk-wrapper.cjs --gain
 *   node rtk-wrapper.cjs --version
 *   node rtk-wrapper.cjs --init
 *
 * Options:
 *   --command <cmd>       Required (unless --gain/--version/--init): CLI command to proxy through RTK
 *   --timeout <ms>        Execution timeout in milliseconds (default: 120000, max: 600000)
 *   --working-dir <dir>   Set working directory for execution
 *   --gain                Show token savings statistics (rtk gain)
 *   --version             Show RTK version (rtk --version)
 *   --init                Initialize RTK for current project (rtk init -g)
 *
 * Output (JSON to stdout):
 *   Success: { "success": true, "output": "...", "duration_ms": 1234, "command": "..." }
 *   Failure: { "success": false, "error": "...", "stderr": "...", "exit_code": 1 }
 *
 * Exit codes:
 *   0 = success
 *   1 = execution error
 *   2 = validation error (missing binary or invalid arguments)
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes
const MAX_TIMEOUT_MS = 600000; // 10 minutes
const KILL_GRACE_PERIOD_MS = 5000; // 5 seconds for graceful shutdown

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = {
    command: null,
    timeout: DEFAULT_TIMEOUT_MS,
    workingDir: null,
    gain: false,
    version: false,
    init: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    switch (arg) {
      case '--command':
        if (i + 1 < process.argv.length) {
          args.command = process.argv[++i];
        }
        break;
      case '--timeout':
        if (i + 1 < process.argv.length) {
          const timeoutValue = parseInt(process.argv[++i], 10);
          if (!isNaN(timeoutValue)) {
            args.timeout = Math.min(timeoutValue, MAX_TIMEOUT_MS);
          }
        }
        break;
      case '--working-dir':
        if (i + 1 < process.argv.length) {
          args.workingDir = process.argv[++i];
        }
        break;
      case '--gain':
        args.gain = true;
        break;
      case '--version':
        args.version = true;
        break;
      case '--init':
        args.init = true;
        break;
    }
  }

  return args;
}

/**
 * Validate environment for RTK execution
 * No auth required — only checks binary availability
 * @returns {Object} Validation result { valid: boolean, errors: string[], rtkPath: string|null }
 */
function validateEnvironment() {
  const errors = [];
  let rtkPath = null;

  // Check for rtk binary
  try {
    const result = execFileSync('which', ['rtk'], { stdio: 'pipe' });
    rtkPath = result.toString().trim();
  } catch (error) {
    // Try common installation paths
    const commonPaths = [
      '/usr/local/bin/rtk',
      path.join(os.homedir(), '.local', 'bin', 'rtk'),
      path.join(os.homedir(), 'bin', 'rtk'),
      path.join(os.homedir(), '.cargo', 'bin', 'rtk'),
      '/opt/homebrew/bin/rtk',
    ];

    const foundPath = commonPaths.find(p => fs.existsSync(p));
    if (foundPath) {
      rtkPath = foundPath;
    } else {
      errors.push(
        'rtk binary not found in PATH or common locations. ' +
        'Install with: brew install rtk, ' +
        'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh, ' +
        'or cargo install --git https://github.com/rtk-ai/rtk'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    rtkPath,
  };
}

/**
 * Build RTK command array
 * @param {Object} options - Parsed arguments
 * @returns {Object} Command structure { binary: string, args: string[], label: string }
 */
function buildCommand(options) {
  // Special commands
  if (options.gain) {
    return { binary: 'rtk', args: ['gain'], label: 'rtk gain' };
  }

  if (options.version) {
    return { binary: 'rtk', args: ['--version'], label: 'rtk --version' };
  }

  if (options.init) {
    return { binary: 'rtk', args: ['init', '-g'], label: 'rtk init -g' };
  }

  // Proxy command: rtk <command_parts...>
  // Split the command string into parts for safe argv construction
  const commandParts = splitCommand(options.command);
  return {
    binary: 'rtk',
    args: commandParts,
    label: `rtk ${options.command}`,
  };
}

/**
 * Split a command string into argv parts, respecting quoted strings
 * Simple shell-like splitting (no full POSIX parsing)
 * @param {string} cmd - Command string
 * @returns {string[]} Argv parts
 */
function splitCommand(cmd) {
  const parts = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * Execute RTK command
 * @param {string} binary - Binary to execute (rtk)
 * @param {string[]} args - Command arguments
 * @param {number} timeout - Timeout in milliseconds
 * @param {string|null} workingDir - Working directory
 * @returns {Promise<Object>} Execution result
 */
function executeRtk(binary, args, timeout, workingDir = null) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const spawnOptions = {
      cwd: workingDir || process.cwd(),
      env: process.env,
    };

    const child = spawn(binary, args, spawnOptions);

    // Collect output
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.error('[rtk-wrapper] Timeout reached, terminating process...');

      // Graceful termination attempt
      child.kill('SIGTERM');

      // Force kill after grace period
      setTimeout(() => {
        if (!child.killed) {
          console.error('[rtk-wrapper] Force killing process...');
          child.kill('SIGKILL');
        }
      }, KILL_GRACE_PERIOD_MS);
    }, timeout);

    // Handle process exit
    child.on('close', (exitCode) => {
      clearTimeout(timeoutHandle);
      const durationMs = Date.now() - startTime;

      resolve({
        exitCode: exitCode !== null ? exitCode : 1,
        stdout,
        stderr,
        timedOut,
        durationMs,
      });
    });

    // Handle spawn errors
    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      const durationMs = Date.now() - startTime;

      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + '\nSpawn error: ' + error.message,
        timedOut: false,
        durationMs,
      });
    });
  });
}

/**
 * Main execution function
 */
async function main() {
  const args = parseArgs();

  // Determine which mode we're running in
  const isSpecialCommand = args.gain || args.version || args.init;

  // Validate required arguments
  if (!isSpecialCommand && !args.command) {
    const result = {
      success: false,
      error: 'Missing required argument: --command (or use --gain, --version, --init)',
      exit_code: 2,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  // Validate environment (binary check only, no auth)
  const validation = validateEnvironment();
  if (!validation.valid) {
    const result = {
      success: false,
      error: 'RTK binary not found',
      validation_errors: validation.errors,
      exit_code: 2,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  console.error(`[rtk-wrapper] RTK binary: ${validation.rtkPath}`);
  console.error(`[rtk-wrapper] Executing with timeout: ${args.timeout}ms`);
  if (args.workingDir) {
    console.error(`[rtk-wrapper] Working directory: ${args.workingDir}`);
  }

  // Build command
  const command = buildCommand(args);
  console.error(`[rtk-wrapper] Command: ${command.binary} ${command.args.join(' ')}`);

  // Execute
  const execResult = await executeRtk(
    command.binary,
    command.args,
    args.timeout,
    args.workingDir
  );

  // Determine success
  const success = execResult.exitCode === 0 && !execResult.timedOut;

  // Build result object
  const result = {
    success,
    duration_ms: execResult.durationMs,
    exit_code: execResult.exitCode,
    command: command.label,
  };

  if (success) {
    result.output = execResult.stdout.trim();
    if (execResult.stderr.trim()) {
      result.stderr = execResult.stderr.trim();
    }
  } else {
    if (execResult.timedOut) {
      result.error = `Execution timed out after ${args.timeout}ms`;
    } else {
      result.error = 'Execution failed';
    }
    if (execResult.stderr.trim()) {
      result.stderr = execResult.stderr.trim();
    }
    if (execResult.stdout.trim()) {
      result.partial_output = execResult.stdout.trim();
    }
  }

  // Output JSON result to stdout
  console.log(JSON.stringify(result, null, 2));

  process.exit(result.exit_code);
}

// Run
main().catch(error => {
  const result = {
    success: false,
    error: 'Unexpected error: ' + error.message,
    stack: error.stack,
    exit_code: 1,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
});
