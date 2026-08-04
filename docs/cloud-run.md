# 後端部署到 Google Cloud Run

前端維持在 Vercel，這份文件只處理 **後端 API**（`apps/api`）。
目的是取代 Render 免費版——Render 閒置後會休眠，第一次請求要等 30–60 秒；
Cloud Run 冷啟動約 1–2 秒，而且用量在免費額度內。

## 目前狀態（2026-08-04）

已部署完成，但**還沒切換**：前端仍指向 Render，Render 也還在跑。兩邊並存不互相影響。

| 項目 | 值 |
|---|---|
| GCP 專案 | `sansoon-route` |
| 服務 | `sansoon-api`（region `asia-east1`） |
| 網址 | https://sansoon-api-702692123354.asia-east1.run.app |

尚未完成：`LINE_CHANNEL_ACCESS_TOKEN` 還沒設（本機 `.env` 是空的，值只在 Render 上），
所以 Cloud Run 目前**不會發 LINE 推播**。切換前要從 Render 的 Environment 頁面複製過來。

## 一、事前準備

1. 一個已啟用計費的 GCP 專案（用量會落在免費額度內，但 Cloud Run 需要綁定計費帳戶）
2. 安裝 [gcloud CLI](https://cloud.google.com/sdk/docs/install)，然後：

```bash
gcloud auth login
gcloud config set project sansoon-route
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

本機**不需要安裝 Docker**，建置會在 Cloud Build 上進行。

> **Windows PowerShell**：執行原則會擋掉 `gcloud.ps1`，指令要打 `gcloud.cmd`
>（跟 `npm.cmd`、`vercel.cmd` 同樣的狀況）。不需要為此改任何安全設定。

### 首次部署會卡的 IAM 權限

`--source` 部署是由**預設 compute 服務帳戶**去跑 Cloud Build，該帳戶預設權限不足，
第一次會直接 `PERMISSION_DENIED`。這個專案已經補上，換新專案時要重跑：

```bash
gcloud projects add-iam-policy-binding sansoon-route \
  --member=serviceAccount:702692123354-compute@developer.gserviceaccount.com \
  --role=roles/cloudbuild.builds.builder
```

同樣方式再加 `roles/logging.logWriter`、`roles/artifactregistry.writer`、`roles/storage.objectAdmin`。

## 二、環境變數

Render 上現有的設定要一併搬過去。清單如下（值請從 Render 的 Environment 頁面複製，
或從 `apps/api/.env` 取得——**注意那份檔案含正式資料庫密碼，不要外流**）：

| 變數 | 用途 | 沒設定會怎樣 |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL 連線字串 | 服務起不來 |
| `JWT_SECRET` | 簽發登入憑證 | **正式環境會直接拒絕啟動**（刻意設計） |
| `CORS_ORIGINS` | 允許的前端來源，逗號分隔 | 不設會開放所有來源 |
| `GOOGLE_MAPS_API_KEY` | 地址轉座標、路線規劃 | 改用直線距離估算 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 推播 | 推播功能失效 |
| `IMPORT_API_KEY` | 本機自動匯入程式的金鑰 | 自動匯入會被擋（401） |

**不要設 `PORT`**——Cloud Run 會自己注入。

## 三、部署

環境變數要跟程式碼**同一次**送上去。少了 `JWT_SECRET`，容器會照設計拒絕啟動
（部署會失敗並顯示「缺少環境變數 JWT_SECRET…」——這代表防護有效，不是 bug）。

先在**暫存目錄**（不要放在 repo 內）寫一份 `cloudrun-env.yaml`，值一律用雙引號包住，
因為 Neon 連線字串含 `:` `?` `&`：

```yaml
DATABASE_URL: "postgresql://..."
JWT_SECRET: "..."
GOOGLE_MAPS_API_KEY: "..."
IMPORT_API_KEY: "..."
CORS_ORIGINS: "https://everbest-web-jade.vercel.app"
LINE_CHANNEL_ACCESS_TOKEN: "..."
```

在專案根目錄執行：

```bash
gcloud run deploy sansoon-api --source . --region asia-east1 --allow-unauthenticated --env-vars-file <暫存路徑>/cloudrun-env.yaml
```

- `asia-east1` 是台灣機房，離使用者最近
- `--allow-unauthenticated`：這是公開 API，權限由程式自己的登入機制控管
- 第一次會問要不要建立 Artifact Registry 儲存庫，選 Yes
- 建置約 6–8 分鐘（含上傳原始碼與 Cloud Build）

**部署完成後把該 YAML 刪掉**——裡面有正式資料庫密碼與 JWT 金鑰。
之後只要改單一變數，用 `gcloud run services update ... --update-env-vars KEY=值` 即可，
不必再寫整份檔案。

## 四、資料庫 migration

**不要放在容器啟動時執行**——Cloud Run 會同時起多個實例，可能互相衝突。
需要套用新的 migration 時，從本機執行即可（跟現在的作法一樣）：

```bash
cd apps/api
npx prisma migrate deploy
```

## 五、驗證（切換前務必做完）

1. **服務有起來、環境變數有讀到**（已驗證通過）

```bash
curl https://sansoon-api-702692123354.asia-east1.run.app/health
```

`hasJwtSecret`、`hasImportKey` 要是 `true`，`corsCount` 要大於 0。
實測回傳：`{"ok":true,"corsRestricted":true,"corsCount":1,"hasJwtSecret":true,"hasImportKey":true}`

2. **資料庫真的連得到**——`/health` 不查資料庫，光看它不夠。
   打一個會查資料庫的端點，回 401「登入已過期」就代表 Prisma 有連上並查了帳號：

```bash
curl -H "Authorization: Bearer invalid" https://sansoon-api-702692123354.asia-east1.run.app/orders
```

3. **冷啟動時間**（閒置十幾分鐘後再測，這是換平台的主要目的）

```bash
curl -o NUL -s -w "%{time_total}s\n" https://sansoon-api-702692123354.asia-east1.run.app/health
```

4. **登入與資料讀取**：依下一節把前端指過去，實際登入操作一輪
   （派遣單、貨物追蹤、檢驗報告、LINE 分享路線）。

## 六、切換前端（尚未執行）

切換是一次做完的三件事，順序不能顛倒，否則會有一段時間打不通：

1. 先補上 `LINE_CHANNEL_ACCESS_TOKEN`（值從 Render 的 Environment 頁面複製）：

```bash
gcloud run services update sansoon-api --region asia-east1 --update-env-vars LINE_CHANNEL_ACCESS_TOKEN=<值>
```

2. Vercel 專案 → Settings → Environment Variables → 把 `VITE_API_BASE_URL`
   改成 `https://sansoon-api-702692123354.asia-east1.run.app`，然後重新部署前端：

```bash
npx vercel --prod
```

3. 本機自動匯入程式 `tools/auto-import/.env` 的 `API_BASE` 也改成新網址，重啟 watcher。

`CORS_ORIGINS` 已經設成 `https://everbest-web-jade.vercel.app`，不用再動。

## 七、Dockerfile 的兩個地雷

- **shared-types 不能照 workspace 的樣子留在映像裡。** `packages/shared-types` 的
  `main` 指向 `src/index.ts`；本機之所以能跑，是因為 Node ≥23 會自動剝掉 TypeScript 型別。
  Node 22 沒這功能，一 `require` 就 SyntaxError。所以執行階段把整包換成編譯後的
  `index.js` 加一份最小 `package.json`。**別把它改回直接複製原始碼。**
- **`.dockerignore` 一定要擋掉所有 `.env`**：`apps/api/.env` 內含正式 Neon 連線字串，
  進了映像等於把密碼放進 Artifact Registry。

## 八、留意事項

- **冷啟動仍然存在**，只是從 30–60 秒變成 1–2 秒。若要完全消除，可設
  `--min-instances=1`，但那會離開免費額度、開始計費。
- **Neon 免費版也會休眠**，第一次查詢會多花一兩秒，偶爾出現連線失敗。
  後端換平台不會改善這一點。
- 切換後 Render 可以先留著不刪，確認新環境穩定運作幾天再關閉。
- Cloud Run 會同時起多個實例，這跟 Render 單一實例不同：任何「靠記憶體存狀態」的
  作法（例如登入失敗鎖定的計數）在多實例下會失準。目前登入鎖定是記憶體計數，
  切換後鎖定門檻實質上會變寬鬆——不影響安全底線（密碼仍要對），但要知道有這回事。
