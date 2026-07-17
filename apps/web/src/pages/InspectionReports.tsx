import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Download, Trash2, MessageCircle, Mail, ChevronRight, FolderClosed } from "lucide-react";
import { api, InspectionReportMeta, publicReportUrl } from "../api/client";
import { getAuthedStaff } from "../lib/auth";
import { C, TopBar } from "../components/common";

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10).replace(/-/g, "/") : "";
}

// 分享給客戶的訊息內容（含公開連結）
function shareMessage(r: InspectionReportMeta): string {
  const date = r.reportDate ? `（報告日期 ${fmtDate(r.reportDate)}）` : "";
  return `${r.fileName} 檢驗報告${date}\n${publicReportUrl(r.shareToken)}`;
}

export default function InspectionReports() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  const isManager = !!staff?.roles.includes("MANAGER");

  const [years, setYears] = useState<{ year: number; count: number }[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [reports, setReports] = useState<InspectionReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadYears() {
    setLoading(true);
    setError(null);
    try {
      setYears(await api.getReportYears());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadReports(year: number) {
    setLoading(true);
    setError(null);
    try {
      setReports(await api.getReports(year));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadYears();
  }, []);

  function openYear(year: number) {
    setSelectedYear(year);
    loadReports(year);
  }

  function backToYears() {
    setSelectedYear(null);
    setReports([]);
    setError(null);
    loadYears();
  }

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

  function handleDownload(r: InspectionReportMeta) {
    withBlob(r, (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  }

  // 開啟 LINE 分享（帶入報告名稱、日期與公開連結，實際送出仍由使用者在 LINE 確認）
  function handleShareLine(r: InspectionReportMeta) {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(shareMessage(r))}`, "_blank");
  }

  // 開啟郵件軟體並帶入內容（實際寄出仍由使用者確認）
  function handleShareMail(r: InspectionReportMeta) {
    const subject = encodeURIComponent(`${r.fileName} 檢驗報告`);
    const body = encodeURIComponent(shareMessage(r));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
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
      <TopBar
        title={selectedYear ? `${selectedYear}檢驗報告` : "檢驗報告"}
        accent={C.navy}
        onBack={() => (selectedYear ? backToYears() : navigate("/"))}
      />
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
        ) : selectedYear === null ? (
          // 年份分類
          years.length === 0 ? (
            <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
              目前沒有檢驗報告
            </div>
          ) : (
            years.map((y) => (
              <button
                key={y.year}
                onClick={() => openYear(y.year)}
                className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm"
                style={{ background: "#fff" }}
              >
                <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: C.bizAccentSoft }}>
                  <FolderClosed size={22} color={C.bizAccent} />
                </div>
                <div className="text-left flex-1">
                  <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">
                    {y.year}檢驗報告
                  </div>
                  <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                    共 {y.count} 份報告
                  </div>
                </div>
                <ChevronRight size={18} color={C.muted} />
              </button>
            ))
          )
        ) : reports.length === 0 ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            這一年沒有檢驗報告
          </div>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="rounded-xl p-3 mb-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
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
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <ActionButton icon={Eye} label="預覽" color={C.bizAccent} disabled={busyId === r.id} onClick={() => handlePreview(r)} />
                <ActionButton icon={Download} label="下載" color={C.logiAccent} disabled={busyId === r.id} onClick={() => handleDownload(r)} />
                <ActionButton icon={MessageCircle} label="LINE" color="#06C755" disabled={false} onClick={() => handleShareLine(r)} />
                <ActionButton icon={Mail} label="Email" color={C.navy} disabled={false} onClick={() => handleShareMail(r)} />
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
