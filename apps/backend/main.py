from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AppGen API", version="0.1.0")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Data Models =====

class GenerateAppRequest(BaseModel):
    description: str
    appName: str
    language: str = "TypeScript"
    dbType: str = "PostgreSQL"
    temperature: float = 0.7

class GenerationJob(BaseModel):
    id: str
    status: str
    prompt: str
    appName: str
    language: str
    dbType: str
    temperature: float
    designDocument: Optional[str] = None
    appUrl: Optional[str] = None
    error: Optional[str] = None
    progress: int
    createdAt: datetime
    updatedAt: datetime

# ===== In-memory Job Store（開発用、本番ではDBを使用） =====

jobs_store = {}

def simulate_job_progress(job_id: str):
    """ジョブの進捗をシミュレート"""
    import time

    job = jobs_store.get(job_id)
    if not job:
        return

    # 進捗パターン: pending → design_review → approved → deployed
    stages = [
        (10, "pending"),
        (30, "design_review"),
        (60, "approved"),
        (100, "deployed"),
    ]

    for progress, status in stages:
        time.sleep(2)
        if job_id in jobs_store:
            jobs_store[job_id]["progress"] = progress
            jobs_store[job_id]["status"] = status
            jobs_store[job_id]["updatedAt"] = datetime.now()

            # design_reviewステップで設計書を追加
            if status == "design_review" and not jobs_store[job_id].get("designDocument"):
                jobs_store[job_id]["designDocument"] = f"""
# {jobs_store[job_id]['appName']} 設計書

## 要件
- 説明: {jobs_store[job_id]['prompt']}
- 言語: {jobs_store[job_id]['language']}
- DB: {jobs_store[job_id]['dbType']}

## アーキテクチャ
- フロントエンド: Next.js/React
- バックエンド: {jobs_store[job_id]['language']}
- データベース: {jobs_store[job_id]['dbType']}

## 機能一覧
1. ユーザー認証
2. CRUD操作
3. API インタフェース
4. エラーハンドリング

## セキュリティ
- JWT認証
- HTTPS通信
- SQL injection対策
- CORS設定

## デプロイ
- Cloud Run でコンテナ化
- Cloud SQL との連携
- 環境変数管理
"""

            # deployedステップでURL追加
            if status == "deployed" and not jobs_store[job_id].get("appUrl"):
                jobs_store[job_id]["appUrl"] = f"https://{jobs_store[job_id]['appName'].lower()}.example.com"

# ===== API Endpoints =====

@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {"status": "ok"}

@app.post("/api/generate")
async def generate_app(req: GenerateAppRequest, background_tasks: BackgroundTasks):
    """
    アプリ生成ジョブを作成

    フロントエンドからの生成リクエストを受け取り、
    ジョブを作成して、バックグラウンドで進捗をシミュレート
    """
    job_id = str(uuid.uuid4())
    now = datetime.now()

    job = {
        "id": job_id,
        "status": "pending",
        "prompt": req.description,
        "appName": req.appName,
        "language": req.language,
        "dbType": req.dbType,
        "temperature": req.temperature,
        "designDocument": None,
        "appUrl": None,
        "error": None,
        "progress": 0,
        "createdAt": now,
        "updatedAt": now,
    }

    jobs_store[job_id] = job

    # バックグラウンドで進捗をシミュレート
    background_tasks.add_task(simulate_job_progress, job_id)

    return job

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """
    ジョブの状態を取得

    フロントエンドが定期的にこのエンドポイントをポーリングして
    ジョブの進捗を確認
    """
    if job_id not in jobs_store:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs_store[job_id]
    return job

@app.post("/api/jobs/{job_id}/approve-design")
async def approve_design(job_id: str):
    """
    設計書を承認してコード生成に進む
    """
    if job_id not in jobs_store:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs_store[job_id]

    if job["status"] != "design_review":
        raise HTTPException(
            status_code=400,
            detail="Job must be in design_review status"
        )

    job["status"] = "approved"
    job["progress"] = 50
    job["updatedAt"] = datetime.now()

    return job

@app.post("/api/jobs/{job_id}/reject-design")
async def reject_design(job_id: str):
    """
    設計書を却下して再生成を要求
    """
    if job_id not in jobs_store:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs_store[job_id]

    if job["status"] != "design_review":
        raise HTTPException(
            status_code=400,
            detail="Job must be in design_review status"
        )

    job["status"] = "pending"
    job["progress"] = 0
    job["designDocument"] = None
    job["updatedAt"] = datetime.now()

    return job

@app.get("/api/jobs")
async def list_jobs():
    """
    全ジョブのリストを返す
    """
    return list(jobs_store.values())

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host=host, port=port)
