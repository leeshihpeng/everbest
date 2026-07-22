import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { parseCustomerExcel, extractCity, getSheetHeaders } from "../services/importParser";
import { geocodeAddress } from "../services/googleMaps";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", async (_req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({ orderBy: { code: "asc" } });
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

// 新增客戶是業務／內勤的工作。沒有這層限制，送貨人員或倉管的 token 也能新增客戶，
// 順帶消耗 Google 定位額度。
customersRouter.post("/", requireRole(["SALES", "MANAGER", "ADMIN"]), async (req, res, next) => {
  try {
    const { code, name, address, phone, isPriority } = req.body;
    const coords = await geocodeAddress(address);
    const customer = await prisma.customer.create({
      data: {
        code,
        name,
        address,
        phone,
        isPriority: !!isPriority,
        city: extractCity(address),
        lat: coords?.lat,
        lng: coords?.lng,
      },
    });
    res.status(201).json(customer);
  } catch (err) {
    next(err);
  }
});

customersRouter.delete("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// 清除全部客戶資料（例如匯入錯誤需要重來），內勤後台使用，操作前請再三確認
customersRouter.delete("/", requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const result = await prisma.customer.deleteMany({});
    res.json({ deletedCount: result.count });
  } catch (err) {
    next(err);
  }
});

customersRouter.put("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { name, address, phone, isPriority } = req.body;
    const updateData: Record<string, unknown> = { name, phone, isPriority };
    if (address) {
      updateData.address = address;
      updateData.city = extractCity(address);
      const coords = await geocodeAddress(address);
      if (coords) {
        updateData.lat = coords.lat;
        updateData.lng = coords.lng;
      }
    }
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: updateData });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// 批次補齊尚未定位（lat/lng 為 null）的客戶座標，例如匯入當下 Google API 還沒設定好時使用
customersRouter.post("/geocode-missing", requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const targets = await prisma.customer.findMany({ where: { lat: null } });
    let updated = 0;
    const errors: string[] = [];

    const CONCURRENCY = 8;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (c) => {
          try {
            const coords = await geocodeAddress(c.address);
            if (!coords) {
              errors.push(`${c.code}: 找不到座標`);
              return;
            }
            await prisma.customer.update({ where: { id: c.id }, data: { lat: coords.lat, lng: coords.lng } });
            updated++;
          } catch (e) {
            errors.push(`${c.code}: ${(e as Error).message}`);
          }
        })
      );
    }

    res.json({ total: targets.length, updated, failed: errors.length, errors: errors.slice(0, 30) });
  } catch (err) {
    next(err);
  }
});

// 對應 customer_import_template.xlsx 匯入
customersRouter.post("/import", requireRole("ADMIN"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "請上傳 Excel 檔案" });

    const rows = parseCustomerExcel(req.file.buffer);
    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
      detectedHeaders: getSheetHeaders(req.file.buffer),
    };

    for (const row of rows) {
      if (!row.name || !row.address) {
        results.errors.push(`${row.code}: 缺少客戶名稱或住址，請確認 Excel 欄位名稱與範本一致（略過此筆）`);
        continue;
      }
      const exists = await prisma.customer.findUnique({ where: { code: row.code } });
      if (exists) {
        results.skipped++;
        continue;
      }
      try {
        const coords = await geocodeAddress(row.address);
        await prisma.customer.create({
          data: {
            code: row.code,
            name: row.name,
            address: row.address,
            phone: row.phone,
            isPriority: row.isPriority,
            city: extractCity(row.address),
            lat: coords?.lat,
            lng: coords?.lng,
          },
        });
        results.created++;
      } catch (e) {
        results.errors.push(`${row.code}: ${(e as Error).message}`);
      }
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});
