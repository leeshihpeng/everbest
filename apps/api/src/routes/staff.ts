import { Router } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { StaffRole, validateStaffRoles } from "@route-scheduler/shared-types";
import { geocodeAddress } from "../services/googleMaps";
import { rolesToArray, rolesToString } from "../utils/roles";
import { validatePassword, generateTempPassword } from "../utils/password";

const prisma = new PrismaClient();
export const staffRouter = Router();

staffRouter.use(requireAuth);

staffRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const staff = await prisma.staff.findMany({
      select: { id: true, name: true, roles: true, homeAddress: true, homeLat: true, homeLng: true, lineGroupId: true, salesRegions: true },
    });

    // 住家地址與 LINE 群組屬個資／內部資訊：主管與內勤看得到全部；
    // 其他人（例如送貨人員）只拿得到自己的完整資料，別人的僅保留姓名與角色。
    const roles = req.staff?.roles ?? [];
    const seesAll = roles.includes("MANAGER") || roles.includes("ADMIN");

    res.json(
      staff.map((s) => {
        const base = { ...s, roles: rolesToArray(s.roles), salesRegions: s.salesRegions ? s.salesRegions.split(",") : [] };
        if (seesAll || s.id === req.staff?.id) return base;
        return { ...base, homeAddress: "", homeLat: null, homeLng: null, lineGroupId: null, salesRegions: [] };
      })
    );
  } catch (err) {
    next(err);
  }
});

staffRouter.post("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { name, roles, homeAddress, lineGroupId, password, salesRegions } = req.body as {
      name: string;
      roles: StaffRole[];
      homeAddress: string;
      lineGroupId?: string;
      password: string;
      salesRegions?: string[];
    };

    // 規格書 3.2：物流主管與送貨人員為互斥角色
    if (!validateStaffRoles(roles as any)) {
      return res.status(400).json({ error: "物流主管與送貨人員為互斥角色，不可同時指派" });
    }

    const invalid = validatePassword(password);
    if (invalid) return res.status(400).json({ error: invalid });

    const coords = await geocodeAddress(homeAddress);
    const passwordHash = await bcrypt.hash(password, 10);

    const staff = await prisma.staff.create({
      data: {
        name,
        roles: rolesToString(roles),
        homeAddress,
        lineGroupId,
        passwordHash,
        homeLat: coords?.lat,
        homeLng: coords?.lng,
        salesRegions: salesRegions && salesRegions.length > 0 ? salesRegions.join(",") : null,
      },
    });

    res.status(201).json({ id: staff.id, name: staff.name, roles: rolesToArray(staff.roles), salesRegions: salesRegions ?? [] });
  } catch (err) {
    next(err);
  }
});

// 批次補齊尚未定位（homeLat/homeLng 為 null）的人員住家座標
staffRouter.post("/geocode-missing", requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const targets = await prisma.staff.findMany({ where: { homeLat: null } });
    let updated = 0;
    const errors: string[] = [];

    for (const s of targets) {
      try {
        const coords = await geocodeAddress(s.homeAddress);
        if (!coords) {
          errors.push(`${s.name}: 找不到座標`);
          continue;
        }
        await prisma.staff.update({ where: { id: s.id }, data: { homeLat: coords.lat, homeLng: coords.lng } });
        updated++;
      } catch (e) {
        errors.push(`${s.name}: ${(e as Error).message}`);
      }
    }

    res.json({ total: targets.length, updated, failed: errors.length, errors });
  } catch (err) {
    next(err);
  }
});

// 刪除人員：先清掉關聯的通知，並把該人員指派的派遣單改回未指派，避免留下無法解析的參照
staffRouter.delete("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.notification.deleteMany({ where: { staffId: req.params.id } });
    await prisma.dispatchOrder.updateMany({ where: { assignedDriverId: req.params.id }, data: { assignedDriverId: null } });
    await prisma.staff.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// 忘記密碼：主管重設成一組一次性臨時密碼，當面／電話告知本人，本人登入後會被強制設定新密碼。
// 刻意**不做**「清空密碼讓本人自己設定」——那段空窗期任何知道姓名的人都能搶先接管帳號。
staffRouter.post("/:id/reset-password", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const target = await prisma.staff.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: "找不到人員" });

    const tempPassword = generateTempPassword();
    // passwordChangedAt 讓對方所有既有登入立刻失效——帳號被盜時，重設密碼才真的能把人踢掉
    await prisma.staff.update({
      where: { id: target.id },
      data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true, passwordChangedAt: new Date() },
    });
    // 臨時密碼只在這個回應出現一次，資料庫存的是雜湊值，之後沒有任何地方查得到
    res.json({ tempPassword });
  } catch (err) {
    next(err);
  }
});

staffRouter.put("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { name, roles, homeAddress, lineGroupId, salesRegions } = req.body as {
      name?: string;
      roles?: StaffRole[];
      homeAddress?: string;
      lineGroupId?: string;
      salesRegions?: string[];
    };

    if (roles && !validateStaffRoles(roles as any)) {
      return res.status(400).json({ error: "物流主管與送貨人員為互斥角色，不可同時指派" });
    }

    const updateData: Record<string, unknown> = {
      name,
      roles: roles ? rolesToString(roles) : undefined,
      lineGroupId,
      salesRegions: salesRegions ? (salesRegions.length > 0 ? salesRegions.join(",") : null) : undefined,
    };
    if (homeAddress) {
      updateData.homeAddress = homeAddress;
      const coords = await geocodeAddress(homeAddress);
      if (coords) {
        updateData.homeLat = coords.lat;
        updateData.homeLng = coords.lng;
      }
    }

    const staff = await prisma.staff.update({ where: { id: req.params.id }, data: updateData });
    res.json({ id: staff.id, name: staff.name, roles: rolesToArray(staff.roles), salesRegions: staff.salesRegions ? staff.salesRegions.split(",") : [] });
  } catch (err) {
    next(err);
  }
});
