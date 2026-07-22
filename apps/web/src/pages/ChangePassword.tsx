import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { getAuthedStaff, clearMustChangePassword } from "../lib/auth";
import { PASSWORD_RULE_TEXT, validatePassword } from "../lib/password";
import { C, TopBar } from "../components/common";

/** 本人修改自己的密碼。主管重設過密碼的人由 Login 直接帶到這裡（forced），
 *  改完之前不讓他進系統，所以那個情況不顯示返回鍵。 */
export default function ChangePassword({ forced = false }: { forced?: boolean }) {
  const navigate = useNavigate();
  const staff = getAuthedStaff();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = validatePassword(next);
    if (invalid) return setError(invalid);
    if (next !== confirm) return setError("兩次輸入的新密碼不一樣");
    if (next === current) return setError("新密碼不能跟目前的密碼一樣");

    setSaving(true);
    try {
      // 改密碼會讓舊 token 失效，要換上後端回傳的新 token，否則下一個請求就變成未登入
      const { token } = await api.changePassword(current, next);
      if (token) localStorage.setItem("token", token);
      clearMustChangePassword();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div>
        <TopBar title="修改密碼" accent={C.navy} onBack={() => navigate("/")} />
        <div className="p-4">
          <div className="rounded-xl p-4 text-[13px]" style={{ background: C.logiAccentSoft, color: C.logiAccent }}>
            密碼已更新。下次登入請用新密碼。
          </div>
          <button onClick={() => navigate("/")} style={{ background: C.navy }} className="w-full text-white font-bold text-[14px] py-3 rounded-xl mt-4">
            回主目錄
          </button>
        </div>
      </div>
    );
  }

  const inputStyle = { border: `1px solid ${C.hairline}` };
  const labelClass = "text-[12px] font-bold block mb-1";
  const labelStyle = { color: C.muted, fontFamily: "'Noto Sans TC', sans-serif" };

  return (
    <div>
      {!forced && <TopBar title="修改密碼" accent={C.navy} onBack={() => navigate("/")} />}
      <div className="p-4">
        {forced && (
          <div className="rounded-xl p-3 mb-3 text-[13px]" style={{ background: C.goldSoft, color: C.gold }}>
            {staff?.name}，你的密碼被主管重設過。請先設定一組自己的新密碼才能繼續使用。
          </div>
        )}
        <form onSubmit={handleSubmit} className="rounded-2xl p-4 shadow-sm" style={{ background: "#fff" }}>
          <label style={labelStyle} className={labelClass}>
            {forced ? "主管給的臨時密碼" : "目前密碼"}
          </label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg text-[14px]"
            style={inputStyle}
          />
          <label style={labelStyle} className={labelClass}>
            新密碼
          </label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full mb-1 px-3 py-2 rounded-lg text-[14px]"
            style={inputStyle}
          />
          <div style={{ color: C.muted }} className="text-[11px] mb-3">
            {PASSWORD_RULE_TEXT}
          </div>
          <label style={labelStyle} className={labelClass}>
            再輸入一次新密碼
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg text-[14px]"
            style={inputStyle}
          />
          {error && (
            <div style={{ color: C.danger }} className="text-[12px] mb-3">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{ background: C.navy }}
            className="w-full text-white font-bold text-[14px] py-3 rounded-xl disabled:opacity-60"
          >
            {saving ? "儲存中…" : "設定新密碼"}
          </button>
        </form>
      </div>
    </div>
  );
}
