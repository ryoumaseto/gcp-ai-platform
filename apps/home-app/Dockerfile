FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3000

# Copy package files
COPY package*.json ./

# Copy pre-built dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built app and public files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

CMD ["npm", "start"]
