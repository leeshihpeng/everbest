import type { StaffRole } from "@route-scheduler/shared-types";

// Staff.roles 在 SQLite 存成逗號分隔字串（例如 "MANAGER,SALES"）
export function rolesToString(roles: StaffRole[]): string {
  return roles.join(",");
}

export function rolesToArray(roles: string): StaffRole[] {
  return roles ? (roles.split(",") as StaffRole[]) : [];
}
