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
