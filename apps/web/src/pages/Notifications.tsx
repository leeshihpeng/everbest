import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api } from "../api/client";
import { C, TopBar } from "../components/common";

interface NotificationItem {
  id: string;
  orderId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.getNotifications());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClick(item: NotificationItem) {
    if (item.isRead) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    try {
      await api.markNotificationRead(item.id);
    } catch {
      // 標記已讀失敗不影響瀏覽，下次載入會再嘗試
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const prev = items;
    setItems((cur) => cur.filter((n) => n.id !== id));
    try {
      await api.deleteNotification(id);
    } catch (err) {
      setItems(prev);
      setError((err as Error).message);
    }
  }

  return (
    <div>
      {/* 回到來源頁：主管來自路線排程首頁，送貨人員來自今日配送名單 */}
      <TopBar title="通知" accent={C.navy} onBack={() => navigate(-1)} />
      <div className="p-4">
        {loading && (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            載入中…
          </div>
        )}
        {error && (
          <div className="text-center text-[13px] py-8" style={{ color: C.danger }}>
            {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            目前沒有通知
          </div>
        )}
        {!loading &&
          items.map((n) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className="w-full text-left rounded-xl p-3 mb-2 flex items-start gap-2 cursor-pointer"
              style={{ background: n.isRead ? "#fff" : C.bizAccentSoft, border: `1px solid ${C.hairline}` }}
            >
              {!n.isRead && <div className="mt-1.5 rounded-full shrink-0" style={{ width: 7, height: 7, background: C.bizAccent }} />}
              <div className="flex-1">
                <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.text }} className={`text-[13px] ${n.isRead ? "" : "font-bold"}`}>
                  {n.message}
                </div>
                <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                  {formatTime(n.createdAt)}
                </div>
              </div>
              <button onClick={(e) => handleDelete(e, n.id)} className="p-1 -mt-1 -mr-1 shrink-0">
                <Trash2 size={15} color={C.muted} />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
