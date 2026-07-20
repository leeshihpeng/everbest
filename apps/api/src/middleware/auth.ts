import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";

// 正式環境一定要自己設 JWT_SECRET。若允許沿用預設值，任何知道這串（原本寫在公開原始碼裡）
// 的人都能自行簽出管理員 token，等同完全繞過登入，所以缺少時直接讓服務啟動失敗。
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("缺少環境變數 JWT_SECRET，為避免使用可預測的密鑰簽發登入憑證，服務不予啟動。");
  }
  console.warn("[警告] 未設定 JWT_SECRET，本機開發暫用隨機密鑰（每次重啟都會讓既有登入失效）。");
}
// 本機沒設就用隨機值，確保絕不會有一組寫死在原始碼裡的共用密鑰
const SECRET = JWT_SECRET ?? randomBytes(32).toString("hex");

export interface AuthedRequest extends Request {
  staff?: { id: string; name: string; roles: string[] };
}

export function signStaffToken(staff: { id: string; name: string; roles: string[] }): string {
  return jwt.sign(staff, SECRET, { expiresIn: "30d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登入" });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET) as AuthedRequest["staff"];
    req.staff = payload;
    next();
  } catch {
    return res.status(401).json({ error: "登入已過期，請重新登入" });
  }
}

/** 限定角色使用，例如 requireRole("MANAGER") 或 requireRole(["ADMIN", "MANAGER"])（符合其中一個即可） */
export function requireRole(role: string | string[]) {
  const allowed = Array.isArray(role) ? role : [role];
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.staff || !allowed.some((r) => req.staff!.roles.includes(r))) {
      return res.status(403).json({ error: "沒有權限執行此操作" });
    }
    next();
  };
}
