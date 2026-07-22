-- 主管重設密碼後，本人下次登入必須先設定新密碼
ALTER TABLE "Staff" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
