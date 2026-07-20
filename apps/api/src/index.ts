import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { customersRouter } from "./routes/customers";
import { staffRouter } from "./routes/staff";
import { ordersRouter } from "./routes/orders";
import { routeRouter } from "./routes/route";
import { notifyRouter } from "./routes/notify";
import { settingsRouter } from "./routes/settings";
import { reportsRouter } from "./routes/reports";
import { permitsRouter } from "./routes/permits";
import { shipmentsRouter } from "./routes/shipments";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// 只允許自家前端呼叫。設定 CORS_ORIGINS（逗號分隔）即生效；未設定時維持開放，
// 以免正式站漏設就整個壞掉，但正式環境請務必設定。
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin: (origin, cb) => {
            // same-origin／curl 等沒有 Origin 標頭的請求一律放行
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error("不允許的來源"));
          },
        }
      : undefined
  )
);

// 基本防護標頭：避免瀏覽器誤判內容型別、不要把網址帶到外站、禁止被嵌成 iframe
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// 限制 JSON 大小，避免超大請求塞爆記憶體
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/customers", customersRouter);
app.use("/staff", staffRouter);
app.use("/orders", ordersRouter);
app.use("/route", routeRouter);
app.use("/notifications", notifyRouter);
app.use("/settings", settingsRouter);
app.use("/reports", reportsRouter);
app.use("/permits", permitsRouter);
app.use("/shipments", shipmentsRouter);

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
