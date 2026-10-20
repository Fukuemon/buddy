# syntax=docker/dockerfile:1
# ビルドの文脈はリポジトリのルートである。packages/ui を一緒にビルドするためである。
# 例: docker build -f apps/web/Dockerfile -t buddy-web .

FROM node:24-slim AS build
# 画面は BFF を通して API を呼ぶ。VITE_ の値はビルドのときに埋め込まれる
ARG VITE_API_MODE=bff
ENV CI=true VITE_API_MODE=$VITE_API_MODE
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @buddy/web...
COPY apps/web apps/web
COPY packages/ui packages/ui
RUN pnpm --filter @buddy/web build && \
    pnpm --filter @buddy/web deploy --legacy --prod /out && \
    cp -r apps/web/dist /out/dist

FROM node:24-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /out /app
EXPOSE 3000
USER node
CMD ["node_modules/.bin/srvx", "serve", "--prod", "--entry", "dist/server/server.js", "--static", "../client"]
