import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { C } from "../../components/common";

export default function SettingsPanel() {
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState<{ companyAddress: string; companyLat?: number; companyLng?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const s = await api.getSettings();
      setSaved(s);
      setAddress(s?.companyAddress ?? "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const s = await api.updateSettings(address);
      setSaved(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-center text-[13px]" style={{ color: C.muted }}>載入中…</div>;

  return (
    <div className="p-4">
      <form onSubmit={handleSave} className="rounded-xl p-3 mb-4" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px] mb-2">
          公司地址
        </div>
        <input
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="例如：新北市汐止區環河街164巷3號"
          className="w-full mb-2 px-2 py-1.5 rounded text-[12px]"
          style={{ border: `1px solid ${C.hairline}` }}
        />
        <div style={{ color: C.muted }} className="text-[11px] mb-2">
          業務／物流模式選「出發地/目的地＝公司」時會用這個地址，儲存時會自動轉換座標。
        </div>
        <button type="submit" disabled={saving} style={{ background: C.bizAccent }} className="text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60">
          {saving ? "儲存中…" : "儲存"}
        </button>
      </form>

      {error && <div className="text-[12px] mb-2" style={{ color: C.danger }}>{error}</div>}

      {saved && (
        <div className="rounded-xl p-3 text-[12px]" style={{ background: "#fff", border: `1px solid ${C.hairline}`, color: C.muted }}>
          目前設定：{saved.companyAddress}
          {saved.companyLat != null ? (
            <span style={{ color: C.bizAccent }}> （已定位）</span>
          ) : (
            <span style={{ color: C.danger }}> （尚未定位）</span>
          )}
        </div>
      )}
    </div>
  );
}
