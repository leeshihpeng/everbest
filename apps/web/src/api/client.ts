// 統一的 API 呼叫封裝。
// 開發時沒設定 VITE_API_BASE_URL，走 "/api" 由 vite.config.ts 的 proxy 轉去本機 apps/api（會把 /api 前綴去掉）；
// 正式部署時後端是獨立網域，build 時要帶 VITE_API_BASE_URL=https://your-api-domain 直接打過去
// （後端路由本身沒有 /api 前綴，所以這裡不能加）。
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function getToken(): string | null {
  return localStorage.getItem("token"); // 注意：Claude.ai Artifacts 內不可用 localStorage，
  // 但這是「真正部署」的 web app 原始碼，不是 Claude.ai 內的 artifact demo，所以可以正常使用瀏覽器儲存。
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API 錯誤：${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// 檔案上傳（Excel/CSV 匯入）不能設定 Content-Type: application/json，
// 讓瀏覽器自動帶上 multipart/form-data 的 boundary。
async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API 錯誤：${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (name: string, password: string) =>
    request<{ token: string; staff: { id: string; name: string; roles: string[] } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    }),
  getCustomers: () => request<any[]>("/customers"),
  createCustomer: (data: unknown) =>
    request<{ id: string; code: string; name: string; address: string; city: string; isPriority: boolean; lat?: number; lng?: number }>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCustomer: (id: string, data: unknown) => request(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCustomer: (id: string) => request<void>(`/customers/${id}`, { method: "DELETE" }),
  deleteAllCustomers: () => request<{ deletedCount: number }>("/customers", { method: "DELETE" }),
  importCustomers: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return uploadFile<{ created: number; skipped: number; errors: string[]; detectedHeaders: string[] }>("/customers/import", fd);
  },
  getStaff: () => request<any[]>("/staff"),
  createStaff: (data: unknown) => request("/staff", { method: "POST", body: JSON.stringify(data) }),
  updateStaff: (id: string, data: unknown) => request(`/staff/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteStaff: (id: string) => request<void>(`/staff/${id}`, { method: "DELETE" }),
  geocodeMissingStaff: () =>
    request<{ total: number; updated: number; failed: number; errors: string[] }>("/staff/geocode-missing", { method: "POST" }),
  getSettings: () => request<{ companyAddress: string; companyLat?: number; companyLng?: number } | null>("/settings"),
  updateSettings: (companyAddress: string) =>
    request<{ companyAddress: string; companyLat?: number; companyLng?: number }>("/settings", {
      method: "PUT",
      body: JSON.stringify({ companyAddress }),
    }),
  geocodeMissingCustomers: () =>
    request<{ total: number; updated: number; failed: number; errors: string[] }>("/customers/geocode-missing", { method: "POST" }),
  getOrders: (params: { date?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<any[]>(`/orders?${qs}`);
  },
  optimizeRoute: (body: unknown) =>
    request<{
      orderedStopRefIds: string[];
      legs: { refId: string; legDistanceKm: number; legDurationMin?: number }[];
      finalLegDistanceKm: number;
      finalLegDurationMin?: number;
      totalDistanceKm: number;
      totalDurationMin?: number;
    }>("/route/optimize", { method: "POST", body: JSON.stringify(body) }),
  getDirections: (body: unknown) =>
    request<{
      legs: { refId?: string; distanceText: string; durationText: string; steps: { instruction: string; distanceText: string; durationText: string }[] }[];
      overviewPolyline: string;
      totalDistanceText: string;
      totalDurationText: string;
    } | null>("/route/directions", { method: "POST", body: JSON.stringify(body) }),
  selectOrders: (body: unknown) =>
    request<{
      orderedStopRefIds: string[];
      legs: { refId: string; legDistanceKm: number; legDurationMin?: number }[];
      finalLegDistanceKm: number;
      totalDistanceKm: number;
      unroutedCount: number;
      unroutedOrderNames: string[];
    }>("/orders/select", { method: "POST", body: JSON.stringify(body) }),
  updateOrderStatus: (id: string, status: "DISPATCHED" | "COMPLETED") =>
    request(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateItemChecked: (itemId: string, checked: boolean) =>
    request(`/orders/items/${itemId}/checked`, { method: "PATCH", body: JSON.stringify({ checked }) }),
  deleteOrder: (id: string) => request<void>(`/orders/${id}`, { method: "DELETE" }),
  geocodeMissingOrders: () =>
    request<{ total: number; updated: number; failed: number; errors: string[] }>("/orders/geocode-missing", { method: "POST" }),
  importOrders: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return uploadFile<{ createdCount: number; orderIds: string[]; errors: string[]; detectedHeaders: string[] }>("/orders/import", fd);
  },
  getNotifications: () =>
    request<{ id: string; orderId: string; message: string; isRead: boolean; createdAt: string }[]>("/notifications"),
  markNotificationRead: (id: string) => request(`/notifications/${id}/read`, { method: "PATCH" }),
};
