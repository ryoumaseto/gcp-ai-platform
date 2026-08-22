# Documentation Guide

## 📍 ドキュメント保管場所

このプロジェクトのドキュメントは **Git 管理外** で管理されています。

```
/home/ryohma/gcp-ai-platform/doc/
├── README.md                              （ドキュメント全体ガイド）
├── app-generator-saas-improved-v2.1.md    （実装用マスタードキュメント）⭐️
├── plan-review-and-issues.md              （問題分析・参考）
└── app-generator-saas-revised-plan.md     （旧版・廃止予定）
```

## 🎯 アクセス方法

### ローカル環境でドキュメントを読む

```bash
# doc ディレクトリをブラウザで開く
cd /home/ryohma/gcp-ai-platform/doc

# または VS Code で開く
code /home/ryohma/gcp-ai-platform/doc
```

### 実装ガイド

1. **最初に読むべき**: `doc/README.md`
   - ドキュメント全体のナビゲーション
   - 読むべき順序を明記

2. **実装を開始**: `doc/app-generator-saas-improved-v2.1.md`
   - 第0～7章の詳細な実装手順
   - コード例・SQL テンプレート付き
   - 9週間のロードマップ

3. **問題分析が必要な場合**: `doc/plan-review-and-issues.md`
   - v2.0 の問題点と改善策
   - v2.1 で全て解決済み

## 📋 ドキュメント構成

### `doc/README.md`
- ドキュメント全体インデックス
- 読むべき順序（重要！）
- ドキュメント作成予定リスト

### `doc/app-generator-saas-improved-v2.1.md`
- **実装用マスタードキュメント**
- 第0章: GCP 初期設定
- 第1章: Cloud SQL + RLS 実装
- 第2章: JWT + DNS
- 第3章: Home アプリケーション
- 第4章: AI エージェント
- 第5章: Pub/Sub Workflow
- 第6章: セキュリティ
- 第7章: コスト計算＆ロードマップ

### `doc/plan-review-and-issues.md`
- v2.0 の問題点分析
- 7 つの重大問題と改善案
- 8 つの中程度の問題と改善案

## ⚙️ なぜ Git 管理外なのか？

ドキュメント（特に計画書）は以下の理由で Git から除外されています：

1. **頻繁な更新**: 実装中にドキュメントが何度も更新される
   - 各更新が Git commit になると、履歴が混乱
   
2. **コードレビュー混乱**: ドキュメント更新が大量の diff を生成
   - コード変更の diff が埋もれる
   
3. **競合の増加**: 複数メンバーが同時編集すると競合が増加
   - マージの手間が増える
   
4. **バージョン管理の複雑さ**: コードとドキュメントのバージョン同期が困難
   - 特に計画書は「概念」の変更が多い

## 📤 ドキュメントの共有方法

### チームメンバーへの共有

ドキュメントをチームと共有する場合：

1. **ローカル環境で読む**（推奨）
   ```bash
   # VS Code でドキュメント参照しながら実装
   code /home/ryohma/gcp-ai-platform/doc
   ```

2. **PDF にエクスポート**
   ```bash
   # Markdown → PDF 変換（必要に応じて）
   pandoc doc/app-generator-saas-improved-v2.1.md -o app-plan-v2.1.pdf
   ```

3. **HTML で公開**
   ```bash
   # GitHub Pages または内部 Wiki に公開
   # Markdown を HTML に変換して共有
   ```

## 🔄 ドキュメント更新時のルール

ドキュメントを更新した場合：

1. **Git commit には含めない**
   - `.gitignore` で自動除外

2. **更新内容を記録**（オプション）
   - `doc/README.md` の「最終更新」セクションを手動更新
   - または `doc/CHANGELOG.md` を作成

3. **チームへの通知**
   - Slack / Teams で「ドキュメント更新」を報告
   - 必要に応じて重要な変更箇所を要約

## 📝 今後のドキュメント作成

実装開始後、以下のドキュメントを追加予定：

- `security-design.md` - セキュリティ詳細設計
- `api-specification.md` - API 仕様書
- `operations-manual.md` - 運用手順書
- `troubleshooting.md` - トラブルシューティング

すべて `doc/` ディレクトリに保存（Git 管理外）

## 🚀 始めるには

```bash
# 1. ドキュメント確認
cd /home/ryohma/gcp-ai-platform/doc

# 2. README で全体構成を理解
cat README.md

# 3. 改善版 v2.1 を実装開始
code app-generator-saas-improved-v2.1.md
```

---

**注**: ドキュメントが Git から除外されているため、GitHub にはコードのみが保存されます。
ドキュメントはローカル環境で管理してください。
