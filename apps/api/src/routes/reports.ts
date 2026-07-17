import { Router } from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const reportsRouter = Router();

reportsRouter.use(requireAuth);

// multer/busboy 以 latin1 解讀 multipart 檔名位元組，中文檔名需轉回 UTF-8
function decodeFileName(name: string): string {
  const converted = Buffer.from(name, "latin1").toString("utf8");
  return converted.includes("�") ? name : converted;
}

// 從 PDF 前兩頁抓第一個 YYYY/MM/DD 當報告日期。掃描檔沒有文字層時回 null。
async function extractReportDate(buffer: Buffer): Promise<Date | null> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText({ first: 2 });
    await parser.destroy();
    const m = result.text.match(/20[0-9]{2}\/[0-9]{2}\/[0-9]{2}/);
    return m ? new Date(m[0].replace(/\//g, "-")) : null;
  } catch {
    return null;
  }
}

// 年份分類清單（每年幾份報告）— 業務與主管皆可
reportsRouter.get("/years", requireRole(["SALES", "MANAGER"]), async (_req, res, next) => {
  try {
    // 年份 = 手動建立的目錄（可能是空的）∪ 報告實際存在的年份
    const [folders, grouped] = await Promise.all([
      prisma.reportYear.findMany({ select: { year: true } }),
      prisma.inspectionReport.groupBy({ by: ["year"], _count: { _all: true } }),
    ]);
    const counts = new Map(grouped.map((g) => [g.year, g._count._all]));
    const years = new Set<number>([...folders.map((f) => f.year), ...grouped.map((g) => g.year)]);
    res.json(
      [...years].sort((a, b) => b - a).map((year) => ({ year, count: counts.get(year) ?? 0 }))
    );
  } catch (err) {
    next(err);
  }
});

// 手動新增年份目錄 — 僅最高權限者（ADMIN）
reportsRouter.post("/years", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const year = Number((req.body as { year: unknown }).year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: "年份格式不正確（請輸入 2000～2100 之間的西元年）" });
    }
    await prisma.reportYear.upsert({ where: { year }, update: {}, create: { year } });
    res.status(201).json({ year, count: 0 });
  } catch (err) {
    next(err);
  }
});

// 匯入檢驗報告 PDF — 僅最高權限者（ADMIN）。
// 年份優先採指定的 year，否則依 PDF 內讀到的報告日期自動分類；
// 掃描檔讀不到日期且未指定年份時，該檔會列在 errors 請使用者指定。
reportsRouter.post("/import", requireRole("ADMIN"), upload.array("files"), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) return res.status(400).json({ error: "請選擇要匯入的 PDF 檔案" });

    const body = req.body as { year?: string; reportDate?: string };
    const forcedYear = body.year ? Number(body.year) : null;
    const fallbackDate = body.reportDate ? new Date(body.reportDate) : null;

    const imported: { fileName: string; year: number; reportDate: string | null }[] = [];
    const errors: string[] = [];

    for (const f of files) {
      const fileName = decodeFileName(f.originalname).replace(/\.pdf$/i, "");
      if (!/pdf$/i.test(f.originalname)) {
        errors.push(`${fileName}: 僅支援 PDF 檔案（略過）`);
        continue;
      }

      const extracted = await extractReportDate(f.buffer);
      const reportDate = extracted ?? (fallbackDate && !isNaN(fallbackDate.getTime()) ? fallbackDate : null);
      const year = forcedYear ?? reportDate?.getFullYear() ?? null;

      if (!year) {
        errors.push(`${fileName}: 無法從 PDF 讀取報告日期（可能是掃描檔），請指定年份或報告日期後再匯入`);
        continue;
      }

      await prisma.reportYear.upsert({ where: { year }, update: {}, create: { year } });

      const existing = await prisma.inspectionReport.findFirst({ where: { year, fileName } });
      if (existing) {
        await prisma.inspectionReport.update({
          where: { id: existing.id },
          data: { content: f.buffer, sizeBytes: f.buffer.length, reportDate: reportDate ?? existing.reportDate, mimeType: "application/pdf" },
        });
      } else {
        await prisma.inspectionReport.create({
          data: { year, fileName, content: f.buffer, sizeBytes: f.buffer.length, reportDate, mimeType: "application/pdf" },
        });
      }
      imported.push({ fileName, year, reportDate: reportDate ? reportDate.toISOString() : null });
    }

    res.json({ importedCount: imported.length, imported, errors });
  } catch (err) {
    next(err);
  }
});

// 檢驗報告列表（僅回中繼資料，不含檔案內容）；可用 ?year=2026 篩選 — 業務與主管皆可
reportsRouter.get("/", requireRole(["SALES", "MANAGER"]), async (req, res, next) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const reports = await prisma.inspectionReport.findMany({
      where: year ? { year } : {},
      select: { id: true, year: true, fileName: true, reportDate: true, sizeBytes: true, mimeType: true, createdAt: true },
      orderBy: { fileName: "asc" },
    });
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

// 檔案內容（預覽 / 下載）— 業務與主管皆可。?dl=1 觸發下載，否則內嵌預覽。
reportsRouter.get("/:id/file", requireRole(["SALES", "MANAGER"]), async (req, res, next) => {
  try {
    const report = await prisma.inspectionReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: "找不到檢驗報告" });
    const download = req.query.dl === "1";
    const utf8Name = encodeURIComponent(`${report.fileName}.pdf`);
    res.setHeader("Content-Type", report.mimeType);
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="report-${report.id}.pdf"; filename*=UTF-8''${utf8Name}`);
    res.send(Buffer.from(report.content));
  } catch (err) {
    next(err);
  }
});

// 更新報告日期（例如補填掃描檔缺少的日期）— 僅最高權限者（ADMIN：李世鵬、李世斌）
reportsRouter.patch("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { reportDate } = req.body as { reportDate: string | null };
    const report = await prisma.inspectionReport.update({
      where: { id: req.params.id },
      data: { reportDate: reportDate ? new Date(reportDate) : null },
      select: { id: true, year: true, fileName: true, reportDate: true, sizeBytes: true, mimeType: true, createdAt: true },
    });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// 刪除檢驗報告 — 僅最高權限者（ADMIN：李世鵬、李世斌），物流主管不可刪除
reportsRouter.delete("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.inspectionReport.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
