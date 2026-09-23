# 世界服务端容器镜像：一个 Node 进程同时提供静态文件、API 与 WebSocket。
# 前端若分离部署到 Vercel 等静态托管，只需把 VITE_API_BASE / VITE_WS_URL 指向本服务。
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
# 数据持久化：把 ATOM_DATA_DIR 指向挂载卷（见 docker-compose.yml）
CMD ["npm", "start"]
