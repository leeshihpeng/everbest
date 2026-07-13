export interface AuthedStaff {
  id: string;
  name: string;
  roles: string[];
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

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem(STAFF_KEY);
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem("token");
}
