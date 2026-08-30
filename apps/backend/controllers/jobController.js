const { Op } = require('sequelize');
const { Job } = require('../models');
const geminiService = require('../services/geminiService');
const { parseGeneratedCode } = require('../services/codeParser');
const deployService = require('../services/deployService');

// 1 ユーザーあたりのアプリ作成上限
const JOB_LIMIT = 3;

// 枠を消費しているジョブ数をカウントする。
// 失敗したジョブは枠を返す（再挑戦できる）が、生成途中のジョブは枠を消費する。
// 進行中を数えないと、pending/generating を量産して Gemini 呼び出しを
// 無制限に発火させられてしまう。
async function countJobsAgainstLimit(userId) {
  return Job.count({
    where: {
      userId,
      status: { [Op.ne]: 'failed' },
    },
  });
}

// ジョブ作成（Gemini 統合 + 作成数制限）
exports.createJob = async (req, res) => {
  try {
    const { description, appName, language, dbType, model } = req.body;
    const userId = req.userId;

    if (!description || !appName) {
      return res.status(400).json({ error: 'description と appName は必須' });
    }

    // appName バリデーション (英数字・ハイフン・アンダースコアのみ)
    if (!/^[a-zA-Z0-9_-]+$/.test(appName)) {
      return res.status(400).json({
        error: 'appName は英数字・ハイフン・アンダースコアのみ使用可能です',
      });
    }

    if (appName.length > 100) {
      return res.status(400).json({ error: 'appName は100文字以内です' });
    }

    // description の長さ制限（プロンプト肥大化・コスト暴走の防止）
    if (description.length > 5000) {
      return res.status(400).json({ error: 'description は5000文字以内です' });
    }

    // ===== 作成数制限チェック =====
    const usedSlots = await countJobsAgainstLimit(userId);

    if (usedSlots >= JOB_LIMIT) {
      return res.status(400).json({
        error: 'アプリ生成上限に達しています',
        message: `最大${JOB_LIMIT}個まで作成できます。古いアプリを削除してから新規作成してください。`,
        current: usedSlots,
        limit: JOB_LIMIT,
      });
    }

    const job = await Job.create({
      userId,
      appName,
      prompt: description,
      language: language || 'TypeScript',
      dbType: dbType || 'PostgreSQL',
      model: model || 'gemini-flash-latest',
      status: 'pending',
      progress: 0,
    });

    // バックグラウンドで AI 処理を実行（レスポンスはブロックしない）
    processJobWithAI(job.id).catch((error) => {
      console.error(`[${job.id}] Background processing failed:`, error.message);
    });

    res.status(201).json(job);
  } catch (error) {
    console.error('Error in createJob:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 利用可能なモデル一覧
exports.listModels = async (req, res) => {
  const result = await geminiService.listModels();

  // 取得に失敗しても画面が使えなくならないよう、既定値を返す
  if (!result.success || result.models.length === 0) {
    return res.json({
      models: [{ id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' }],
      fallback: true,
    });
  }

  res.json({ models: result.models, fallback: false });
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

    // 自分のジョブのみ取得可能
    if (job.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error in getJob:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ジョブ一覧（作成数制限の情報付き）
exports.listJobs = async (req, res) => {
  try {
    const userId = req.userId;

    const jobs = await Job.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    // 表示用の「完成した数」と、枠の消費数は別物として扱う
    const deployedCount = jobs.filter((j) => j.status === 'deployed').length;
    const usedSlots = jobs.filter((j) => j.status !== 'failed').length;

    res.json({
      jobs,
      stats: {
        total: jobs.length,
        completed: deployedCount,
        used: usedSlots,
        limit: JOB_LIMIT,
        canCreate: usedSlots < JOB_LIMIT,
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

    // 承認後のデプロイ処理をバックグラウンドで実行
    finalizeJob(job.id).catch((error) => {
      console.error(`[${job.id}] Finalize failed:`, error.message);
    });

    res.json(job);
  } catch (error) {
    console.error('Error in approveDesign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 設計書却下（再生成）
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

    // 再生成をバックグラウンドで実行
    processJobWithAI(job.id).catch((error) => {
      console.error(`[${job.id}] Regeneration failed:`, error.message);
    });

    res.json(job);
  } catch (error) {
    console.error('Error in rejectDesign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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

    // 先に Cloud Run の生成アプリを消す。DB だけ消すと、
    // 削除したはずのアプリが公開されたまま課金され続ける。
    const removal = await deployService.deleteGeneratedApp(jobId);

    await job.destroy();

    res.json({
      message: 'Job deleted successfully',
      // 消し漏れがあったことを隠さない（手動で消す判断ができるように）
      ...(removal.success ? {} : { warning: `生成アプリの削除に失敗しました: ${removal.error}` }),
    });
  } catch (error) {
    console.error('Error in deleteJob:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ===== Gemini AI 処理パイプライン =====

async function processJobWithAI(jobId) {
  const job = await Job.findByPk(jobId);
  if (!job) return;

  try {
    // Step 1: コード生成
    console.log(`[${jobId}] Step 1/4: Generating code with ${job.model}...`);
    job.status = 'generating';
    job.progress = 10;
    job.error = null;
    await job.save();

    const codeResult = await geminiService.generateApplicationCode({
      appName: job.appName,
      prompt: job.prompt,
      language: job.language,
      dbType: job.dbType,
      model: job.model,
    });

    if (!codeResult.success) {
      throw new Error(`Code generation failed: ${codeResult.error}`);
    }

    job.generatedCode = codeResult.content;
    job.progress = 30;
    await job.save();

    // Step 2: テスト生成
    console.log(`[${jobId}] Step 2/4: Generating tests...`);
    job.status = 'testing';
    job.progress = 45;
    await job.save();

    const testResult = await geminiService.generateTests(
      codeResult.content,
      job.language,
      job.model
    );

    if (!testResult.success) {
      console.warn(`[${jobId}] Test generation warning: ${testResult.error}`);
    }

    // Step 3: セキュリティ監査
    console.log(`[${jobId}] Step 3/4: Running security audit...`);
    job.progress = 60;
    await job.save();

    const securityResult = await geminiService.performSecurityAudit(
      codeResult.content,
      job.language,
      job.model
    );

    if (!securityResult.success) {
      console.warn(`[${jobId}] Security audit warning: ${securityResult.error}`);
    }

    // Step 4: 品質スコア計算と設計書生成
    const qualityScore = geminiService.calculateQualityScore(testResult, securityResult);
    console.log(`[${jobId}] Step 4/4: Quality Score ${qualityScore}/100`);

    job.designDocument = buildDesignDocument({
      job,
      codeResult,
      testResult,
      securityResult,
      qualityScore,
    });
    job.status = 'design_review';
    job.progress = 70;
    await job.save();

    console.log(`[${jobId}] Design review ready. Awaiting user approval.`);
  } catch (error) {
    console.error(`[${jobId}] AI processing error:`, error.message);
    await markJobFailed(jobId, error.message);
  }
}

// 承認後の最終処理（デプロイ）
async function finalizeJob(jobId) {
  const job = await Job.findByPk(jobId);
  if (!job || job.status !== 'approved') return;

  try {
    job.progress = 85;
    await job.save();

    // 生成物をファイル群へ分解する。ここが通らなければデプロイのしようがない。
    const parsed = parseGeneratedCode(job.generatedCode);
    if (!parsed.success) {
      throw new Error(`生成コードを解釈できませんでした: ${parsed.error}`);
    }

    const result = await deployService.deployGeneratedApp({
      jobId,
      files: parsed.files,
      port: parsed.port,
      startCommand: parsed.startCommand,
      language: job.language,
      // 進捗を画面へ反映する。ビルドは数分かかるため、
      // 何も動かないと利用者には固まったように見える。
      onProgress: async (message, progress) => {
        const current = await Job.findByPk(jobId);
        if (!current) return;
        if (typeof progress === 'number') current.progress = progress;
        await current.save();
      },
    });

    if (!result.success) {
      throw new Error(`デプロイに失敗しました: ${result.error}`);
    }

    job.appUrl = result.url;
    job.status = 'deployed';
    job.progress = 100;
    job.deployedAt = new Date();
    await job.save();

    console.log(`[${jobId}] Deployed: ${result.url}`);
  } catch (error) {
    console.error(`[${jobId}] Finalize error:`, error.message);
    await markJobFailed(jobId, error.message);
  }
}

// ジョブを失敗状態に更新（失敗記録自体が失敗してもプロセスは落とさない）
async function markJobFailed(jobId, message) {
  try {
    const job = await Job.findByPk(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = message;
    job.progress = 0;
    await job.save();
  } catch (error) {
    console.error(`[${jobId}] Failed to persist failure state:`, error.message);
  }
}

// 設計書を生成
function buildDesignDocument({ job, codeResult, testResult, securityResult, qualityScore }) {
  const verdict = qualityScore >= 80 ? 'PASS' : qualityScore >= 60 ? 'CAUTION' : 'FAIL';

  return `# ${job.appName} - 設計書・生成レポート

## プロジェクト概要
- アプリ名: ${job.appName}
- 説明: ${job.prompt}
- 言語: ${job.language}
- DB: ${job.dbType}
- AI モデル: ${job.model}
- 生成日時: ${new Date().toISOString()}

## 品質スコア
${qualityScore}/100 (${verdict})

### スコア内訳
- セキュリティ監査: ${securityResult.success ? '完了' : `警告 (${securityResult.error})`}
- テスト生成: ${testResult.success ? '完了' : `警告 (${testResult.error})`}

## 生成されたコード（抜粋）
\`\`\`${job.language}
${truncate(codeResult.content, 1000)}
\`\`\`

## テスト戦略
${testResult.success ? truncate(testResult.content, 500) : testResult.error}

## セキュリティ監査結果
${securityResult.success ? truncate(securityResult.content, 800) : securityResult.error}

## 次のステップ
1. この設計書を確認
2. 「承認」でデプロイへ
3. 「却下」で再生成

---
自動生成: Gemini API (${job.model})
`;
}

function truncate(text, length) {
  if (!text) return '';
  return text.length > length ? `${text.substring(0, length)}...` : text;
}
