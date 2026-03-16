export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  // claude-sonnet-4-6 pricing (per 1M tokens)
  const inputCostPer1M = 3.0;
  const outputCostPer1M = 15.0;
  return (inputTokens * inputCostPer1M + outputTokens * outputCostPer1M) / 1_000_000;
}
