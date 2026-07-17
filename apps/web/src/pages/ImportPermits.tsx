import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Download, Trash2, Share2, ChevronRight, FolderClosed, Upload } from "lucide-react";
import { api, ImportPermitMeta } from "../api/client";
import { getAuthedStaff } from "../lib/auth";
import { C, TopBar } from "../components/common";

function fmtDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "/");
}

function extOf(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

export default function ImportPermits() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  // 上傳／刪除與檢驗報告一致，僅最高權限者（李世鵬、李世斌）
  const canManage = !!staff?.roles.includes("ADMIN");

  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [permits, setPermits] = useState<ImportPermitMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function loadCategories() {
    setLoading(true);
    setError(null);
    try {
      setCategories(await api.getPermitCategories());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPermits(category: string) {
    setLoading(true);
    setError(null);
    try {
      setPermits(await api.getPermits(category));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function openCategory(category: string) {
    setSelected(category);
    setImportMsg(null);
    loadPermits(category);
  }

  function backToCategories() {
    setSelected(null);
    setPermits([]);
    setError(null);
    setImportMsg(null);
    loadCategories();
  }

  async function handleImport() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0 || !selected) return;
    setImporting(true);
    setError(null);
    setImportMsg(null);
    try {
      const result = await api.importPermits(files, selected);
      if (fileRef.current) fileRef.current.value = "";
      setImportMsg(result.importedCount > 0 ? `已上傳 ${result.importedCount} 份許可證` : null);
      if (result.errors.length > 0) setError(result.errors.join("；"));
      await loadPermits(selected);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function withBlob(p: ImportPermitMeta, action: (blob: Blob) => void | Promise<void>) {
    setBusyId(p.id);
    setError(null);
    try {
      const blob = await api.fetchPermitBlob(p.id);
      await action(blob);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function handlePreview(p: ImportPermitMeta) {
    withBlob(p, (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }

  function handleDownload(p: ImportPermitMeta) {
    withBlob(p, (blob) => triggerDownload(blob, `${p.fileName}.${extOf(p.mimeType)}`));
  }

  // 交給手機系統分享清單直接夾帶檔案（LINE、郵件等）；電腦版不支援時改為下載
  function handleShare(p: ImportPermitMeta) {
    withBlob(p, async (blob) => {
      const name = `${p.fileName}.${extOf(p.mimeType)}`;
      const file = new File([blob], name, { type: p.mimeType });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${p.fileName} 輸入許可證` });
        } catch {
          // 使用者自行取消分享
        }
      } else {
        triggerDownload(blob, name);
        setError("此裝置（多為電腦版瀏覽器）不支援直接分享檔案，已改為下載，請自行附加到 LINE 或郵件。");
      }
    });
  }

  async function handleDelete(p: ImportPermitMeta) {
    if (!confirm(`確定要刪除「${p.fileName}」嗎？此動作無法復原。`)) return;
    setBusyId(p.id);
    setError(null);
    try {
      await api.deletePermit(p.id);
      setPermits((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <TopBar
        title={selected ?? "輸入許可證"}
        accent={C.navy}
        onBack={() => (selected ? backToCategories() : navigate("/"))}
      />
      <div className="p-4">
        {canManage && selected && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
              上傳最新許可證到「{selected}」
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="text-[12px] w-full min-w-0" />
              <button
                onClick={handleImport}
                disabled={importing}
                style={{ background: C.navy }}
                className="w-full flex items-center justify-center gap-1.5 text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60"
              >
                <Upload size={14} /> {importing ? "上傳中…" : "上傳"}
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
        ) : selected === null ? (
          categories.length === 0 ? (
            <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
              目前沒有輸入許可證
            </div>
          ) : (
            categories.map((c) => (
              <button
                key={c.category}
                onClick={() => openCategory(c.category)}
                className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm"
                style={{ background: "#fff" }}
              >
                <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 46, height: 46, background: C.goldSoft }}>
                  <FolderClosed size={22} color={C.gold} />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px] truncate">
                    {c.category}
                  </div>
                  <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                    共 {c.count} 份許可證
                  </div>
                </div>
                <ChevronRight size={18} color={C.muted} className="shrink-0" />
              </button>
            ))
          )
        ) : permits.length === 0 ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            這個產品項目沒有許可證
          </div>
        ) : (
          permits.map((p) => (
            <div key={p.id} className="rounded-xl p-3 mb-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] break-all">
                {p.fileName}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span style={{ color: C.muted }} className="text-[11px]">
                  檔案日期
                </span>
                <span style={{ fontFamily: "Manrope", color: C.text }} className="text-[12px] font-bold">
                  {fmtDate(p.fileDate)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <ActionButton icon={Eye} label="預覽" color={C.bizAccent} disabled={busyId === p.id} onClick={() => handlePreview(p)} />
                <ActionButton icon={Download} label="下載" color={C.logiAccent} disabled={busyId === p.id} onClick={() => handleDownload(p)} />
                <ActionButton icon={Share2} label="分享" color={C.navy} disabled={busyId === p.id} onClick={() => handleShare(p)} />
                {canManage && (
                  <ActionButton icon={Trash2} label="刪除" color={C.danger} disabled={busyId === p.id} onClick={() => handleDelete(p)} />
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
