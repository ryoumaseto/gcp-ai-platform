const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { verifyToken } = require('../middleware/auth');

// すべてのルートに認証が必須
router.use(verifyToken);

// ジョブ作成
router.post('/', jobController.createJob);

// ジョブ一覧
router.get('/', jobController.listJobs);

// ジョブ取得
router.get('/:jobId', jobController.getJob);

// 設計書承認
router.post('/:jobId/approve-design', jobController.approveDesign);

// 設計書却下
router.post('/:jobId/reject-design', jobController.rejectDesign);

// ジョブ削除
router.delete('/:jobId', jobController.deleteJob);

module.exports = router;
