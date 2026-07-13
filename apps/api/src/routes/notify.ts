import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, AuthedRequest } from "../middleware/auth";
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

notifyRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json(notification);
  } catch (err) {
    next(err);
  }
});

// 內部使用：手動觸發 LINE 群組推播（例如「分享到 LINE 群組」按鈕）
notifyRouter.post("/line", async (req, res, next) => {
  try {
    const { groupId, message } = req.body as { groupId: string; message: string };
    await pushLineMessage(groupId, message);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
