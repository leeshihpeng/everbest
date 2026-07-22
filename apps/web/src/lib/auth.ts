export interface AuthedStaff {
  id: string;
  name: string;
  roles: string[];
  /** 主管重設過密碼：進系統前必須先設定自己的新密碼 */
  mustChangePassword?: boolean;
}

const STAFF_KEY = "staff";

export function getAuthedStaff(): AuthedStaff | null {
  const raw = localStorage.getItem(STAFF_KEY);
  return raw ? (JSON.parse(raw) as AuthedStaff) : null;
}

export function setSession(token: string, staff: AuthedStaff) {
  localStorage.setItem("token", token);
  localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
}

/** 設定完新密碼後清掉旗標，否則 RequireAuth 會一直把人擋回設定畫面 */
export function clearMustChangePassword() {
  const staff = getAuthedStaff();
  if (!staff) return;
  localStorage.setItem(STAFF_KEY, JSON.stringify({ ...staff, mustChangePassword: false }));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem(STAFF_KEY);
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem("token");
}

// 除了送貨人員以外，會在主目錄產生入口的角色。
// 兼任倉管的人在主目錄還有「貨運派遣」可用，因此不算「只送貨」。
const HUB_ROLES = ["SALES", "MANAGER", "ADMIN", "MANAGER_VIEW", "DRIVER_VIEW", "WAREHOUSE"];

/** 只有送貨任務的人（例如邱炫誠）沒有其他入口可選，登入後直接進今日配送名單，
 *  不必再點「路線排程系統 → 物流模式」兩層。 */
export function isDriverOnly(roles: string[]): boolean {
  return roles.includes("DRIVER") && !roles.some((r) => HUB_ROLES.includes(r));
}

/** 登入後（或回到首頁時）該落在哪一頁 */
export function landingPath(roles: string[]): string {
  return isDriverOnly(roles) ? "/logi/driver" : "/";
}
