import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export interface AuthedRequest extends Request {
  staff?: { id: string; name: string; roles: string[] };
}

export function signStaffToken(staff: { id: string; name: string; roles: string[] }): string {
  return jwt.sign(staff, JWT_SECRET, { expiresIn: "30d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登入" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthedRequest["staff"];
    req.staff = payload;
    next();
  } catch {
    return res.status(401).json({ error: "登入已過期，請重新登入" });
  }
}

/** 限定角色使用，例如 requireRole("MANAGER") */
export function requireRole(role: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.staff?.roles.includes(role)) {
      return res.status(403).json({ error: "沒有權限執行此操作" });
    }
    next();
  };
}
