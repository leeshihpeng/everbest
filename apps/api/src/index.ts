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
import { errorHandler } from "./middleware/errorHandler";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/customers", customersRouter);
app.use("/staff", staffRouter);
app.use("/orders", ordersRouter);
app.use("/route", routeRouter);
app.use("/notifications", notifyRouter);
app.use("/settings", settingsRouter);
app.use("/reports", reportsRouter);

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
