const axios = require('axios');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const API_KEY = process.env.GEMINI_API_KEY;

/**
 * Gemini API を使用してコードを生成
 */
class GeminiService {
  constructor() {
    this.client = axios.create({
      baseURL: GEMINI_API_BASE,
      timeout: 30000,
    });
  }

  /**
   * コード生成プロンプトを構築
   */
  buildCodeGenerationPrompt(jobData) {
    return `
You are an expert software developer. Generate a complete, production-ready application based on the following requirements:

**Project Details:**
- App Name: ${jobData.appName}
- Description: ${jobData.prompt}
- Language: ${jobData.language}
- Database: ${jobData.dbType}
- Framework: ${jobData.language === 'TypeScript' ? 'Next.js + Express' : jobData.language === 'Python' ? 'FastAPI' : 'Gin'}

**Requirements:**
1. Generate a fully functional application structure
2. Include proper error handling
3. Implement security best practices
4. Use the specified database
5. Include API endpoints
6. Write clean, well-documented code
7. Include deployment instructions

**Output Format:**
Provide the implementation in the following sections:
1. Project Structure
2. Backend Implementation
3. Frontend Implementation (if applicable)
4. Database Schema
5. API Endpoints
6. Deployment Instructions
7. Security Considerations

Generate comprehensive, production-ready code.
`;
  }

  /**
   * テスト生成プロンプトを構築
   */
  buildTestGenerationPrompt(generatedCode, language) {
    return `
Given the following application code, generate comprehensive unit and integration tests:

\`\`\`${language}
${generatedCode}
\`\`\`

Create tests that cover:
1. Core functionality
2. Error handling
3. Edge cases
4. Security validations

Use appropriate testing framework for ${language}.
Provide test code in production-ready format.
`;
  }

  /**
   * セキュリティスキャンプロンプトを構築
   */
  buildSecurityAuditPrompt(generatedCode, language) {
    return `
Perform a security audit on the following code and identify vulnerabilities:

\`\`\`${language}
${generatedCode}
\`\`\`

Check for:
1. SQL Injection vulnerabilities
2. XSS vulnerabilities
3. Authentication/Authorization issues
4. API security issues
5. Data exposure risks
6. Cryptography issues
7. Input validation gaps

Provide:
- List of vulnerabilities found
- Severity level (Critical/High/Medium/Low)
- Remediation steps for each

Format as a structured security report.
`;
  }

  /**
   * Gemini API を呼び出してコンテンツを生成
   */
  async generateContent(prompt, model = 'gemini-2.0-flash') {
    try {
      if (!API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
      }

      const response = await this.client.post(`${model}:generateContent`, {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          topP: 0.8,
        },
      }, {
        params: {
          key: API_KEY,
        },
      });

      if (!response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('No content generated from Gemini API');
      }

      const generatedText = response.data.candidates[0].content.parts[0].text;
      return {
        success: true,
        content: generatedText,
        model: model,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Gemini API Error:', error.message);
      return {
        success: false,
        error: error.message,
        model: model,
        timestamp: new Date(),
      };
    }
  }

  /**
   * アプリケーションコードを生成
   */
  async generateApplicationCode(jobData) {
    const prompt = this.buildCodeGenerationPrompt(jobData);
    return this.generateContent(prompt, jobData.model || 'gemini-2.0-flash');
  }

  /**
   * テストコードを生成
   */
  async generateTests(generatedCode, language, model = 'gemini-2.0-flash') {
    const prompt = this.buildTestGenerationPrompt(generatedCode, language);
    return this.generateContent(prompt, model);
  }

  /**
   * セキュリティ監査を実行
   */
  async performSecurityAudit(generatedCode, language, model = 'gemini-2.0-flash') {
    const prompt = this.buildSecurityAuditPrompt(generatedCode, language);
    return this.generateContent(prompt, model);
  }

  /**
   * 品質スコアを計算（テストカバレッジ＆セキュリティ）
   */
  calculateQualityScore(testResult, securityAuditResult) {
    let score = 100;

    // セキュリティスコア
    if (!securityAuditResult.success) {
      score -= 30;
    } else {
      const criticalVulns = (securityAuditResult.content.match(/Critical/gi) || []).length;
      const highVulns = (securityAuditResult.content.match(/High/gi) || []).length;
      score -= criticalVulns * 20 + highVulns * 10;
    }

    // テストスコア
    if (!testResult.success) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }
}

module.exports = new GeminiService();
