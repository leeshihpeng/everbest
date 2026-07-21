import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Download, Upload } from "lucide-react";
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
      setUploadMsg(`已更新報價單：${r.fileName}，舊檔已覆蓋`);
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
          <div className="rounded-xl p-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px] break-all">
              {sheet.fileName}
            </div>
            <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
              更新於 {sheet.uploadedAt.slice(0, 10).replace(/-/g, "/")}
              {sheet.uploadedBy ? `・${sheet.uploadedBy}` : ""}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={handlePreview}
                disabled={busy}
                style={{ border: `1px solid ${C.bizAccent}`, color: C.bizAccent }}
                className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-50"
              >
                <Eye size={13} /> 預覽
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
          </div>
        )}
      </div>
    </div>
  );
}
