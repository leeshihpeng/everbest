import { Router } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { signStaffToken } from "../middleware/auth";
import { rolesToArray } from "../utils/roles";

const prisma = new PrismaClient();
export const authRouter = Router();

// 簡易登入：姓名 + 密碼(PIN)。正式上線前建議依公司需求換成更完整的帳號系統。
authRouter.post("/login", async (req, res, next) => {
  try {
    const { name, password } = req.body as { name: string; password: string };
    const staff = await prisma.staff.findFirst({ where: { name } });

    if (!staff || !staff.passwordHash) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }
    const valid = await bcrypt.compare(password, staff.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }

    const roles = rolesToArray(staff.roles);
    const token = signStaffToken({ id: staff.id, name: staff.name, roles });
    res.json({ token, staff: { id: staff.id, name: staff.name, roles } });
  } catch (err) {
    next(err);
  }
});
