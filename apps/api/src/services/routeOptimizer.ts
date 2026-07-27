// 路線最佳化服務 — 對應規格書「7. 路線最佳化邏輯」
// 規則：優先客戶固定排在路線最前段（優先組內部依最短路徑排序），
//       其餘客戶接在優先組之後，同樣依最短路徑排序。
// 業務模式與物流模式共用同一套邏輯。

import type { RouteOptimizeRequest, RouteOptimizeResult, RoutePoint } from "@route-scheduler/shared-types";
import { getDistanceMatrix } from "./googleMaps";

type Stop = RouteOptimizeRequest["stops"][number];

/**
 * 從 current 出發，依序找最近的下一站（最近鄰居法，以距離排序）。
 * 回傳依序排好的 stops，以及每一段的距離／時間。
 */
async function nearestNeighborOrder(
  current: RoutePoint,
  stops: Stop[]
): Promise<{ ordered: Stop[]; legDistances: number[]; legDurations: number[] }> {
  const remaining = [...stops];
  const ordered: Stop[] = [];
  const legDistances: number[] = [];
  const legDurations: number[] = [];
  let cur = current;

  while (remaining.length > 0) {
    const matrix = await getDistanceMatrix([cur], remaining);
    const row = matrix[0];
    let bestIdx = 0;
    let bestDist = Infinity;
    row.forEach((c, i) => {
      if (c.distanceKm < bestDist) {
        bestDist = c.distanceKm;
        bestIdx = i;
      }
    });
    const chosen = remaining.splice(bestIdx, 1)[0];
    ordered.push(chosen);
    legDistances.push(row[bestIdx].distanceKm);
    legDurations.push(row[bestIdx].durationMin);
    cur = { lat: chosen.lat, lng: chosen.lng };
  }

  return { ordered, legDistances, legDurations };
}

/** 照傳入順序逐段計算距離／時間，不重新排序（送貨人員自行調整順序後用） */
async function legsInGivenOrder(
  origin: RoutePoint,
  stops: Stop[]
): Promise<{ legDistances: number[]; legDurations: number[] }> {
  const legDistances: number[] = [];
  const legDurations: number[] = [];
  let cur = origin;
  for (const s of stops) {
    const matrix = await getDistanceMatrix([cur], [s]);
    legDistances.push(matrix[0][0].distanceKm);
    legDurations.push(matrix[0][0].durationMin);
    cur = { lat: s.lat, lng: s.lng };
  }
  return { legDistances, legDurations };
}

export async function optimizeRoute(req: RouteOptimizeRequest): Promise<RouteOptimizeResult> {
  if (req.keepOrder) {
    const { legDistances, legDurations } = await legsInGivenOrder(req.origin, req.stops);
    const lastPoint: RoutePoint =
      req.stops.length > 0 ? { lat: req.stops[req.stops.length - 1].lat, lng: req.stops[req.stops.length - 1].lng } : req.origin;
    const finalLeg = (await getDistanceMatrix([lastPoint], [req.destination]))[0][0];
    return {
      orderedStopRefIds: req.stops.map((s) => s.refId),
      legs: req.stops.map((s, i) => ({ refId: s.refId, legDistanceKm: legDistances[i], legDurationMin: legDurations[i] })),
      finalLegDistanceKm: finalLeg.distanceKm,
      finalLegDurationMin: finalLeg.durationMin,
      totalDistanceKm: legDistances.reduce((s, d) => s + d, 0) + finalLeg.distanceKm,
      totalDurationMin: legDurations.reduce((s, d) => s + d, 0) + finalLeg.durationMin,
    };
  }

  const priorityStops = req.stops.filter((s) => s.isPriority);
  const normalStops = req.stops.filter((s) => !s.isPriority);

  const {
    ordered: orderedPriority,
    legDistances: priorityLegs,
    legDurations: priorityDurations,
  } = await nearestNeighborOrder(req.origin, priorityStops);

  const lastPoint: RoutePoint =
    orderedPriority.length > 0
      ? { lat: orderedPriority[orderedPriority.length - 1].lat, lng: orderedPriority[orderedPriority.length - 1].lng }
      : req.origin;

  const {
    ordered: orderedNormal,
    legDistances: normalLegs,
    legDurations: normalDurations,
  } = await nearestNeighborOrder(lastPoint, normalStops);

  const fullOrdered = [...orderedPriority, ...orderedNormal];
  const allLegs = [...priorityLegs, ...normalLegs];
  const allDurations = [...priorityDurations, ...normalDurations];

  const lastStopPoint: RoutePoint =
    fullOrdered.length > 0
      ? { lat: fullOrdered[fullOrdered.length - 1].lat, lng: fullOrdered[fullOrdered.length - 1].lng }
      : req.origin;
  const finalLegMatrix = await getDistanceMatrix([lastStopPoint], [req.destination]);
  const finalLegDistanceKm = finalLegMatrix[0][0].distanceKm;
  const finalLegDurationMin = finalLegMatrix[0][0].durationMin;

  const totalDistanceKm = allLegs.reduce((s, d) => s + d, 0) + finalLegDistanceKm;
  const totalDurationMin = allDurations.reduce((s, d) => s + d, 0) + finalLegDurationMin;

  return {
    orderedStopRefIds: fullOrdered.map((s) => s.refId),
    legs: fullOrdered.map((s, i) => ({ refId: s.refId, legDistanceKm: allLegs[i], legDurationMin: allDurations[i] })),
    finalLegDistanceKm,
    finalLegDurationMin,
    totalDistanceKm,
    totalDurationMin,
  };
}
