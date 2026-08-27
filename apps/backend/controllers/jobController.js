const { Job } = require('../models');

// ジョブ作成
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
        error: 'appName は英数字・ハイフン・アンダースコアのみ使用可能です'
      });
    }

    if (appName.length > 100) {
      return res.status(400).json({ error: 'appName は100文字以内です' });
    }

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

    // バックグラウンド処理は別途実装 (processJobWithAI など)
    // TODO: Gemini API 統合による AI 処理を実装

    res.json(job);
  } catch (error) {
    console.error('Error in createJob:', error);
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

// ジョブ一覧
exports.listJobs = async (req, res) => {
  try {
    const userId = req.userId;
    const jobs = await Job.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    res.json(jobs);
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

// ジョブ進捗シミュレーション
async function simulateJobProgress(jobId) {
  const stages = [
    { progress: 10, status: 'pending', delay: 2 },
    { progress: 30, status: 'design_review', delay: 2 },
  ];

  for (const stage of stages) {
    await new Promise((resolve) => setTimeout(resolve, stage.delay * 1000));

    const job = await Job.findByPk(jobId);
    if (job) {
      job.progress = stage.progress;
      job.status = stage.status;

      // design_reviewで設計書を生成
      if (stage.status === 'design_review' && !job.designDocument) {
        job.designDocument = `
# ${job.appName} 設計書

## 要件
- 説明: ${job.prompt}
- 言語: ${job.language}
- DB: ${job.dbType}
- AIモデル: ${job.model} (Gemini)

## アーキテクチャ
- フロントエンド: Next.js/React
- バックエンド: ${job.language}
- データベース: ${job.dbType}

## 機能
1. ユーザー認証
2. CRUD操作
3. API インタフェース
4. エラーハンドリング
5. Gemini統合コード生成

## セキュリティ
- JWT認証
- HTTPS通信
- SQL injection対策
- CORS設定
- APIキー管理
`;
      }

      await job.save();
    }
  }
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
