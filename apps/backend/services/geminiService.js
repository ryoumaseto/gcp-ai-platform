const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

// ===== 接続先 =====
// vertex   : Vertex AI。Cloud Run ではアタッチされたサービスアカウントの
//            認証情報が自動で使われるため API キーが一切不要になる。
// aistudio : Gemini Developer API。API キー方式。
const getProvider = () => (process.env.GEMINI_PROVIDER || 'vertex').toLowerCase();

const AISTUDIO_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// 環境変数はモジュール読み込み時に固定すると、後から差し替えても反映されない
// （テストや起動順の違いで未設定扱いになる）ため、呼び出しごとに読む。
const getApiKey = () => process.env.GEMINI_API_KEY;
const getProjectId = () => process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const getLocation = () => process.env.VERTEX_LOCATION || 'us-central1';

/**
 * Gemini（Vertex AI / AI Studio）でコードを生成する
 */
class GeminiService {
  constructor() {
    this.http = axios.create({
      // maxOutputTokens 8192 の生成は 30 秒では収まらず、
      // タイムアウトでジョブが誤って failed になる。
      // リクエスト経路外のバックグラウンド処理なので長めに取る。
      timeout: Number(process.env.GEMINI_TIMEOUT_MS || 180000),
    });

    this.auth = null;
  }

  /**
   * Vertex AI 用のアクセストークンを取得する。
   * Cloud Run 上ではメタデータサーバー経由でアタッチされた
   * サービスアカウントの認証情報が自動的に使われる（鍵ファイル不要）。
   * ローカルでは `gcloud auth application-default login` の認証情報を使う。
   */
  async getAccessToken() {
    if (!this.auth) {
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }

    const client = await this.auth.getClient();
    const token = await client.getAccessToken();

    if (!token || !token.token) {
      throw new Error('Failed to obtain Google Cloud access token');
    }

    return token.token;
  }

  /**
   * 接続先に応じた URL と認証ヘッダを組み立てる
   */
  async buildRequest(model, action) {
    if (getProvider() === 'aistudio') {
      const API_KEY = getApiKey();
      if (!API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
      }

      return {
        url: `${AISTUDIO_BASE}/models/${model}:${action}`,
        headers: { 'x-goog-api-key': API_KEY },
      };
    }

    const project = getProjectId();
    if (!project) {
      throw new Error('GCP_PROJECT_ID is not configured (required for Vertex AI)');
    }

    const location = getLocation();
    const token = await this.getAccessToken();

    return {
      url:
        `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
        `/locations/${location}/publishers/google/models/${model}:${action}`,
      headers: { Authorization: `Bearer ${token}` },
    };
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
- Severity level for each
- Remediation steps for each

Format as a structured security report.

IMPORTANT: End your response with a single machine-readable line in exactly this format
(counts of vulnerabilities you actually found; use 0 when none):
SEVERITY_COUNTS: critical=<n> high=<n> medium=<n> low=<n>
`;
  }

  /**
   * Gemini API を呼び出してコンテンツを生成
   */
  async generateContent(prompt, model = 'gemini-flash-latest') {
    try {
      const { url, headers } = await this.buildRequest(model, 'generateContent');

      const response = await this.http.post(url, {
        contents: [
          {
            role: 'user',
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
      }, { headers });

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
      // axios のメッセージは "Request failed with status code 503" だけで
      // API が返した理由が落ちてしまうため、本文から取り出して残す。
      const apiMessage = error.response?.data?.error?.message;
      const detail = apiMessage ? `${error.message}: ${apiMessage}` : error.message;

      console.error(`Gemini API Error (${getProvider()}):`, detail);
      return {
        success: false,
        error: detail,
        status: error.response?.status,
        model: model,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 一時的な障害はリトライする。
   * Gemini は過負荷時に 503、レート超過時に 429 を返し、
   * これらは時間を置けば成功する。1 回の失敗でジョブを落とすと
   * 利用者から見て「たまに壊れるサービス」になってしまう。
   */
  async generateContentWithRetry(prompt, model, attempts = 4) {
    const RETRYABLE = [429, 500, 502, 503, 504];
    let last;

    for (let i = 0; i < attempts; i++) {
      last = await this.generateContent(prompt, model);
      if (last.success) return last;

      const retryable = RETRYABLE.includes(last.status);
      if (!retryable || i === attempts - 1) return last;

      // 指数バックオフ + ジッタ（2s, 4s, 8s 前後）
      const waitMs = 2000 * 2 ** i + Math.floor(Math.random() * 1000);
      console.warn(
        `Gemini ${last.status} - ${Math.round(waitMs / 1000)}秒後に再試行 (${i + 1}/${attempts - 1})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }

    return last;
  }

  /**
   * 利用可能なモデル一覧を取得する。
   * モデル ID をハードコードすると Google 側の提供終了でアプリが壊れるため、
   * 実際に使えるものを API から引く。
   */
  async listModels() {
    try {
      if (getProvider() === 'aistudio') {
        const API_KEY = getApiKey();
        if (!API_KEY) {
          throw new Error('GEMINI_API_KEY is not configured');
        }

        const response = await this.http.get(`${AISTUDIO_BASE}/models`, {
          headers: { 'x-goog-api-key': API_KEY },
          timeout: 15000,
        });

        const models = (response.data.models || [])
          // 生成に使えるものだけに絞る（埋め込み専用モデル等を除外）
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => ({
            id: String(m.name).replace(/^models\//, ''),
            label: m.displayName || String(m.name).replace(/^models\//, ''),
          }));

        return { success: true, models };
      }

      // Vertex AI は publisher モデルを列挙する
      const location = getLocation();
      const token = await this.getAccessToken();

      const response = await this.http.get(
        `https://${location}-aiplatform.googleapis.com/v1/publishers/google/models`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { pageSize: 200 },
          timeout: 15000,
        }
      );

      const models = (response.data.publisherModels || [])
        .map((m) => String(m.name).replace(/^publishers\/google\/models\//, ''))
        // 生成系の Gemini モデルのみ（埋め込み・画像・TTS などを除外）
        .filter((id) => /^gemini-/.test(id) && !/(embedding|tts|image|omni)/.test(id))
        .map((id) => ({ id, label: id }));

      return { success: true, models };
    } catch (error) {
      const apiMessage = error.response?.data?.error?.message;
      const detail = apiMessage ? `${error.message}: ${apiMessage}` : error.message;
      console.error(`Failed to list models (${getProvider()}):`, detail);
      return { success: false, error: detail, models: [] };
    }
  }

  /**
   * アプリケーションコードを生成
   */
  async generateApplicationCode(jobData) {
    const prompt = this.buildCodeGenerationPrompt(jobData);
    return this.generateContentWithRetry(prompt, jobData.model || 'gemini-flash-latest');
  }

  /**
   * テストコードを生成
   */
  async generateTests(generatedCode, language, model = 'gemini-flash-latest') {
    const prompt = this.buildTestGenerationPrompt(generatedCode, language);
    return this.generateContentWithRetry(prompt, model);
  }

  /**
   * セキュリティ監査を実行
   */
  async performSecurityAudit(generatedCode, language, model = 'gemini-flash-latest') {
    const prompt = this.buildSecurityAuditPrompt(generatedCode, language);
    return this.generateContentWithRetry(prompt, model);
  }

  /**
   * 品質スコアを計算（テストカバレッジ＆セキュリティ）
   */
  /**
   * 監査レポート末尾の SEVERITY_COUNTS 行から件数を取り出す。
   * 本文中の "Critical" という単語を数える方式だと、凡例
   * ("Severity level (Critical/High/Medium/Low)") や "Highly" などにも
   * 反応してしまい、脆弱性ゼロのレポートが最低点になる。
   * 行が見つからない場合は null を返し、呼び出し側で判断する。
   */
  parseSeverityCounts(content) {
    const match = /SEVERITY_COUNTS:\s*critical=(\d+)\s+high=(\d+)\s+medium=(\d+)\s+low=(\d+)/i.exec(
      content || ''
    );
    if (!match) return null;

    return {
      critical: Number(match[1]),
      high: Number(match[2]),
      medium: Number(match[3]),
      low: Number(match[4]),
    };
  }

  calculateQualityScore(testResult, securityAuditResult) {
    let score = 100;

    // セキュリティスコア
    if (!securityAuditResult.success) {
      score -= 30;
    } else {
      const counts = this.parseSeverityCounts(securityAuditResult.content);
      if (counts) {
        score -= counts.critical * 20 + counts.high * 10 + counts.medium * 3;
      } else {
        // 想定書式で返ってこなかった場合は判定不能として控えめに減点する
        score -= 10;
      }
    }

    // テストスコア
    if (!testResult.success) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }
}

module.exports = new GeminiService();
