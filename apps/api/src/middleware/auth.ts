import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { rolesToArray } from "../utils/roles";

const prisma = new PrismaClient();

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
  // 自己帶毫秒級的簽發時間：JWT 內建的 iat 只精確到秒，
  // 「改完密碼後立刻簽出的新 token」會跟「改密碼前一刻的舊 token」落在同一秒而分不出來。
  return jwt.sign({ ...staff, iatMs: Date.now() }, SECRET, { expiresIn: "30d" });
}

/**
 * 驗證登入憑證。**光是 JWT 簽章有效還不夠**，每次請求都要回資料庫確認帳號現況，
 * 否則 token 一簽出去就等於 30 天內無法收回：
 *   - 離職刪帳號後，他手機裡的 token 照樣能用到過期。
 *   - 收回 ADMIN 角色後，舊 token 裡仍寫著 ADMIN。
 *   - 密碼被盜、改密碼或主管重設密碼後，入侵者的既有登入不會被踢掉。
 * 代價是每個請求多一次查詢，以本系統的使用量（十人以內）完全可接受。
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登入" });
  }

  let payload: { id?: string; iat?: number; iatMs?: number };
  try {
    payload = jwt.verify(header.slice(7), SECRET) as { id?: string; iat?: number; iatMs?: number };
  } catch {
    return res.status(401).json({ error: "登入已過期，請重新登入" });
  }

  try {
    if (!payload.id) return res.status(401).json({ error: "登入憑證不完整，請重新登入" });

    const staff = await prisma.staff.findUnique({
      where: { id: payload.id },
      select: { id: true, name: true, roles: true, passwordChangedAt: true },
    });
    if (!staff) return res.status(401).json({ error: "帳號已不存在，請重新登入" });

    // 密碼變更前簽發的 token 一律作廢。
    // 舊版 token 沒有 iatMs，退回用秒級的 iat（取該秒起點，寧可嚴格一點）。
    if (staff.passwordChangedAt) {
      const issuedMs = payload.iatMs ?? (payload.iat != null ? payload.iat * 1000 : 0);
      if (issuedMs < staff.passwordChangedAt.getTime()) {
        return res.status(401).json({ error: "密碼已變更，請重新登入" });
      }
    }

    // 角色一律以資料庫為準，不用 token 裡的舊值
    req.staff = { id: staff.id, name: staff.name, roles: rolesToArray(staff.roles) };
    next();
  } catch (err) {
    next(err);
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
