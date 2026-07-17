import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Download, Trash2, Share2, ChevronRight, FolderClosed, FolderPlus, Upload } from "lucide-react";
import { api, InspectionReportMeta } from "../api/client";
import { getAuthedStaff } from "../lib/auth";
import { C, TopBar } from "../components/common";

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10).replace(/-/g, "/") : "";
}

export default function InspectionReports() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  // 匯入、修改報告日期、刪除皆僅限最高權限者（李世鵬、李世斌）；
  // 物流主管只能預覽／下載／分享
  const canManage = !!staff?.roles.includes("ADMIN");

  const [years, setYears] = useState<{ year: number; count: number }[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [reports, setReports] = useState<InspectionReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

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

  async function handleAddYear() {
    const input = prompt("請輸入要新增的年份（西元年，例如 2027）");
    if (!input) return;
    const year = Number(input.trim());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError("年份格式不正確，請輸入 2000～2100 之間的西元年。");
      return;
    }
    setError(null);
    try {
      await api.createReportYear(year);
      await loadYears();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // 匯入 PDF。在年份目錄內匯入時固定歸到該年份；在年份清單匯入則依報告日期自動分類。
  async function handleImport() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setImporting(true);
    setError(null);
    setImportMsg(null);
    try {
      const result = await api.importReports(files, selectedYear ? { year: selectedYear } : {});
      if (fileRef.current) fileRef.current.value = "";
      const byYear = new Map<number, number>();
      for (const i of result.imported) byYear.set(i.year, (byYear.get(i.year) ?? 0) + 1);
      const summary = [...byYear.entries()].map(([y, n]) => `${y}年 ${n} 份`).join("、");
      setImportMsg(result.importedCount > 0 ? `已匯入 ${result.importedCount} 份報告（${summary}）` : null);
      if (result.errors.length > 0) setError(result.errors.join("；"));
      if (selectedYear) await loadReports(selectedYear);
      else await loadYears();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
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

  // 直接把 PDF 檔案交給手機的系統分享清單（可選 LINE、郵件等 App 夾帶檔案送出，
  // 實際送出仍由使用者在該 App 確認）。電腦版瀏覽器多不支援，改為下載讓使用者自行附加。
  function handleShare(r: InspectionReportMeta) {
    withBlob(r, async (blob) => {
      const file = new File([blob], `${r.fileName}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${r.fileName} 檢驗報告` });
        } catch {
          // 使用者自行取消分享，不算錯誤
        }
      } else {
        triggerDownload(blob, r.fileName);
        setError("此裝置（多為電腦版瀏覽器）不支援直接分享檔案，已改為下載，請自行附加到 LINE 或郵件。");
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
      <TopBar
        title={selectedYear ? `${selectedYear}檢驗報告` : "檢驗報告"}
        accent={C.navy}
        onBack={() => (selectedYear ? backToYears() : navigate("/"))}
      />
      <div className="p-4">
        {canManage && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
            <div className="flex items-center justify-between mb-2">
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px]">
                {selectedYear ? `匯入報告到 ${selectedYear} 年` : "匯入檢驗報告（依報告日期自動分類年份）"}
              </div>
              {!selectedYear && (
                <button onClick={handleAddYear} style={{ color: C.bizAccent }} className="flex items-center gap-1 text-[12px] font-bold">
                  <FolderPlus size={14} /> 新增年份
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept=".pdf" multiple className="text-[12px] w-full min-w-0" />
              <button
                onClick={handleImport}
                disabled={importing}
                style={{ background: C.navy }}
                className="w-full flex items-center justify-center gap-1.5 text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60"
              >
                <Upload size={14} /> {importing ? "匯入中…" : "上傳"}
              </button>
            </div>
            {importMsg && (
              <div className="text-[12px] mt-2" style={{ color: C.logiAccent }}>
                {importMsg}
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
                {canManage ? (
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
                <ActionButton icon={Share2} label="分享" color={C.navy} disabled={busyId === r.id} onClick={() => handleShare(r)} />
                {canManage && (
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
