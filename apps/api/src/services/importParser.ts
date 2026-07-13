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
  productName: string;
  quantity: number;
}

const TRUE_VALUES = new Set(["是", "true", "TRUE", "1", "yes", "Y", "y", "V", "v"]);

// 不同來源的 Excel/CSV 常會用不同欄名，這裡列出常見別名，容錯比對（去除全形/半形空白後比對）
const HEADER_ALIASES: Record<string, string[]> = {
  code: ["客戶編號", "編號", "客戶代號", "代號", "客戶code", "code"],
  name: ["客戶名稱", "名稱", "客戶", "公司名稱", "店名", "客戶名"],
  address: ["住址", "地址", "客戶地址", "客戶住址", "送貨地址", "收貨地址"],
  phone: ["電話", "聯絡電話", "客戶電話", "手機"],
  priority: ["優先客戶", "優先", "是否優先", "priority"],
  deliveryDate: ["送貨日期", "日期", "配送日期", "出貨日期"],
  productName: ["產品項目", "產品", "品名", "產品名稱", "項目"],
  quantity: ["數量", "訂購數量", "數量(個)"],
};

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

/** 讀出 CSV 檔案文字內容。Windows 版 Excel「另存新檔」CSV 預設是 Big5 編碼而非 UTF-8，
 *  這裡先嘗試 UTF-8 解碼，若發現亂碼（替代字元）就改用 Big5 重新解碼。 */
function decodeCsvBuffer(buffer: Buffer): string {
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  if (hasBom) return buffer.subarray(3).toString("utf8");

  const utf8Text = buffer.toString("utf8");
  if (utf8Text.includes("�")) {
    return iconv.decode(buffer, "big5");
  }
  return utf8Text;
}

/** 讀出 CSV 第一列欄位標題，用於匯入失敗時的診斷訊息 */
export function getCsvHeaders(buffer: Buffer): string[] {
  const text = decodeCsvBuffer(buffer);
  const records = parseCsv(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.length > 0 ? Object.keys(records[0]) : [];
}

/** 解析派遣單 CSV，欄位對應 HEADER_ALIASES 容錯比對，容忍 Big5/UTF-8 編碼與常見欄名別名 */
export function parseDispatchOrderCsv(buffer: Buffer): ParsedOrderRow[] {
  const text = decodeCsvBuffer(buffer);
  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  return records
    .map((r) => ({
      deliveryDate: pickField(r, HEADER_ALIASES.deliveryDate),
      customerCode: pickField(r, HEADER_ALIASES.code),
      customerName: pickField(r, HEADER_ALIASES.name),
      address: pickField(r, HEADER_ALIASES.address),
      phone: pickField(r, HEADER_ALIASES.phone) || undefined,
      productName: pickField(r, HEADER_ALIASES.productName),
      quantity: Number(pickField(r, HEADER_ALIASES.quantity) || 0),
    }))
    .filter((r) => r.customerCode !== "");
}

/**
 * 派遣單 CSV 同一客戶可能有多列（多產品項目），需要依 客戶編號+送貨日期 分組，
 * 合併成單一派遣單、多個 DispatchOrderItem。
 */
export function groupOrderRowsByCustomer(rows: ParsedOrderRow[]) {
  const map = new Map<string, { header: Omit<ParsedOrderRow, "productName" | "quantity">; items: { productName: string; quantity: number }[] }>();

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
    map.get(key)!.items.push({ productName: row.productName, quantity: row.quantity });
  }

  return Array.from(map.values());
}
