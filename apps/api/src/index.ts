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
import { quotesRouter } from "./routes/quotes";
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
            // 帶 status 讓 errorHandler 回 403；不加的話會變成 500，
            // 把「正常擋掉外部網站」跟「系統真的壞了」混在一起。
            cb(Object.assign(new Error("不允許的來源"), { status: 403 }));
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

// 服務啟動時間，用來判斷「改完環境變數後到底有沒有重啟」
const STARTED_AT = new Date().toISOString();

// 診斷用：只回布林值與數量，不吐出任何變數內容。
// 今天（2026-07-22）發生過「Render 說部署完成、實際跑舊程式」以及
// 「環境變數設了卻沒生效」，光從外面觀察分不出是哪一種，所以留這個端點。
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    startedAt: STARTED_AT,
    corsRestricted: allowedOrigins.length > 0,
    corsCount: allowedOrigins.length,
    hasJwtSecret: !!process.env.JWT_SECRET,
  })
);

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
app.use("/quotes", quotesRouter);

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
