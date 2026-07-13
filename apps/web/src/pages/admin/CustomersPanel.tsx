import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { C, PriorityTag } from "../../components/common";

interface Customer {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  phone?: string;
  isPriority: boolean;
  lat?: number | null;
  lng?: number | null;
}

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ code: "", name: "", address: "", phone: "", isPriority: false });
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[]; detectedHeaders: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<{ total: number; updated: number; failed: number; errors: string[] } | null>(null);

  async function load() {
    setLoading(true);
    try {
      setCustomers(await api.getCustomers());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createCustomer(form);
      setForm({ code: "", name: "", address: "", phone: "", isPriority: false });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const result = await api.importCustomers(file);
      setImportResult(result);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這筆客戶資料嗎？")) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteCustomer(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleGeocodeMissing() {
    setGeocoding(true);
    setGeocodeResult(null);
    setError(null);
    try {
      const result = await api.geocodeMissingCustomers();
      setGeocodeResult(result);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeocoding(false);
    }
  }

  async function handleClearAll() {
    if (!confirm(`確定要刪除全部 ${customers.length} 筆客戶資料嗎？此動作無法復原。`)) return;
    setClearing(true);
    setError(null);
    try {
      await api.deleteAllCustomers();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="p-4">
      <div className="rounded-xl p-3 mb-4" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
          Excel 匯入客戶（customer_import_template.xlsx 格式）
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="text-[12px] w-full min-w-0" />
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
            新增 {importResult.created} 筆・略過 {importResult.skipped} 筆
            {importResult.errors.length > 0 && (
              <div style={{ color: C.danger }} className="mt-1">
                {importResult.errors.length} 筆未匯入（缺客戶名稱或住址），偵測到的 Excel 欄位名稱：
                <b>{importResult.detectedHeaders.join("、")}</b>
                <br />
                請確認欄位名稱是否為「客戶編號／客戶名稱／住址／電話／優先客戶」或其常見別名。
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleAdd} className="rounded-xl p-3 mb-4" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
          新增客戶
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input required placeholder="客戶編號" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
          <input required placeholder="客戶名稱" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
        </div>
        <input required placeholder="住址" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full mb-2 px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
        <div className="flex items-center gap-3 mb-2">
          <input placeholder="電話" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="flex-1 px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
          <label className="flex items-center gap-1 text-[12px]" style={{ color: C.muted }}>
            <input type="checkbox" checked={form.isPriority} onChange={(e) => setForm({ ...form, isPriority: e.target.checked })} /> 優先客戶
          </label>
        </div>
        <button type="submit" disabled={saving} style={{ background: C.bizAccent }} className="text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60">
          {saving ? "新增中…" : "新增客戶"}
        </button>
      </form>

      {error && <div className="text-[12px] mb-2" style={{ color: C.danger }}>{error}</div>}

      {!loading && customers.length > 0 && (
        <div className="flex justify-end gap-2 mb-2 flex-wrap">
          {customers.some((c) => c.lat == null) && (
            <button
              onClick={handleGeocodeMissing}
              disabled={geocoding}
              style={{ color: C.bizAccent, border: `1px solid ${C.bizAccent}` }}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-60"
            >
              {geocoding ? "定位中（可能需要 1-2 分鐘）…" : `補齊座標（${customers.filter((c) => c.lat == null).length} 筆未定位）`}
            </button>
          )}
          <button
            onClick={handleClearAll}
            disabled={clearing}
            style={{ color: C.danger, border: `1px solid ${C.danger}` }}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-60"
          >
            {clearing ? "清除中…" : "清除全部客戶資料"}
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

      {loading ? (
        <div className="text-center text-[13px] py-6" style={{ color: C.muted }}>載入中…</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.hairline}`, background: "#fff" }}>
          {customers.map((c) => (
            <div key={c.id} className="px-3 py-2 border-t first:border-t-0 flex items-start justify-between gap-2" style={{ borderColor: C.hairline }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">{c.code}</span>
                  <span className="font-semibold text-[13px]">{c.name || "（無名稱）"}</span>
                  {c.isPriority && <PriorityTag />}
                  {(c.lat == null || c.lng == null) && (
                    <span style={{ color: C.danger }} className="text-[10px]">
                      未定位
                    </span>
                  )}
                </div>
                <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                  {c.city} ・ {c.address} {c.phone && `・ ${c.phone}`}
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={deletingId === c.id}
                style={{ color: C.danger }}
                className="text-[11px] font-bold px-2 py-1 shrink-0 disabled:opacity-60"
              >
                {deletingId === c.id ? "刪除中…" : "刪除"}
              </button>
            </div>
          ))}
          {customers.length === 0 && (
            <div className="text-center text-[13px] py-6" style={{ color: C.muted }}>
              尚無客戶資料
            </div>
          )}
        </div>
      )}
    </div>
  );
}
