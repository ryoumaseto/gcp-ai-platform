# ===== Build stage =====
FROM node:20-alpine AS builder

WORKDIR /app

# 依存関係のインストール（package-lock.json に一致させる）
COPY package.json package-lock.json ./
RUN npm ci

# ソースコードをコピー
COPY . .

# NEXT_PUBLIC_* はビルド時にクライアントバンドルへ埋め込まれるため、
# ビルド引数として受け取る必要がある（実行時の env では反映されない）
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ===== Runtime stage =====
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 非 root ユーザーで実行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# standalone 出力（server.js + 必要な node_modules のみ）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# トップページの応答でヘルスチェック（Next.js は /health を持たない）
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
