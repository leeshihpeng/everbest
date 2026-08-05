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
const VERSION = "2026-08-05（派遣單只收檔名帶日期的檔案 + 含子資料夾）";

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
// 預設打 Cloud Run（2026-08-04 起的正式後端）。舊的 Render 網址還活著，
// 但已無人使用，遲早會關掉——.env 裡若還寫著 onrender 要一併改掉。
const API_BASE = (env.API_BASE || "https://sansoon-api-702692123354.asia-east1.run.app").replace(/\/+$/, "");
const IMPORT_KEY = env.IMPORT_API_KEY || "";
const POLL_SECONDS = Number(env.POLL_SECONDS || 60);
// 當天的派遣單即使內容沒變，每隔這麼久也重送一次，讓被刪掉的資料能自己補回來。
// 設 0 可關掉（就回到只看內容有沒有變的舊行為）。
const RECHECK_MINUTES = Number(env.RECHECK_MINUTES ?? 15);
const STATE_PATH = path.join(HERE, "state.json");
const LOG_PATH = path.join(HERE, "auto-import.log");
const LOCK_PATH = path.join(HERE, "watch.lock");

if (!IMPORT_KEY) {
  console.error("`.env` 裡的 IMPORT_API_KEY 是空的，請填入與後端 IMPORT_API_KEY 環境變數相同的金鑰。");
  process.exit(1);
}

const DIR_SELF = env.DIR_SELF || String.raw`C:\server\出貨派遣`;
const DIR_HSINCHU = env.DIR_HSINCHU || String.raw`C:\server\新竹貨運`;
const DIR_DALEN = env.DIR_DALEN || String.raw`C:\server\大榮貨運`;
const DIR_YONGCHANG = env.DIR_YONGCHANG || String.raw`C:\server\永昌回頭車`;

/** 檔名裡的日期編號（YYYYMMDD），例如 `出貨派遣單20260730.CSV`、`202607\20260729-2.CSV`。
 *
 *  **沒有日期的一律不匯入**：`新竹轉檔.CSV`／`大榮轉檔.CSV`／`出貨派遣單.CSV` 是 ERP 的工作檔，
 *  內容可能是半成品或上一批的殘留，匯進去會產生錯誤的派遣單（使用者 2026-08-05 指定要略過）。
 *  正式檔一律帶日期，所以「檔名有沒有日期」就是最可靠的判斷依據——
 *  比列黑名單好，因為之後多出別的工作檔也不會誤收。 */
const DATED_NAME = /(^|\D)20\d{6}(\D|$)/;

/** 取檔名裡的日期，用來把同一天的檔案分成一組。取不到就自成一組。 */
function dateKeyOf(filePath) {
  const m = path.basename(filePath).match(/(^|\D)(20\d{6})(\D|$)/);
  return m ? m[2] : filePath;
}

// 監看規則。同一個資料夾可以有兩種用途：
//   kind=orders    派遣單 CSV（檔名帶日期，可能放在年月子資料夾）→ 內勤後台的派遣單分頁
//   kind=shipments 託運報表 PDF（放在 202607 之類的年月子資料夾）→ 貨物追蹤
//
// 派遣單三個資料夾都設 recursive：新竹／大榮的正式檔放在年月子資料夾裡，
// 出貨派遣目前檔案在最上層、但之後也會改成子資料夾（使用者 2026-08-05 說明），
// 兩種擺法都要收得到。
const WATCH = [
  { dir: DIR_SELF, kind: "orders", carrier: "SELF", label: "派遣單", match: /\.(csv|txt)$/i, todayOnly: true, datedOnly: true, recursive: true },
  { dir: DIR_HSINCHU, kind: "orders", carrier: "新竹貨運", label: "新竹派遣單", match: /\.(csv|txt)$/i, todayOnly: true, datedOnly: true, recursive: true },
  { dir: DIR_DALEN, kind: "orders", carrier: "大榮貨運", label: "大榮派遣單", match: /\.(csv|txt)$/i, todayOnly: true, datedOnly: true, recursive: true },
  // 永昌與回頭車**共用一份匯出檔**（`202608\20260805.CSV`），靠檔案裡的「貨運行ID」欄
  // 分流（4＝永昌、3＝回頭車），所以 carrier 傳 AUTO 讓後端逐列判斷。
  // 檔名規則與新竹／大榮相同：年月子資料夾＋帶日期的檔名。
  {
    dir: DIR_YONGCHANG,
    kind: "orders",
    carrier: "AUTO",
    label: "永昌／回頭車派遣單",
    match: /\.(csv|txt)$/i,
    todayOnly: true,
    datedOnly: true,
    recursive: true,
  },
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

async function importFile(filePath, rule, opts = {}) {
  const buffer = readFileSync(filePath);
  const name = path.basename(filePath);
  // recheck＝內容沒變但時間到了的例行重送，日誌上標出來，
  // 免得看到一堆匯入紀錄以為 ERP 一直在改檔案
  const tag = opts.recheck ? "（例行重送）" : "";

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
  if (body.unassignedCount) parts.push(`⚠ 未指派 ${body.unassignedCount}`);
  if (body.purged) parts.push(`清除舊單 ${body.purged}`);
  if (body.noteCount) parts.push(`附註 ${body.noteCount}`);
  log(`${rule.label}${tag} ← ${name}：${parts.join("・")}`);
  if (body.errors?.length) log(`  ⚠ ${body.errors.join("；")}`);
  return body;
}

/** 列出資料夾內符合條件的檔案。
 *  recursive＝往下找「所有」子資料夾（不限年月那一層，例如 202607\新竹\ 也找得到）。
 *  datedOnly＝檔名必須帶日期編號（見 DATED_NAME），用來排除 ERP 的工作檔。
 *  仍設一個很寬鬆的深度上限，純粹是防止捷徑造成的無限循環。 */
function listFiles(rule) {
  const MAX_DEPTH = 12;
  const found = [];
  const walk = (d, depth) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return; // 沒有權限或資料夾被刪掉，跳過就好
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (rule.recursive && depth < MAX_DEPTH) walk(full, depth + 1);
      } else if (rule.match.test(e.name) && (!rule.datedOnly || DATED_NAME.test(e.name))) {
        found.push(full);
      }
    }
  };
  walk(rule.dir, 0);
  return found;
}

// 記住上一輪看到的大小／時間戳，用來判斷檔案是不是還在寫入
const lastSeen = new Map();

// 同一個原因不要每分鐘洗一次日誌，但也不能完全不講——
// 「為什麼沒有自動匯入」查不出來就是因為跳過時什麼都沒寫。
const skipLogged = new Map();
function logSkipOnce(filePath, reason) {
  if (skipLogged.get(filePath) === reason) return;
  skipLogged.set(filePath, reason);
  log(`  跳過 ${path.basename(filePath)}：${reason}`);
}

async function scanOnce() {
  heartbeat();
  const state = loadState();

  for (const rule of WATCH) {
    if (!existsSync(rule.dir)) {
      logSkipOnce(rule.dir, `資料夾不存在（${rule.label}）`);
      continue;
    }

    const files = listFiles(rule);
    if (files.length === 0) logSkipOnce(rule.dir, `資料夾裡沒有符合的檔案（${rule.label}）`);

    // 先挑出這一輪真正要考慮的檔案，順便帶上修改時間供排序
    const candidates = [];
    for (const filePath of files) {
      let st;
      try {
        st = statSync(filePath);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size === 0) {
        logSkipOnce(filePath, "檔案是空的");
        continue;
      }
      // 派遣單只處理當日的檔案，避免把歷年舊檔又匯一次；託運報表則不限日期，只看內容有沒有變。
      if (rule.todayOnly && !isToday(st.mtime)) {
        // 常見原因：檔案是用複製／同步過來的，複製工具保留了原本的修改時間。
        logSkipOnce(filePath, `修改時間不是今天（${st.mtime.toLocaleString("zh-TW")}），派遣單只收當天的檔案`);
        continue;
      }

      // 檔案可能正在被寫入：大小或時間戳跟上一輪不同就先跳過，下一輪再看
      const fingerprint = `${st.size}|${st.mtimeMs}`;
      if (lastSeen.get(filePath) !== fingerprint) {
        lastSeen.set(filePath, fingerprint);
        continue;
      }
      candidates.push({ filePath, mtimeMs: st.mtimeMs });
    }

    // 同一天常常有多個檔（`出貨派遣單20260805.CSV` 與 `出貨派遣單20260805-1.CSV`），
    // 而且兩種情況都存在：有時是**修訂版**（同一批客戶、內容改了，例如客戶臨時加訂），
    // 有時是**追加單**（完全不同的客戶）。因此不能只取其中一個，但順序很重要——
    // **一律依修改時間由舊到新送**，最新的版本最後寫入才會是最終狀態。
    // （按檔名排序會讓 `-1` 排在無編號的檔案前面，反而讓舊內容蓋掉新的。）
    candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);

    // 每個日期最新的那個檔：例行重送只送它，見下方說明
    const newestOfDay = new Map();
    for (const c of candidates) newestOfDay.set(dateKeyOf(c.filePath), c.filePath);

    for (const { filePath } of candidates) {
      const name = path.basename(filePath);

      const hash = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      const prev = state[filePath];
      const sameContent = prev?.hash === hash;

      // 內容沒變通常就不用再送。但如果資料被刪掉（不管是誤刪還是清理），
      // 光靠雜湊比對永遠不會補回來，看起來就像「自動匯入壞掉了」。
      // 所以當天的派遣單每隔 RECHECK_MINUTES 分鐘強制重送一次——
      // 匯入本身是冪等的（已檢貨的略過、標記刪除的不會復活），重送是安全的。
      // 例行重送只送「同一天最新的那個檔」。把舊修訂版每 15 分鐘重送一遍的話，
      // 客戶臨時加訂的品項會被改回舊數量、送貨人員檢好的貨也會被清掉——
      // 內容真的變了的檔案不受這個限制，一律立刻送。
      const lastImportMs = prev?.importedAt ? Date.parse(prev.importedAt) : 0;
      const isNewestOfDay = newestOfDay.get(dateKeyOf(filePath)) === filePath;
      const dueForRecheck =
        rule.todayOnly &&
        RECHECK_MINUTES > 0 &&
        isNewestOfDay &&
        Date.now() - lastImportMs > RECHECK_MINUTES * 60 * 1000;

      if (sameContent && !dueForRecheck) {
        logSkipOnce(
          filePath,
          isNewestOfDay
            ? `內容與上次匯入相同（${RECHECK_MINUTES} 分鐘後會再確認一次）`
            : "內容與上次匯入相同，且同一天有更新的檔案（不重送舊版本）"
        );
        continue;
      }

      try {
        await importFile(filePath, rule, { recheck: sameContent });
        state[filePath] = { hash, importedAt: new Date().toISOString() };
        saveState(state);
        skipLogged.delete(filePath);
      } catch (err) {
        log(`${rule.label} ← ${name}：匯入失敗（${err.message}），下一輪會重試`);
      }
    }
  }
}

acquireLock();
log(`開始監看 v${VERSION}（每 ${POLL_SECONDS} 秒掃一次）→ ${API_BASE}`);
// 舊後端遲早會關掉，指著它會在某天無聲停止匯入，開機時就講清楚
if (/onrender\.com/.test(API_BASE)) {
  log("  ⚠ 目前指向舊的 Render 後端，請把 .env 的 API_BASE 改成 Cloud Run 網址");
}
log(
  RECHECK_MINUTES > 0
    ? `  當天的派遣單即使內容沒變，每 ${RECHECK_MINUTES} 分鐘也會重送一次（被刪掉的資料會自己補回來）`
    : "  已關閉例行重送（RECHECK_MINUTES=0），只有檔案內容變了才會匯入"
);
for (const w of WATCH) {
  if (!existsSync(w.dir)) {
    mkdirSync(w.dir, { recursive: true });
    log(`已建立資料夾 ${w.dir}`);
  }
  // 一併印出目前掃到幾個符合的檔案：若貨物追蹤顯示 0 個，
  // 就知道是檔名或路徑不對，而不是程式沒跑。
  // 派遣單含子資料夾後總數會是歷年累積的幾千個，所以另外標出「今天的」——
  // 真正會匯入的只有今天那幾個，看總數容易誤判。
  const matched = listFiles(w);
  let detail = `目前符合的檔案 ${matched.length} 個`;
  if (w.todayOnly) {
    const todayCount = matched.filter((f) => {
      try {
        return isToday(statSync(f).mtime);
      } catch {
        return false;
      }
    }).length;
    detail += `，其中今天的 ${todayCount} 個`;
  }
  log(`  監看 ${w.dir}${w.recursive ? "（含子資料夾）" : ""} → ${w.label}：${detail}`);
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
