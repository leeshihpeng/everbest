import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { parseQuotePdf } from "../services/quoteParser";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const quotesRouter = Router();

// 永遠只保留一份，固定用這個 id
const SHEET_ID = "singleton";

quotesRouter.use(requireAuth);

// 取得報價單內容（表格 + 檔案資訊）— 業務與主管皆可
quotesRouter.get("/", requireRole(["SALES", "MANAGER"]), async (_req, res, next) => {
  try {
    const sheet = await prisma.quoteSheet.findUnique({
      where: { id: SHEET_ID },
      select: {
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        uploadedAt: true,
        uploadedBy: true,
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!sheet) return res.json(null);
    res.json(sheet);
  } catch (err) {
    next(err);
  }
});

// 原始檔案（預覽 / 下載）— 業務與主管皆可
quotesRouter.get("/file", requireRole(["SALES", "MANAGER"]), async (_req, res, next) => {
  try {
    const sheet = await prisma.quoteSheet.findUnique({ where: { id: SHEET_ID } });
    if (!sheet) return res.status(404).json({ error: "尚未上傳產品報價單" });
    res.setHeader("Content-Type", sheet.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="quote.pdf"; filename*=UTF-8''${encodeURIComponent(`${sheet.fileName}.pdf`)}`
    );
    res.send(Buffer.from(sheet.content));
  } catch (err) {
    next(err);
  }
});

// 上傳報價單 — 僅最高權限者。整份覆蓋舊檔，永遠只保留一份。
quotesRouter.post("/", requireRole("ADMIN"), upload.single("file"), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "請選擇要上傳的 PDF" });
    if (!/\.pdf$/i.test(req.file.originalname)) return res.status(400).json({ error: "僅支援 PDF 檔案" });

    // 先解析成功才覆蓋，避免舊報價單被清掉卻換不到新的
    let items;
    try {
      items = await parseQuotePdf(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: `PDF 解析失敗（${(e as Error).message}），原報價單保持不變` });
    }
    if (items.length === 0) {
      return res.status(400).json({ error: "讀不到任何產品資料，請確認是三順產品項目表；原報價單保持不變" });
    }

    const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8").replace(/\.pdf$/i, "");
    const safeName = fileName.includes("�") ? req.file.originalname.replace(/\.pdf$/i, "") : fileName;

    // upsert + 重建品項＝整份覆蓋（QuoteItem 設了 onDelete: Cascade，先刪再建）
    await prisma.quoteItem.deleteMany({ where: { sheetId: SHEET_ID } });
    await prisma.quoteSheet.upsert({
      where: { id: SHEET_ID },
      update: {
        fileName: safeName,
        mimeType: "application/pdf",
        sizeBytes: req.file.buffer.length,
        content: req.file.buffer,
        uploadedAt: new Date(),
        uploadedBy: req.staff?.name ?? null,
      },
      create: {
        id: SHEET_ID,
        fileName: safeName,
        mimeType: "application/pdf",
        sizeBytes: req.file.buffer.length,
        content: req.file.buffer,
        uploadedBy: req.staff?.name ?? null,
      },
    });
    await prisma.quoteItem.createMany({ data: items.map((i) => ({ ...i, sheetId: SHEET_ID })) });

    res.json({ itemCount: items.length, fileName: safeName });
  } catch (err) {
    next(err);
  }
});
