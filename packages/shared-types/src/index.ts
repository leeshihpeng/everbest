// 共用型別 — apps/api 與 apps/web 都會引用這份定義，避免前後端資料結構不一致

// MANAGER_VIEW / DRIVER_VIEW：唯讀查看物流主管／送貨人員畫面，但不能勾選派遣單、指派、標記完成
// WAREHOUSE：倉管（角色細部權限待定，先能指派）
export type StaffRole = "SALES" | "MANAGER" | "MANAGER_VIEW" | "DRIVER" | "DRIVER_VIEW" | "ADMIN" | "WAREHOUSE";
export type OrderStatus = "PENDING" | "SELECTED" | "DISPATCHED" | "COMPLETED";

export interface Customer {
  id: string;
  code: string; // 客戶編號 C001
  name: string;
  address: string;
  city: string;
  phone?: string;
  isPriority: boolean; // 優先客戶（客戶主檔層級，業務模式用）
  lat?: number;
  lng?: number;
}

export interface Staff {
  id: string;
  name: string;
  roles: StaffRole[]; // 主管與送貨人員互斥（應用層檢查，見 validateStaffRoles）
  homeAddress: string;
  homeLat?: number;
  homeLng?: number;
  lineGroupId?: string;
  salesRegions?: string[]; // 業務人員可選客戶的縣市範圍；空陣列＝不限制
}

export interface SystemSetting {
  companyAddress: string;
  companyLat?: number;
  companyLng?: number;
}

export interface DispatchOrderItem {
  id: string;
  productName: string;
  quantity: number;
}

export interface DispatchOrder {
  id: string;
  deliveryDate: string; // ISO date
  customerCode: string; // 純文字，不強制對應 Customer 主檔
  customerName: string;
  address: string;
  phone?: string;
  status: OrderStatus;
  isPriority: boolean; // 本次配送優先標記（與客戶主檔無關）
  assignedDriverId?: string;
  routeSequence?: number;
  lat?: number;
  lng?: number;
  items: DispatchOrderItem[];
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteStopResult {
  refId: string; // Customer.id 或 DispatchOrder.id
  legDistanceKm: number;
  legDurationMin?: number;
}

export interface RouteOptimizeRequest {
  origin: RoutePoint;
  destination: RoutePoint;
  stops: {
    refId: string;
    lat: number;
    lng: number;
    isPriority: boolean;
  }[];
}

export interface RouteOptimizeResult {
  orderedStopRefIds: string[]; // 依排序後的順序
  legs: RouteStopResult[]; // 對應每一站與上一站的距離
  finalLegDistanceKm: number; // 最後一站到目的地
  finalLegDurationMin?: number;
  totalDistanceKm: number;
  totalDurationMin?: number;
}

export interface DirectionsStep {
  instruction: string; // 已去除 HTML 標籤的文字指示（含街名）
  distanceText: string;
  durationText: string;
}

export interface DirectionsLeg {
  refId?: string; // 這段路線抵達的站點（Customer.id 或 DispatchOrder.id），最後一段固定為 "__destination__"
  distanceText: string;
  durationText: string;
  steps: DirectionsStep[];
}

export interface DirectionsResult {
  legs: DirectionsLeg[];
  overviewPolyline: string; // Google 編碼過的路線座標，前端用 geometry library 解碼繪製
  totalDistanceText: string;
  totalDurationText: string;
}

export interface DirectionsRequest {
  origin: RoutePoint;
  destination: RoutePoint;
  stops: { refId: string; lat: number; lng: number }[]; // 已排序好的停靠站
}

/** 主管與送貨人員為互斥角色；業務人員可與其他角色並存（規格書 3.2） */
export function validateStaffRoles(roles: StaffRole[]): boolean {
  return !(roles.includes("MANAGER") && roles.includes("DRIVER"));
}
