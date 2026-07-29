// 三順派遣單自動匯入 — 在公司這台 Windows 電腦上常駐執行。
//
// 為什麼要有這支程式：後端跑在 Render 雲端，讀不到 C:\server 底下的檔案，
// 所以必須由本機程式監看資料夾、主動把檔案送上去。
//
// 行為：
//   每 POLL_SECONDS 秒掃一次三個資料夾，找出「今天有更新」的 CSV／TXT。
//   檔案內容的 SHA-256 與上次匯入的不同才會上傳（ERP 覆蓋同一個檔名也認得出來）。
//   檔案還在寫入時（大小或時間戳還在變）會等下一輪再處理，避免匯入到半截的檔案。
//   後端以「配送方式＋送貨日期＋客戶代號」判斷同一張派遣單，重覆送不會產生重複資料。
//
// 設定：把 .env.example 複製成 .env 填好；安裝成開機自動執行請看 README.md。

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(HERE, ".env");
  if (!existsSync(envPath)) {
    console.error(`找不到設定檔 ${envPath}，請先把 .env.example 複製成 .env 並填好。`);
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const API_BASE = (env.API_BASE || "https://everbest.onrender.com").replace(/\/+$/, "");
const IMPORT_KEY = env.IMPORT_API_KEY || "";
const POLL_SECONDS = Number(env.POLL_SECONDS || 60);
const STATE_PATH = path.join(HERE, "state.json");
const LOG_PATH = path.join(HERE, "auto-import.log");

if (!IMPORT_KEY) {
  console.error("`.env` 裡的 IMPORT_API_KEY 是空的，請填入與 Render 環境變數相同的金鑰。");
  process.exit(1);
}

// 資料夾 → 配送方式。與內勤後台的三個分頁一一對應。
// 路徑走設定檔，換一台電腦（例如搬到工作電腦）只要改 .env，不必動程式。
const WATCH = [
  { dir: env.DIR_SELF || String.raw`C:\server\出貨派遣`, carrier: "SELF", label: "派遣單" },
  { dir: env.DIR_HSINCHU || String.raw`C:\server\新竹貨運`, carrier: "新竹貨運", label: "新竹派遣單" },
  { dir: env.DIR_DALEN || String.raw`C:\server\大榮貨運`, carrier: "大榮貨運", label: "大榮派遣單" },
];

const IMPORTABLE = /\.(csv|txt)$/i;

function log(msg) {
  const line = `[${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_PATH, line + "\n", "utf8");
  } catch {
    // 寫不了日誌不該讓監看停擺
  }
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function isToday(d) {
  const tw = (x) => new Date(x.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return tw(d) === tw(new Date());
}

async function importFile(filePath, carrier, label) {
  const buffer = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer]), path.basename(filePath));
  form.append("carrier", carrier);

  const res = await fetch(`${API_BASE}/orders/import`, {
    method: "POST",
    headers: { "X-Import-Key": IMPORT_KEY },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${body.error ?? ""}`);

  const parts = [`新增 ${body.createdCount ?? 0}`];
  if (body.updatedCount) parts.push(`更新 ${body.updatedCount}`);
  if (body.skippedCount) parts.push(`略過 ${body.skippedCount}（已在作業中）`);
  if (body.purged) parts.push(`清除舊單 ${body.purged}`);
  if (body.noteCount) parts.push(`附註 ${body.noteCount}`);
  log(`${label} ← ${path.basename(filePath)}：${parts.join("・")}`);
  if (body.errors?.length) log(`  ⚠ ${body.errors.join("；")}`);
  return body;
}

// 記住上一輪看到的大小／時間戳，用來判斷檔案是不是還在寫入
const lastSeen = new Map();

async function scanOnce() {
  const state = loadState();

  for (const { dir, carrier, label } of WATCH) {
    if (!existsSync(dir)) continue;

    for (const name of readdirSync(dir)) {
      if (!IMPORTABLE.test(name)) continue;
      const filePath = path.join(dir, name);

      let st;
      try {
        st = statSync(filePath);
      } catch {
        continue;
      }
      if (!st.isFile() || st.size === 0) continue;
      if (!isToday(st.mtime)) continue; // 只處理當日更新的檔案

      // 檔案可能正在被 ERP 寫入：大小或時間戳跟上一輪不同就先跳過，下一輪再看
      const fingerprint = `${st.size}|${st.mtimeMs}`;
      if (lastSeen.get(filePath) !== fingerprint) {
        lastSeen.set(filePath, fingerprint);
        continue;
      }

      const hash = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      if (state[filePath]?.hash === hash) continue; // 內容和上次匯入的一樣

      try {
        await importFile(filePath, carrier, label);
        state[filePath] = { hash, importedAt: new Date().toISOString() };
        saveState(state);
      } catch (err) {
        log(`${label} ← ${name}：匯入失敗（${err.message}），下一輪會重試`);
      }
    }
  }
}

log(`開始監看（每 ${POLL_SECONDS} 秒掃一次）→ ${API_BASE}`);
for (const w of WATCH) {
  if (!existsSync(w.dir)) {
    mkdirSync(w.dir, { recursive: true });
    log(`已建立資料夾 ${w.dir}`);
  }
  log(`  監看 ${w.dir} → ${w.label}`);
}

await scanOnce();
setInterval(() => {
  scanOnce().catch((err) => log(`掃描發生未預期錯誤：${err.message}`));
}, POLL_SECONDS * 1000);
