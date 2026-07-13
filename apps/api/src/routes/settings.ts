import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { geocodeAddress } from "../services/googleMaps";

const prisma = new PrismaClient();
export const settingsRouter = Router();
settingsRouter.use(requireAuth);

// 公司地址／座標，業務與物流模式的「出發地/目的地＝公司」選項需要用到
settingsRouter.get("/", async (_req, res, next) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { id: "singleton" } });
    res.json(setting);
  } catch (err) {
    next(err);
  }
});

settingsRouter.put("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { companyAddress } = req.body as { companyAddress: string };
    if (!companyAddress) return res.status(400).json({ error: "缺少公司地址" });

    const coords = await geocodeAddress(companyAddress);
    const setting = await prisma.systemSetting.upsert({
      where: { id: "singleton" },
      update: { companyAddress, companyLat: coords?.lat, companyLng: coords?.lng },
      create: { id: "singleton", companyAddress, companyLat: coords?.lat, companyLng: coords?.lng },
    });
    res.json(setting);
  } catch (err) {
    next(err);
  }
});
