/**
 * Shared sensitivity detection for memory adapters.
 *
 * Implements the secret-tier regex suite from docs/memory-unification/sensitivity.md (#1067).
 * Adapters for claude-mem (#1070), native (#1071), episodic-memory (#1072), etc. all import from here.
 */

export type SensitivityTier = 'public' | 'project' | 'sensitive' | 'secret';

/**
 * Secret-tier detection patterns.
 * A match in ANY string field is sufficient to classify the entire record as `secret`.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[a-zA-Z0-9]{30,}/,                                                  // OpenAI API keys
  /ghp_[a-zA-Z0-9]{36}/,                                                  // GitHub personal access tokens
  /ghs_[a-zA-Z0-9]{36}/,                                                  // GitHub OAuth app tokens
  /ghs_[a-zA-Z0-9]{36}/,                                                  // GitHub OAuth app tokens
  /AKIA[0-9A-Z]{16}/,                                                     // AWS access key IDs
  /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/,                                     // Slack bot tokens
  /xoxp-[0-9]+-[0-9]+-[0-9]+-[a-zA-Z0-9]+/,                             // Slack user tokens
  /sk-ant-[a-zA-Z0-9-]{40,}/,                                             // Anthropic API keys
  /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/,                 // Private key blocks
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,              // JWT tokens
  /[Pp]assword\s*[=:]\s*["'][^"']{8,}["']/,                              // Generic passwords
  /(api[_-]?key|secret)\s*[=:]\s*["'][a-zA-Z0-9]{20,}["']/i,            // Generic API keys / secrets
] as const;

/**
 * Detects whether content contains secret-tier data.
 *
 * @returns true if any secret pattern matches
 */
export function containsSecret(content: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Classifies content sensitivity.
 *
 * Rules (per sensitivity.md):
 *   - secret  → any secret pattern detected (overrides explicit metadata)
 *   - default → 'project'
 *
 * Callers wishing to honour explicit `sensitive` or `public` declarations should
 * call `containsSecret()` first and only fall through to their own logic when false.
 *
 * @param content - The full string body to scan
 * @returns 'secret' if a secret pattern matches, 'project' otherwise
 */
export function detectSensitivity(content: string): Extract<SensitivityTier, 'public' | 'project' | 'sensitive' | 'secret'> {
  if (containsSecret(content)) {
    return 'secret';
  }
  return 'project';
}
