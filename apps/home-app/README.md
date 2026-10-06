# home-app

AI アプリジェネレーターのフロントエンド（Next.js 16 / App Router）。プロンプトを入力してジョブを作成し、設計書のレビュー・承認とデプロイ結果の確認を行います。全体像はルートの [README](../../README.md) を参照してください。

## 画面

- `/auth/signup`, `/auth/login`: 登録とログイン
- `/`: アプリの説明を入力して生成ジョブを作成
- `/jobs`: ジョブ一覧（5秒間隔のポーリング）。設計書の承認・却下、デプロイ URL の確認

ジョブの進捗は、`JobStatus` が 3 秒間隔のポーリングで取得し、完了か失敗で止まります。WebSocket は使っていません。

## 技術スタック

Next.js / TypeScript / Tailwind CSS 4 / shadcn/ui / Zustand / Axios / React Hot Toast

## 開発

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev   # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` の既定値は `http://localhost:3001` です。バックエンドの起動方法はルートの README を参照してください。

```bash
npx tsc --noEmit   # 型チェック（CI でも実行）
npm run build
```
