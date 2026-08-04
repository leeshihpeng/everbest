# 後端部署到 Google Cloud Run

前端維持在 Vercel，這份文件只處理 **後端 API**（`apps/api`）。
目的是取代 Render 免費版——Render 閒置後會休眠，第一次請求要等 30–60 秒；
Cloud Run 冷啟動約 1–2 秒，而且用量在免費額度內。

> 這份設定尚未在正式環境跑過。切換前請照「驗證」那一節逐項確認，
> 確認沒問題再改前端網址；在那之前 Render 可以繼續服務，兩邊並存不會互相影響。

## 一、事前準備

1. 一個已啟用計費的 GCP 專案（用量會落在免費額度內，但 Cloud Run 需要綁定計費帳戶）
2. 安裝 [gcloud CLI](https://cloud.google.com/sdk/docs/install)，然後：

```bash
gcloud auth login
gcloud config set project <你的專案ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

本機**不需要安裝 Docker**，建置會在 Cloud Build 上進行。

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

在專案根目錄執行：

```bash
gcloud run deploy sansoon-api --source . --region asia-east1 --allow-unauthenticated
```

- `asia-east1` 是台灣機房，離使用者最近
- `--allow-unauthenticated`：這是公開 API，權限由程式自己的登入機制控管
- 第一次會問要不要建立 Artifact Registry 儲存庫，選 Yes

設定環境變數（一次設完，值請自行替換）：

```bash
gcloud run services update sansoon-api --region asia-east1 \
  --set-env-vars "DATABASE_URL=...,JWT_SECRET=...,CORS_ORIGINS=https://everbest-web-jade.vercel.app,GOOGLE_MAPS_API_KEY=...,LINE_CHANNEL_ACCESS_TOKEN=...,IMPORT_API_KEY=..."
```

> 連線字串裡若含有 `,` 會被誤判成分隔符。遇到這種情況改用 `--env-vars-file env.yaml`，
> 並記得該檔案含機密、不要 commit。

## 四、資料庫 migration

**不要放在容器啟動時執行**——Cloud Run 會同時起多個實例，可能互相衝突。
需要套用新的 migration 時，從本機執行即可（跟現在的作法一樣）：

```bash
cd apps/api
npx prisma migrate deploy
```

## 五、驗證（切換前務必做完）

部署完成後 gcloud 會給一個網址，例如 `https://sansoon-api-xxxx.a.run.app`。

1. **服務有起來、環境變數有讀到**

```bash
curl https://<新網址>/health
```

`hasJwtSecret`、`hasImportKey` 要是 `true`，`corsCount` 要大於 0。

2. **冷啟動時間**（閒置十幾分鐘後再測，這是換平台的主要目的）

```bash
curl -o NUL -s -w "%{time_total}s\n" https://<新網址>/health
```

3. **登入與資料讀取**：用瀏覽器開 `https://<新網址>/health` 確認可連，
   再依下一節把前端指過去，實際登入操作一輪（派遣單、貨物追蹤、檢驗報告）。

## 六、切換前端

Vercel 專案 → Settings → Environment Variables → 把 `VITE_API_BASE_URL` 改成新網址，
然後重新部署前端：

```bash
npx vercel --prod
```

同時把 Cloud Run 的 `CORS_ORIGINS` 設成前端網址，否則瀏覽器會被 CORS 擋掉。

## 七、留意事項

- **冷啟動仍然存在**，只是從 30–60 秒變成 1–2 秒。若要完全消除，可設
  `--min-instances=1`，但那會離開免費額度、開始計費。
- **Neon 免費版也會休眠**，第一次查詢會多花一兩秒，偶爾出現連線失敗。
  後端換平台不會改善這一點。
- 切換後 Render 可以先留著不刪，確認新環境穩定運作幾天再關閉。
- 本機自動匯入程式（`tools/auto-import/.env`）的 `API_BASE` 也要改成新網址。
