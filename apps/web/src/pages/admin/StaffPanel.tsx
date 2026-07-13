import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { C } from "../../components/common";
import { TAIWAN_CITIES } from "../../lib/taiwanCities";

const ROLE_LABELS: Record<string, string> = { SALES: "業務", MANAGER: "主管", DRIVER: "送貨" };
const ALL_ROLES = ["SALES", "MANAGER", "DRIVER"];

interface Staff {
  id: string;
  name: string;
  roles: string[];
  homeAddress: string;
  homeLat?: number | null;
  lineGroupId?: string;
  salesRegions?: string[];
}

export default function StaffPanel() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: "", homeAddress: "", password: "", lineGroupId: "" });
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [formRegions, setFormRegions] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRegions, setEditRegions] = useState<Set<string>>(new Set());
  const [savingRegions, setSavingRegions] = useState(false);

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<{ total: number; updated: number; failed: number; errors: string[] } | null>(null);

  async function load() {
    setLoading(true);
    try {
      setStaff(await api.getStaff());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleRole(role: string) {
    const s = new Set(roles);
    s.has(role) ? s.delete(role) : s.add(role);
    setRoles(s);
  }

  function toggleFormRegion(city: string) {
    const s = new Set(formRegions);
    s.has(city) ? s.delete(city) : s.add(city);
    setFormRegions(s);
  }

  function toggleEditRegion(city: string) {
    const s = new Set(editRegions);
    s.has(city) ? s.delete(city) : s.add(city);
    setEditRegions(s);
  }

  function startEditRegions(s: Staff) {
    setEditingId(s.id);
    setEditRegions(new Set(s.salesRegions ?? []));
  }

  async function handleSaveRegions(id: string) {
    setSavingRegions(true);
    setError(null);
    try {
      await api.updateStaff(id, { salesRegions: Array.from(editRegions) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingRegions(false);
    }
  }

  const rolesInvalid = roles.has("MANAGER") && roles.has("DRIVER");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (rolesInvalid) {
      setError("物流主管與送貨人員為互斥角色，不可同時指派");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createStaff({ ...form, roles: Array.from(roles), salesRegions: Array.from(formRegions) });
      setForm({ name: "", homeAddress: "", password: "", lineGroupId: "" });
      setRoles(new Set());
      setFormRegions(new Set());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGeocodeMissing() {
    setGeocoding(true);
    setGeocodeResult(null);
    setError(null);
    try {
      const result = await api.geocodeMissingStaff();
      setGeocodeResult(result);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeocoding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這位人員嗎？該人員指派的派遣單會改回未指派。")) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteStaff(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-4">
      <form onSubmit={handleAdd} className="rounded-xl p-3 mb-4" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
          新增人員
        </div>
        <input required placeholder="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mb-2 px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
        <input required placeholder="住家地址" value={form.homeAddress} onChange={(e) => setForm({ ...form, homeAddress: e.target.value })} className="w-full mb-2 px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
        <input required type="password" placeholder="登入密碼" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full mb-2 px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
        <input placeholder="LINE 群組 ID（選填）" value={form.lineGroupId} onChange={(e) => setForm({ ...form, lineGroupId: e.target.value })} className="w-full mb-2 px-2 py-1.5 rounded text-[12px]" style={{ border: `1px solid ${C.hairline}` }} />
        <div className="flex gap-3 mb-2">
          {ALL_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-1 text-[12px]" style={{ color: C.muted }}>
              <input type="checkbox" checked={roles.has(r)} onChange={() => toggleRole(r)} /> {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        {rolesInvalid && (
          <div className="text-[11px] mb-2" style={{ color: C.danger }}>
            物流主管與送貨人員為互斥角色，不可同時指派
          </div>
        )}
        {roles.has("SALES") && (
          <div className="mb-2">
            <div style={{ color: C.muted }} className="text-[11px] font-bold mb-1">
              業務範圍（不勾＝不限制）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TAIWAN_CITIES.map((city) => (
                <button
                  type="button"
                  key={city}
                  onClick={() => toggleFormRegion(city)}
                  style={
                    formRegions.has(city)
                      ? { background: C.bizAccent, color: "#fff", borderColor: C.bizAccent }
                      : { color: C.muted, borderColor: C.hairline }
                  }
                  className="px-2 py-1 rounded-full text-[11px] font-medium border"
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="submit" disabled={saving || rolesInvalid} style={{ background: C.bizAccent }} className="text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60">
          {saving ? "新增中…" : "新增人員"}
        </button>
      </form>

      {error && <div className="text-[12px] mb-2" style={{ color: C.danger }}>{error}</div>}

      {!loading && staff.some((s) => s.homeLat == null) && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleGeocodeMissing}
            disabled={geocoding}
            style={{ color: C.bizAccent, border: `1px solid ${C.bizAccent}` }}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-60"
          >
            {geocoding ? "定位中…" : `補齊座標（${staff.filter((s) => s.homeLat == null).length} 筆未定位）`}
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
          {staff.map((s) => (
            <div key={s.id} className="px-3 py-2 border-t first:border-t-0" style={{ borderColor: C.hairline }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-[13px]">{s.name}</span>
                    {s.roles.map((r) => (
                      <span key={r} style={{ background: C.bizAccentSoft, color: C.bizAccent }} className="text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {ROLE_LABELS[r] ?? r}
                      </span>
                    ))}
                    {s.homeLat == null && (
                      <span style={{ color: C.danger }} className="text-[10px]">
                        未定位
                      </span>
                    )}
                  </div>
                  <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                    {s.homeAddress}
                  </div>
                  {s.roles.includes("SALES") && editingId !== s.id && (
                    <div style={{ color: C.muted }} className="text-[11px] mt-1">
                      業務範圍：{s.salesRegions && s.salesRegions.length > 0 ? s.salesRegions.join("、") : "不限制"}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {s.roles.includes("SALES") && (
                    <button
                      onClick={() => (editingId === s.id ? setEditingId(null) : startEditRegions(s))}
                      style={{ color: C.bizAccent }}
                      className="text-[11px] font-bold px-2 py-1"
                    >
                      {editingId === s.id ? "取消" : "編輯範圍"}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    style={{ color: C.danger }}
                    className="text-[11px] font-bold px-2 py-1 disabled:opacity-60"
                  >
                    {deletingId === s.id ? "刪除中…" : "刪除"}
                  </button>
                </div>
              </div>
              {editingId === s.id && (
                <div className="mt-2 rounded-lg p-2" style={{ background: C.bg }}>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {TAIWAN_CITIES.map((city) => (
                      <button
                        key={city}
                        onClick={() => toggleEditRegion(city)}
                        style={
                          editRegions.has(city)
                            ? { background: C.bizAccent, color: "#fff", borderColor: C.bizAccent }
                            : { color: C.muted, borderColor: C.hairline, background: "#fff" }
                        }
                        className="px-2 py-1 rounded-full text-[11px] font-medium border"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSaveRegions(s.id)}
                    disabled={savingRegions}
                    style={{ background: C.bizAccent }}
                    className="text-white text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                  >
                    {savingRegions ? "儲存中…" : "儲存範圍"}
                  </button>
                </div>
              )}
            </div>
          ))}
          {staff.length === 0 && (
            <div className="text-center text-[13px] py-6" style={{ color: C.muted }}>
              尚無人員資料
            </div>
          )}
        </div>
      )}
    </div>
  );
}
