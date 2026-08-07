// 共用型別 — apps/api 與 apps/web 都會引用這份定義，避免前後端資料結構不一致

// MANAGER_VIEW / DRIVER_VIEW：唯讀查看物流主管／送貨人員畫面，但不能勾選派遣單、指派、標記完成
// WAREHOUSE：倉管（角色細部權限待定，先能指派）
// ACCOUNTING：會計。**只用在三順記帳系統**，讓它讀寫共用的客戶主檔；
//   不會讓人看到派遣單、出貨或貨物追蹤。要開通記帳系統還必須在該員工填上 email。
export type StaffRole = "SALES" | "MANAGER" | "MANAGER_VIEW" | "DRIVER" | "DRIVER_VIEW" | "ADMIN" | "WAREHOUSE" | "ACCOUNTING";
// CANCELLED：送貨人員／倉管把不需要送的單子「刪除」後的狀態。
// 刻意不是真的從資料庫刪除——自動匯入會重讀同一份 ERP 檔案，真刪掉的單子隔幾分鐘就會長回來。
export type OrderStatus = "PENDING" | "SELECTED" | "DISPATCHED" | "COMPLETED" | "CANCELLED";

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
  /** 送貨人員負責的配送縣市。派遣單匯入時依此自動指派。
   *  空陣列＝後備人員，接收所有沒被別人指定的縣市。 */
  dispatchCities?: string[];
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
  /** 是否納入今日路線。送貨人員可取消勾選「這趟不送」的單子，
   *  單子仍留在名單上（隔天或改天再送），只是不排進路線與導航。 */
  inRoute: boolean;
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
  /** true＝完全照 stops 傳入的順序走，只計算各段距離／時間（送貨人員自行調整順序時用）。
   *  預設 false＝依優先客戶與最短路徑自動排序。 */
  keepOrder?: boolean;
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
