#!/usr/bin/env node

/**
 * gemini-wrapper.cjs
 *
 * Node.js wrapper for Google Gemini CLI (non-interactive execution).
 * Executes gemini in prompt mode with structured JSON output.
 *
 * Usage:
 *   node gemini-wrapper.cjs --prompt "your prompt" [options]
 *
 * Options:
 *   --prompt <text>       Required: prompt to execute
 *   --json                Enable JSON output from gemini (-o json)
 *   --stream-json         Enable stream-JSON output (-o stream-json)
 *   --output <path>       Save response to file
 *   --model <name>        Specify model (default: gemini CLI default)
 *   --timeout <ms>        Execution timeout in milliseconds (default: 120000, max: 600000)
 *   --yolo                Use yolo approval mode (auto-approve all actions)
 *   --sandbox             Run in sandbox mode
 *   --plan                Use plan approval mode
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
    streamJson: false,
    output: null,
    model: null,
    timeout: DEFAULT_TIMEOUT_MS,
    yolo: false,
    sandbox: false,
    plan: false,
    workingDir: null,
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
      case '--stream-json':
        args.streamJson = true;
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
      case '--yolo':
        args.yolo = true;
        break;
      case '--sandbox':
        args.sandbox = true;
        break;
      case '--plan':
        args.plan = true;
        break;
      case '--working-dir':
        if (i + 1 < process.argv.length) {
          args.workingDir = process.argv[++i];
        }
        break;
    }
  }

  return args;
}

/**
 * Validate environment for gemini execution
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validateEnvironment() {
  const errors = [];

  // Check for gemini binary
  try {
    execFileSync('which', ['gemini'], { stdio: 'pipe' });
  } catch (error) {
    // Try common installation paths
    const commonPaths = [
      '/usr/local/bin/gemini',
      path.join(os.homedir(), '.local', 'bin', 'gemini'),
      path.join(os.homedir(), 'bin', 'gemini'),
      path.join(os.homedir(), '.npm-global', 'bin', 'gemini'),
    ];

    const geminiExists = commonPaths.some(p => fs.existsSync(p));
    if (!geminiExists) {
      errors.push('gemini binary not found in PATH or common locations');
    }
  }

  // Check authentication (multiple methods supported)
  const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
  const hasGeminiApiKey = !!process.env.GEMINI_API_KEY;

  if (!hasGoogleApiKey && !hasGeminiApiKey) {
    console.error('[gemini-wrapper] Note: GOOGLE_API_KEY/GEMINI_API_KEY not set, relying on gcloud auth');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build gemini command array
 * @param {Object} options - Command options
 * @returns {Object} Command structure { binary: string, args: string[] }
 */
function buildCommand(options) {
  const args = [];

  // Prompt mode (non-interactive, ephemeral)
  args.push('-p', options.prompt);

  // Output format
  if (options.streamJson) {
    args.push('-o', 'stream-json');
  } else if (options.json) {
    args.push('-o', 'json');
  }

  // Model selection
  if (options.model) {
    args.push('-m', options.model);
  }

  // Approval mode
  if (options.yolo) {
    args.push('-y');
  } else if (options.plan) {
    args.push('--approval-mode', 'plan');
  }

  // Sandbox mode
  if (options.sandbox) {
    args.push('-s');
  }

  return {
    binary: 'gemini',
    args,
  };
}

/**
 * Execute gemini command
 * @param {string} binary - Binary to execute
 * @param {string[]} args - Command arguments
 * @param {number} timeout - Timeout in milliseconds
 * @param {string|null} workingDir - Working directory
 * @returns {Promise<Object>} Execution result
 */
function executeGemini(binary, args, timeout, workingDir = null) {
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
      console.error('[gemini-wrapper] Timeout reached, terminating process...');

      // Graceful termination attempt
      child.kill('SIGTERM');

      // Force kill after grace period
      setTimeout(() => {
        if (!child.killed) {
          console.error('[gemini-wrapper] Force killing process...');
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
 * Parse JSON output from gemini (-o json)
 * Gemini JSON output is a single JSON object: { session_id, response, stats }
 * @param {string} output - Raw output string
 * @returns {Object} Parsed result { response: string|null, stats: object|null, parseError: string|null }
 */
function parseJson(output) {
  try {
    const data = JSON.parse(output.trim());
    return {
      response: data.response || null,
      stats: data.stats || null,
      sessionId: data.session_id || null,
      parseError: null,
    };
  } catch (error) {
    return {
      response: null,
      stats: null,
      sessionId: null,
      parseError: `Failed to parse JSON: ${error.message}`,
    };
  }
}

/**
 * Parse stream-JSON output from gemini (-o stream-json)
 * Stream format: newline-delimited JSON events
 *   { type: "init", ... }
 *   { type: "message", role: "user"|"assistant", content: "..." }
 *   { type: "result", stats: {...} }
 * @param {string} output - Raw output string
 * @returns {Object} Parsed result { events: object[], finalMessage: string|null, stats: object|null, parseErrors: string[] }
 */
function parseStreamJson(output) {
  const lines = output.split('\n').filter(line => line.trim().length > 0);
  const events = [];
  const parseErrors = [];
  let finalMessage = null;
  let stats = null;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      events.push(event);

      // Extract final assistant message
      if (event.type === 'message' && event.role === 'assistant') {
        finalMessage = event.content || event.text || finalMessage;
      }

      // Extract stats from result event
      if (event.type === 'result') {
        stats = event.stats || null;
        if (event.response) {
          finalMessage = event.response;
        }
      }

      // Fallback: look for common response patterns
      if (!finalMessage && event.content && event.role === 'model') {
        finalMessage = event.content;
      }
    } catch (error) {
      parseErrors.push(`Failed to parse line: ${error.message}`);
    }
  }

  return {
    events,
    finalMessage,
    stats,
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

  console.error(`[gemini-wrapper] Executing gemini with timeout: ${args.timeout}ms`);
  if (args.workingDir) {
    console.error(`[gemini-wrapper] Working directory: ${args.workingDir}`);
  }

  // Build command
  const command = buildCommand(args);
  console.error(`[gemini-wrapper] Command: ${command.binary} ${command.args.join(' ')}`);

  // Execute
  const execResult = await executeGemini(
    command.binary,
    command.args,
    args.timeout,
    args.workingDir
  );

  // Process result
  let output = null;
  let eventsCount = 0;
  let stats = null;

  if (args.streamJson && execResult.stdout) {
    const parsed = parseStreamJson(execResult.stdout);
    eventsCount = parsed.events.length;
    output = parsed.finalMessage;
    stats = parsed.stats;

    if (parsed.parseErrors.length > 0) {
      console.error('[gemini-wrapper] Stream-JSON parse errors:', parsed.parseErrors.join('; '));
    }
  } else if (args.json && execResult.stdout) {
    const parsed = parseJson(execResult.stdout);
    output = parsed.response;
    stats = parsed.stats;

    if (parsed.parseError) {
      console.error('[gemini-wrapper] JSON parse error:', parsed.parseError);
      // Fallback to raw output
      output = execResult.stdout.trim();
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
    result.model = args.model || '(default)';
    if (args.streamJson) {
      result.events_count = eventsCount;
    }
    if (stats) {
      result.stats = stats;
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
      console.error(`[gemini-wrapper] Output written to: ${args.output}`);
    } catch (error) {
      console.error(`[gemini-wrapper] Failed to write output file: ${error.message}`);
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
