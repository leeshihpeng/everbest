import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { getAuthedStaff } from "../../lib/auth";
import { C, Checkbox } from "../../components/common";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待處理",
  SELECTED: "已勾選配送",
  DISPATCHED: "已檢貨",
  COMPLETED: "已完成",
};

interface OrderItem {
  productName: string;
  quantity: number;
}

interface Order {
  id: string;
  customerCode: string;
  customerName: string;
  address: string;
  status: string;
  isPriority: boolean;
  assignedDriverId?: string | null;
  lat?: number | null;
  items: OrderItem[];
}

// 同時用於內勤後台與物流主管頁面。匯入／補座標／刪除在後端都限 ADMIN，
// 因此非 ADMIN（例如只有 MANAGER 的徐文卿）只看得到清單與狀態篩選。
export default function OrdersPanel() {
  const isAdmin = !!getAuthedStaff()?.roles.includes("ADMIN");
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ createdCount: number; errors: string[]; detectedHeaders: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<{ total: number; updated: number; failed: number; errors: string[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.getOrders(status ? { status } : {}));
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const result = await api.importOrders(file);
      setImportResult(result);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleGeocodeMissing() {
    setGeocoding(true);
    setGeocodeResult(null);
    setError(null);
    try {
      const result = await api.geocodeMissingOrders();
      setGeocodeResult(result);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeocoding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這筆派遣單嗎？")) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteOrder(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const allSelected = orders.length > 0 && selected.size === orders.length;
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  }
  function toggleSelectOne(id: string) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`確定要刪除已勾選的 ${selected.size} 筆派遣單嗎？`)) return;
    setBulkDeleting(true);
    setError(null);
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteOrder(id)));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="p-4">
      {isAdmin && (
      <div className="rounded-xl p-3 mb-4" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
          CSV 匯入派遣單（欄位：出貨日期,公司名稱,倉庫住址1,公司電話1,託運備註,訂貨數量之總計）
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="text-[12px] w-full min-w-0" />
          <button
            onClick={handleImport}
            disabled={importing}
            style={{ background: C.navy }}
            className="w-full text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60"
          >
            {importing ? "上傳中…" : "上傳"}
          </button>
        </div>
        {importResult && (
          <div className="text-[12px] mt-2" style={{ color: C.muted }}>
            新增 {importResult.createdCount} 筆派遣單
            {importResult.errors.length > 0 && (
              <div style={{ color: C.danger }} className="mt-1">
                {importResult.errors.length} 筆未匯入：{importResult.errors.join("；")}
                <br />
                偵測到的 CSV 欄位名稱：<b>{importResult.detectedHeaders.join("、")}</b>
                <br />
                請確認欄位名稱是否為「出貨日期／公司名稱／倉庫住址1／公司電話1／託運備註／訂貨數量之總計」或其常見別名。
              </div>
            )}
          </div>
        )}
      </div>
      )}

      <div className="flex gap-2 mb-3">
        {["", "PENDING", "SELECTED", "DISPATCHED", "COMPLETED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={status === s ? { background: C.navy, color: "#fff" } : { color: C.muted, border: `1px solid ${C.hairline}` }}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium"
          >
            {s ? STATUS_LABELS[s] : "全部"}
          </button>
        ))}
      </div>

      {error && <div className="text-[12px] mb-2" style={{ color: C.danger }}>{error}</div>}

      {isAdmin && !loading && orders.some((o) => o.lat == null) && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleGeocodeMissing}
            disabled={geocoding}
            style={{ color: C.bizAccent, border: `1px solid ${C.bizAccent}` }}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-60"
          >
            {geocoding ? "定位中…" : `補齊座標（${orders.filter((o) => o.lat == null).length} 筆未定位）`}
          </button>
        </div>
      )}
      {geocodeResult && (
        <div className="text-[12px] mb-2" style={{ color: C.muted }}>
          已補齊 {geocodeResult.updated}／{geocodeResult.total} 筆座標
          {geocodeResult.failed > 0 && (
            <div style={{ color: C.danger }}>
              {geocodeResult.failed} 筆定位失敗：{geocodeResult.errors.join("；")}
            </div>
          )}
        </div>
      )}

      {isAdmin && !loading && orders.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <button onClick={toggleSelectAll} className="flex items-center gap-1.5">
            <Checkbox checked={allSelected} />
            <span className="text-[12px] font-bold">全部勾選</span>
          </button>
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              style={{ color: C.danger, border: `1px solid ${C.danger}` }}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-60"
            >
              {bulkDeleting ? "刪除中…" : `刪除已選（${selected.size}）`}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center text-[13px] py-6" style={{ color: C.muted }}>載入中…</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.hairline}`, background: "#fff" }}>
          {orders.map((o) => (
            <div key={o.id} className="px-3 py-2 border-t first:border-t-0 flex items-start gap-2" style={{ borderColor: C.hairline }}>
              {isAdmin && (
                <button onClick={() => toggleSelectOne(o.id)} className="mt-0.5 shrink-0">
                  <Checkbox checked={selected.has(o.id)} />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">
                      {o.customerCode}
                    </span>
                    <span className="font-semibold text-[13px]">{o.customerName}</span>
                    {o.lat == null && (
                      <span style={{ color: C.danger }} className="text-[10px]">
                        未定位
                      </span>
                    )}
                  </div>
                  <span style={{ background: C.bg, color: C.text }} className="text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </div>
                <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                  {o.address}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {o.items.map((it, i) => (
                    <span key={i} style={{ background: C.logiAccentSoft, color: C.logiAccent }} className="text-[11px] px-1.5 py-0.5 rounded">
                      {it.productName} ×{it.quantity}
                    </span>
                  ))}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(o.id)}
                      disabled={deletingId === o.id}
                      style={{ color: C.danger }}
                      className="text-[11px] font-bold ml-auto px-2 py-0.5 disabled:opacity-60"
                    >
                      {deletingId === o.id ? "刪除中…" : "刪除"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <div className="text-center text-[13px] py-6" style={{ color: C.muted }}>
              沒有符合條件的派遣單
            </div>
          )}
        </div>
      )}
    </div>
  );
}
