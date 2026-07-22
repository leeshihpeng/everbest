// 台灣縣市由北到南排序（西部＋東部＋離島，慣用順序）
export const TAIWAN_CITIES = [
  "基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣",
];

export function cityOrderIndex(city: string): number {
  const idx = TAIWAN_CITIES.indexOf(city);
  return idx === -1 ? TAIWAN_CITIES.length : idx;
}

/** 派遣單勾選的分區順序，是使用者指定的送貨慣用順序，**不是**由北到南（基隆排在新北之後）。
 *  不在清單內的縣市一律歸「其他」，排最後。 */
export const DISPATCH_CITIES = ["台北市", "新北市", "基隆市", "桃園市"];
export const OTHER_CITY = "其他";

/** 從地址取縣市。容忍開頭郵遞區號（「106 台北市…」）與「臺／台」異體字。
 *  與後端 `importParser.ts` 的 extractCity 規則一致，改動時請一起改。 */
export function extractCity(address: string): string {
  const cleaned = (address ?? "").trim().replace(/^\d{3,6}\s*/, "");
  const match = cleaned.match(/(.{2,3}[市縣])/);
  return match ? match[1].replace(/^臺/, "台") : OTHER_CITY;
}

export function dispatchCityOf(address: string): string {
  const city = extractCity(address);
  return DISPATCH_CITIES.includes(city) ? city : OTHER_CITY;
}

export function dispatchCityIndex(city: string): number {
  const idx = DISPATCH_CITIES.indexOf(city);
  return idx === -1 ? DISPATCH_CITIES.length : idx;
}
