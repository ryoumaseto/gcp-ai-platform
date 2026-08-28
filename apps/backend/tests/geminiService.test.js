/**
 * Gemini Service Unit Tests
 * テストカバレッジ: 80% 以上を目標
 */

const geminiService = require('../services/geminiService');

describe('GeminiService', () => {
  // Test Suite 1: プロンプト生成
  describe('Prompt Generation', () => {
    test('buildCodeGenerationPrompt should include all required fields', () => {
      const jobData = {
        appName: 'TestApp',
        prompt: 'Test description',
        language: 'TypeScript',
        dbType: 'PostgreSQL',
      };

      const prompt = geminiService.buildCodeGenerationPrompt(jobData);

      expect(prompt).toContain('TestApp');
      expect(prompt).toContain('Test description');
      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('PostgreSQL');
      // プロンプト本文は "production-ready" (小文字) で埋め込まれる
      expect(prompt).toMatch(/production-ready/i);
    });

    test('buildTestGenerationPrompt should include code and language', () => {
      const code = 'const hello = () => console.log("Hello");';
      const language = 'TypeScript';

      const prompt = geminiService.buildTestGenerationPrompt(code, language);

      expect(prompt).toContain(code);
      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('unit and integration tests');
    });

    test('buildSecurityAuditPrompt should include security checks', () => {
      const code = 'const sql = "SELECT * FROM users WHERE id = " + userId;';
      const language = 'JavaScript';

      const prompt = geminiService.buildSecurityAuditPrompt(code, language);

      expect(prompt).toContain(code);
      expect(prompt).toContain('SQL Injection');
      expect(prompt).toContain('XSS');
      expect(prompt).toContain('Authentication');
    });
  });

  // Test Suite 2: 品質スコア計算
  describe('Quality Score Calculation', () => {
    test('should return 100 for perfect results', () => {
      const testResult = { success: true };
      const securityResult = {
        success: true,
        content: 'No vulnerabilities found\nSEVERITY_COUNTS: critical=0 high=0 medium=0 low=0',
      };

      const score = geminiService.calculateQualityScore(testResult, securityResult);

      expect(score).toBe(100);
    });

    test('should not penalize a clean report that merely mentions severity words', () => {
      // 監査プロンプトは "Severity level (Critical/High/Medium/Low)" という凡例を含む。
      // 本文の単語を数える実装では、脆弱性ゼロでも最低点になってしまっていた。
      const testResult = { success: true };
      const securityResult = {
        success: true,
        content:
          'Severity level (Critical/High/Medium/Low)\n' +
          'Highly recommended: keep dependencies updated.\n' +
          'SEVERITY_COUNTS: critical=0 high=0 medium=0 low=0',
      };

      expect(geminiService.calculateQualityScore(testResult, securityResult)).toBe(100);
    });

    test('should penalize failed security audit', () => {
      const testResult = { success: true };
      const securityResult = { success: false };

      const score = geminiService.calculateQualityScore(testResult, securityResult);

      expect(score).toBe(70); // 100 - 30
    });

    test('should penalize critical vulnerabilities', () => {
      const testResult = { success: true };
      const securityResult = {
        success: true,
        content:
          'Critical: SQL Injection found. Critical: XSS found.\n' +
          'SEVERITY_COUNTS: critical=2 high=0 medium=0 low=0',
      };

      const score = geminiService.calculateQualityScore(testResult, securityResult);

      expect(score).toBeLessThan(70); // 100 - 2*20 = 60
    });

    test('should apply a small penalty when the report is not machine-readable', () => {
      const testResult = { success: true };
      const securityResult = { success: true, content: 'Some free-form prose without counts.' };

      // 判定不能なので満点にはしないが、単語数え時代のような極端な減点もしない
      expect(geminiService.calculateQualityScore(testResult, securityResult)).toBe(90);
    });

    test('should penalize failed tests', () => {
      const testResult = { success: false };
      const securityResult = {
        success: true,
        content: 'Clean\nSEVERITY_COUNTS: critical=0 high=0 medium=0 low=0',
      };

      const score = geminiService.calculateQualityScore(testResult, securityResult);

      expect(score).toBe(80); // 100 - 20
    });

    test('should never return negative score', () => {
      const testResult = { success: false };
      const securityResult = { success: false, content: 'Multiple critical issues' };

      const score = geminiService.calculateQualityScore(testResult, securityResult);

      expect(score).toBeGreaterThanOrEqual(0);
    });

    test('should never exceed 100', () => {
      const testResult = { success: true };
      const securityResult = { success: true, content: 'Perfect' };

      const score = geminiService.calculateQualityScore(testResult, securityResult);

      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // Test Suite 3: エラーハンドリング
  describe('Error Handling', () => {
    test('should handle missing API key gracefully', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const result = await geminiService.generateContent('test prompt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('GEMINI_API_KEY');

      process.env.GEMINI_API_KEY = originalKey;
    });

    test('should include timestamp in all responses', async () => {
      // Note: This will fail without valid API key, but we're testing structure
      const result = await geminiService.generateContent('test');

      expect(result).toHaveProperty('timestamp');
      expect(result.timestamp instanceof Date).toBe(true);
    });

    test('should include model info in response', async () => {
      const result = await geminiService.generateContent('test', 'gemini-1.5-pro');

      expect(result).toHaveProperty('model');
      expect(result.model).toBe('gemini-1.5-pro');
    });
  });

  // Test Suite 4: バリデーション
  describe('Input Validation', () => {
    test('buildCodeGenerationPrompt should handle empty strings', () => {
      const jobData = {
        appName: '',
        prompt: '',
        language: '',
        dbType: '',
      };

      const prompt = geminiService.buildCodeGenerationPrompt(jobData);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    test('buildTestGenerationPrompt should handle large code', () => {
      const largeCode = 'const x = 1;'.repeat(1000);
      const prompt = geminiService.buildTestGenerationPrompt(largeCode, 'TypeScript');

      expect(prompt).toContain(largeCode);
    });
  });
});

// ===== カバレッジレポート生成 =====
// テスト実行後: npx jest --coverage

console.log(`
===========================================
テストカバレッジ目標: 80% 以上
テスト実行: npm run test
カバレッジ確認: npm run test:coverage
===========================================
`);
