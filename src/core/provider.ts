/**
 * Provider detection (Claude-only)
 */

export type DetectionSource = 'default';
export type DetectionConfidence = 'high';

export interface ProviderDetection {
  provider: 'claude';
  source: DetectionSource;
  confidence: DetectionConfidence;
  reason: string;
}

export interface DetectProviderOptions {
  targetDir?: string;
}

/**
 * Returns Claude as the sole provider
 */
export async function detectProvider(
  _options: DetectProviderOptions = {}
): Promise<ProviderDetection> {
  return {
    provider: 'claude',
    source: 'default',
    confidence: 'high',
    reason: 'claude-only',
  };
}
