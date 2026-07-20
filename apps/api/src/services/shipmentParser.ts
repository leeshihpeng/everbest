// 解析新竹物流「託運總表」與嘉里大榮「託運明細表」PDF，並依收件地址分北中南三區。
import { PDFParse } from "pdf-parse";

export interface ParsedShipment {
  carrier: string;
  region: string;
  shipDate: Date;
  seq?: number;
  trackingNo: string;
  station: string;
  stationCode?: string;
  recipient: string;
  pieces: number;
  weight: number;
  cbm?: number;
  voucher?: string;
  cod?: number;
  phone?: string;
  address: string;
  orderNo?: string;
  note?: string;
}

const REGION_BY_CITY: Record<string, string[]> = {
  北部: ["基隆", "台北", "臺北", "新北", "桃園", "新竹", "宜蘭", "花蓮", "台東", "臺東"],
  中部: ["苗栗", "台中", "臺中", "彰化", "南投", "雲林"],
  南部: ["嘉義", "台南", "臺南", "高雄", "屏東"],
};

export const UNCLASSIFIED = "未分類";

/** 取地址中最先出現的縣市判斷區域；判不出來回 null（交由呼叫端用客戶資料補） */
export function regionOfAddress(address: string): string | null {
  if (!address) return null;
  let best: { region: string; i: number } | null = null;
  for (const [region, cities] of Object.entries(REGION_BY_CITY)) {
    for (const c of cities) {
      const i = address.indexOf(c);
      if (i !== -1 && (best === null || i < best.i)) best = { region, i };
    }
  }
  return best?.region ?? null;
}

const PAGE_MARK = /^--\s*\d+\s*of\s*\d+\s*--$/;
const isCJK = (ch: string) => /[一-鿿（）()]/.test(ch);

// 報表右邊界會把長欄位（公司名、單號）折到下一行：中文接中文才黏合，其餘補空白
function smartJoin(lines: string[]): string {
  return lines.reduce((acc, cur) => {
    if (!acc) return cur;
    return isCJK(acc[acc.length - 1]) && isCJK(cur[0]) ? acc + cur : acc + " " + cur;
  }, "");
}

function cleanLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !PAGE_MARK.test(l));
}

function parseRocOrIsoDate(s: string): Date | null {
  const m = s.match(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
  return isNaN(d.getTime()) ? null : d;
}

/** 新竹物流託運總表 */
export function parseHsinchu(text: string): Omit<ParsedShipment, "region">[] {
  const lines = cleanLines(text);
  const shipDate = parseRocOrIsoDate(lines.find((l) => l.includes("發送日期")) ?? "") ?? new Date();

  const idx: number[] = [];
  lines.forEach((l, i) => {
    if (/^\d{3}-\d{3}-\d{4}\s/.test(l)) idx.push(i);
  });

  const headRe = /^(\d{3}-\d{3}-\d{4})\s+(\d+)(\S+?)\s+-(.+?)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\S+)$/;
  const out: Omit<ParsedShipment, "region">[] = [];

  for (let k = 0; k < idx.length; k++) {
    const to = k + 1 < idx.length ? idx[k + 1] : lines.length;
    const chunk = lines.slice(idx[k], to).filter((l) => !/合計|總計|代收總金額|客戶簽收|收貨司機/.test(l));

    let m: RegExpMatchArray | null = null;
    let used = 0;
    for (let i = 0; i < chunk.length; i++) {
      m = smartJoin(chunk.slice(0, i + 1)).match(headRe);
      if (m) {
        used = i;
        break;
      }
    }
    if (!m) continue;

    const rest = chunk.slice(used + 1);
    const addrLine = rest.find((l) => /[市縣鄉鎮區路街道村里]/.test(l)) ?? "";
    out.push({
      carrier: "新竹貨運",
      shipDate,
      trackingNo: m[1],
      stationCode: m[2],
      station: m[3],
      recipient: m[4],
      pieces: Number(m[5]),
      weight: Number(m[6]),
      phone: m[7],
      voucher: m[8],
      orderNo: m[9],
      address: addrLine.replace(/\s*(元付|代收)\s*$/, "").trim(),
      note: rest.filter((l) => l !== addrLine).join(" ").trim() || undefined,
    });
  }
  return out;
}

/** 嘉里大榮託運明細表 */
export function parseDalen(text: string): Omit<ParsedShipment, "region">[] {
  const lines = cleanLines(text);
  const shipDate = parseRocOrIsoDate(lines.find((l) => /\d{8}\s*~/.test(l)) ?? "") ?? parseDalenDate(lines) ?? new Date();

  const idx: number[] = [];
  lines.forEach((l, i) => {
    if (/^\d+\s+\d{11}\s/.test(l)) idx.push(i);
  });

  const headRe = /^(\d+)\s+(\d{11})\s+(\S+)\s+(\d+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)\s+(\d+)$/;
  const out: Omit<ParsedShipment, "region">[] = [];

  for (let k = 0; k < idx.length; k++) {
    const to = k + 1 < idx.length ? idx[k + 1] : lines.length;
    const chunk = lines.slice(idx[k], to);

    const phoneIdx = chunk.findIndex((l) => /^[\d\-()]{8,}$/.test(l));
    const head = smartJoin(phoneIdx > 0 ? chunk.slice(0, phoneIdx) : chunk.slice(0, 3));
    const m = head.match(headRe);
    if (!m) continue;

    const rest = phoneIdx > 0 ? chunk.slice(phoneIdx) : [];
    const addr = rest.slice(1).find((l) => /[市縣鄉鎮區路街道村里]/.test(l) && !l.startsWith("備註")) ?? "";
    const noteLine = rest.find((l) => l.startsWith("備註")) ?? "";

    out.push({
      carrier: "大榮貨運",
      shipDate,
      seq: Number(m[1]),
      trackingNo: m[2],
      station: m[3],
      stationCode: m[4],
      recipient: m[5],
      pieces: Number(m[6]),
      weight: Number(m[7]),
      cbm: Number(m[8]),
      orderNo: m[9].replace(/\s+/g, ""),
      cod: Number(m[10]),
      phone: rest[0],
      address: addr.replace(/\s*門市\s*$/, "").trim(),
      note: noteLine.replace(/^備註[：:]\s*/, "").trim() || undefined,
    });
  }
  return out;
}

// 大榮的託運日期是「20260720 ~ 20260720」格式
function parseDalenDate(lines: string[]): Date | null {
  const m = lines.join(" ").match(/(20\d{2})(\d{2})(\d{2})\s*~/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}`) : null;
}

/** 依 PDF 內容自動判斷是哪一家業者並解析 */
export async function parseShipmentPdf(buffer: Buffer): Promise<Omit<ParsedShipment, "region">[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  const text = result.text;

  if (text.includes("新竹") || /^\d{3}-\d{3}-\d{4}/m.test(text)) {
    const rows = parseHsinchu(text);
    if (rows.length > 0) return rows;
  }
  return parseDalen(text);
}
