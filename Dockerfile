# 三順系統「後端 API」的容器映像，用於 Google Cloud Run。
# 前端仍在 Vercel，這個映像不含 apps/web。
#
# 放在專案根目錄的原因：monorepo 的 lockfile 與 packages/shared-types 都在根目錄，
# 建置時必須一起進到 build context；`gcloud run deploy --source .` 也是在根目錄尋找 Dockerfile。
#
# 本機建置： docker build -t sansoon-api .
# 直接部署： gcloud run deploy sansoon-api --source .   （由 Cloud Build 在雲端建置，本機不需要 Docker）

# ---------- 建置階段 ----------
FROM node:22-slim AS build

# Prisma 需要 openssl，node:slim 沒有內建
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先只複製 package 檔，讓「安裝相依套件」這一層能被快取，改程式碼時不必重裝
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared-types/package.json packages/shared-types/

# --ignore-scripts：此時還沒有 prisma schema，apps/api 的 postinstall（prisma generate）會失敗
RUN npm ci --ignore-scripts

COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types

RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api

# ---------- 執行階段 ----------
FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/package.json ./package.json

# packages/shared-types 的 package.json 指向 src/index.ts，而編譯後的 API 會在執行期
# require("@route-scheduler/shared-types")（validateStaffRoles 是真的函式，不是純型別）。
# 目前本機與 Render 之所以跑得動，是因為 Node 24 預設會自動剝除 TypeScript 型別——
# 那是實驗性行為，用 --no-experimental-strip-types 執行就會 SyntaxError。
# 這裡改成指向編譯後的 JS，任何 Node 18+ 都能穩定執行，不依賴該行為。
RUN rm -rf node_modules/@route-scheduler/shared-types
COPY --from=build /app/apps/api/dist/packages/shared-types/src/index.js \
     ./node_modules/@route-scheduler/shared-types/index.js
RUN printf '{"name":"@route-scheduler/shared-types","version":"0.1.0","main":"index.js"}' \
    > node_modules/@route-scheduler/shared-types/package.json

# Cloud Run 用 PORT 環境變數指定監聽埠（預設 8080），src/index.ts 已經會讀取
EXPOSE 8080
CMD ["node", "apps/api/dist/apps/api/src/index.js"]
