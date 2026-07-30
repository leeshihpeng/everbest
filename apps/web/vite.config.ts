import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // 註冊改由 src/main.tsx 自己做（要加上定期檢查新版），
      // 這裡關掉自動注入，避免同一個 Service Worker 被註冊兩次
      injectRegister: null,
      manifest: {
        name: "路線排程系統",
        short_name: "路線排程",
        start_url: "/",
        display: "standalone",
        background_color: "#F2F4F7",
        theme_color: "#1C2B45",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      // 業務/物流路線結果需可離線查看（規格書 8.）
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/route\/optimize/,
            handler: "NetworkFirst",
            options: { cacheName: "route-cache" },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // 讓同一區網內的手機可以連進來測試（例如 http://<這台電腦的區網IP>:5173）
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
