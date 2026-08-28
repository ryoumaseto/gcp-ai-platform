/**
 * セキュリティチェックリスト（毎回実行）
 * 品質ループの S パートで自動実行
 */

const fs = require('fs');
const path = require('path');

class SecurityChecklist {
  constructor() {
    this.checks = {
      S1: this.checkAuthentication(),
      S2: this.checkDataProtection(),
      S3: this.checkAPISecuritySecure(),
      S4: this.checkErrorHandling(),
      S5: this.checkDeploymentSecurity(),
    };
  }

  /**
   * S1: 認証・認可チェック
   */
  checkAuthentication() {
    return {
      name: '認証・認可',
      items: [
        {
          id: 'S1.1',
          check: 'JWT トークン検証',
          verify: () => this.fileContains('middleware/auth.js', 'jwt.verify'),
        },
        {
          id: 'S1.2',
          check: 'ユーザー隔離確認',
          verify: () => this.fileContains('controllers/jobController.js', 'userId !== userId'),
        },
        {
          id: 'S1.3',
          check: 'スコープ制限確認',
          verify: () => this.fileContains('routes/jobs.js', 'verifyToken'),
        },
      ],
    };
  }

  /**
   * S2: データ保護チェック
   */
  checkDataProtection() {
    return {
      name: 'データ保護',
      items: [
        {
          id: 'S2.1',
          check: 'パスワード暗号化 (bcrypt)',
          verify: () => this.fileContains('routes/auth.js', 'bcrypt.hash'),
        },
        {
          id: 'S2.2',
          check: 'API キー管理 (env変数)',
          verify: () => this.fileContains('.env', 'API_KEY') || this.fileContains('services/geminiService.js', 'process.env.GEMINI_API_KEY'),
        },
        {
          id: 'S2.3',
          check: 'SQL injection 対策 (ORM)',
          verify: () => this.fileContains('config/database.js', 'new Sequelize'),
        },
      ],
    };
  }

  /**
   * S3: API セキュリティチェック
   */
  checkAPISecuritySecure() {
    return {
      name: 'API セキュリティ',
      items: [
        {
          id: 'S3.1',
          check: 'CORS設定確認',
          verify: () => this.fileContains('server-secure.js', 'cors'),
        },
        {
          id: 'S3.2',
          check: 'Rate limiting 有効',
          verify: () => this.fileContains('server-secure.js', 'createRateLimiter'),
        },
        {
          id: 'S3.3',
          check: 'Input validation',
          verify: () => this.fileContains('controllers/jobController.js', 'if (!description || !appName)'),
        },
      ],
    };
  }

  /**
   * S4: エラーハンドリングチェック
   */
  checkErrorHandling() {
    return {
      name: 'エラーハンドリング',
      items: [
        {
          id: 'S4.1',
          check: '機密情報をログ出力していない',
          verify: () => this.noSecretsLogged(['server-secure.js', 'controllers/jobController.js', 'routes/auth.js']),
        },
        {
          id: 'S4.2',
          check: 'スタックトレース非表示',
          verify: () => this.fileContains('controllers/jobController.js', 'error.message'),
        },
        {
          id: 'S4.3',
          check: 'HTTP ステータス区別',
          verify: () => this.fileContains('controllers/jobController.js', '400') && this.fileContains('controllers/jobController.js', '403'),
        },
      ],
    };
  }

  /**
   * S5: デプロイセキュリティチェック
   */
  checkDeploymentSecurity() {
    return {
      name: 'デプロイセキュリティ',
      items: [
        // scope: 'repo' の項目はリポジトリ全体が揃っている場所（CI / ローカル）でのみ検査する。
        // 本番コンテナには infra/ が含まれないため、起動時ゲートでは対象外にする。
        {
          id: 'S5.1',
          scope: 'repo',
          check: 'Secret Manager キー管理 (Terraform)',
          verify: () =>
            this.fileContains('../../infra/secrets.tf', 'google_secret_manager_secret') &&
            this.fileContains('../../infra/main-cloud-run.tf', 'secret_key_ref'),
        },
        {
          id: 'S5.2',
          scope: 'repo',
          check: 'VPC 通信隔離 (Private IP + VPC Connector)',
          verify: () =>
            this.fileContains('../../infra/networking.tf', 'google_vpc_access_connector') &&
            this.fileContains('../../infra/database.tf', 'ipv4_enabled') &&
            this.fileContains('../../infra/database.tf', 'private_network'),
        },
        {
          id: 'S5.3',
          scope: 'repo',
          check: 'Cloud SQL の TLS 強制 (Terraform)',
          verify: () => this.fileContains('../../infra/database.tf', 'ssl_mode'),
        },
        {
          id: 'S5.4',
          check: 'アプリ側の HTTPS 強制',
          verify: () => this.fileContains('security/advancedSecurity.js', 'enforceHTTPS'),
        },
        {
          id: 'S5.5',
          check: 'JWT_SECRET_KEY のハードコード無し',
          verify: () =>
            this.fileContains('middleware/auth.js', 'JWT_SECRET_KEY environment variable is required'),
        },
        {
          id: 'S5.6',
          scope: 'repo',
          check: 'compose に秘密のハードコード無し',
          verify: () =>
            !this.fileContains('../../docker-compose.yml', 'JWT_SECRET_KEY=production-secret-key-change-this') &&
            !this.fileContains('../../docker-compose.yml', 'secure_password_123'),
        },
      ],
    };
  }

  /**
   * console 出力に秘密の「値」が混ざっていないか検査する。
   * 環境変数の「名前」を書くだけ（必須チェックのエラーメッセージ等）は許容し、
   * process.env.*SECRET* / *PASSWORD* / *KEY* や passwordHash を
   * 実際にログへ流している行だけを失格とする。
   */
  noSecretsLogged(filePaths) {
    const consoleCall = /console\.(log|info|warn|error|debug)\s*\(/;
    const secretValue = /(process\.env\.\w*(SECRET|PASSWORD|API_KEY|TOKEN)\w*)|passwordHash|\breq\.body\.password\b/;

    return filePaths.every((filePath) => {
      const fullPath = path.join(__dirname, '..', filePath);
      if (!fs.existsSync(fullPath)) return false;

      const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
      return !lines.some((line) => consoleCall.test(line) && secretValue.test(line));
    });
  }

  /**
   * ファイル内容チェック
   */
  fileContains(filePath, content) {
    try {
      const fullPath = path.join(__dirname, '..', filePath);
      if (!fs.existsSync(fullPath)) return false;

      const fileContent = fs.readFileSync(fullPath, 'utf8');
      return fileContent.includes(content);
    } catch (error) {
      console.error(`Error checking file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * チェックを実行する。
   * options.scope === 'runtime' を渡すと、リポジトリ全体を必要とする項目
   * (scope: 'repo') を除外する。本番コンテナには infra/ や docker-compose.yml が
   * 含まれないため、起動時ゲートは runtime スコープで実行する必要がある。
   */
  async runAllChecks(options = {}) {
    const runtimeOnly = options.scope === 'runtime';
    const results = {};
    let passCount = 0;
    let totalCount = 0;

    Object.entries(this.checks).forEach(([key, category]) => {
      const items = category.items.filter((item) => !(runtimeOnly && item.scope === 'repo'));
      if (items.length === 0) return;

      results[key] = {
        category: category.name,
        items: [],
      };

      items.forEach((item) => {
        totalCount++;
        const passed = item.verify();
        if (passed) passCount++;

        results[key].items.push({
          id: item.id,
          check: item.check,
          status: passed ? '✅ PASS' : '❌ FAIL',
          passed,
        });
      });
    });

    const passPercentage = (passCount / totalCount) * 100;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        total: totalCount,
        passed: passCount,
        failed: totalCount - passCount,
        percentage: Math.round(passPercentage),
      },
      details: results,
      status: passPercentage >= 80 ? 'PASS' : 'FAIL',
    };
  }

  /**
   * レポートを表示
   */
  printReport(report) {
    console.log(`
╔════════════════════════════════════════════╗
║   セキュリティチェックリスト実行結果      ║
╚════════════════════════════════════════════╝

実行日時: ${report.timestamp}
総合判定: ${report.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}

【スコア】
  合計: ${report.summary.total}
  成功: ${report.summary.passed} ✅
  失敗: ${report.summary.failed} ❌
  合格率: ${report.summary.percentage}% (目標: 80%)

【カテゴリ別】
    `);

    Object.entries(report.details).forEach(([key, category]) => {
      console.log(`\n${key} - ${category.category}:`);
      category.items.forEach((item) => {
        console.log(`  ${item.id} ${item.status} ${item.check}`);
      });
    });

    console.log(`
╔════════════════════════════════════════════╗
${report.status === 'PASS' ? '✅ デプロイ準備完了' : '❌ セキュリティ問題があります'}
╚════════════════════════════════════════════╝
    `);
  }
}

// ===== CLI 実行 =====
if (require.main === module) {
  const checklist = new SecurityChecklist();
  checklist.runAllChecks().then((report) => {
    checklist.printReport(report);
    process.exit(report.status === 'PASS' ? 0 : 1);
  });
}

module.exports = SecurityChecklist;
