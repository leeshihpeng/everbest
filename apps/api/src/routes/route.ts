import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { optimizeRoute } from "../services/routeOptimizer";
import { getDirections } from "../services/googleMaps";
import type { DirectionsRequest, RouteOptimizeRequest } from "@route-scheduler/shared-types";

export const routeRouter = Router();
routeRouter.use(requireAuth);

// 業務模式：勾選客戶後即時呼叫這支 API 重新排序（規格書 4. 步驟 4 / 6）
routeRouter.post("/optimize", async (req, res, next) => {
  try {
    const body = req.body as RouteOptimizeRequest;
    if (!body.origin || !body.destination || !Array.isArray(body.stops)) {
      return res.status(400).json({ error: "缺少 origin / destination / stops" });
    }
    const result = await optimizeRoute(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 依 /route/optimize 決定好的順序，取得真實 Google 導航路線（地圖用的座標＋逐步街名指示）
// 沒有設定 GOOGLE_MAPS_API_KEY 時回傳 null，前端應該 fallback 成只顯示距離／時間
routeRouter.post("/directions", async (req, res, next) => {
  try {
    const body = req.body as DirectionsRequest;
    if (!body.origin || !body.destination || !Array.isArray(body.stops)) {
      return res.status(400).json({ error: "缺少 origin / destination / stops" });
    }
    const result = await getDirections(
      body.origin,
      body.destination,
      body.stops.map((s) => ({ lat: s.lat, lng: s.lng }))
    );
    if (!result) return res.json(null);

    // Directions API 回傳的 legs 是「origin→stop1, stop1→stop2, ..., 最後一站→destination」，
    // 依序對應到 stops 的 refId，最後一段固定標記為 __destination__
    const legsWithRefIds = result.legs.map((leg, i) => ({
      ...leg,
      refId: i < body.stops.length ? body.stops[i].refId : "__destination__",
    }));

    res.json({ ...result, legs: legsWithRefIds });
  } catch (err) {
    next(err);
  }
});
