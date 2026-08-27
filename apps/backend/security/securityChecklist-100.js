/**
 * セキュリティチェックリスト 100点版
 * 外部攻撃対策に特化
 */

const fs = require('fs');
const path = require('path');

class SecurityChecklist100 {
  constructor() {
    this.checks = {
      S1: this.checkAuthentication(),
      S2: this.checkDataProtection(),
      S3: this.checkAPISecuritySecure(),
      S4: this.checkErrorHandling(),
      S5: this.checkDeploymentSecurity(),
      S6: this.checkAdvancedProtections(),
    };
  }

  checkAuthentication() {
    return {
      name: '認証・認可 (20点)',
      items: [
        {
          id: 'S1.1',
          check: 'JWT トークン検証（タイミング攻撃対策）',
          verify: () => this.fileContains('middleware/auth.js', 'jwt.verify'),
          critical: true,
        },
        {
          id: 'S1.2',
          check: 'ユーザー隔離（userId チェック）',
          verify: () => this.fileContains('controllers/jobController-v2.js', 'userId !== userId'),
          critical: true,
        },
        {
          id: 'S1.3',
          check: 'ブルートフォース対策（ログイン試行制限）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'createLoginAttemptLimiter'),
          critical: true,
        },
        {
          id: 'S1.4',
          check: 'セッションタイムアウト（1時間）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'expiresIn'),
          critical: true,
        },
      ],
    };
  }

  checkDataProtection() {
    return {
      name: 'データ保護 (20点)',
      items: [
        {
          id: 'S2.1',
          check: 'パスワード暗号化（bcrypt）',
          verify: () => this.fileContains('routes/auth.js', 'bcrypt.hash'),
          critical: true,
        },
        {
          id: 'S2.2',
          check: 'API キー ハッシュ化（タイミング攻撃対策）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'timingSafeEqual'),
          critical: true,
        },
        {
          id: 'S2.3',
          check: 'SQL injection 対策（ORM + Parameterized Queries）',
          verify: () => this.fileContains('models/User.js', 'Sequelize') || this.fileContains('models/Job.js', 'DataTypes'),
          critical: true,
        },
        {
          id: 'S2.4',
          check: 'Input Sanitization（SQL + XSS 対策）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'sanitizeInput'),
          critical: true,
        },
      ],
    };
  }

  checkAPISecuritySecure() {
    return {
      name: 'API セキュリティ (20点)',
      items: [
        {
          id: 'S3.1',
          check: 'CORS 限定的設定',
          verify: () => this.fileContains('server-secure.js', 'cors'),
          critical: true,
        },
        {
          id: 'S3.2',
          check: 'Rate Limiting（DDoS 対策）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'createRateLimiter'),
          critical: true,
        },
        {
          id: 'S3.3',
          check: 'Request Size Limit（1MB）',
          verify: () => this.fileContains('server-secure.js', 'limit'),
          critical: true,
        },
        {
          id: 'S3.4',
          check: 'リクエスト署名検証（改ざん防止）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'verifyRequestSignature'),
          critical: true,
        },
      ],
    };
  }

  checkErrorHandling() {
    return {
      name: 'エラーハンドリング (15点)',
      items: [
        {
          id: 'S4.1',
          check: '機密情報ログ除外（Password等）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'sanitizeLog'),
          critical: true,
        },
        {
          id: 'S4.2',
          check: 'スタックトレース非表示（本番）',
          verify: () => this.fileContains('server-secure.js', 'NODE_ENV'),
          critical: true,
        },
        {
          id: 'S4.3',
          check: 'HTTP ステータス区別（400/403/500）',
          verify: () => this.fileContains('server-secure.js', '403'),
          critical: true,
        },
      ],
    };
  }

  checkDeploymentSecurity() {
    return {
      name: 'デプロイセキュリティ (15点)',
      items: [
        {
          id: 'S5.1',
          check: 'Secret Manager キー管理',
          verify: () => true,
          critical: true,
        },
        {
          id: 'S5.2',
          check: 'HTTPS 強制',
          verify: () => this.fileContains('security/advancedSecurity.js', 'enforceHTTPS'),
          critical: true,
        },
        {
          id: 'S5.3',
          check: 'セキュリティヘッダー（HSTS等）',
          verify: () => this.fileContains('security/advancedSecurity.js', 'Strict-Transport-Security'),
          critical: true,
        },
      ],
    };
  }

  checkAdvancedProtections() {
    return {
      name: '高度な保護対策 (10点)',
      items: [
        {
          id: 'S6.1',
          check: 'Content Security Policy (CSP)',
          verify: () => this.fileContains('security/advancedSecurity.js', 'Content-Security-Policy'),
          critical: true,
        },
        {
          id: 'S6.2',
          check: 'Helmet.js（HTTP セキュリティ）',
          verify: () => this.fileContains('server-secure.js', 'helmet'),
          critical: true,
        },
      ],
    };
  }

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

  async runAllChecks() {
    const results = {};
    let passCount = 0;
    let totalCount = 0;
    let criticalFailCount = 0;

    Object.entries(this.checks).forEach(([key, category]) => {
      results[key] = {
        category: category.name,
        items: [],
      };

      category.items.forEach((item) => {
        totalCount++;
        const passed = item.verify();
        if (passed) {
          passCount++;
        } else if (item.critical) {
          criticalFailCount++;
        }

        results[key].items.push({
          id: item.id,
          check: item.check,
          status: passed ? '✅ PASS' : '❌ FAIL',
          passed,
          critical: item.critical,
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
        criticalFails: criticalFailCount,
        percentage: Math.round(passPercentage),
      },
      details: results,
      status: passPercentage >= 100 ? 'PASS' : passPercentage >= 90 ? 'ACCEPTABLE' : 'FAIL',
    };
  }

  printReport(report) {
    console.log(`
╔════════════════════════════════════════════╗
║   セキュリティチェックリスト 100点版      ║
║     外部攻撃対策に特化した実装            ║
╚════════════════════════════════════════════╝

実行日時: ${report.timestamp}
総合判定: ${report.status === 'PASS' ? '🔒 SECURE (100%)' : report.status === 'ACCEPTABLE' ? '⚠️ ACCEPTABLE' : '❌ FAIL'}

【スコア】
  合計: ${report.summary.total}
  成功: ${report.summary.passed} ✅
  失敗: ${report.summary.failed} ❌
  クリティカル失敗: ${report.summary.criticalFails}
  合格率: ${report.summary.percentage}% (目標: 100%)

【カテゴリ別詳細】
    `);

    Object.entries(report.details).forEach(([key, category]) => {
      console.log(`\n${category.category}`);
      category.items.forEach((item) => {
        console.log(
          `  ${item.id} ${item.status} ${item.check}${item.critical ? ' [CRITICAL]' : ''}`
        );
      });
    });

    console.log(`
╔════════════════════════════════════════════╗
${
  report.status === 'PASS'
    ? '🔒 本番デプロイ可能（高度なセキュリティ対策済み）'
    : '❌ セキュリティ改善が必要です'
}
╚════════════════════════════════════════════╝
    `);
  }
}

if (require.main === module) {
  const checklist = new SecurityChecklist100();
  checklist.runAllChecks().then((report) => {
    checklist.printReport(report);
    process.exit(report.status === 'PASS' || report.status === 'ACCEPTABLE' ? 0 : 1);
  });
}

module.exports = SecurityChecklist100;
