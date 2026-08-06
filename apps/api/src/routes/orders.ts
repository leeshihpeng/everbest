import { Router } from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { importKeyOrAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { parseDispatchOrderCsv, groupOrderRowsByCustomer, getCsvHeaders, CARRIER_BY_ID } from "../services/importParser";
import { geocodeAddress } from "../services/googleMaps";
import { loadDrivers, pickDriver, resequenceByCity } from "../services/driverAssignment";
import { rolesToArray } from "../utils/roles";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
export const ordersRouter = Router();

// 交給貨運行或回頭車配送的派遣單；SELF 代表自家送貨人員。
// 前端 `apps/web/src/lib/carriers.ts` 有同一份，改動時兩邊一起改，
// 否則匯入會被「配送方式不正確」擋掉。
// 貨物追蹤（`routes/shipments.ts` 的 CARRIERS）是另一回事——只有新竹與大榮有託運報表，不要一起加。
export const CARRIERS = ["新竹貨運", "大榮貨運", "永昌貨運", "回頭車"];

/** 今天（台灣時間）零點，換算成 UTC。
 *  Render 主機跑 UTC，直接用 UTC 零點會把台灣清晨 08:00 前上傳的資料誤判成「昨天」。 */
function startOfTodayTaipei(): Date {
  const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowTaipei = new Date(Date.now() + TAIPEI_OFFSET_MS);
  const midnightTaipei = Date.UTC(nowTaipei.getUTCFullYear(), nowTaipei.getUTCMonth(), nowTaipei.getUTCDate());
  return new Date(midnightTaipei - TAIPEI_OFFSET_MS);
}

/** 統計要保留的天數。物流管理可以往回查每一天的出貨量，所以比這個更舊的才清掉。
 *  與前端 `components/common.tsx` 的 `STATS_KEEP_DAYS` 是同一個值，改要一起改。 */
const STATS_KEEP_DAYS = 14;

/** 清除門檻：**出貨日期**早於這一天的派遣單才會被自動刪除。
 *
 *  一律看出貨日期，**不是匯入日期**（使用者 2026-08-06）：下班前會先把明天的配送資料匯進來，
 *  用匯入日期判斷的話，那批明天的貨會被算成「今天的」而提早出現在送貨人員名單上。 */
function statsCutoffTaipei(): Date {
  return new Date(startOfTodayTaipei().getTime() - STATS_KEEP_DAYS * 24 * 60 * 60 * 1000);
}

/** 整張單的訂貨內容指紋：同品名合併數量後排序，與 CSV 的列出順序無關。
 *
 *  判斷「這張單跟上次匯入是不是同一份」時，**只比客戶與送貨日期是不夠的**：
 *  客戶臨時加訂或改量時，客戶與日期都沒變、訂貨內容卻已經不同，
 *  只比身分就會被當成重複匯入而略過，那筆異動就這樣消失（送貨數量出現誤差）。 */
function itemsSignature(items: { productName: string; quantity: number }[]): string {
  const merged = new Map<string, number>();
  for (const i of items) {
    const name = i.productName.trim();
    merged.set(name, (merged.get(name) ?? 0) + i.quantity);
  }
  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-Hant"))
    .map(([name, qty]) => `${name}×${qty}`)
    .join("、");
}

ordersRouter.use(importKeyOrAuth("/import"));

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

// 未指定 carrier 時只回自家配送（SELF），確保原有的物流主管／送貨人員流程
// 不會混入交給貨運行的派遣單。
// 已刪除（CANCELLED）的單子預設不回傳，除非明確指定 status=CANCELLED——
// 內勤後台要能查到被刪掉的單子，其他畫面則當它不存在。
ordersRouter.get("/", async (req, res, next) => {
  try {
    const { date, status, carrier } = req.query as { date?: string; status?: string; carrier?: string };
    const orders = await prisma.dispatchOrder.findMany({
      where: {
        carrier: carrier || "SELF",
        ...(date ? { deliveryDate: new Date(date) } : {}),
        ...(status ? { status: status as any } : { status: { not: "CANCELLED" } }),
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

    // carrier 決定這批要進「自家配送」還是某家貨運行的派遣單。
    // AUTO＝一份檔案裡混著多家，依每一列的「貨運行ID」欄分流（永昌回頭車的匯出檔）。
    const requestedCarrier = (req.body as { carrier?: string }).carrier?.trim() || "SELF";
    if (requestedCarrier !== "AUTO" && !["SELF", ...CARRIERS].includes(requestedCarrier)) {
      return res.status(400).json({ error: "配送方式不正確" });
    }

    const allRows = parseDispatchOrderCsv(req.file.buffer);
    const created: string[] = [];
    const errors: string[] = [];
    let updated = 0;
    let skipped = 0;
    // 訂貨內容與上次完全相同、不需要動的筆數（自動匯入重送同一份檔案的正常情況）
    let unchanged = 0;
    // 內容變了但單子已完成／已刪除，不能自動覆蓋，改為回報請人工處理。
    // 與 errors 分開：那是「CSV 解析不出來」，這是「解析正確但不能自動套用」，處理方式完全不同。
    const conflictMessages: string[] = [];
    // 內容變動、而送貨人員已經在檢貨的單子——要另外通知，不然他會照舊的數量出貨
    const changedInProgress: { orderId: string; driverId: string; customerName: string }[] = [];

    // AUTO 時依每列的貨運行 ID 分流；ID 認不得就整列略過並回報，
    // **絕不猜**——猜錯會把單子送到錯的貨運行。
    const batches = new Map<string, typeof allRows>();
    if (requestedCarrier === "AUTO") {
      for (const r of allRows) {
        const target = CARRIER_BY_ID[r.carrierId ?? ""];
        if (!target) {
          errors.push(`${r.customerName}：貨運行ID「${r.carrierId ?? ""}」無法對應到配送方式（略過此筆）`);
          continue;
        }
        batches.set(target, [...(batches.get(target) ?? []), r]);
      }
    } else {
      batches.set(requestedCarrier, allRows);
    }

    // 自家配送的單子在匯入當下就直接指派給送貨人員（依收件地址的縣市），
    // 不再停在「待處理」等物流管理勾選。分工設定在 Staff.dispatchCities。
    const drivers = batches.has("SELF") ? await loadDrivers() : [];
    const touchedDriverIds = new Set<string>();
    let unassignedCount = 0;
    let purged = 0;
    let noteCount = 0;

    for (const [carrier, carrierRows] of batches) {
    // 這一批開始前的計數，用來算「這批」新增／更新了多少（清除舊單與通知都只看自己這批）
    const createdBefore = created.length;
    const updatedBefore = updated;
    const grouped = groupOrderRowsByCustomer(carrierRows);
    noteCount += grouped.filter((g) => g.header.orderNote).length;

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
      // 自動匯入會重覆送同一天的檔案（ERP 每天覆蓋同一個檔名，中途還可能追加單子），
      // 因此以「配送方式＋送貨日期＋客戶代號」當同一張派遣單。
      // 沒有這層判斷的話，自動匯入每跑一次就會多一份重複的派遣單。
      const existing = await prisma.dispatchOrder.findFirst({
        where: { carrier, deliveryDate, customerCode: g.header.customerCode },
        include: { items: true },
      });

      // 品項要帶著檢貨狀態寫回去。新單一律未檢貨；既有單見下方的保留邏輯。
      let itemsToWrite: { productName: string; quantity: number; checked: boolean }[] = g.items.map((i) => ({
        ...i,
        checked: false,
      }));
      let revertDispatched = false;

      if (existing) {
        // 已完成配送（貨已經送出去了）與已刪除（有人刻意拿掉）不動它，但要回報讓內勤知道
        if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
          conflictMessages.push(
            `${g.header.customerName}：新檔案又出現這位客戶，但這張單已${
              existing.status === "COMPLETED" ? "完成配送" : "刪除"
            }，未自動合併，請人工確認`
          );
          continue;
        }

        // **同一天同一位客戶＝合併，不是取代**（使用者 2026-08-05 決定）：
        //   - 同品名 → 數量以新檔為準（**不累加**，否則修訂版檔案會讓數量翻倍）
        //   - 新檔多出來的品項 → 加進去
        //   - 舊檔有、新檔沒有的品項 → 保留，不刪
        // 檢貨勾選盡量留著：品名與數量都沒變的維持原狀，改量或新增的一律回到未檢貨，
        // 送貨人員才看得出哪幾項需要重新備貨。
        const merged = existing.items.map((i) => ({ productName: i.productName, quantity: i.quantity, checked: i.checked }));
        for (const inc of g.items) {
          const hit = merged.find((m) => m.productName.trim() === inc.productName.trim());
          if (!hit) {
            merged.push({ productName: inc.productName, quantity: inc.quantity, checked: false });
          } else if (hit.quantity !== inc.quantity) {
            hit.quantity = inc.quantity;
            hit.checked = false; // 數量變了就得重新確認
          }
        }
        itemsToWrite = merged;

        // 原本已檢貨的單子多出未檢的品項時要退回「已勾選配送」，
        // 否則畫面顯示已檢貨、實際上還有東西沒備。
        revertDispatched = existing.status === "DISPATCHED" && itemsToWrite.some((i) => !i.checked);

        // 合併後內容與原本完全一樣（例如同一份檔案又手動上傳一次）就不用寫入
        if (itemsSignature(itemsToWrite) === itemsSignature(existing.items) &&
            existing.address === g.header.address &&
            (existing.orderNote ?? "") === (g.header.orderNote ?? "")) {
          unchanged++;
          continue;
        }

        // 送貨人員已經開始檢貨（或已檢完）才通知：這種時候內容變動最容易出錯，
        // 而還沒動過的單子他本來就會看到最新內容，不需要打擾。
        if (existing.assignedDriverId && (existing.items.some((i) => i.checked) || existing.status === "DISPATCHED")) {
          changedInProgress.push({
            orderId: existing.id,
            driverId: existing.assignedDriverId,
            customerName: g.header.customerName,
          });
        }
      }

      // 交給貨運行的派遣單不需要座標（不做路線規劃、不導航），省下 geocode 呼叫。
      // 地址沒變就沿用原有座標，避免每次自動匯入都重打 geocode。
      const needGeocode = carrier === "SELF" && (!existing || existing.address !== g.header.address || existing.lat == null);
      const coords = needGeocode ? await geocodeAddress(g.header.address) : null;

      const data = {
        carrier,
        deliveryDate,
        customerCode: g.header.customerCode,
        customerName: g.header.customerName,
        address: g.header.address,
        phone: g.header.phone,
        orderNo: g.header.orderNo,
        weight: g.header.weight,
        orderNote: g.header.orderNote,
        lat: coords?.lat ?? existing?.lat ?? undefined,
        lng: coords?.lng ?? existing?.lng ?? undefined,
      };

      // 依收件地址的縣市決定送貨人員。找不到對應的人（例如還沒設定分工）就維持
      // 「待處理」不指派，讓物流管理的勾選畫面接手——寧可讓主管補指派，
      // 也不要塞給不負責那個區域的人。
      const driver = carrier === "SELF" ? pickDriver(g.header.address, drivers) : null;
      const assignment =
        carrier === "SELF"
          ? driver
            ? { status: "SELECTED", assignedDriverId: driver.id }
            : { status: "PENDING", assignedDriverId: null }
          : {};
      if (carrier === "SELF" && !driver) unassignedCount++;

      if (existing) {
        await prisma.dispatchOrder.update({
          where: { id: existing.id },
          // 已經指派過的單子不重新指派：主管可能手動改過送貨人員，
          // 重新匯入不該把那個調整蓋掉。只有還沒指派的才套用自動指派。
          data: {
            ...data,
            ...(existing.assignedDriverId ? {} : assignment),
            // 退回「已勾選配送」要放在 assignment 後面，否則會被自動指派的狀態蓋掉
            ...(revertDispatched ? { status: "SELECTED" } : {}),
            items: { deleteMany: {}, create: itemsToWrite },
          },
        });
        updated++;
      } else {
        const order = await prisma.dispatchOrder.create({
          data: { ...data, ...assignment, items: { create: itemsToWrite } },
        });
        created.push(order.id);
        // **只有真的有新單子進來才重排順序。**
        // watcher 會定期重送同一份檔案（讓被刪掉的資料自己補回來），
        // 若連「純更新」也重排，送貨人員自己拖過的順序每隔十幾分鐘就會被打回縣市順序。
        if (driver) touchedDriverIds.add(driver.id);
      }
    }

    // 依縣市重排有新單子進來的送貨人員路線（台北→新北→基隆→桃園→其他）
    for (const driverId of touchedDriverIds) {
      await resequenceByCity(driverId);
    }

    // 已經在檢貨的單子內容被客戶改掉，一定要主動講——送貨人員不會沒事重看已經檢過的單，
    // 只靠畫面更新他不會發現數量變了。改過的品項已回到未檢貨狀態，通知裡直接點名客戶。
    for (const [driverId, list] of changedInProgress.reduce((m, c) => {
      m.set(c.driverId, [...(m.get(c.driverId) ?? []), c]);
      return m;
    }, new Map<string, typeof changedInProgress>())) {
      const names = [...new Set(list.map((c) => c.customerName))].join("、");
      await prisma.notification.create({
        data: {
          orderId: list[0].orderId,
          staffId: driverId,
          message: `${names} 的訂貨內容有異動，請重新確認品項與數量（變動的品項已取消檢貨勾選）`,
        },
      });
    }

    // 匯入即指派，所以通知改成「指派給你」而不是「待確認」，並且只發給實際被指派的人。
    // 整批匯入每個人只發一則通知，避免匯入多筆時洗版。
    // 交給貨運行的派遣單不經送貨人員，不發這則通知。
    // 只看這一批新增的（AUTO 會分多批，created 是跨批累積的）
    const createdThisBatch = created.slice(createdBefore);
    if (createdThisBatch.length > 0 && carrier === "SELF") {
      const newOrders = await prisma.dispatchOrder.findMany({
        where: { id: { in: createdThisBatch } },
        select: { id: true, assignedDriverId: true },
      });

      const byDriver = new Map<string, string[]>();
      const unassignedIds: string[] = [];
      for (const o of newOrders) {
        if (!o.assignedDriverId) unassignedIds.push(o.id);
        else byDriver.set(o.assignedDriverId, [...(byDriver.get(o.assignedDriverId) ?? []), o.id]);
      }

      for (const [driverId, ids] of byDriver) {
        await prisma.notification.create({
          data: { orderId: ids[0], staffId: driverId, message: `今天有 ${ids.length} 筆派遣單已指派給你` },
        });
      }
      // 沒能自動指派的單子要讓主管知道，否則會靜靜卡在「待處理」沒人發現。
      // 只通知主管——這是分工設定的問題，廣播給送貨人員只會造成困惑。
      if (unassignedIds.length > 0) {
        const managers = (await prisma.staff.findMany()).filter((s) => rolesToArray(s.roles).includes("MANAGER"));
        for (const m of managers) {
          await prisma.notification.create({
            data: {
              orderId: unassignedIds[0],
              staffId: m.id,
              message: `有 ${unassignedIds.length} 筆派遣單找不到對應的送貨人員，請確認配送縣市設定後按「重新指派」`,
            },
          });
        }
      }
    }

    // 匯入時順手清掉太舊的單子。**四個管道一視同仁**（含自家配送，使用者 2026-08-06：
    // 系統一致比較不會混亂），清除門檻是**出貨日期**早於 `STATS_KEEP_DAYS` 天。
    //
    // 為什麼不用匯入日期：下班前會先把明天的配送資料匯進來，用匯入日期判斷會把
    // 「明天要出的貨」算成今天的。
    // 只清 14 天以前的、不是「非今天」的：物流管理要能往回查每一天的統計。
    // 「隔日就看不到舊的」是**畫面依出貨日期過濾**出來的，不是靠刪資料。
    // 清除範圍限這一批的 carrier，判斷也只看這一批有沒有進東西
    if (createdThisBatch.length + (updated - updatedBefore) > 0) {
      const stale = await prisma.dispatchOrder.findMany({
        where: { carrier, deliveryDate: { lt: statsCutoffTaipei() } },
        select: { id: true },
      });
      const staleIds = stale.map((o) => o.id);
      if (staleIds.length > 0) {
        await prisma.dispatchOrderItem.deleteMany({ where: { orderId: { in: staleIds } } });
        await prisma.notification.deleteMany({ where: { orderId: { in: staleIds } } });
        purged += (await prisma.dispatchOrder.deleteMany({ where: { id: { in: staleIds } } })).count;
      }
    }
    } // ← 每個 carrier 一輪（AUTO 時一份檔案會跑多輪）

    res.json({
      createdCount: created.length,
      orderIds: created,
      updatedCount: updated,
      skippedCount: skipped,
      // 內容與上次完全相同、不需要處理的筆數
      unchangedCount: unchanged,
      // 內容變了卻不能自動更新（已完成／已刪除）的單子，需要人工判斷
      conflictCount: conflictMessages.length,
      conflicts: conflictMessages,
      // 送貨人員檢貨到一半被改掉的筆數，已另外發通知
      changedInProgressCount: changedInProgress.length,
      // 沒能自動指派的筆數：不是 0 就代表分工設定有缺口，畫面要講出來
      unassignedCount,
      purged,
      // 讓內勤一眼看出附註有沒有真的帶進來（曾發生匯出檔欄位錯位而整批沒帶到）
      noteCount,
      // AUTO 時實際分流到哪幾家、各幾列，方便核對貨運行 ID 有沒有讀對
      carriers: [...batches.entries()].map(([c, r]) => ({ carrier: c, rows: r.length })),
      errors,
      detectedHeaders: getCsvHeaders(req.file.buffer),
    });
  } catch (err) {
    next(err);
  }
});

// 重新套用自動指派：把還沒指派（PENDING）的自家派遣單依縣市分給送貨人員。
//
// 匯入當下就會自動指派，正常情況這裡沒事可做。它是設定改過之後的補救入口：
// 「派遣單勾選」畫面移除後（使用者 2026-08-04 決定不需要），這是唯一能讓
// 卡在待處理的單子動起來的方法。**不要因為看起來沒人用就刪掉。**
ordersRouter.post("/auto-assign", requireRole(["MANAGER", "ADMIN"]), async (_req, res, next) => {
  try {
    const drivers = await loadDrivers();
    const pending = await prisma.dispatchOrder.findMany({
      where: { carrier: "SELF", status: "PENDING" },
      select: { id: true, address: true, customerName: true },
    });

    const touched = new Set<string>();
    const unresolvedNames: string[] = [];
    for (const o of pending) {
      const driver = pickDriver(o.address, drivers);
      if (!driver) {
        unresolvedNames.push(o.customerName);
        continue;
      }
      await prisma.dispatchOrder.update({
        where: { id: o.id },
        data: { status: "SELECTED", assignedDriverId: driver.id, inRoute: true },
      });
      touched.add(driver.id);
    }
    for (const driverId of touched) await resequenceByCity(driverId);

    for (const driverId of touched) {
      const ids = pending.filter((o) => pickDriver(o.address, drivers)?.id === driverId).map((o) => o.id);
      if (ids.length > 0) {
        await prisma.notification.create({
          data: { orderId: ids[0], staffId: driverId, message: `有 ${ids.length} 筆派遣單已指派給你` },
        });
      }
    }

    res.json({ total: pending.length, assigned: pending.length - unresolvedNames.length, unresolvedNames });
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

/** 送貨人員只能動指派給自己的派遣單；物流主管與內勤不受限。
 *  貨運行的派遣單由主管與倉管處理（沒有指派特定送貨人員）。
 *  沒有這層檢查的話，任何登入者都能把別人的派遣單標成已完成。 */
type OrderAccess = { ok: true } | { ok: false; status: number; error: string };

async function assertCanModifyOrder(req: AuthedRequest, orderId: string): Promise<OrderAccess> {
  const order = await prisma.dispatchOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, status: 404, error: "找不到派遣單" };

  const roles = req.staff?.roles ?? [];
  if (roles.includes("MANAGER") || roles.includes("ADMIN")) return { ok: true };
  if (order.carrier !== "SELF") {
    if (roles.includes("WAREHOUSE")) return { ok: true };
    return { ok: false, status: 403, error: "沒有權限操作貨運派遣單" };
  }
  if (order.assignedDriverId && order.assignedDriverId === req.staff?.id) return { ok: true };
  return { ok: false, status: 403, error: "只能操作指派給你的派遣單" };
}

// 送貨人員臨時調整送貨順序（路線已送出後仍可改）。
// 一定要放在 PUT /:id 之前，否則會被當成 id 為 "route-order" 的派遣單。
// manual=false 代表還原成系統自動排序，之後每次開啟都會重新計算最佳路線。
ordersRouter.put("/route-order", async (req: AuthedRequest, res, next) => {
  try {
    const { orderIds, manual = true } = req.body as { orderIds: unknown; manual?: boolean };
    if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.some((id) => typeof id !== "string")) {
      return res.status(400).json({ error: "請提供要排序的派遣單" });
    }

    // 逐筆確認擁有權：送貨人員只能排自己的單，不能動到別人的路線
    for (const id of orderIds as string[]) {
      const check = await assertCanModifyOrder(req, id);
      if (!check.ok) return res.status(check.status).json({ error: check.error });
    }

    await Promise.all(
      (orderIds as string[]).map((id, idx) =>
        prisma.dispatchOrder.update({ where: { id }, data: { routeSequence: idx, routeOrderManual: manual } })
      )
    );

    res.json({ updated: orderIds.length, manual });
  } catch (err) {
    next(err);
  }
});

// 更新派遣單狀態（例如送貨人員標記完成、貨運派遣頁取消「已交貨運行」退回 PENDING、
// 送貨人員／倉管把不需要送的單子標成已刪除 CANCELLED）
const SETTABLE_STATUSES = ["PENDING", "SELECTED", "DISPATCHED", "COMPLETED", "CANCELLED"] as const;

ordersRouter.patch("/:id/status", async (req: AuthedRequest, res, next) => {
  try {
    const { status } = req.body as { status: (typeof SETTABLE_STATUSES)[number] };
    if (!SETTABLE_STATUSES.includes(status)) {
      return res.status(400).json({ error: "狀態值不正確" });
    }

    const check = await assertCanModifyOrder(req, req.params.id);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const order = await prisma.dispatchOrder.update({ where: { id: req.params.id }, data: { status } });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// 送貨人員勾選「這趟要不要送」。取消勾選的單子仍留在名單上（改天再送），
// 只是不排進路線與導航，跟「刪除」（CANCELLED）是兩回事。
ordersRouter.patch("/:id/in-route", async (req: AuthedRequest, res, next) => {
  try {
    const { inRoute } = req.body as { inRoute: boolean };
    if (typeof inRoute !== "boolean") return res.status(400).json({ error: "勾選狀態值不正確" });

    const check = await assertCanModifyOrder(req, req.params.id);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const order = await prisma.dispatchOrder.update({ where: { id: req.params.id }, data: { inRoute } });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// 送貨人員裝車前逐項檢貨標記。
// 全部品項都檢貨完成 → 派遣單自動進入「已派送」；若又取消其中一項 → 退回「已勾選配送」。
ordersRouter.patch("/items/:itemId/checked", async (req: AuthedRequest, res, next) => {
  try {
    const { checked } = req.body as { checked: boolean };
    if (typeof checked !== "boolean") return res.status(400).json({ error: "檢貨狀態值不正確" });

    const target = await prisma.dispatchOrderItem.findUnique({ where: { id: req.params.itemId } });
    if (!target) return res.status(404).json({ error: "找不到品項" });
    const check = await assertCanModifyOrder(req, target.orderId);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

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
