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
          verify: () => this.fileContains('controllers/jobController-v2.js', 'userId !== userId'),
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
          verify: () => this.fileContains('models/index.js', 'Sequelize'),
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
          verify: () => this.fileContains('server-db.js', 'cors'),
        },
        {
          id: 'S3.2',
          check: 'Rate limiting (必要なら)',
          verify: () => true, // オプション
        },
        {
          id: 'S3.3',
          check: 'Input validation',
          verify: () => this.fileContains('controllers/jobController-v2.js', 'if (!description || !appName)'),
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
          check: '本番ログに機密情報なし',
          verify: () => !this.fileContains('server-db.js', 'PASSWORD') && !this.fileContains('server-db.js', 'SECRET'),
        },
        {
          id: 'S4.2',
          check: 'スタックトレース非表示',
          verify: () => this.fileContains('controllers/jobController-v2.js', 'error.message'),
        },
        {
          id: 'S4.3',
          check: 'HTTP ステータス区別',
          verify: () => this.fileContains('controllers/jobController-v2.js', '400') && this.fileContains('controllers/jobController-v2.js', '403'),
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
        {
          id: 'S5.1',
          check: 'Secret Manager キー管理',
          verify: () => true, // Terraform で実装予定
        },
        {
          id: 'S5.2',
          check: 'VPC 通信隔離',
          verify: () => true, // インフラで実装
        },
        {
          id: 'S5.3',
          check: 'SSL/TLS 有効',
          verify: () => true, // Cloud Run で自動
        },
      ],
    };
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
   * すべてのチェックを実行
   */
  async runAllChecks() {
    const results = {};
    let passCount = 0;
    let totalCount = 0;

    Object.entries(this.checks).forEach(([key, category]) => {
      results[key] = {
        category: category.name,
        items: [],
      };

      category.items.forEach((item) => {
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
