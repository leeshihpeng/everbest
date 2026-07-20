import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { parseShipmentPdf, regionOfAddress, UNCLASSIFIED } from "../services/shipmentParser";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const shipmentsRouter = Router();

shipmentsRouter.use(requireAuth);

export const ALL_REGIONS = ["北部", "中部", "南部"];
export const CARRIERS = ["新竹貨運", "大榮貨運"];

/** 使用者可看的區域：最高權限者看全部；其餘由其業務範圍（縣市）換算成北中南。
 *  這樣改業務範圍時，貨運追蹤權限會自動跟著調整，不必兩邊各設一次。 */
async function allowedRegionsFor(req: AuthedRequest): Promise<string[]> {
  const roles = req.staff?.roles ?? [];
  if (roles.includes("ADMIN")) return [...ALL_REGIONS, UNCLASSIFIED];

  const staff = await prisma.staff.findUnique({ where: { id: req.staff!.id }, select: { salesRegions: true } });
  const cities = staff?.salesRegions ? staff.salesRegions.split(",").map((c) => c.trim()).filter(Boolean) : [];
  const regions = new Set<string>();
  for (const c of cities) {
    const r = regionOfAddress(c);
    if (r) regions.add(r);
  }
  return [...regions];
}

// 六個目錄（業者 × 區域）與各自筆數；只回使用者有權限的區域
shipmentsRouter.get("/folders", requireRole(["SALES", "MANAGER"]), async (req: AuthedRequest, res, next) => {
  try {
    const allowed = await allowedRegionsFor(req);
    const grouped = await prisma.shipment.groupBy({
      by: ["carrier", "region"],
      _count: { _all: true },
      where: { region: { in: allowed } },
    });
    const counts = new Map(grouped.map((g) => [`${g.region}|${g.carrier}`, g._count._all]));

    const folders = [];
    for (const region of ALL_REGIONS) {
      if (!allowed.includes(region)) continue;
      for (const carrier of CARRIERS) {
        folders.push({ region, carrier, count: counts.get(`${region}|${carrier}`) ?? 0 });
      }
    }
    // 地址判不出區域的（僅最高權限者看得到），另外列出以便處理
    if (allowed.includes(UNCLASSIFIED)) {
      for (const carrier of CARRIERS) {
        const n = counts.get(`${UNCLASSIFIED}|${carrier}`) ?? 0;
        if (n > 0) folders.push({ region: UNCLASSIFIED, carrier, count: n });
      }
    }
    res.json(folders);
  } catch (err) {
    next(err);
  }
});

// 某業者某區域的託運明細
shipmentsRouter.get("/", requireRole(["SALES", "MANAGER"]), async (req: AuthedRequest, res, next) => {
  try {
    const { carrier, region } = req.query as { carrier?: string; region?: string };
    if (!carrier || !region) return res.status(400).json({ error: "請指定貨運業者與區域" });

    const allowed = await allowedRegionsFor(req);
    if (!allowed.includes(region)) return res.status(403).json({ error: "沒有權限查看此區域" });

    const shipments = await prisma.shipment.findMany({
      where: { carrier, region },
      orderBy: [{ shipDate: "desc" }, { seq: "asc" }, { trackingNo: "asc" }],
    });
    res.json(shipments);
  } catch (err) {
    next(err);
  }
});

// 上傳託運報表 PDF（新竹／大榮皆可，自動辨識）— 僅最高權限者
shipmentsRouter.post("/import", requireRole("ADMIN"), upload.array("files"), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) return res.status(400).json({ error: "請選擇要上傳的 PDF" });

    // 地址判不出縣市時，用收貨人比對既有客戶資料補上
    const customers = await prisma.customer.findMany({ select: { name: true, city: true } });
    const cityByName = new Map(customers.map((c) => [c.name, c.city]));

    let imported = 0;
    let updated = 0;
    let unclassified = 0;
    const errors: string[] = [];
    const summary: Record<string, number> = {};

    for (const f of files) {
      if (!/\.pdf$/i.test(f.originalname)) {
        errors.push(`${f.originalname}: 僅支援 PDF（略過）`);
        continue;
      }
      let rows;
      try {
        rows = await parseShipmentPdf(f.buffer);
      } catch (e) {
        errors.push(`${f.originalname}: 解析失敗（${(e as Error).message}）`);
        continue;
      }
      if (rows.length === 0) {
        errors.push(`${f.originalname}: 讀不到任何託運資料，請確認是新竹或大榮的託運報表`);
        continue;
      }

      for (const r of rows) {
        let region = regionOfAddress(r.address);
        if (!region) {
          const city = cityByName.get(r.recipient);
          if (city) region = regionOfAddress(city);
        }
        if (!region) {
          region = UNCLASSIFIED;
          unclassified++;
        }

        const data = { ...r, region };
        const existing = await prisma.shipment.findUnique({
          where: { carrier_trackingNo: { carrier: r.carrier, trackingNo: r.trackingNo } },
        });
        if (existing) {
          await prisma.shipment.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.shipment.create({ data });
          imported++;
        }
        summary[`${region} ${r.carrier}`] = (summary[`${region} ${r.carrier}`] ?? 0) + 1;
      }
    }

    res.json({ imported, updated, unclassified, summary, errors });
  } catch (err) {
    next(err);
  }
});

// 刪除單筆 — 僅最高權限者
shipmentsRouter.delete("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.shipment.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
