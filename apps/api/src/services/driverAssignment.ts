import { PrismaClient } from "@prisma/client";
import { rolesToArray } from "../utils/roles";
import { extractCity } from "./importParser";

const prisma = new PrismaClient();

/** 送貨慣用順序，與前端 `lib/taiwanCities.ts` 的 DISPATCH_CITIES 必須一致（改動時兩邊一起改）。
 *  這是使用者指定的送貨路線順序，**不是**由北到南。 */
export const DISPATCH_CITIES = ["台北市", "新北市", "基隆市", "桃園市"];
export const OTHER_CITY = "其他";

export function dispatchCityOf(address: string): string {
  const city = extractCity(address);
  return DISPATCH_CITIES.includes(city) ? city : OTHER_CITY;
}

export function dispatchCityIndex(city: string): number {
  const idx = DISPATCH_CITIES.indexOf(city);
  return idx === -1 ? DISPATCH_CITIES.length : idx;
}

export interface DriverForAssign {
  id: string;
  name: string;
  cities: string[]; // 空陣列＝後備，接收其他所有縣市
}

/** 取出所有送貨人員與其負責縣市。
 *  角色一律用 rolesToArray 判斷，**不能用字串 contains "DRIVER"**——那會誤中唯讀的 DRIVER_VIEW。 */
export async function loadDrivers(): Promise<DriverForAssign[]> {
  const staff = await prisma.staff.findMany({
    select: { id: true, name: true, roles: true, dispatchCities: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return staff
    .filter((s) => rolesToArray(s.roles).includes("DRIVER"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      cities: (s.dispatchCities ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    }));
}

/** 這個地址該給誰送：先找有指定該縣市的人，沒有就給後備（沒指定任何縣市的人）。
 *  兩者都沒有就回 null——呼叫端要把單子留在「待處理」交給物流管理處理，
 *  絕對不要硬塞給某個人，那會讓單子跑到不該送的人手上。
 *
 *  多個後備人員時取最早建立的那位（`loadDrivers` 已依 createdAt 排序），
 *  確保同一批匯入的分派結果穩定、不會每次跑都換人。 */
export function pickDriver(address: string, drivers: DriverForAssign[]): DriverForAssign | null {
  const city = extractCity(address);
  const byCity = drivers.find((d) => d.cities.includes(city));
  if (byCity) return byCity;
  return drivers.find((d) => d.cities.length === 0) ?? null;
}

/** 重新編排某位送貨人員今日路線的順序：依縣市（台北→新北→基隆→桃園→其他），
 *  同縣市內維持既有順序（先匯入的排前面），讓每天的名單看起來穩定。
 *
 *  只動「還沒開始作業」的單子順序沒有意義——順序是整條路線的事，
 *  所以連同已檢貨的一起重排；已完成與已刪除的不列入。
 *
 *  routeOrderManual 設為 true，這樣送貨人員頁面會照這個順序走而不是重新做最短路徑排序。
 *  送貨人員仍可自行拖曳，或按「最短路徑」改用系統排序。 */
export async function resequenceByCity(driverId: string): Promise<void> {
  const orders = await prisma.dispatchOrder.findMany({
    where: {
      carrier: "SELF",
      assignedDriverId: driverId,
      status: { in: ["SELECTED", "DISPATCHED"] },
    },
    select: { id: true, address: true, routeSequence: true, createdAt: true },
  });

  const sorted = [...orders].sort((a, b) => {
    const byCity = dispatchCityIndex(dispatchCityOf(a.address)) - dispatchCityIndex(dispatchCityOf(b.address));
    if (byCity !== 0) return byCity;
    const seqA = a.routeSequence ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.routeSequence ?? Number.MAX_SAFE_INTEGER;
    if (seqA !== seqB) return seqA - seqB;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  await Promise.all(
    sorted.map((o, idx) =>
      prisma.dispatchOrder.update({
        where: { id: o.id },
        data: { routeSequence: idx, routeOrderManual: true },
      })
    )
  );
}
