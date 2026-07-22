-- 密碼變更時間：比這個時間早簽發的登入憑證一律失效，
-- 讓「改密碼／主管重設密碼」能真正把既有的登入踢掉。
ALTER TABLE "Staff" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
