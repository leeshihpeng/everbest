import type { Request, Response, NextFunction } from "express";

// 原本直接把錯誤訊息回給前端，會外洩資料庫主機位址、原始碼路徑等內部資訊
// （例如 Prisma 連線失敗時會帶出 Neon 的 endpoint）。詳細內容只寫進伺服器日誌，
// 對外一律給概括訊息。
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // 預期內的拒絕（例如 CORS 擋掉外部網站）不是系統故障，不要洗版伺服器日誌
  const status = (err as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return res.status(status).json({ error: (err as Error).message });
  }

  console.error(err);

  // multer 檔案過大等可安全告知使用者的狀況
  const code = (err as { code?: string })?.code;
  if (code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "檔案太大，請縮小後再上傳。" });
  }

  res.status(500).json({ error: "系統發生錯誤，請稍後再試；若持續發生請聯絡管理員。" });
}
