#!/usr/bin/env node

/**
 * 品質ループ実行スクリプト
 *
 * 流れ:
 * 1. 実装チェック
 * 2. セキュリティチェック
 * 3. テスト実行
 * 4. 品質判定
 * 5. デプロイ判定
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const SecurityChecklist = require('../security/securityChecklist');

const execAsync = promisify(exec);

class QualityLoop {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      steps: {},
      finalStatus: 'PENDING',
    };
  }

  /**
   * Step 1: セキュリティチェック
   */
  async stepSecurity() {
    console.log('\n📋 Step 1: セキュリティチェック実行...');
    const checklist = new SecurityChecklist();
    const report = await checklist.runAllChecks();

    this.results.steps.security = {
      status: report.status,
      percentage: report.summary.percentage,
      details: report.details,
    };

    return report.status === 'PASS';
  }

  /**
   * Step 2: ユニットテスト実行
   */
  async stepTesting() {
    console.log('\n🧪 Step 2: ユニットテスト実行...');

    try {
      const { stdout, stderr } = await execAsync('npm run test:coverage 2>&1 || true');

      // Jest カバレッジパーサー
      const coverage = this.parseJestCoverage(stdout + stderr);

      this.results.steps.testing = {
        status: coverage >= 80 ? 'PASS' : 'FAIL',
        coverage: coverage,
        output: (stdout + stderr).substring(0, 500),
      };

      return coverage >= 80;
    } catch (error) {
      console.error('Test execution error:', error.message);
      this.results.steps.testing = {
        status: 'FAIL',
        error: error.message,
      };
      return false;
    }
  }

  /**
   * Jest カバレッジを解析
   */
  parseJestCoverage(output) {
    // 簡易版: 60% デフォルト（実際のテスト実行時に更新）
    const match = output.match(/Statements\s*:\s*(\d+)/);
    return match ? parseInt(match[1]) : 60;
  }

  /**
   * Step 3: 品質判定
   */
  stepQualityCheck() {
    console.log('\n📊 Step 3: 品質判定...');

    const securityPass = this.results.steps.security?.status === 'PASS';
    const testPass = this.results.steps.testing?.status === 'PASS';

    const qualityScore = (securityPass ? 50 : 0) + (testPass ? 50 : 0);

    this.results.steps.quality = {
      score: qualityScore,
      security: securityPass ? '✅' : '❌',
      testing: testPass ? '✅' : '❌',
      status: qualityScore >= 80 ? 'PASS' : 'FAIL',
    };

    return qualityScore >= 80;
  }

  /**
   * Step 4: デプロイ判定
   */
  stepDeploymentDecision() {
    console.log('\n🚀 Step 4: デプロイ判定...');

    const qualityPass = this.results.steps.quality?.status === 'PASS';

    this.results.finalStatus = qualityPass ? 'READY_TO_DEPLOY' : 'NEEDS_FIXES';
    this.results.steps.deployment = {
      status: qualityPass ? 'APPROVED' : 'REJECTED',
      message: qualityPass
        ? 'すべての品質基準を満たしています。デプロイ準備完了。'
        : '品質基準を満たしていません。修正が必要です。',
    };

    return qualityPass;
  }

  /**
   * レポート表示
   */
  printReport() {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║             品質ループ実行結果                        ║
╚═══════════════════════════════════════════════════════╝

実行日時: ${this.results.timestamp}
最終判定: ${this.results.finalStatus}

【ステップ別結果】

1️⃣ セキュリティチェック
   判定: ${this.results.steps.security?.status || 'PENDING'}
   スコア: ${this.results.steps.security?.percentage || 0}%

2️⃣ テストカバレッジ
   判定: ${this.results.steps.testing?.status || 'PENDING'}
   カバレッジ: ${this.results.steps.testing?.coverage || 0}%

3️⃣ 品質判定
   スコア: ${this.results.steps.quality?.score || 0}/100
   セキュリティ: ${this.results.steps.quality?.security}
   テスト: ${this.results.steps.quality?.testing}
   判定: ${this.results.steps.quality?.status || 'PENDING'}

4️⃣ デプロイ判定
   ステータス: ${this.results.steps.deployment?.status}
   メッセージ: ${this.results.steps.deployment?.message}

╔═══════════════════════════════════════════════════════╗
${this.results.finalStatus === 'READY_TO_DEPLOY'
  ? '✅ デプロイ準備完了！'
  : '❌ 修正が必要です'}
╚═══════════════════════════════════════════════════════╝
    `);
  }

  /**
   * 品質ループを実行
   */
  async run() {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║              品質ループ実行開始                      ║
╚═══════════════════════════════════════════════════════╝
    `);

    try {
      const securityOk = await this.stepSecurity();
      const testingOk = await this.stepTesting();
      const qualityOk = this.stepQualityCheck();
      const deploymentOk = this.stepDeploymentDecision();

      this.printReport();

      process.exit(deploymentOk ? 0 : 1);
    } catch (error) {
      console.error('❌ 品質ループエラー:', error.message);
      process.exit(1);
    }
  }
}

// メイン実行
if (require.main === module) {
  const loop = new QualityLoop();
  loop.run();
}

module.exports = QualityLoop;
