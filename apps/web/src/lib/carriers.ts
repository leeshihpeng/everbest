/** 交給貨運行或回頭車配送的管道（`DispatchOrder.carrier` 的值）。
 *
 *  `SELF`＝自家送貨人員**不在此列**，它走物流管理統計與送貨人員今日名單的流程。
 *
 *  後端 `apps/api/src/routes/orders.ts` 的 `CARRIERS` 是同一份，**改動時兩邊一起改**，
 *  否則匯入會因為「配送方式不正確」被擋掉。
 *
 *  貨物追蹤（`Shipment`）的業者清單是另一回事——只有新竹與大榮會給託運報表 PDF，
 *  **不要因為這裡多了永昌／回頭車就一起加進去。** */
export const DISPATCH_CARRIERS = [
  { carrier: "新竹貨運", short: "新竹" },
  { carrier: "大榮貨運", short: "大榮" },
  { carrier: "永昌貨運", short: "永昌" },
  { carrier: "回頭車", short: "回頭車" },
] as const;

export const CARRIER_VALUES: readonly string[] = DISPATCH_CARRIERS.map((c) => c.carrier);
