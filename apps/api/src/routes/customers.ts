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
customersRouter.post("/", requireRole(["SALES", "MANAGER", "ADMIN", "ACCOUNTING"]), async (req, res, next) => {
  try {
    const { code, name, address, phone, isPriority } = req.body ?? {};
    // 必填欄位缺漏或型別不對時，回明確的 400，而不是讓 Prisma 拋錯變成 500。
    // 也擋掉物件注入（例如 code 傳成 {$ne:null}）——本系統欄位一律是字串。
    if (typeof code !== "string" || !code.trim() || typeof name !== "string" || !name.trim() || typeof address !== "string" || !address.trim()) {
      return res.status(400).json({ error: "請提供客戶編號、名稱與地址（皆為文字）" });
    }
    if (phone != null && typeof phone !== "string") {
      return res.status(400).json({ error: "電話格式不正確" });
    }
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

/**
 * 記帳系統匯入應收帳款時的補建入口：對帳單上有、客戶主檔沒有的客戶，在這裡補一筆。
 *
 * 這種資料**只有編號與名稱**，沒有地址也沒有縣市，所以一律標 `unconfirmed`，
 * 讓配送相關的畫面排除它們——沒有地址無法定位，混進路線規劃只會產生錯誤的派遣。
 * 已存在的客戶**不覆蓋**：主檔的地址是業務維護的，對帳單沒有這些欄位，
 * 覆蓋等於用比較差的資料蓋掉比較好的資料。
 */
customersRouter.post("/ensure", requireRole(["ADMIN", "ACCOUNTING"]), async (req, res, next) => {
  try {
    const list = (req.body ?? {}).customers;
    if (!Array.isArray(list)) return res.status(400).json({ error: "請提供 customers 陣列" });
    if (list.length > 2000) return res.status(400).json({ error: "一次最多 2000 筆" });

    const created: string[] = [];
    const existed: string[] = [];
    const errors: string[] = [];

    for (const raw of list) {
      const code = typeof raw?.code === "string" ? raw.code.trim() : "";
      const name = typeof raw?.name === "string" ? raw.name.trim() : "";
      if (!code || !name) {
        errors.push(`缺少編號或名稱：${JSON.stringify(raw)}`);
        continue;
      }
      const hit = await prisma.customer.findUnique({ where: { code } });
      if (hit) {
        existed.push(code);
        continue;
      }
      await prisma.customer.create({
        data: { code, name, address: "", city: "", unconfirmed: true },
      });
      created.push(code);
    }

    res.json({ createdCount: created.length, existedCount: existed.length, created, errors });
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

// 客戶主檔與記帳系統共用，兩邊都能改（使用者 2026-08-07 選定），所以會計也放行。
// 記帳只送得出名稱／電話／地址，座標與優先仍然只有這裡會動。
customersRouter.put("/:id", requireRole(["ADMIN", "ACCOUNTING"]), async (req, res, next) => {
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
      // 補上地址就不再是「只有名字的補建資料」，可以正常排配送了
      updateData.unconfirmed = false;
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
