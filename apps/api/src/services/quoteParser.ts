// 解析「三順產品項目表」PDF，抽出報價表格。
// 欄位順序：代號 產品項目 品牌 規格(箱) 價格 有效日期 備註
import { PDFParse } from "pdf-parse";

export interface ParsedQuoteItem {
  sortOrder: number;
  code: string;
  productName: string;
  brand: string;
  spec: string;
  price: string;
  validDate: string;
  note: string;
}

// 表中出現的品牌；品牌欄過窄時英文會被折行（Rigiwan+g、Hudelso+n），先接回再比對
const BRANDS = ["優鮮沛", "Rigiwang", "Campos", "CAMPOS", "Hudelson", "Twins", "優生", "樹屋", "金龍牌", "美蒂娜", "龍源"];

// 規格：25 磅 / 一箱 24 包 / 每箱6罐 / 33.33 台斤 / 10 公斤
const SPEC_RE = /(一箱\s*\d+\s*包|每箱\s*\d+\s*罐|\d+(?:\.\d+)?\s*(?:磅|公斤|台斤))/;
const DATE_RE = /(20\d{2}\/\d{1,2}\/\d{1,2})/;
const PAGE_MARK = /^--\s*\d+\s*of\s*\d+\s*--$/;

export function parseQuotePdfText(text: string): ParsedQuoteItem[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !PAGE_MARK.test(l) && !/住址：|產品項目表|^代號\s/.test(l));

  // 先組出每一列的完整文字（處理品牌折行、行首雜訊）
  const raw: { code: string; text: string }[] = [];
  for (const line of lines) {
    // 有些列前面黏了雜訊（「2\tBTH …」「DDJ942800-29\tW80 …」），取最後一段
    const cleaned = line.includes("\t") ? (line.split("\t").pop() as string).trim() : line;
    const m = cleaned.match(/^([A-Z][A-Z0-9]{0,6})\s+(.*)$/);

    // 單獨的小寫片段是被折行的品牌尾巴（g / n），接回上一列
    if (!m && raw.length > 0 && /^[a-z]{1,3}$/.test(cleaned)) {
      raw[raw.length - 1].text += cleaned;
      continue;
    }
    if (m && /[一-鿿]/.test(m[2])) {
      raw.push({ code: m[1], text: m[2] });
    } else if (raw.length > 0) {
      raw[raw.length - 1].text += " " + cleaned;
    }
  }

  return raw.map((r, i) => {
    let rest = r.text.replace(/\s+/g, " ").trim();

    // 規格把「品名＋品牌」與「價格／日期／備註」切開
    const specM = rest.match(SPEC_RE);
    const spec = specM ? specM[1].replace(/\s+/g, "") : "";
    let head = specM ? rest.slice(0, specM.index).trim() : rest;
    let tail = specM ? rest.slice((specM.index ?? 0) + specM[1].length).trim() : "";

    // 品牌固定在品名後面
    let brand = "";
    for (const b of BRANDS) {
      if (head.endsWith(b)) {
        brand = b;
        head = head.slice(0, -b.length).trim();
        break;
      }
    }

    // 價格：緊接規格後的數字或數字區間（可能有兩段報價），或「缺貨」
    let price = "";
    const priceM = tail.match(/^((?:\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)(?:\s+\d+(?:\.\d+)?-\d+(?:\.\d+)?)*)/);
    if (priceM) {
      price = priceM[1].trim();
      tail = tail.slice(priceM[1].length).trim();
    } else if (/^缺貨/.test(tail)) {
      price = "缺貨";
      tail = tail.replace(/^缺貨/, "").trim();
    }

    // 有效日期（取第一個），其餘留在備註
    const dateM = tail.match(DATE_RE);
    const validDate = dateM ? dateM[1] : "";
    if (dateM) tail = (tail.slice(0, dateM.index) + tail.slice((dateM.index ?? 0) + dateM[1].length)).trim();

    return {
      sortOrder: i,
      code: r.code,
      productName: head,
      brand,
      spec,
      price: price || (/(缺貨)/.test(r.text) ? "缺貨" : ""),
      validDate,
      note: tail.replace(/\s+/g, " ").trim(),
    };
  });
}

export async function parseQuotePdf(buffer: Buffer): Promise<ParsedQuoteItem[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return parseQuotePdfText(result.text);
}
