#!/usr/bin/env node

/**
 * codex-wrapper.js
 *
 * Node.js wrapper for OpenAI Codex CLI (non-interactive execution).
 * Executes codex in ephemeral mode with structured JSON output.
 *
 * Usage:
 *   node codex-wrapper.js --prompt "your prompt" [options]
 *
 * Options:
 *   --prompt <text>       Required: prompt to execute
 *   --json                Enable JSON Lines output from codex
 *   --output <path>       Save final message to file
 *   --model <name>        Specify model (default: o3)
 *   --timeout <ms>        Execution timeout in milliseconds (default: 120000, max: 600000)
 *   --full-auto           Use full-auto approval mode (default: -a never)
 *   --working-dir <dir>   Set working directory for execution
 *
 * Output (JSON to stdout):
 *   Success: { "success": true, "output": "...", "duration_ms": 1234, ... }
 *   Failure: { "success": false, "error": "...", "stderr": "...", ... }
 *
 * Exit codes:
 *   0 = success
 *   1 = execution error
 *   2 = validation error (missing binary/auth)
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
    prompt: null,
    json: false,
    output: null,
    model: null,
    timeout: DEFAULT_TIMEOUT_MS,
    fullAuto: false,
    workingDir: null,
    effort: null,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    switch (arg) {
      case '--prompt':
        if (i + 1 < process.argv.length) {
          args.prompt = process.argv[++i];
        }
        break;
      case '--json':
        args.json = true;
        break;
      case '--output':
        if (i + 1 < process.argv.length) {
          args.output = process.argv[++i];
        }
        break;
      case '--model':
        if (i + 1 < process.argv.length) {
          args.model = process.argv[++i];
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
      case '--full-auto':
        args.fullAuto = true;
        break;
      case '--working-dir':
        if (i + 1 < process.argv.length) {
          args.workingDir = process.argv[++i];
        }
        break;
      case '--effort':
      case '--reasoning-effort':
        if (i + 1 < process.argv.length) {
          args.effort = process.argv[++i];
        }
        break;
    }
  }

  return args;
}

/**
 * Validate environment for codex execution
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validateEnvironment() {
  const errors = [];

  // Check for codex binary
  try {
    execFileSync('which', ['codex'], { stdio: 'pipe' });
  } catch (error) {
    // Try common installation paths
    const commonPaths = [
      '/usr/local/bin/codex',
      path.join(os.homedir(), '.local', 'bin', 'codex'),
      path.join(os.homedir(), 'bin', 'codex'),
    ];

    const codexExists = commonPaths.some(p => fs.existsSync(p));
    if (!codexExists) {
      errors.push('codex binary not found in PATH or common locations');
    }
  }

  // Note: OPENAI_API_KEY is optional if codex has its own stored auth (via `codex auth`)
  if (!process.env.OPENAI_API_KEY) {
    console.error('[codex-wrapper] Note: OPENAI_API_KEY not set, relying on codex built-in auth');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build codex command array
 * @param {Object} options - Command options
 * @returns {Object} Command structure { binary: string, args: string[] }
 */
function buildCommand(options) {
  const args = ['exec', '--ephemeral'];

  // Approval mode (default: normal, --full-auto: automatic execution)
  if (options.fullAuto) {
    args.push('--full-auto');
  }

  // JSON output
  if (options.json) {
    args.push('--json');
  }

  // Model selection
  if (options.model) {
    args.push('--model', options.model);
  }

  // Working directory
  if (options.workingDir) {
    args.push('-C', options.workingDir);
  }

  // Reasoning effort (maps to -c model_reasoning_effort="value")
  if (options.effort) {
    const validEfforts = ['minimal', 'low', 'medium', 'high', 'xhigh'];
    if (validEfforts.includes(options.effort)) {
      args.push('-c', `model_reasoning_effort="${options.effort}"`);
    } else {
      process.stderr.write(`Warning: Invalid effort level "${options.effort}". Valid: ${validEfforts.join(', ')}\n`);
    }
  }

  // Add prompt as last argument
  args.push(options.prompt);

  return {
    binary: 'codex',
    args,
  };
}

/**
 * Execute codex command
 * @param {string} binary - Binary to execute
 * @param {string[]} args - Command arguments
 * @param {number} timeout - Timeout in milliseconds
 * @param {string|null} workingDir - Working directory
 * @returns {Promise<Object>} Execution result
 */
function executeCodex(binary, args, timeout, workingDir = null) {
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
      console.error('[codex-wrapper] Timeout reached, terminating process...', { file: 'stderr' });

      // Graceful termination attempt
      child.kill('SIGTERM');

      // Force kill after grace period
      setTimeout(() => {
        if (!child.killed) {
          console.error('[codex-wrapper] Force killing process...', { file: 'stderr' });
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
 * Parse JSON Lines output from codex
 * @param {string} output - Raw output string
 * @returns {Object} Parsed result { events: object[], finalMessage: string|null, parseErrors: string[] }
 */
function parseJsonLines(output) {
  const lines = output.split('\n').filter(line => line.trim().length > 0);
  const events = [];
  const parseErrors = [];
  let finalMessage = null;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      events.push(event);

      // Codex CLI v0.99.0 format: item.completed events with agent_message type
      if (event.type === 'item.completed' && event.item) {
        if (event.item.type === 'agent_message' && event.item.text) {
          finalMessage = event.item.text;
        }
      }
      // Look for assistant message in various event structures (fallback for future API changes)
      else if (event.type === 'assistant_message' && event.content) {
        finalMessage = event.content;
      } else if (event.message && event.message.role === 'assistant') {
        finalMessage = event.message.content || event.message.text;
      } else if (event.role === 'assistant' && event.content) {
        finalMessage = event.content;
      }
    } catch (error) {
      parseErrors.push(`Failed to parse line: ${error.message}`);
    }
  }

  return {
    events,
    finalMessage,
    parseErrors,
  };
}

/**
 * Main execution function
 */
async function main() {
  const args = parseArgs();

  // Validate required arguments
  if (!args.prompt) {
    const result = {
      success: false,
      error: 'Missing required argument: --prompt',
      exit_code: 2,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  // Validate environment
  const validation = validateEnvironment();
  if (!validation.valid) {
    const result = {
      success: false,
      error: 'Environment validation failed',
      validation_errors: validation.errors,
      exit_code: 2,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  console.error(`[codex-wrapper] Executing codex with timeout: ${args.timeout}ms`);
  if (args.workingDir) {
    console.error(`[codex-wrapper] Working directory: ${args.workingDir}`);
  }

  // Build command
  const command = buildCommand(args);
  console.error(`[codex-wrapper] Command: ${command.binary} ${command.args.join(' ')}`);

  // Execute
  const execResult = await executeCodex(
    command.binary,
    command.args,
    args.timeout,
    args.workingDir
  );

  // Process result
  let output = null;
  let eventsCount = 0;

  if (args.json && execResult.stdout) {
    const parsed = parseJsonLines(execResult.stdout);
    eventsCount = parsed.events.length;
    output = parsed.finalMessage;

    if (parsed.parseErrors.length > 0) {
      console.error('[codex-wrapper] JSON parse errors:', parsed.parseErrors.join('; '));
    }
  } else {
    output = execResult.stdout.trim();
  }

  // Determine success
  const success = execResult.exitCode === 0 && !execResult.timedOut;

  // Build result object
  const result = {
    success,
    duration_ms: execResult.durationMs,
    exit_code: execResult.exitCode,
  };

  if (success) {
    result.output = output || execResult.stdout;
    result.model = args.model || 'o3';
    if (args.json) {
      result.events_count = eventsCount;
    }
  } else {
    if (execResult.timedOut) {
      result.error = `Execution timed out after ${args.timeout}ms`;
    } else {
      result.error = 'Execution failed';
    }
    if (execResult.stderr) {
      result.stderr = execResult.stderr.trim();
    }
  }

  // Write output file if requested
  if (args.output && output) {
    try {
      const outputDir = path.dirname(args.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(args.output, output, 'utf-8');
      console.error(`[codex-wrapper] Output written to: ${args.output}`);
    } catch (error) {
      console.error(`[codex-wrapper] Failed to write output file: ${error.message}`);
      result.output_file_error = error.message;
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
