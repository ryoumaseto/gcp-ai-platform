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
// global は us-central1 等より利用できるモデルが多く、ホスト名も異なる
// （global-aiplatform... ではなく aiplatform...）。
const getLocation = () => process.env.VERTEX_LOCATION || 'global';
const vertexHost = (location) =>
  location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;

// Vertex AI にはモデル一覧 API が実質使えない（publishers/google/models は 404/403）。
// -latest エイリアスは Google 側で最新モデルを指し続けるため、
// ここを固定してもモデル終了で壊れない。
const VERTEX_MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite (latest, 最安)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (高精度)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
];

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
        `https://${vertexHost(location)}/v1/projects/${project}` +
        `/locations/${location}/publishers/google/models/${model}:${action}`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  /**
   * コード生成プロンプトを構築
   *
   * 以前は散文＋Markdown コードブロック混在の出力を要求していたが、
   * それだと生成物を機械的にファイル群へ分解できず、Cloud Run への
   * 自動デプロイが成立しない。そのため厳密な JSON マニフェスト 1 個だけを
   * 返すよう指示する形に変更した（パース側は codeParser.js が担当）。
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

**Deployment target (must follow exactly):**
The generated application will be deployed to Google Cloud Run as a single container. This
imposes hard constraints on what you may generate:

1. The app MUST be a single-container HTTP server written in ${jobData.language}.
2. The server MUST read the listening port from the \`PORT\` environment variable and bind
   to it. Never hardcode a port number (e.g. 3000, 8080) — Cloud Run injects \`PORT\` at
   runtime and the container will fail health checks if the port is hardcoded.
3. The app MUST NOT connect to any external database (no PostgreSQL, MySQL, MongoDB, Redis,
   etc. reachable over the network). It runs in an isolated environment with no network
   access to a database. If the app needs to persist data, use an in-memory store or a
   local SQLite file instead, regardless of the "Database" field above.
4. Do NOT include a Dockerfile or any container build files — the platform generates the
   Dockerfile separately.
5. Implement proper error handling, security best practices, and clean, documented code.
6. Include the necessary API endpoints for the described functionality.

**Size limits (hard limits, do not exceed):**
- At most 40 files total.
- Each file's content must be at most 100,000 characters (100KB).
- The combined size of all file contents must be at most 2,000,000 characters (2MB).

**Keep it small — this matters more than completeness:**
- Aim for 5-10 files. Do not create folders or layers you do not actually use.
- No tests, no CI config, no README, no .gitignore, no example/env files.
- Prefer one dependency-light server file over a layered architecture.
- A response that hits the model's output limit is truncated and therefore
  unusable, so favour brevity. Cut scope, not correctness.

**Output format (must follow exactly):**
Respond with ONLY a single JSON object, wrapped in a single \`\`\`json code fence, and
nothing else. Do NOT write any prose, explanation, greeting, or summary before or after the
fence — the response must start with \`\`\`json and end with \`\`\` and contain no other text.

The JSON object must have exactly this shape:

\`\`\`json
{
  "files": [
    { "path": "package.json", "content": "..." },
    { "path": "src/index.js", "content": "..." }
  ],
  "port": 8080,
  "start_command": "node src/index.js"
}
\`\`\`

Where:
- "files" is an array of objects, each with a "path" (relative path, no leading "/", no
  ".." segments) and "content" (the full, literal file content as a string, with newlines
  escaped as JSON requires).
- "port" is the port number the server listens on by reading \`process.env.PORT\` (or the
  equivalent for ${jobData.language}), defaulting to 8080 if unset.
- "start_command" is the exact shell command used to start the server (e.g. "node
  src/index.js", "python main.py", "npm start").

Generate comprehensive, production-ready code inside that single JSON object.
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
          // アプリ一式の JSON マニフェストは 8192 では収まらず、
          // 途中で切れた壊れた JSON がパーサに渡っていた。
          maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 32768),
          topP: 0.8,
        },
      }, { headers });

      if (!response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('No content generated from Gemini API');
      }

      const candidate = response.data.candidates[0];

      // 出力上限で打ち切られると、途中で切れた文字列がそのまま返る。
      // これを検知せずに渡すと「JSON が壊れている」としか分からず、
      // 原因が上限だったのか品質だったのか切り分けられない。
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error(
          '生成が出力上限に達して途中で打ち切られました。' +
            'より小さなアプリを指定するか、GEMINI_MAX_OUTPUT_TOKENS を増やしてください。'
        );
      }

      const generatedText = candidate.content?.parts?.[0]?.text;
      if (!generatedText) {
        throw new Error(
          `Gemini が本文を返しませんでした (finishReason=${candidate.finishReason || 'unknown'})`
        );
      }
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

      // Vertex AI は publishers/google/models の列挙が使えない（404/403）ため、
      // 検証済みのモデルを返す。-latest は Google 側が最新を指すので陳腐化しない。
      return { success: true, models: VERTEX_MODELS };
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
