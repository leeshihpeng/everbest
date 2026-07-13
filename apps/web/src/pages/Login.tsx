import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { setSession } from "../lib/auth";
import { C } from "../components/common";

export default function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, staff } = await api.login(name, password);
      setSession(token, staff);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4">
      <div style={{ background: C.navy }} className="px-5 pt-8 pb-10 rounded-b-3xl text-white">
        <div style={{ fontFamily: "Manrope", color: "#9FB0C9" }} className="text-[11px] font-bold tracking-wide mb-1">
          ROUTE SCHEDULER
        </div>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[22px] font-black leading-tight">
          路線排程系統
        </div>
        <div style={{ color: "#B7C2D6" }} className="text-[12px] mt-1">
          請登入
        </div>
      </div>
      <form onSubmit={handleSubmit} className="p-4 -mt-5">
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#fff" }}>
          <label style={{ color: C.muted, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[12px] font-bold block mb-1">
            姓名
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg text-[14px]"
            style={{ border: `1px solid ${C.hairline}` }}
            placeholder="例如：陳主管"
          />
          <label style={{ color: C.muted, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[12px] font-bold block mb-1">
            密碼
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg text-[14px]"
            style={{ border: `1px solid ${C.hairline}` }}
            placeholder="密碼"
          />
          {error && (
            <div style={{ color: C.danger }} className="text-[12px] mb-3">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{ background: C.bizAccent }}
            className="w-full text-white font-bold text-[14px] py-3 rounded-xl disabled:opacity-60"
          >
            {loading ? "登入中…" : "登入"}
          </button>
        </div>
      </form>
    </div>
  );
}
