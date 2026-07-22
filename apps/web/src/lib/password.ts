// 密碼規則：至少 6 個字，數字或文字皆可，但不能有空白。
// 後端 apps/api/src/utils/password.ts 有同樣一份（真正把關的是後端），改規則時兩邊要一起改。
export const PASSWORD_RULE_TEXT = "密碼至少 6 個字（數字或文字皆可），不能有空白";

export function validatePassword(password: string): string | null {
  if (/\s/.test(password)) return PASSWORD_RULE_TEXT;
  if (password.length < 6) return PASSWORD_RULE_TEXT;
  return null;
}
