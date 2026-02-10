/**
 * Provider detection logic
 */

import { join } from 'node:path';
import { fileExists, readJsonFile } from '../utils/fs.js';
import { getDefaultProvider, type LlmProvider, type ProviderPreference } from './layout.js';

export type DetectionSource = 'override' | 'config' | 'env' | 'project' | 'default';
export type DetectionConfidence = 'high' | 'medium' | 'low';

export interface ProviderDetection {
  provider: LlmProvider;
  source: DetectionSource;
  confidence: DetectionConfidence;
  reason: string;
}

export interface DetectProviderOptions {
  targetDir?: string;
  env?: NodeJS.ProcessEnv;
  override?: ProviderPreference;
  /** Prefer project markers over environment signals */
  preferProject?: boolean;
}

interface EnvSignal {
  claude: string[];
  codex: string[];
}

const ENV_SIGNALS: EnvSignal = {
  claude: [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE',
    'CLAUDE_CODE_EFFORT_LEVEL',
    'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
    'CLAUDE_CODE_ENABLE_TELEMETRY',
  ],
  codex: ['OPENAI_API_KEY', 'OPENAI_ORG_ID', 'OPENAI_PROJECT', 'CODEX_HOME', 'CODEX_PROJECT'],
};

const PROVIDER_ENV_OVERRIDES = ['OMCUSTOM_PROVIDER', 'LLM_SERVICE'];

function normalizeProvider(value?: string | null): ProviderPreference | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'claude' || normalized === 'codex' || normalized === 'auto') {
    return normalized;
  }
  return null;
}

function detectFromEnv(env: NodeJS.ProcessEnv): ProviderDetection | null {
  for (const key of PROVIDER_ENV_OVERRIDES) {
    const override = normalizeProvider(env[key]);
    if (override && override !== 'auto') {
      return {
        provider: override,
        source: 'override',
        confidence: 'high',
        reason: `env:${key}`,
      };
    }
  }

  const claudeSignals = ENV_SIGNALS.claude.filter((key) => Boolean(env[key]));
  const codexSignals = ENV_SIGNALS.codex.filter((key) => Boolean(env[key]));

  const hasClaude = claudeSignals.length > 0;
  const hasCodex = codexSignals.length > 0;

  if (hasClaude && !hasCodex) {
    return {
      provider: 'claude',
      source: 'env',
      confidence: 'medium',
      reason: `env:${claudeSignals[0]}`,
    };
  }

  if (hasCodex && !hasClaude) {
    return {
      provider: 'codex',
      source: 'env',
      confidence: 'medium',
      reason: `env:${codexSignals[0]}`,
    };
  }

  return null;
}

async function detectFromProject(targetDir: string): Promise<ProviderDetection | null> {
  const claudeMarkers = [join(targetDir, 'CLAUDE.md'), join(targetDir, '.claude')];
  const codexMarkers = [join(targetDir, 'AGENTS.md'), join(targetDir, '.codex')];

  const claudeFound = await Promise.all(claudeMarkers.map((path) => fileExists(path)));
  const codexFound = await Promise.all(codexMarkers.map((path) => fileExists(path)));

  const hasClaude = claudeFound.some(Boolean);
  const hasCodex = codexFound.some(Boolean);

  if (hasClaude && !hasCodex) {
    return {
      provider: 'claude',
      source: 'project',
      confidence: 'medium',
      reason: 'project:claude',
    };
  }

  if (hasCodex && !hasClaude) {
    return {
      provider: 'codex',
      source: 'project',
      confidence: 'medium',
      reason: 'project:codex',
    };
  }

  return null;
}

async function detectFromConfig(targetDir: string): Promise<ProviderDetection | null> {
  const configPath = join(targetDir, '.omcustomrc.json');
  if (!(await fileExists(configPath))) {
    return null;
  }

  try {
    const config = await readJsonFile<{ provider?: ProviderPreference }>(configPath);
    const provider = normalizeProvider(config.provider);
    if (provider && provider !== 'auto') {
      return {
        provider,
        source: 'config',
        confidence: 'high',
        reason: 'config:provider',
      };
    }
  } catch {
    // Ignore invalid config
  }

  return null;
}

export async function detectProvider(
  options: DetectProviderOptions = {}
): Promise<ProviderDetection> {
  const env = options.env ?? process.env;
  const override = options.override;

  const normalizedOverride = normalizeProvider(override);
  if (normalizedOverride && normalizedOverride !== 'auto') {
    return {
      provider: normalizedOverride,
      source: 'override',
      confidence: 'high',
      reason: 'override:option',
    };
  }

  if (options.targetDir) {
    const fromConfig = await detectFromConfig(options.targetDir);
    if (fromConfig) {
      return fromConfig;
    }
  }

  if (options.targetDir && options.preferProject) {
    const fromProject = await detectFromProject(options.targetDir);
    if (fromProject) {
      return fromProject;
    }
  }

  const fromEnv = detectFromEnv(env);
  if (fromEnv) {
    return fromEnv;
  }

  if (options.targetDir && !options.preferProject) {
    const fromProject = await detectFromProject(options.targetDir);
    if (fromProject) {
      return fromProject;
    }
  }

  return {
    provider: getDefaultProvider(),
    source: 'default',
    confidence: 'low',
    reason: 'default',
  };
}
