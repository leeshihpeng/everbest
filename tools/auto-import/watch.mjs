// 三順自動匯入（派遣單 + 貨物追蹤託運報表）— 在公司電腦上常駐執行。
//
// 為什麼要有這支程式：後端跑在 Render 雲端，讀不到 C:\server 底下的檔案，
// 所以必須由本機程式監看資料夾、主動把檔案送上去。
//
// 行為：
//   每 POLL_SECONDS 秒掃一次資料夾，找出派遣單 CSV 與託運報表 PDF。
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

// 版本字串會寫進日誌。搬到別台電腦時若忘了更新程式，
// 看日誌第一行就能確認那台跑的是哪一版（例如貨物追蹤是 2026-07-30 之後才加的）。
const VERSION = "2026-07-31（派遣單 + 貨物追蹤）";

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
const LOCK_PATH = path.join(HERE, "watch.lock");

if (!IMPORT_KEY) {
  console.error("`.env` 裡的 IMPORT_API_KEY 是空的，請填入與 Render 環境變數相同的金鑰。");
  process.exit(1);
}

const DIR_SELF = env.DIR_SELF || String.raw`C:\server\出貨派遣`;
const DIR_HSINCHU = env.DIR_HSINCHU || String.raw`C:\server\新竹貨運`;
const DIR_DALEN = env.DIR_DALEN || String.raw`C:\server\大榮貨運`;

// 監看規則。同一個資料夾可以有兩種用途：
//   kind=orders    派遣單 CSV（每天覆蓋同一個檔名）→ 內勤後台的派遣單分頁
//   kind=shipments 託運報表 PDF（放在 202607 之類的年月子資料夾）→ 貨物追蹤
const WATCH = [
  { dir: DIR_SELF, kind: "orders", carrier: "SELF", label: "派遣單", match: /\.(csv|txt)$/i, todayOnly: true },
  { dir: DIR_HSINCHU, kind: "orders", carrier: "新竹貨運", label: "新竹派遣單", match: /\.(csv|txt)$/i, todayOnly: true },
  { dir: DIR_DALEN, kind: "orders", carrier: "大榮貨運", label: "大榮派遣單", match: /\.(csv|txt)$/i, todayOnly: true },
  // 託運報表不限當天：報表可能是前幾天出的，只要內容有更新就重新匯入並覆蓋上次版本。
  // 檔案放在年月子資料夾，所以要往下找。
  { dir: DIR_HSINCHU, kind: "shipments", label: "新竹貨物追蹤", match: /^pdfsummary.*\.pdf$/i, recursive: true },
  { dir: DIR_DALEN, kind: "shipments", label: "大榮貨物追蹤", match: /^reportdetails.*\.pdf$/i, recursive: true },
];

function log(msg) {
  const line = `[${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_PATH, line + "\n", "utf8");
  } catch {
    // 寫不了日誌不該讓監看停擺
  }
}

/** 只允許一個監看程式在跑。登入自動啟動的那個還在背景執行時，
 *  又手動開一個的話，兩邊會共用同一份狀態檔而互相覆蓋，造成同一個檔案被重覆匯入。 */
function acquireLock() {
  const staleAfterMs = Math.max(POLL_SECONDS * 3, 180) * 1000;
  try {
    const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
    const age = Date.now() - Date.parse(lock.heartbeat);
    let alive = false;
    try {
      process.kill(lock.pid, 0); // 只探測程序在不在，不會真的送出訊號
      alive = true;
    } catch {
      alive = false;
    }
    if (alive && age < staleAfterMs) {
      log(`已有另一個監看程式在執行（PID ${lock.pid}），這次不重覆啟動。`);
      process.exit(0);
    }
  } catch {
    // 沒有鎖檔或內容壞掉，視同沒人在跑
  }
  heartbeat();
}

function heartbeat() {
  try {
    writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, heartbeat: new Date().toISOString() }), "utf8");
  } catch {
    // 寫不了鎖檔不該讓監看停擺
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

async function post(endpoint, form) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "X-Import-Key": IMPORT_KEY },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${body.error ?? ""}`);
  return body;
}

async function importFile(filePath, rule) {
  const buffer = readFileSync(filePath);
  const name = path.basename(filePath);

  if (rule.kind === "shipments") {
    // 貨物追蹤：後端會自動辨識是新竹還是大榮的報表，並覆蓋同一天的舊資料
    const form = new FormData();
    form.append("files", new Blob([buffer]), name);
    const body = await post("/shipments/import", form);
    const parts = [`匯入 ${body.imported ?? 0}`];
    if (body.replaced) parts.push(`覆蓋上次 ${body.replaced}`);
    if (body.purged) parts.push(`清除兩週前 ${body.purged}`);
    if (body.unclassified) parts.push(`未分類 ${body.unclassified}`);
    log(`${rule.label} ← ${name}：${parts.join("・")}`);
    if (body.errors?.length) log(`  ⚠ ${body.errors.join("；")}`);
    return body;
  }

  const form = new FormData();
  form.append("file", new Blob([buffer]), name);
  form.append("carrier", rule.carrier);
  const body = await post("/orders/import", form);
  const parts = [`新增 ${body.createdCount ?? 0}`];
  if (body.updatedCount) parts.push(`更新 ${body.updatedCount}`);
  if (body.skippedCount) parts.push(`略過 ${body.skippedCount}（已在作業中）`);
  if (body.purged) parts.push(`清除舊單 ${body.purged}`);
  if (body.noteCount) parts.push(`附註 ${body.noteCount}`);
  log(`${rule.label} ← ${name}：${parts.join("・")}`);
  if (body.errors?.length) log(`  ⚠ ${body.errors.join("；")}`);
  return body;
}

/** 列出資料夾內符合條件的檔案；recursive 時連年月子資料夾一起找 */
function listFiles(dir, match, recursive) {
  const found = [];
  const walk = (d, depth) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (recursive && depth < 3) walk(full, depth + 1);
      } else if (match.test(e.name)) {
        found.push(full);
      }
    }
  };
  walk(dir, 0);
  return found;
}

// 記住上一輪看到的大小／時間戳，用來判斷檔案是不是還在寫入
const lastSeen = new Map();

async function scanOnce() {
  heartbeat();
  const state = loadState();

  for (const rule of WATCH) {
    if (!existsSync(rule.dir)) continue;

    for (const filePath of listFiles(rule.dir, rule.match, rule.recursive)) {
      const name = path.basename(filePath);

      let st;
      try {
        st = statSync(filePath);
      } catch {
        continue;
      }
      if (!st.isFile() || st.size === 0) continue;
      // 派遣單每天覆蓋同一個檔名，只處理當日更新的，避免把舊檔又匯一次；
      // 託運報表則不限日期，只看內容有沒有變。
      if (rule.todayOnly && !isToday(st.mtime)) continue;

      // 檔案可能正在被寫入：大小或時間戳跟上一輪不同就先跳過，下一輪再看
      const fingerprint = `${st.size}|${st.mtimeMs}`;
      if (lastSeen.get(filePath) !== fingerprint) {
        lastSeen.set(filePath, fingerprint);
        continue;
      }

      const hash = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      if (state[filePath]?.hash === hash) continue; // 內容和上次匯入的一樣

      try {
        await importFile(filePath, rule);
        state[filePath] = { hash, importedAt: new Date().toISOString() };
        saveState(state);
      } catch (err) {
        log(`${rule.label} ← ${name}：匯入失敗（${err.message}），下一輪會重試`);
      }
    }
  }
}

acquireLock();
log(`開始監看 v${VERSION}（每 ${POLL_SECONDS} 秒掃一次）→ ${API_BASE}`);
for (const w of WATCH) {
  if (!existsSync(w.dir)) {
    mkdirSync(w.dir, { recursive: true });
    log(`已建立資料夾 ${w.dir}`);
  }
  // 一併印出目前掃到幾個符合的檔案：若貨物追蹤顯示 0 個，
  // 就知道是檔名或路徑不對，而不是程式沒跑
  const n = listFiles(w.dir, w.match, w.recursive).length;
  log(`  監看 ${w.dir}${w.recursive ? "（含子資料夾）" : ""} → ${w.label}：目前符合的檔案 ${n} 個`);
}

// 上一輪還沒跑完就不要再開一輪：上傳 PDF 或 Render 冷啟動可能花上幾十秒，
// 兩輪重疊會各自讀到還沒更新的狀態檔，同一個檔案就被重覆匯入。
let scanning = false;
async function tick() {
  if (scanning) return;
  scanning = true;
  try {
    await scanOnce();
  } catch (err) {
    log(`掃描發生未預期錯誤：${err.message}`);
  } finally {
    scanning = false;
  }
}

await tick();
setInterval(tick, POLL_SECONDS * 1000);
