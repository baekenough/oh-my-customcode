import { describe, expect, it } from 'bun:test';
import { detectProvider, type ProviderDetection } from '../../../src/core/provider.js';

describe('provider detection', () => {
  describe('detectProvider', () => {
    it('should return claude as default provider', async () => {
      const result = await detectProvider();

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('claude-only');
    });

    it('should return claude with targetDir option', async () => {
      const result = await detectProvider({
        targetDir: '/some/path',
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe('high');
      expect(result.reason).toBe('claude-only');
    });

    it('should ignore targetDir value and return claude', async () => {
      const result = await detectProvider({
        targetDir: '/nonexistent/path',
      });

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
    });

    it('should return valid ProviderDetection type', async () => {
      const result: ProviderDetection = await detectProvider();

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reason');

      expect(result.provider).toBe('claude');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe('high');
      expect(typeof result.reason).toBe('string');
    });
  });
});
