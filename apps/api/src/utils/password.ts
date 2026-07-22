// 密碼規則：至少 6 個字，數字或文字皆可，但不能有空白。
// 前端 apps/web/src/lib/password.ts 有同樣一份，改規則時兩邊要一起改。
export const PASSWORD_RULE_TEXT = "密碼至少 6 個字（數字或文字皆可），不能有空白";

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return PASSWORD_RULE_TEXT;
  if (/\s/.test(password)) return PASSWORD_RULE_TEXT;
  if (password.length < 6) return PASSWORD_RULE_TEXT;
  return null;
}

/** 主管重設密碼時發給本人的一次性臨時密碼（6 位數字，方便口頭轉達）。 */
export function generateTempPassword(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}
