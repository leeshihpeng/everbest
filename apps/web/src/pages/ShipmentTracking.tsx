import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderClosed, Upload, Truck, Trash2 } from "lucide-react";
import { api, ShipmentRow } from "../api/client";
import { getAuthedStaff } from "../lib/auth";
import { C, TopBar, TileGrid, Tile } from "../components/common";

interface Folder {
  region: string;
  carrier: string;
  count: number;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "/");
}

export default function ShipmentTracking() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  const canManage = !!staff?.roles.includes("ADMIN");

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<Folder | null>(null);
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [dateFilter, setDateFilter] = useState<string>("all"); // "all" 或 "YYYY/MM/DD"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function loadFolders() {
    setLoading(true);
    setError(null);
    try {
      setFolders(await api.getShipmentFolders());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRows(f: Folder) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getShipments(f.carrier, f.region);
      setRows(data);
      // 保留兩週的資料，預設只顯示最新一天的報表，其他配送日期用上方的日期列切換
      setDateFilter(data.length > 0 ? fmtDate(data[0].shipDate) : "all");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFolders();
  }, []);

  function openFolder(f: Folder) {
    setSelected(f);
    setImportMsg(null);
    loadRows(f);
  }

  function back() {
    setSelected(null);
    setRows([]);
    setError(null);
    loadFolders();
  }

  async function handleImport() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setImporting(true);
    setError(null);
    setImportMsg(null);
    try {
      const r = await api.importShipments(files);
      if (fileRef.current) fileRef.current.value = "";
      const parts = Object.entries(r.summary).map(([k, v]) => `${k} ${v} 筆`);
      setImportMsg(
        `已匯入 ${r.imported} 筆` +
          (parts.length ? `（${parts.join("、")}）` : "") +
          (r.replaced > 0 ? `；更新同日既有資料 ${r.replaced} 筆` : "") +
          (r.purged > 0 ? `；清除兩週前的舊報表 ${r.purged} 筆` : "") +
          (r.unclassified > 0 ? `；其中 ${r.unclassified} 筆地址判不出區域，已歸入「未分類」` : "")
      );
      if (r.errors.length > 0) setError(r.errors.join("；"));
      await loadFolders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(r: ShipmentRow) {
    if (!confirm(`確定要刪除「${r.recipient}」這筆託運（${r.trackingNo}）嗎？`)) return;
    setError(null);
    try {
      await api.deleteShipment(r.id);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const isHsinchu = selected?.carrier === "新竹貨運";
  // 資料依配送日期由新到舊排序，Set 會保留這個順序
  const dates = [...new Set(rows.map((r) => fmtDate(r.shipDate)))];
  const shown = dateFilter === "all" ? rows : rows.filter((r) => fmtDate(r.shipDate) === dateFilter);

  return (
    <div>
      <TopBar
        title={selected ? `${selected.region} ${selected.carrier}` : "貨物追蹤"}
        accent={C.navy}
        onBack={() => (selected ? back() : navigate("/"))}
      />
      <div className="p-4">
        {canManage && !selected && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
              上傳託運報表（新竹／大榮 PDF，自動辨識並分區）
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
        ) : !selected ? (
          folders.length === 0 ? (
            <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
              目前沒有可查看的託運資料
            </div>
          ) : (
            <TileGrid>
              {folders.map((f) => (
                <Tile
                  key={`${f.region}-${f.carrier}`}
                  icon={f.count > 0 ? Truck : FolderClosed}
                  label={`${f.region} ${f.carrier}`}
                  sub={`${f.count} 筆託運`}
                  color={f.carrier === "新竹貨運" ? C.bizAccent : C.gold}
                  soft={f.carrier === "新竹貨運" ? C.bizAccentSoft : C.goldSoft}
                  dimmed={f.count === 0}
                  onClick={() => openFolder(f)}
                />
              ))}
            </TileGrid>
          )
        ) : rows.length === 0 ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            這個區域目前沒有託運資料
          </div>
        ) : (
          <>
            {/* 配送日期切換：預設最新一天，可回看兩週內的其他報表 */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span style={{ color: C.muted }} className="text-[11px] shrink-0">
                配送日期
              </span>
              {dates.map((d) => (
                <button
                  key={d}
                  onClick={() => setDateFilter(d)}
                  style={
                    dateFilter === d
                      ? { background: C.navy, color: "#fff" }
                      : { background: "#fff", border: `1px solid ${C.hairline}`, color: C.text }
                  }
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                >
                  {d.slice(5)}
                </button>
              ))}
              {dates.length > 1 && (
                <button
                  onClick={() => setDateFilter("all")}
                  style={
                    dateFilter === "all"
                      ? { background: C.navy, color: "#fff" }
                      : { background: "#fff", border: `1px solid ${C.hairline}`, color: C.text }
                  }
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                >
                  全部
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: C.muted }} className="text-[12px]">
                {dateFilter === "all" ? "全部" : dateFilter}・共 {shown.length} 筆・{shown.reduce((s, r) => s + r.pieces, 0)} 件・
                {shown.reduce((s, r) => s + r.weight, 0)} 公斤
              </span>
              <span style={{ color: C.muted }} className="text-[11px]">
                保留兩週內報表
              </span>
            </div>
            {shown.map((r, i) => {
              const date = fmtDate(r.shipDate);
              const newDay = dateFilter === "all" && (i === 0 || fmtDate(shown[i - 1].shipDate) !== date);
              const dayRows = newDay ? shown.filter((x) => fmtDate(x.shipDate) === date) : [];
              return (
              <div key={r.id}>
                {newDay && (
                  <div className={`flex items-center justify-between mb-1.5 px-1 ${i === 0 ? "" : "mt-4"}`}>
                    <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px]">
                      {date}
                    </span>
                    <span style={{ color: C.muted }} className="text-[11px]">
                      {dayRows.length} 筆・{dayRows.reduce((s, x) => s + x.pieces, 0)} 件・
                      {dayRows.reduce((s, x) => s + x.weight, 0)} 公斤
                    </span>
                  </div>
                )}
              <div className="rounded-xl p-3 mb-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px] break-all">
                      {r.recipient}
                    </div>
                    <div style={{ fontFamily: "Manrope", color: C.bizAccent }} className="text-[12px] font-bold mt-0.5">
                      {r.trackingNo}
                    </div>
                  </div>
                  <span
                    style={{ background: C.bg, color: C.text }}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                  >
                    {r.seq != null ? `序 ${r.seq}・` : ""}
                    {r.stationCode ? `${r.stationCode} ` : ""}
                    {r.station}
                  </span>
                </div>

                <div style={{ color: C.muted }} className="text-[11px] mt-1 break-all">
                  {r.address}
                  {r.phone ? `　${r.phone}` : ""}
                </div>

                {/* 欄位比照各業者原始報表 */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                  <Field label="件數" value={r.pieces} />
                  <Field label="重量" value={r.weight} />
                  {isHsinchu ? (
                    <>
                      {r.voucher && <Field label="傳票區分" value={r.voucher} />}
                      {r.orderNo && <Field label="訂單編號" value={r.orderNo} />}
                    </>
                  ) : (
                    <>
                      {r.cbm != null && <Field label="才數" value={r.cbm} />}
                      {r.cod != null && <Field label="代收貨款" value={r.cod} />}
                      {r.orderNo && <Field label="出貨單號" value={r.orderNo} />}
                    </>
                  )}
                </div>

                {r.note && (
                  <div className="mt-1.5 text-[11px] px-2 py-1 rounded" style={{ background: C.logiAccentSoft, color: C.logiAccent }}>
                    {isHsinchu ? "內容品" : "備註"}：{r.note}
                  </div>
                )}

                {canManage && (
                  <div className="flex justify-end mt-1.5">
                    <button
                      onClick={() => handleDelete(r)}
                      style={{ border: `1px solid ${C.danger}`, color: C.danger }}
                      className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg"
                    >
                      <Trash2 size={12} /> 刪除
                    </button>
                  </div>
                )}
              </div>
              </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span style={{ color: C.muted }}>{label} </span>
      <span style={{ fontFamily: "Manrope", color: C.text }} className="font-bold">
        {value}
      </span>
    </span>
  );
}
