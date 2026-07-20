import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { pushLineMessage } from "../services/lineNotify";

const prisma = new PrismaClient();
export const notifyRouter = Router();
notifyRouter.use(requireAuth);

// 該員工的未讀通知（App 內提示角標，對應 5.4 通知管道）
notifyRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { staffId: req.staff!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

notifyRouter.patch("/:id/read", async (req: AuthedRequest, res, next) => {
  try {
    // 只能標記自己的通知；否則任何登入者都能改別人的通知狀態
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.staffId !== req.staff!.id) {
      return res.status(404).json({ error: "找不到通知" });
    }
    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

notifyRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.staffId !== req.staff!.id) {
      return res.status(404).json({ error: "找不到通知" });
    }
    await prisma.notification.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// 內部使用：手動觸發 LINE 群組推播（例如「分享到 LINE 群組」按鈕）。
// 未限制角色的話，任何登入者都能對任意群組發送任意內容（可被用來冒名發訊息）。
notifyRouter.post("/line", requireRole(["MANAGER", "ADMIN"]), async (req, res, next) => {
  try {
    const { groupId, message } = req.body as { groupId: string; message: string };
    await pushLineMessage(groupId, message);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
