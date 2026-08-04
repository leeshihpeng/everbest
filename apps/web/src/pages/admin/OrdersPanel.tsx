import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { getAuthedStaff } from "../../lib/auth";
import { dispatchCityOf, dispatchCityIndex } from "../../lib/taiwanCities";
import { C, Checkbox, ProductSummary, QtySubtotal, sumQty, DispatchDateTag } from "../../components/common";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待處理",
  SELECTED: "已指派",
  DISPATCHED: "已檢貨",
  COMPLETED: "已完成",
  CANCELLED: "已刪除",
};

// 沒有「待處理」：派遣單匯入時就自動指派，PENDING 只剩下「找不到送貨人員」這個例外，
// 物流管理首頁會直接警告，不需要在這裡佔一個分頁（使用者 2026-08-04 決定）。
// 那些單子仍然看得到，在「全部」裡標著「待處理」。
// 「已刪除」則是後端沒指定 status 時就不回傳，要另外選才看得到。
const STATUS_FILTERS = ["", "SELECTED", "DISPATCHED", "COMPLETED", "CANCELLED"];

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
  orderNote?: string | null;
  createdAt?: string; // 派遣單匯入（檔案上傳）的時間
  items: OrderItem[];
}

// 同時用於內勤後台與物流主管頁面。匯入／補座標／刪除在後端都限 ADMIN，
// 因此非 ADMIN（例如只有 MANAGER 的徐文卿）只看得到清單與狀態篩選。
// carrier 省略＝自家配送；帶「新竹貨運」／「大榮貨運」則為交給貨運行的派遣單
// allowImport=false：物流主管頁面用。匯入派遣單是內勤的事，即使本人兼 ADMIN 也不該從這裡匯入
export default function OrdersPanel({ carrier, allowImport = true }: { carrier?: string; allowImport?: boolean } = {}) {
  const isAdmin = !!getAuthedStaff()?.roles.includes("ADMIN");
  const isSelf = !carrier || carrier === "SELF";
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{
    createdCount: number;
    purged: number;
    noteCount: number;
    unassignedCount: number;
    errors: string[];
    detectedHeaders: string[];
  } | null>(null);
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
      setOrders(await api.getOrders({ ...(status ? { status } : {}), ...(carrier ? { carrier } : {}) }));
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status, carrier]);

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const result = await api.importOrders(file, carrier);
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

  // 「已刪除」分頁上按刪除＝真的從資料庫清掉；其他分頁＝標記為已刪除。
  //
  // 一般刪除刻意不做真刪除：自動匯入會定期重送當天的檔案（讓誤刪的資料自己補回來），
  // 真刪掉的單子十幾分鐘後就會原樣復活，看起來像刪除功能壞了。
  const isPurgeView = status === "CANCELLED";

  async function handleDelete(id: string) {
    if (!confirm(isPurgeView ? "確定要永久刪除這筆派遣單嗎？" : "確定要刪除這筆派遣單嗎？")) return;
    setDeletingId(id);
    setError(null);
    try {
      await (isPurgeView ? api.deleteOrder(id) : api.cancelOrder(id));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  // 自家配送的清單依縣市分開（送貨順序：台北→新北→基隆→桃園→其他），
  // 貨運行的單子送到全台各地，分區沒有意義，維持單一清單。
  const cityGroups = useMemo(() => {
    if (!isSelf) return [["", orders] as [string, Order[]]];
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const city = dispatchCityOf(o.address);
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(o);
    }
    return [...map.entries()].sort(([a], [b]) => dispatchCityIndex(a) - dispatchCityIndex(b));
  }, [orders, isSelf]);

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
    if (!confirm(`確定要${isPurgeView ? "永久" : ""}刪除已勾選的 ${selected.size} 筆派遣單嗎？`)) return;
    setBulkDeleting(true);
    setError(null);
    try {
      await Promise.all(Array.from(selected).map((id) => (isPurgeView ? api.deleteOrder(id) : api.cancelOrder(id))));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="p-4">
      {isAdmin && allowImport && (
      <div className="rounded-xl p-3 mb-4" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
          CSV 匯入派遣單（欄位：出貨日期,公司名稱,倉庫住址1,公司電話1,託運備註,訂貨數量之總計）
        </div>
        {!isSelf && (
          <div style={{ color: C.muted }} className="text-[11px] mb-2">
            同一天可分多次上傳，當天的都會保留；上傳時會自動清除非今日上傳的舊派遣單。
          </div>
        )}
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
            {importResult.purged > 0 && `・已清除非今日上傳的舊派遣單 ${importResult.purged} 筆`}
            ・帶入貨單附註 {importResult.noteCount} 筆
            {/* 自動指派有缺口時一定要講出來，否則單子會安靜地卡在「待處理」沒人送 */}
            {isSelf && importResult.unassignedCount > 0 && (
              <div style={{ color: C.danger }} className="mt-1">
                有 {importResult.unassignedCount} 筆找不到對應的送貨人員，已留在「待處理」。
                請到「人員」設定各送貨人員的配送縣市（不勾任何縣市＝後備，接收其他所有縣市），
                再到物流管理首頁按「重新指派」。
              </div>
            )}
            <div className="mt-0.5">偵測到的 CSV 欄位：{importResult.detectedHeaders.join("、")}</div>
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

      <div className="flex gap-2 mb-3 flex-wrap">
        {STATUS_FILTERS.map((s) => (
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
      {isPurgeView && (
        <div className="text-[11px] mb-2" style={{ color: C.muted }}>
          這些是被拿掉的派遣單，自動匯入不會把它們加回來。
          在這一頁按刪除是<b>永久刪除</b>；若那份 ERP 檔案還在，下次自動匯入會把它們當成新單子重新建立。
        </div>
      )}

      {error && <div className="text-[12px] mb-2" style={{ color: C.danger }}>{error}</div>}

      {/* 統計範圍跟著上方狀態篩選走，所以「待處理」與「已勾選配送」的總計本來就會不同 */}
      {!loading && orders.length > 0 && (
        <ProductSummary
          title={`貨品數量統計（${status ? STATUS_LABELS[status] : "全部"}）`}
          items={orders.flatMap((o) => o.items)}
          orderCount={orders.length}
          accent={C.navy}
        />
      )}

      {/* 貨運行的派遣單不做路線規劃，不需要座標 */}
      {isSelf && isAdmin && !loading && orders.some((o) => o.lat == null) && (
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
      ) : orders.length === 0 ? (
        <div className="rounded-xl text-center text-[13px] py-6" style={{ border: `1px solid ${C.hairline}`, background: "#fff", color: C.muted }}>
          沒有符合條件的派遣單
        </div>
      ) : (
        cityGroups.map(([city, group]) => (
        <div key={city} className="mb-3 last:mb-0">
          {city && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg mb-1.5" style={{ background: C.bg }}>
              <span style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.navy }} className="text-[12px] font-bold">
                {city}
              </span>
              <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">
                {group.length} 筆
              </span>
            </div>
          )}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.hairline}`, background: "#fff" }}>
          {group.map((o) => (
            <div key={o.id} className="px-3 py-2 border-t first:border-t-0 flex items-start gap-2" style={{ borderColor: C.hairline }}>
              {isAdmin && (
                <button onClick={() => toggleSelectOne(o.id)} className="mt-0.5 shrink-0">
                  <Checkbox checked={selected.has(o.id)} />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* 沒有出貨編號時 customerCode 會沿用公司名，兩個都印會變成同一個名字出現兩次 */}
                    {o.customerCode !== o.customerName && (
                      <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">
                        {o.customerCode}
                      </span>
                    )}
                    <span className="font-semibold text-[13px]">{o.customerName}</span>
                    <DispatchDateTag createdAt={o.createdAt} />
                    {isSelf && o.lat == null && (
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
                {/* 貨單附註：出貨時交代的事項，內勤要看得到才能核對 */}
                {o.orderNote && (
                  <div
                    className="mt-1 text-[11px] px-1.5 py-0.5 rounded"
                    style={{ background: C.goldSoft, color: C.text, whiteSpace: "pre-wrap" }}
                  >
                    <span style={{ color: C.gold }} className="font-bold">
                      貨單附註：
                    </span>
                    {o.orderNote}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {o.items.map((it, i) => (
                    <span key={i} style={{ background: C.logiAccentSoft, color: C.logiAccent }} className="text-[11px] px-1.5 py-0.5 rounded">
                      {it.productName} ×{it.quantity}
                    </span>
                  ))}
                  {o.items.length > 0 && <QtySubtotal total={sumQty(o.items)} accent={C.navy} />}
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
        </div>
        </div>
        ))
      )}
    </div>
  );
}
