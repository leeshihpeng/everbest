// 將本機 C:\Claude\輸入許可證 下各產品項目資料夾的檔案匯入正式資料庫。
// 產品項目 = 資料夾名（照抄，例如「A 杏仁粒」）；檔名照抄（去副檔名）。
// 檔案日期取自檔名的民國日期（例如 116 11 14 → 2027-11-14），取不到則用檔案修改時間。
// 可重複執行：同產品項目+同檔名會更新內容，不會重複建立。
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const ROOT = "C:/Claude/輸入許可證";

function parseRocDateFromName(name) {
  const m = name.match(/(1[1-2][0-9])\s*(0[1-9]|1[0-2])\s*(0[1-9]|[12][0-9]|3[01])/);
  if (!m) return null;
  const d = new Date(`${Number(m[1]) + 1911}-${m[2]}-${m[3]}`);
  return isNaN(d.getTime()) ? null : d;
}

function mimeOf(file) {
  if (/\.pdf$/i.test(file)) return "application/pdf";
  if (/\.jpe?g$/i.test(file)) return "image/jpeg";
  if (/\.png$/i.test(file)) return "image/png";
  return null; // Thumbs.db / desktop.ini 等一律略過
}

const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
console.log(`找到 ${dirs.length} 個產品項目資料夾`);

let created = 0, updated = 0, skipped = 0, noDate = 0;

for (const dir of dirs) {
  const dirPath = path.join(ROOT, dir.name);
  const files = fs.readdirSync(dirPath).filter((f) => fs.statSync(path.join(dirPath, f)).isFile());
  let inDir = 0;

  for (const f of files) {
    const mimeType = mimeOf(f);
    if (!mimeType) { skipped++; continue; }

    const full = path.join(dirPath, f);
    const fileName = f.replace(/\.[^.]+$/, "");
    const content = fs.readFileSync(full);
    const parsed = parseRocDateFromName(fileName);
    if (!parsed) noDate++;
    const fileDate = parsed ?? fs.statSync(full).mtime;

    const existing = await prisma.importPermit.findFirst({ where: { category: dir.name, fileName } });
    if (existing) {
      await prisma.importPermit.update({
        where: { id: existing.id },
        data: { content, sizeBytes: content.length, fileDate, mimeType },
      });
      updated++;
    } else {
      await prisma.importPermit.create({
        data: { category: dir.name, fileName, fileDate, mimeType, sizeBytes: content.length, content },
      });
      created++;
    }
    inDir++;
  }
  console.log(`  [${dir.name}] ${inDir} 個檔案`);
}

console.log(`\n完成：新增 ${created}、更新 ${updated}、略過非文件檔 ${skipped}、檔名無日期改用檔案時間 ${noDate}`);
await prisma.$disconnect();
