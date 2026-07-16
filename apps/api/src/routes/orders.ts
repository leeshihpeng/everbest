import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { parseDispatchOrderCsv, groupOrderRowsByCustomer, getCsvHeaders } from "../services/importParser";
import { geocodeAddress } from "../services/googleMaps";
import { optimizeRoute } from "../services/routeOptimizer";
import { pushLineMessage, formatRouteShareMessage } from "../services/lineNotify";
import { rolesToArray } from "../utils/roles";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
export const ordersRouter = Router();

ordersRouter.use(requireAuth);

// 派遣單建立／異動時通知對象：所有物流主管，以及送貨人員——
// 若已指派特定送貨人員就只通知該人，否則（例如尚未指派）廣播給所有送貨人員
async function notifyOrderStakeholders(orderId: string, message: string, assignedDriverId?: string | null) {
  const allStaff = await prisma.staff.findMany();
  const targets = allStaff.filter((s) => {
    const roles = rolesToArray(s.roles);
    if (roles.includes("MANAGER")) return true;
    if (assignedDriverId) return s.id === assignedDriverId;
    return roles.includes("DRIVER");
  });
  for (const s of targets) {
    await prisma.notification.create({ data: { orderId, staffId: s.id, message } });
  }
}

ordersRouter.get("/", async (req, res, next) => {
  try {
    const { date, status } = req.query as { date?: string; status?: string };
    const orders = await prisma.dispatchOrder.findMany({
      where: {
        ...(date ? { deliveryDate: new Date(date) } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { items: true },
      orderBy: { routeSequence: "asc" },
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// 批次補齊尚未定位（lat/lng 為 null）的派遣單座標，例如匯入當下 Google API 還沒設定好時使用
ordersRouter.post("/geocode-missing", requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const targets = await prisma.dispatchOrder.findMany({ where: { lat: null } });
    let updated = 0;
    const errors: string[] = [];

    const CONCURRENCY = 8;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (o) => {
          try {
            const coords = await geocodeAddress(o.address);
            if (!coords) {
              errors.push(`${o.customerCode}: 找不到座標`);
              return;
            }
            await prisma.dispatchOrder.update({ where: { id: o.id }, data: { lat: coords.lat, lng: coords.lng } });
            updated++;
          } catch (e) {
            errors.push(`${o.customerCode}: ${(e as Error).message}`);
          }
        })
      );
    }

    res.json({ total: targets.length, updated, failed: errors.length, errors: errors.slice(0, 30) });
  } catch (err) {
    next(err);
  }
});

// 派遣單 CSV 匯入（規格書 3.4 / 5.1）— 內勤操作
ordersRouter.post("/import", requireRole("ADMIN"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "請上傳派遣單 CSV 檔案" });

    const rows = parseDispatchOrderCsv(req.file.buffer);
    const grouped = groupOrderRowsByCustomer(rows);
    const created: string[] = [];
    const errors: string[] = [];

    for (const g of grouped) {
      if (!g.header.customerName || !g.header.address || !g.header.deliveryDate) {
        errors.push(`${g.header.customerCode}: 缺少客戶名稱、住址或送貨日期，請確認 CSV 欄位名稱與範本一致（略過此筆）`);
        continue;
      }
      const deliveryDate = new Date(g.header.deliveryDate);
      if (isNaN(deliveryDate.getTime())) {
        errors.push(`${g.header.customerCode}: 送貨日期「${g.header.deliveryDate}」格式無法解析（略過此筆）`);
        continue;
      }
      if (g.items.length === 0) {
        errors.push(`${g.header.customerName}: 託運備註無法解析出任何品項（略過此筆）`);
        continue;
      }
      const coords = await geocodeAddress(g.header.address);
      const order = await prisma.dispatchOrder.create({
        data: {
          deliveryDate,
          customerCode: g.header.customerCode,
          customerName: g.header.customerName,
          address: g.header.address,
          phone: g.header.phone,
          lat: coords?.lat,
          lng: coords?.lng,
          items: { create: g.items },
        },
      });
      created.push(order.id);
    }

    // 5.4：新增時除了通知所有物流主管，也直接廣播給所有送貨人員（此時尚未指派特定人員）
    // 整批匯入只發一則通知，避免匯入多筆時洗版
    if (created.length > 0) {
      await notifyOrderStakeholders(created[created.length - 1], `今天有 ${created.length} 筆新派遣單待確認`, null);
    }

    res.json({ createdCount: created.length, orderIds: created, errors, detectedHeaders: getCsvHeaders(req.file.buffer) });
  } catch (err) {
    next(err);
  }
});

// 物流主管：勾選今日實際配送客戶＋優先標記 → 產生路線＋指派送貨人員（規格書 5.2）
ordersRouter.post("/select", requireRole("MANAGER"), async (req, res, next) => {
  try {
    const { orderIds, priorityOrderIds, driverId, originPoint, destinationPoint } = req.body as {
      orderIds: string[];
      priorityOrderIds: string[];
      driverId: string;
      originPoint: { lat: number; lng: number };
      destinationPoint: { lat: number; lng: number };
    };

    const orders = await prisma.dispatchOrder.findMany({
      where: { id: { in: orderIds } },
      include: { items: true },
    });

    const routableOrders = orders.filter((o) => o.lat != null && o.lng != null);
    const unroutedOrders = orders.filter((o) => o.lat == null || o.lng == null);

    const routeResult = await optimizeRoute({
      origin: originPoint,
      destination: destinationPoint,
      stops: routableOrders.map((o) => ({
        refId: o.id,
        lat: o.lat!,
        lng: o.lng!,
        isPriority: priorityOrderIds.includes(o.id),
      })),
    });

    // 依排序結果更新每筆派遣單狀態、優先標記、指派送貨人員、路線順序
    await Promise.all(
      routeResult.orderedStopRefIds.map((id, idx) =>
        prisma.dispatchOrder.update({
          where: { id },
          data: {
            status: "SELECTED",
            isPriority: priorityOrderIds.includes(id),
            assignedDriverId: driverId,
            routeSequence: idx,
          },
        })
      )
    );

    // 沒有座標的派遣單無法排進路線，但仍要標記為已勾選配送＋指派送貨人員，
    // 否則會卡在「待處理」動彈不得。routeSequence 留 null，排在路線最後面。
    if (unroutedOrders.length > 0) {
      await prisma.dispatchOrder.updateMany({
        where: { id: { in: unroutedOrders.map((o) => o.id) } },
        data: { status: "SELECTED", assignedDriverId: driverId },
      });
    }

    // 通知對應送貨人員（含沒有座標、未排進路線的派遣單）——這次指派只發一則通知，不逐筆洗版
    const driver = await prisma.staff.findUnique({ where: { id: driverId } });
    if (driver) {
      const allAssignedIds = [...routeResult.orderedStopRefIds, ...unroutedOrders.map((o) => o.id)];
      if (allAssignedIds.length > 0) {
        await prisma.notification.create({
          data: { orderId: allAssignedIds[0], staffId: driver.id, message: "今天有新的配送任務已指派給你" },
        });
      }
      if (driver.lineGroupId) {
        const message = formatRouteShareMessage({
          staffName: driver.name,
          originLabel: "公司",
          destinationLabel: "公司",
          totalDistanceKm: routeResult.totalDistanceKm,
          stops: orders.map((o) => ({
            name: o.customerName,
            address: o.address,
            isPriority: priorityOrderIds.includes(o.id),
            products: o.items.map((i) => ({ name: i.productName, qty: i.quantity })),
          })),
        });
        await pushLineMessage(driver.lineGroupId, message);
      }
    }

    res.json({
      ...routeResult,
      unroutedCount: unroutedOrders.length,
      unroutedOrderNames: unroutedOrders.map((o) => o.customerName),
    });
  } catch (err) {
    next(err);
  }
});

// 刪除派遣單（例如匯入錯誤需要重來）
ordersRouter.delete("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.dispatchOrderItem.deleteMany({ where: { orderId: req.params.id } });
    await prisma.notification.deleteMany({ where: { orderId: req.params.id } });
    await prisma.dispatchOrder.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// 更新派遣單狀態（例如送貨人員標記完成）
ordersRouter.patch("/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body as { status: "DISPATCHED" | "COMPLETED" };
    const order = await prisma.dispatchOrder.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// 送貨人員裝車前逐項檢貨標記。
// 全部品項都檢貨完成 → 派遣單自動進入「已派送」；若又取消其中一項 → 退回「已勾選配送」。
ordersRouter.patch("/items/:itemId/checked", async (req, res, next) => {
  try {
    const { checked } = req.body as { checked: boolean };
    const item = await prisma.dispatchOrderItem.update({
      where: { id: req.params.itemId },
      data: { checked },
    });

    const order = await prisma.dispatchOrder.findUnique({
      where: { id: item.orderId },
      include: { items: true },
    });
    let orderStatus = order?.status;
    if (order) {
      const allChecked = order.items.length > 0 && order.items.every((i) => i.checked);
      if (allChecked && order.status === "SELECTED") {
        await prisma.dispatchOrder.update({ where: { id: order.id }, data: { status: "DISPATCHED" } });
        orderStatus = "DISPATCHED";
      } else if (!allChecked && order.status === "DISPATCHED") {
        await prisma.dispatchOrder.update({ where: { id: order.id }, data: { status: "SELECTED" } });
        orderStatus = "SELECTED";
      }
    }

    res.json({ ...item, orderStatus });
  } catch (err) {
    next(err);
  }
});

// 出發前如有新增／修改內容（規格書 5.4）— 內勤或物流主管都可異動派遣單
ordersRouter.put("/:id", requireRole(["ADMIN", "MANAGER"]), async (req: AuthedRequest, res, next) => {
  try {
    const order = await prisma.dispatchOrder.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: "找不到派遣單" });

    const { customerName, address, phone, items } = req.body;
    const coords = address ? await geocodeAddress(address) : null;

    const updated = await prisma.dispatchOrder.update({
      where: { id: req.params.id },
      data: {
        customerName,
        address,
        phone,
        lat: coords?.lat,
        lng: coords?.lng,
        ...(items
          ? {
              items: {
                deleteMany: {},
                create: items,
              },
            }
          : {}),
      },
    });

    // 5.4：派遣單如有異動，物流主管與送貨人員都要收到通知
    // （已指派送貨人員的話只通知該人，否則廣播給所有送貨人員）
    const message = order.assignedDriverId
      ? `已指派的派遣單資料已更新，請重新確認路線：${updated.customerName}`
      : `派遣單已異動：${updated.customerName}`;
    await notifyOrderStakeholders(order.id, message, order.assignedDriverId);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
