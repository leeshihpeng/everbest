import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

// PWA 快取造成的「改好了卻看不到」是這個專案反覆發生的問題：
// 使用者把 App 加到主畫面後，Service Worker 會一直供應舊版，
// 除非把 App 完全關掉重開。這裡主動每 3 分鐘檢查一次新版，
// 有新版就直接套用並重新載入，讓部署完成後幾分鐘內自動生效。
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => {
      registration.update().catch(() => {
        // 離線或伺服器睡著時檢查失敗很正常，下次再試
      });
    }, 3 * 60 * 1000);
  },
  onNeedRefresh() {
    updateSW(true); // true = 立刻啟用新版並重新載入
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
