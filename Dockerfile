# 原子江湖 · 世界服务端镜像（多阶段构建）
# 一个 Node 进程提供：静态前端 + 内容/鉴权/记忆/聊天 API + 权威世界 WebSocket。
#
# 构建：docker build -t atom-jianghu/world:latest .
# 运行：docker run -p 8080:8080 -v atom-data:/app/data atom-jianghu/world:latest

# ---------- 构建阶段：装全部依赖并打包前端 ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- 运行阶段：仅生产依赖 + 运行所需文件 ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# tini：正确的信号转发与子进程回收（优雅关机的关键）
RUN apk add --no-cache tini

# 只装生产依赖（vite 等开发依赖不进运行时镜像）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 运行所需：前端构建产物、服务端、前后端共享逻辑、静态资源
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY src ./src
COPY public ./public

# 非 root 运行；数据目录可写（账号/发布/记忆/审计）
RUN addgroup -S atom && adduser -S atom -G atom \
 && mkdir -p /app/data && chown -R atom:atom /app
USER atom

ENV HOST=0.0.0.0
ENV PORT=8080
ENV ATOM_DATA_DIR=/app/data
EXPOSE 8080

# 健康检查：内容接口（无需鉴权），失败三次标记为不健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/content/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.mjs"]
