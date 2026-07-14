// 客戶 Excel 匯入（沿用 customer_import_template.xlsx 欄位）
// 與派遣單 CSV 匯入（規格書 3.4）的解析邏輯

import * as XLSX from "xlsx";
import { parse as parseCsv } from "csv-parse/sync";
import * as iconv from "iconv-lite";

export interface ParsedCustomerRow {
  isPriority: boolean;
  code: string;
  name: string;
  address: string;
  phone?: string;
}

export interface ParsedOrderRow {
  deliveryDate: string;
  customerCode: string;
  customerName: string;
  address: string;
  phone?: string;
  items: { productName: string; quantity: number }[];
  totalQuantity?: number;
}

const TRUE_VALUES = new Set(["是", "true", "TRUE", "1", "yes", "Y", "y", "V", "v"]);

// 不同來源的 Excel/CSV 常會用不同欄名，這裡列出常見別名，容錯比對（去除全形/半形空白後比對）
const HEADER_ALIASES: Record<string, string[]> = {
  code: ["客戶編號", "編號", "客戶代號", "代號", "客戶code", "code"],
  name: ["客戶名稱", "名稱", "客戶", "公司名稱", "店名", "客戶名"],
  address: ["住址", "地址", "客戶地址", "客戶住址", "送貨地址", "收貨地址", "倉庫住址1", "倉庫住址"],
  phone: ["電話", "聯絡電話", "客戶電話", "手機", "公司電話1", "公司電話"],
  priority: ["優先客戶", "優先", "是否優先", "priority"],
  deliveryDate: ["送貨日期", "日期", "配送日期", "出貨日期"],
  productName: ["產品項目", "產品", "品名", "產品名稱", "項目"],
  quantity: ["數量", "訂購數量", "數量(個)"],
  note: ["託運備註", "備註"],
  totalQuantity: ["訂貨數量之總計", "總數量", "總計數量", "數量總計"],
};

/** 解析「託運備註」欄位裡的品項字串，格式如「品名: 數量 ;品名2: 數量2 ;」，以 ; 分隔多筆品項 */
function parseNoteItems(note: string): { productName: string; quantity: number }[] {
  return note
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const colonIdx = segment.indexOf(":");
      if (colonIdx === -1) return null;
      const productName = segment.slice(0, colonIdx).trim();
      const quantity = Number(segment.slice(colonIdx + 1).trim());
      return productName && !isNaN(quantity) ? { productName, quantity } : null;
    })
    .filter((item): item is { productName: string; quantity: number } => item !== null);
}

function normalizeKey(key: string): string {
  return key.replace(/\s+/g, "").trim();
}

/** 依別名清單，從一列資料中找出對應欄位的值（欄名容忍空白差異與常見別名） */
function pickField(row: Record<string, unknown>, aliases: string[]): string {
  const normalizedRow = new Map(Object.entries(row).map(([k, v]) => [normalizeKey(k), v]));
  for (const alias of aliases) {
    const val = normalizedRow.get(normalizeKey(alias));
    if (val !== undefined && String(val).trim() !== "") return String(val).trim();
  }
  return "";
}

/** 讀出 Excel 第一個工作表的欄位標題（第一列），用於匯入失敗時的診斷訊息 */
export function getSheetHeaders(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

/** 送貨/出貨日期常見格式為「20260714」（8 位數字無分隔符），JS Date 無法直接解析，需轉成「2026-07-14」 */
function normalizeDeliveryDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  return trimmed;
}

/** 解析客戶資料 Excel（第一個工作表為資料，欄位對應 customer_import_template.xlsx，欄名容錯見 HEADER_ALIASES） */
export function parseCustomerExcel(buffer: Buffer): ParsedCustomerRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows
    .map((r) => ({
      isPriority: TRUE_VALUES.has(pickField(r, HEADER_ALIASES.priority)),
      code: pickField(r, HEADER_ALIASES.code),
      name: pickField(r, HEADER_ALIASES.name),
      address: pickField(r, HEADER_ALIASES.address),
      phone: pickField(r, HEADER_ALIASES.phone) || undefined,
    }))
    .filter((r) => r.code !== "");
}

/** 從地址字串抓出「縣市」，供業務模式手風琴分類使用。
 *  容忍地址前面接郵遞區號（例如「106 台北市...」）與「臺」「台」異體字。 */
export function extractCity(address: string): string {
  const cleaned = address.trim().replace(/^\d{3,6}\s*/, ""); // 去除開頭郵遞區號
  const match = cleaned.match(/(.{2,3}[市縣])/);
  if (!match) return "其他";
  return match[1].replace(/^臺/, "台");
}

/** 讀出 CSV 檔案文字內容。Windows「另存新檔」CSV 依儲存選項可能是 UTF-8、Big5，
 *  或「Unicode 文字」（UTF-16LE/BE，帶 BOM）。依 BOM 優先判斷，沒有 BOM 則嘗試 UTF-8，
 *  若發現亂碼（替代字元）再改用 Big5 重新解碼。 */
function decodeCsvBuffer(buffer: Buffer): string {
  const hasUtf8Bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  if (hasUtf8Bom) return buffer.subarray(3).toString("utf8");

  const hasUtf16LeBom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  if (hasUtf16LeBom) return buffer.subarray(2).toString("utf16le");

  const hasUtf16BeBom = buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff;
  if (hasUtf16BeBom) return buffer.subarray(2).swap16().toString("utf16le");

  const utf8Text = buffer.toString("utf8");
  if (utf8Text.includes("�")) {
    return iconv.decode(buffer, "big5");
  }
  return utf8Text;
}

/** 讀出 CSV 第一列欄位標題，用於匯入失敗時的診斷訊息 */
export function getCsvHeaders(buffer: Buffer): string[] {
  const text = decodeCsvBuffer(buffer);
  const records = parseCsv(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  return records.length > 0 ? Object.keys(records[0]) : [];
}

/** 解析派遣單 CSV，欄位對應 HEADER_ALIASES 容錯比對，容忍 Big5/UTF-8 編碼與常見欄名別名。
 *  品項來源優先採「託運備註」欄位（一列可含多品項，格式「品名: 數量 ;」），
 *  若無此欄位則退回舊格式（每列一個「產品項目」+「數量」）。 */
export function parseDispatchOrderCsv(buffer: Buffer): ParsedOrderRow[] {
  const text = decodeCsvBuffer(buffer);
  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  return records
    .map((r) => {
      const note = pickField(r, HEADER_ALIASES.note);
      const legacyProductName = pickField(r, HEADER_ALIASES.productName);
      const items = note
        ? parseNoteItems(note)
        : legacyProductName
        ? [{ productName: legacyProductName, quantity: Number(pickField(r, HEADER_ALIASES.quantity) || 0) }]
        : [];
      const customerName = pickField(r, HEADER_ALIASES.name);

      return {
        deliveryDate: normalizeDeliveryDate(pickField(r, HEADER_ALIASES.deliveryDate)),
        customerCode: pickField(r, HEADER_ALIASES.code) || customerName,
        customerName,
        address: pickField(r, HEADER_ALIASES.address),
        phone: pickField(r, HEADER_ALIASES.phone) || undefined,
        items,
        totalQuantity: pickField(r, HEADER_ALIASES.totalQuantity) ? Number(pickField(r, HEADER_ALIASES.totalQuantity)) : undefined,
      };
    })
    .filter((r) => r.customerName !== "");
}

/**
 * 派遣單 CSV 同一客戶＋送貨日期可能出現多列（例如分次匯入），需要合併
 * 成單一派遣單、多個 DispatchOrderItem。
 */
export function groupOrderRowsByCustomer(rows: ParsedOrderRow[]) {
  const map = new Map<string, { header: Omit<ParsedOrderRow, "items" | "totalQuantity">; items: { productName: string; quantity: number }[] }>();

  for (const row of rows) {
    const key = `${row.deliveryDate}__${row.customerCode}`;
    if (!map.has(key)) {
      map.set(key, {
        header: {
          deliveryDate: row.deliveryDate,
          customerCode: row.customerCode,
          customerName: row.customerName,
          address: row.address,
          phone: row.phone,
        },
        items: [],
      });
    }
    map.get(key)!.items.push(...row.items);
  }

  return Array.from(map.values());
}
