import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const quotesRouter = Router();

// 永遠只保留一份，固定用這個 id
const SHEET_ID = "singleton";

quotesRouter.use(requireAuth);

// 取得報價單檔案資訊（不含內容）— 業務與主管皆可
quotesRouter.get("/", requireRole(["SALES", "MANAGER"]), async (_req, res, next) => {
  try {
    const sheet = await prisma.quoteSheet.findUnique({
      where: { id: SHEET_ID },
      select: { fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true, uploadedBy: true },
    });
    res.json(sheet ?? null);
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

    const decoded = Buffer.from(req.file.originalname, "latin1").toString("utf8").replace(/\.pdf$/i, "");
    const fileName = decoded.includes("�") ? req.file.originalname.replace(/\.pdf$/i, "") : decoded;

    await prisma.quoteSheet.upsert({
      where: { id: SHEET_ID },
      update: {
        fileName,
        mimeType: "application/pdf",
        sizeBytes: req.file.buffer.length,
        content: req.file.buffer,
        uploadedAt: new Date(),
        uploadedBy: req.staff?.name ?? null,
      },
      create: {
        id: SHEET_ID,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: req.file.buffer.length,
        content: req.file.buffer,
        uploadedBy: req.staff?.name ?? null,
      },
    });

    res.json({ fileName });
  } catch (err) {
    next(err);
  }
});
