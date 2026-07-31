import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { importKeyOrAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { parseShipmentPdf, regionOfAddress, UNCLASSIFIED, ParsedShipment } from "../services/shipmentParser";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const shipmentsRouter = Router();

// 本機自動匯入程式用金鑰上傳託運報表；其餘端點一律走正常登入驗證
shipmentsRouter.use(importKeyOrAuth("/import"));

/** 今天（台灣時間）零點，換算成 UTC。Render 主機跑 UTC，直接用 UTC 零點會差 8 小時。 */
function startOfTodayTaipei(): Date {
  const TZ = 8 * 60 * 60 * 1000;
  const nowTaipei = new Date(Date.now() + TZ);
  return new Date(Date.UTC(nowTaipei.getUTCFullYear(), nowTaipei.getUTCMonth(), nowTaipei.getUTCDate()) - TZ);
}

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
    // 圖示下方只顯示「最新一份報表」的筆數，不把保留兩週的資料全部加總。
    // 原本寫死「只算今天」，遇到當天還沒出報表時整面都是 0，看起來像系統沒抓到資料，
    // 所以改成以各業者實際最新的報表日期為準（是今天就等於今天的量）。
    const latestByCarrier = new Map<string, Date>();
    for (const carrier of CARRIERS) {
      const latest = await prisma.shipment.findFirst({
        where: { carrier },
        orderBy: { shipDate: "desc" },
        select: { shipDate: true },
      });
      if (latest) latestByCarrier.set(carrier, latest.shipDate);
    }

    const grouped = await prisma.shipment.groupBy({
      by: ["carrier", "region"],
      _count: { _all: true },
      where: {
        region: { in: allowed },
        OR: [...latestByCarrier.entries()].map(([carrier, shipDate]) => ({ carrier, shipDate })),
      },
    });
    const counts = new Map(grouped.map((g) => [`${g.region}|${g.carrier}`, g._count._all]));
    const dateOf = (carrier: string) => latestByCarrier.get(carrier)?.toISOString() ?? null;

    const folders = [];
    for (const region of ALL_REGIONS) {
      if (!allowed.includes(region)) continue;
      for (const carrier of CARRIERS) {
        folders.push({ region, carrier, count: counts.get(`${region}|${carrier}`) ?? 0, date: dateOf(carrier) });
      }
    }
    // 地址判不出區域的（僅最高權限者看得到），另外列出以便處理。
    // 這裡用「有沒有資料」決定要不要顯示（不限當天），否則前幾天留下來的未分類資料會沒有入口可進去看。
    if (allowed.includes(UNCLASSIFIED)) {
      const anyUnclassified = await prisma.shipment.groupBy({
        by: ["carrier"],
        _count: { _all: true },
        where: { region: UNCLASSIFIED },
      });
      for (const carrier of CARRIERS) {
        const hasAny = anyUnclassified.some((g) => g.carrier === carrier && g._count._all > 0);
        if (hasAny) {
          folders.push({ region: UNCLASSIFIED, carrier, count: counts.get(`${UNCLASSIFIED}|${carrier}`) ?? 0, date: dateOf(carrier) });
        }
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

    let unclassified = 0;
    const errors: string[] = [];
    const summary: Record<string, number> = {};

    // 這兩份報表每天各上傳一次，代表當日全量。先全部解析成功再寫入：
    // 只取代「該業者同一報表日期」的舊資料（同天重傳＝更正），其他日期保留兩星期讓業務回查，
    // 過期資料在匯入時順手清除。解析失敗就不動舊資料，避免把好的資料清掉卻換不到新的。
    const byCarrier = new Map<string, ParsedShipment[]>();

    for (const f of files) {
      if (!/\.pdf$/i.test(f.originalname)) {
        errors.push(`${f.originalname}: 僅支援 PDF（略過）`);
        continue;
      }
      let rows;
      try {
        rows = await parseShipmentPdf(f.buffer);
      } catch (e) {
        errors.push(`${f.originalname}: 解析失敗（${(e as Error).message}），該業者原有資料保持不變`);
        continue;
      }
      if (rows.length === 0) {
        errors.push(`${f.originalname}: 讀不到任何託運資料，請確認是新竹或大榮的託運報表；該業者原有資料保持不變`);
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
        const list = byCarrier.get(r.carrier) ?? [];
        list.push({ ...r, region });
        byCarrier.set(r.carrier, list);
        summary[`${region} ${r.carrier}`] = (summary[`${region} ${r.carrier}`] ?? 0) + 1;
      }
    }

    let imported = 0;
    let replaced = 0;
    for (const [carrier, rows] of byCarrier) {
      const dates = [...new Set(rows.map((r) => r.shipDate.getTime()))].map((t) => new Date(t));
      const removed = await prisma.shipment.deleteMany({ where: { carrier, shipDate: { in: dates } } });
      replaced += removed.count;
      // skipDuplicates：同一批 PDF 內偶發重複單號時略過，不讓整批匯入失敗
      const created = await prisma.shipment.createMany({ data: rows, skipDuplicates: true });
      imported += created.count;
    }

    // 保留兩星期供業務回查，更舊的順手清掉
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const purged = (await prisma.shipment.deleteMany({ where: { shipDate: { lt: cutoff } } })).count;

    res.json({ imported, replaced, purged, unclassified, summary, errors });
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
