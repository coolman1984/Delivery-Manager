export interface Point {
  lat: number;
  lng: number;
}

/** المسافة بين نقطتين على الخريطة بالكيلومتر */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface ZoneArea extends Point {
  id: string;
  radiusKm: number;
}

/** أنهي منطقة فيها النقطة دي؟ لو في أكتر من واحدة، الأقرب لمركزها */
export function detectZone<T extends ZoneArea>(zones: T[], point: Point): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const z of zones) {
    const d = distanceKm(z, point);
    if (d <= z.radiusKm && d < bestDistance) {
      best = z;
      bestDistance = d;
    }
  }
  return best;
}
