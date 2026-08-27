const { Job } = require('../models');
const geminiService = require('../services/geminiService');

// ジョブ作成（Gemini統合版 + 3つ制限）
exports.createJobWithAI = async (req, res) => {
  try {
    const { description, appName, language, dbType, model } = req.body;
    const userId = req.userId;

    if (!description || !appName) {
      return res.status(400).json({ error: 'description と appName は必須' });
    }

    // ===== ジョブ作成数制限チェック (3つまで) =====
    const completedJobs = await Job.count({
      where: {
        userId,
        status: ['deployed', 'failed'],
      },
    });

    const limit = 3;
    if (completedJobs >= limit) {
      return res.status(400).json({
        error: 'アプリ生成上限に達しています',
        message: `最大${limit}個まで作成できます。古いアプリを削除してから新規作成してください。`,
        current: completedJobs,
        limit,
      });
    }

    // ジョブを作成
    const job = await Job.create({
      userId,
      appName,
      prompt: description,
      language: language || 'TypeScript',
      dbType: dbType || 'PostgreSQL',
      model: model || 'gemini-2.0-flash',
      status: 'pending',
      progress: 0,
    });

    // バックグラウンドで AI 処理を実行
    processJobWithAI(job.id, model).catch(console.error);

    res.json({
      id: job.id,
      status: 'pending',
      progress: 0,
      message: 'Job created. AI processing started in background.',
    });
  } catch (error) {
    console.error('Error in createJobWithAI:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ジョブ取得
exports.getJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.userId;

    const job = await Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error in getJob:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ジョブ一覧 (3つ制限情報付き)
exports.listJobs = async (req, res) => {
  try {
    const userId = req.userId;
    const limit = 3;

    const jobs = await Job.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    // 完了したジョブ数をカウント
    const completedCount = jobs.filter(
      (j) => j.status === 'deployed' || j.status === 'failed'
    ).length;

    res.json({
      jobs,
      stats: {
        total: jobs.length,
        completed: completedCount,
        limit,
        canCreate: completedCount < limit,
      },
    });
  } catch (error) {
    console.error('Error in listJobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 設計書承認
exports.approveDesign = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.userId;

    const job = await Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (job.status !== 'design_review') {
      return res.status(400).json({ error: 'Job must be in design_review status' });
    }

    job.status = 'approved';
    job.progress = 50;
    await job.save();

    res.json(job);
  } catch (error) {
    console.error('Error in approveDesign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 設計書却下
exports.rejectDesign = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.userId;

    const job = await Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (job.status !== 'design_review') {
      return res.status(400).json({ error: 'Job must be in design_review status' });
    }

    job.status = 'pending';
    job.progress = 0;
    job.designDocument = null;
    await job.save();

    res.json(job);
  } catch (error) {
    console.error('Error in rejectDesign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ===== Gemini AI 処理ループ =====

async function processJobWithAI(jobId, model) {
  const job = await Job.findByPk(jobId);
  if (!job) return;

  try {
    // Step 1: コード生成
    console.log(`[${jobId}] Step 1: Generating code with ${model}...`);
    job.status = 'generating';
    job.progress = 10;
    await job.save();

    const codeResult = await geminiService.generateApplicationCode({
      appName: job.appName,
      prompt: job.prompt,
      language: job.language,
      dbType: job.dbType,
      model: model,
    });

    if (!codeResult.success) {
      throw new Error(`Code generation failed: ${codeResult.error}`);
    }

    job.generatedCode = codeResult.content;
    job.progress = 25;
    await job.save();

    // Step 2: テスト生成
    console.log(`[${jobId}] Step 2: Generating tests...`);
    job.progress = 35;
    await job.save();

    const testResult = await geminiService.generateTests(
      codeResult.content,
      job.language,
      model
    );

    if (!testResult.success) {
      console.warn(`Test generation warning: ${testResult.error}`);
    }

    job.progress = 45;
    await job.save();

    // Step 3: セキュリティ監査
    console.log(`[${jobId}] Step 3: Running security audit...`);
    job.progress = 55;
    await job.save();

    const securityResult = await geminiService.performSecurityAudit(
      codeResult.content,
      job.language,
      model
    );

    if (!securityResult.success) {
      console.warn(`Security audit warning: ${securityResult.error}`);
    }

    // Step 4: 品質スコア計算
    const qualityScore = geminiService.calculateQualityScore(testResult, securityResult);
    console.log(`[${jobId}] Quality Score: ${qualityScore}/100`);

    // Step 5: 設計書生成
    job.designDocument = generateDesignDocument(
      job,
      codeResult,
      testResult,
      securityResult,
      qualityScore
    );
    job.status = 'design_review';
    job.progress = 70;
    await job.save();

    console.log(`[${jobId}] ✓ Job completed. Awaiting user approval.`);
  } catch (error) {
    console.error(`[${jobId}] ✗ Error in AI processing:`, error.message);
    job.status = 'failed';
    job.error = error.message;
    job.progress = 0;
    await job.save();
  }
}

// 設計書を生成
function generateDesignDocument(job, codeResult, testResult, securityResult, qualityScore) {
  return `
# ${job.appName} - 設計書・生成レポート

## プロジェクト概要
- **アプリ名**: ${job.appName}
- **説明**: ${job.prompt}
- **言語**: ${job.language}
- **DB**: ${job.dbType}
- **AI モデル**: ${job.model}
- **生成日時**: ${new Date().toISOString()}

## 品質スコア
**${qualityScore}/100** ${qualityScore >= 80 ? '✅ PASS' : qualityScore >= 60 ? '⚠️ CAUTION' : '❌ FAIL'}

### スコア内訳
- セキュリティ: ${securityResult.success ? '✅ 監査完了' : '⚠️ 警告あり'}
- テストカバレッジ: ${testResult.success ? '✅ テスト生成完了' : '⚠️ 警告あり'}

## 生成されたコード
\`\`\`${job.language}
${codeResult.content.substring(0, 1000)}...
\`\`\`

## テスト戦略
${testResult.success ? testResult.content.substring(0, 500) : testResult.error}

## セキュリティ監査結果
${securityResult.success ? securityResult.content.substring(0, 800) : securityResult.error}

## 次のステップ
1. この設計書を確認
2. 「承認」で本体実装へ
3. 「却下」で再生成

---
**自動生成**: Gemini API (${job.model})
`;
}

// ジョブ削除
exports.deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.userId;

    const job = await Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await job.destroy();

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error in deleteJob:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
