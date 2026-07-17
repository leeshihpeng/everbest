import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";

const prisma = new PrismaClient();
export const reportsRouter = Router();

reportsRouter.use(requireAuth);

// 年份分類清單（每年幾份報告）— 業務與主管皆可
reportsRouter.get("/years", requireRole(["SALES", "MANAGER"]), async (_req, res, next) => {
  try {
    const grouped = await prisma.inspectionReport.groupBy({
      by: ["year"],
      _count: { _all: true },
      orderBy: { year: "desc" },
    });
    res.json(grouped.map((g) => ({ year: g.year, count: g._count._all })));
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

// 更新報告日期（例如補填掃描檔缺少的日期）— 僅主管
reportsRouter.patch("/:id", requireRole("MANAGER"), async (req, res, next) => {
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

// 刪除檢驗報告 — 僅主管
reportsRouter.delete("/:id", requireRole("MANAGER"), async (req, res, next) => {
  try {
    await prisma.inspectionReport.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
