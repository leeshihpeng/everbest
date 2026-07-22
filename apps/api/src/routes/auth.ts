import { Router } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { signStaffToken, requireAuth, AuthedRequest } from "../middleware/auth";
import { rolesToArray } from "../utils/roles";
import { validatePassword } from "../utils/password";

const prisma = new PrismaClient();
export const authRouter = Router();

// 密碼是短數字 PIN，沒有次數限制的話幾秒鐘就能全部試完，因此針對「帳號」與「來源 IP」
// 各自累計失敗次數並暫時鎖定。存在記憶體即可：重啟頂多重置計數，不影響正確登入者。
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const fails = new Map<string, { count: number; until: number }>();

function checkLocked(key: string): number | null {
  const rec = fails.get(key);
  if (!rec) return null;
  if (rec.until > Date.now()) return Math.ceil((rec.until - Date.now()) / 60000);
  if (rec.until) fails.delete(key); // 鎖定已過期，重新計算
  return null;
}

function recordFail(key: string) {
  const rec = fails.get(key) ?? { count: 0, until: 0 };
  rec.count++;
  if (rec.count >= MAX_FAILS) {
    rec.until = Date.now() + LOCK_MS;
    rec.count = 0;
  }
  fails.set(key, rec);
}

// 定期清掉過期紀錄，避免長時間執行累積
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of fails) if (v.until && v.until < now) fails.delete(k);
}, LOCK_MS).unref();

// 簡易登入：姓名 + 密碼(PIN)。正式上線前建議依公司需求換成更完整的帳號系統。
authRouter.post("/login", async (req, res, next) => {
  try {
    const { name, password } = req.body as { name: string; password: string };
    if (typeof name !== "string" || typeof password !== "string" || !name || !password) {
      return res.status(400).json({ error: "請輸入姓名與密碼" });
    }

    const ipKey = `ip:${req.ip}`;
    const userKey = `user:${name}`;
    for (const key of [userKey, ipKey]) {
      const mins = checkLocked(key);
      if (mins !== null) {
        return res.status(429).json({ error: `登入失敗次數過多，請於 ${mins} 分鐘後再試。` });
      }
    }

    const staff = await prisma.staff.findFirst({ where: { name } });

    if (!staff || !staff.passwordHash) {
      recordFail(userKey);
      recordFail(ipKey);
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }
    const valid = await bcrypt.compare(password, staff.passwordHash);
    if (!valid) {
      recordFail(userKey);
      recordFail(ipKey);
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }

    fails.delete(userKey);
    fails.delete(ipKey);

    const roles = rolesToArray(staff.roles);
    const token = signStaffToken({ id: staff.id, name: staff.name, roles });
    // mustChangePassword＝主管重設過密碼，前端要擋在「設定新密碼」畫面，不讓他直接進系統
    res.json({ token, staff: { id: staff.id, name: staff.name, roles, mustChangePassword: staff.mustChangePassword } });
  } catch (err) {
    next(err);
  }
});

// 本人修改自己的密碼。一定要驗舊密碼，否則撿到別人未登出的手機就能改掉密碼把人鎖在外面。
authRouter.post("/change-password", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    const invalid = validatePassword(newPassword);
    if (invalid) return res.status(400).json({ error: invalid });

    const staff = await prisma.staff.findUnique({ where: { id: req.staff!.id } });
    if (!staff?.passwordHash) return res.status(400).json({ error: "此帳號尚未設定密碼" });

    const valid = await bcrypt.compare(currentPassword ?? "", staff.passwordHash);
    if (!valid) return res.status(401).json({ error: "目前密碼不正確" });

    // passwordChangedAt 會讓所有舊 token 立刻失效（見 middleware/auth.ts）——
    // 密碼被盜時改密碼才真的能把對方踢掉。本人手上這一份要換新的，否則自己也被登出。
    const changedAt = new Date();
    await prisma.staff.update({
      where: { id: staff.id },
      data: { passwordHash: await bcrypt.hash(newPassword!, 10), mustChangePassword: false, passwordChangedAt: changedAt },
    });

    const token = signStaffToken({ id: staff.id, name: staff.name, roles: rolesToArray(staff.roles) });
    res.json({ ok: true, token });
  } catch (err) {
    next(err);
  }
});
