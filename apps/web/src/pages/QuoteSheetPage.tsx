import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Download, Upload, Search } from "lucide-react";
import { api, QuoteSheet } from "../api/client";
import { getAuthedStaff } from "../lib/auth";
import { C, TopBar } from "../components/common";

export default function QuoteSheetPage() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  const canUpload = !!staff?.roles.includes("ADMIN");

  const [sheet, setSheet] = useState<QuoteSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSheet(await api.getQuoteSheet());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    if (!sheet) return [];
    const k = keyword.trim().toLowerCase();
    if (!k) return sheet.items;
    return sheet.items.filter((i) =>
      [i.code, i.productName, i.brand, i.spec, i.price, i.note].join(" ").toLowerCase().includes(k)
    );
  }, [sheet, keyword]);

  async function withBlob(action: (blob: Blob) => void) {
    setBusy(true);
    setError(null);
    try {
      action(await api.fetchQuoteBlob());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handlePreview() {
    withBlob((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }

  function handleDownload() {
    withBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sheet?.fileName ?? "產品報價單"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadMsg(null);
    try {
      const r = await api.uploadQuoteSheet(file);
      if (fileRef.current) fileRef.current.value = "";
      setUploadMsg(`已更新報價單：${r.fileName}（${r.itemCount} 項產品），舊檔已覆蓋`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <TopBar title="產品報價單" accent={C.navy} onBack={() => navigate("/")} />
      <div className="p-4">
        {canUpload && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
              上傳新報價單（會覆蓋舊檔，只保留一份）
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept=".pdf" className="text-[12px] w-full min-w-0" />
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{ background: C.navy }}
                className="w-full flex items-center justify-center gap-1.5 text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60"
              >
                <Upload size={14} /> {uploading ? "上傳中…" : "上傳並覆蓋"}
              </button>
            </div>
            {uploadMsg && (
              <div className="text-[12px] mt-2" style={{ color: C.logiAccent }}>
                {uploadMsg}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-[12px] mb-2" style={{ color: C.danger }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            載入中…
          </div>
        ) : !sheet ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            尚未上傳產品報價單
          </div>
        ) : (
          <>
            <div className="rounded-xl p-3 mb-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] break-all">
                {sheet.fileName}
              </div>
              <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                共 {sheet.items.length} 項・更新於 {sheet.uploadedAt.slice(0, 10).replace(/-/g, "/")}
                {sheet.uploadedBy ? `・${sheet.uploadedBy}` : ""}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  onClick={handlePreview}
                  disabled={busy}
                  style={{ border: `1px solid ${C.bizAccent}`, color: C.bizAccent }}
                  className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-50"
                >
                  <Eye size={13} /> 預覽原始檔
                </button>
                <button
                  onClick={handleDownload}
                  disabled={busy}
                  style={{ border: `1px solid ${C.logiAccent}`, color: C.logiAccent }}
                  className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-50"
                >
                  <Download size={13} /> 下載
                </button>
              </div>
              {/* 表格是從 PDF 自動判讀的，少數欄位可能有落差，報價前以原始檔為準 */}
              <div className="text-[11px] mt-2 px-2 py-1 rounded" style={{ background: C.goldSoft, color: C.gold }}>
                下表為自動判讀結果，僅供快速查詢；正式報價請以「預覽原始檔」的內容為準。
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
              <Search size={14} color={C.muted} />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋代號、品名、品牌…"
                className="flex-1 min-w-0 text-[13px] outline-none"
              />
              {keyword && (
                <button onClick={() => setKeyword("")} style={{ color: C.muted }} className="text-[11px]">
                  清除
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
                找不到符合的產品
              </div>
            ) : (
              rows.map((it) => {
                const out = /缺貨/.test(it.price) || /缺貨/.test(it.note);
                return (
                  <div key={it.id} className="rounded-xl p-3 mb-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span style={{ fontFamily: "Manrope", color: C.bizAccent }} className="text-[11px] font-bold">
                            {it.code}
                          </span>
                          <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px]">
                            {it.productName}
                          </span>
                        </div>
                        <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                          {[it.brand, it.spec].filter(Boolean).join("・")}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          style={{ fontFamily: "Manrope", color: out ? C.danger : C.text }}
                          className="text-[15px] font-extrabold"
                        >
                          {it.price || "—"}
                        </div>
                        {it.validDate && (
                          <div style={{ color: C.muted }} className="text-[10px]">
                            效期 {it.validDate}
                          </div>
                        )}
                      </div>
                    </div>
                    {it.note && (
                      <div className="mt-1.5 text-[11px] px-2 py-1 rounded" style={{ background: C.bg, color: C.text }}>
                        {it.note}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
