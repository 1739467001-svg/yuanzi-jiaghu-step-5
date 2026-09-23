#!/bin/zsh
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  export PATH="/Users/mac/.deskclaw/node/bin:$PATH"
fi
if [ ! -d node_modules ]; then
  npm ci || exit 1
fi
# 5173 被其他实例占用时自动改用空闲端口，避免 strictPort 启动失败。
PORT=5173
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT+1))
done
open "http://127.0.0.1:$PORT"
npx vite --host 127.0.0.1 --port $PORT
