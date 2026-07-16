import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Download, Share2, Trash2 } from "lucide-react";
import { api, InspectionReportMeta } from "../api/client";
import { getAuthedStaff } from "../lib/auth";
import { C, TopBar } from "../components/common";

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10).replace(/-/g, "/") : "";
}

export default function InspectionReports() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  const isManager = !!staff?.roles.includes("MANAGER");

  const [reports, setReports] = useState<InspectionReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setReports(await api.getReports());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function withBlob(r: InspectionReportMeta, action: (blob: Blob) => void | Promise<void>) {
    setBusyId(r.id);
    setError(null);
    try {
      const blob = await api.fetchReportBlob(r.id);
      await action(blob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function handlePreview(r: InspectionReportMeta) {
    withBlob(r, (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }

  function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function handleDownload(r: InspectionReportMeta) {
    withBlob(r, (blob) => triggerDownload(blob, r.fileName));
  }

  function handleShare(r: InspectionReportMeta) {
    withBlob(r, async (blob) => {
      const file = new File([blob], `${r.fileName}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${r.fileName} 檢驗報告` });
        } catch {
          // 使用者取消分享，不視為錯誤
        }
      } else {
        triggerDownload(blob, r.fileName);
        setError("此裝置不支援直接分享，已改為下載檔案，可再自行傳送。");
      }
    });
  }

  async function handleDelete(r: InspectionReportMeta) {
    if (!confirm(`確定要刪除「${r.fileName}」檢驗報告嗎？此動作無法復原。`)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await api.deleteReport(r.id);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDateChange(r: InspectionReportMeta, value: string) {
    setError(null);
    try {
      const updated = await api.updateReportDate(r.id, value || null);
      setReports((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <TopBar title="檢驗報告" accent={C.navy} onBack={() => navigate("/")} />
      <div className="p-4">
        {error && (
          <div className="text-[12px] mb-2" style={{ color: C.danger }}>
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            載入中…
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            目前沒有檢驗報告
          </div>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="rounded-xl p-3 mb-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px] truncate">
                    {r.fileName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span style={{ color: C.muted }} className="text-[11px]">
                      報告日期
                    </span>
                    {isManager ? (
                      <input
                        type="date"
                        value={r.reportDate ? r.reportDate.slice(0, 10) : ""}
                        onChange={(e) => handleDateChange(r, e.target.value)}
                        className="text-[11px] px-1.5 py-0.5 rounded"
                        style={{ border: `1px solid ${C.hairline}`, color: r.reportDate ? C.text : C.muted }}
                      />
                    ) : (
                      <span style={{ fontFamily: "Manrope", color: r.reportDate ? C.text : C.muted }} className="text-[12px] font-bold">
                        {r.reportDate ? fmtDate(r.reportDate) : "未設定"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <ActionButton icon={Eye} label="預覽" color={C.bizAccent} disabled={busyId === r.id} onClick={() => handlePreview(r)} />
                <ActionButton icon={Download} label="下載" color={C.logiAccent} disabled={busyId === r.id} onClick={() => handleDownload(r)} />
                <ActionButton icon={Share2} label="分享" color={C.navy} disabled={busyId === r.id} onClick={() => handleShare(r)} />
                {isManager && (
                  <ActionButton icon={Trash2} label="刪除" color={C.danger} disabled={busyId === r.id} onClick={() => handleDelete(r)} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  color,
  disabled,
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ border: `1px solid ${color}`, color }}
      className="flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-50"
    >
      <Icon size={13} /> {label}
    </button>
  );
}
