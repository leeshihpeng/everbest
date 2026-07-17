import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const permitsRouter = Router();

permitsRouter.use(requireAuth);

// multer/busboy 以 latin1 解讀 multipart 檔名位元組，中文檔名需轉回 UTF-8
function decodeFileName(name: string): string {
  const converted = Buffer.from(name, "latin1").toString("utf8");
  return converted.includes("�") ? name : converted;
}

// 檔名中的民國日期（例如「A 116 11 14 Ever Best」→ 民國116年11月14日 = 2027-11-14）。
// 允許數字間有空白或黏在一起；有多個日期時取第一個。取不到回 null。
export function parseRocDateFromName(name: string): Date | null {
  const m = name.match(/(1[1-2][0-9])\s*(0[1-9]|1[0-2])\s*(0[1-9]|[12][0-9]|3[01])/);
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  const date = new Date(`${year}-${m[2]}-${m[3]}`);
  return isNaN(date.getTime()) ? null : date;
}

// 產品項目清單（每項幾份許可證）— 業務與主管皆可
permitsRouter.get("/categories", requireRole(["SALES", "MANAGER"]), async (_req, res, next) => {
  try {
    const grouped = await prisma.importPermit.groupBy({
      by: ["category"],
      _count: { _all: true },
      orderBy: { category: "asc" },
    });
    res.json(grouped.map((g) => ({ category: g.category, count: g._count._all })));
  } catch (err) {
    next(err);
  }
});

// 許可證列表（不含檔案內容）；可用 ?category=... 篩選，依檔案日期由新到舊 — 業務與主管皆可
permitsRouter.get("/", requireRole(["SALES", "MANAGER"]), async (req, res, next) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const permits = await prisma.importPermit.findMany({
      where: category ? { category } : {},
      select: { id: true, category: true, fileName: true, fileDate: true, sizeBytes: true, mimeType: true, createdAt: true },
      orderBy: [{ fileDate: "desc" }, { fileName: "asc" }],
    });
    res.json(permits);
  } catch (err) {
    next(err);
  }
});

// 檔案內容（預覽 / 下載）— 業務與主管皆可
permitsRouter.get("/:id/file", requireRole(["SALES", "MANAGER"]), async (req, res, next) => {
  try {
    const permit = await prisma.importPermit.findUnique({ where: { id: req.params.id } });
    if (!permit) return res.status(404).json({ error: "找不到輸入許可證" });
    const ext = permit.mimeType === "application/pdf" ? "pdf" : permit.mimeType.split("/")[1] || "bin";
    res.setHeader("Content-Type", permit.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="permit-${permit.id}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${permit.fileName}.${ext}`)}`
    );
    res.send(Buffer.from(permit.content));
  } catch (err) {
    next(err);
  }
});

// 上傳輸入許可證 — 僅最高權限者（ADMIN）。category 為必填（在哪個產品項目底下上傳）。
// 檔案日期取自檔名的民國日期，取不到則用上傳當下時間。
permitsRouter.post("/import", requireRole("ADMIN"), upload.array("files"), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) return res.status(400).json({ error: "請選擇要上傳的檔案" });

    const category = (req.body as { category?: string }).category?.trim();
    if (!category) return res.status(400).json({ error: "請指定產品項目" });

    const imported: { fileName: string; fileDate: string }[] = [];
    const errors: string[] = [];

    for (const f of files) {
      const original = decodeFileName(f.originalname);
      const fileName = original.replace(/\.[^.]+$/, "");
      const mimeType = /\.pdf$/i.test(original)
        ? "application/pdf"
        : /\.(jpe?g)$/i.test(original)
        ? "image/jpeg"
        : /\.png$/i.test(original)
        ? "image/png"
        : null;
      if (!mimeType) {
        errors.push(`${fileName}: 僅支援 PDF 或圖檔（略過）`);
        continue;
      }

      const fileDate = parseRocDateFromName(fileName) ?? new Date();

      const existing = await prisma.importPermit.findFirst({ where: { category, fileName } });
      if (existing) {
        await prisma.importPermit.update({
          where: { id: existing.id },
          data: { content: f.buffer, sizeBytes: f.buffer.length, fileDate, mimeType },
        });
      } else {
        await prisma.importPermit.create({
          data: { category, fileName, fileDate, mimeType, sizeBytes: f.buffer.length, content: f.buffer },
        });
      }
      imported.push({ fileName, fileDate: fileDate.toISOString() });
    }

    res.json({ importedCount: imported.length, imported, errors });
  } catch (err) {
    next(err);
  }
});

// 刪除輸入許可證 — 僅最高權限者（ADMIN）
permitsRouter.delete("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.importPermit.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
