import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const publicRouter = Router();

// 對外公開的檢驗報告連結（不需登入）——供業務用 LINE／Email 分享給客戶。
// 以隨機且唯一的 shareToken 辨識，猜不到就打不開；只提供讀取，不列出清單。
publicRouter.get("/reports/:shareToken", async (req, res, next) => {
  try {
    const report = await prisma.inspectionReport.findUnique({ where: { shareToken: req.params.shareToken } });
    if (!report) return res.status(404).send("找不到檢驗報告，連結可能已失效。");

    res.setHeader("Content-Type", report.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(`${report.fileName}.pdf`)}`
    );
    // 公開連結不進快取伺服器，降低外流風險
    res.setHeader("Cache-Control", "private, no-store");
    res.send(Buffer.from(report.content));
  } catch (err) {
    next(err);
  }
});
