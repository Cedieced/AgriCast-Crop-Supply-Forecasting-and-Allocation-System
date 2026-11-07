const BOUNDARY_NAME_KEYS = [
  "name",
  "barangay",
  "barangay_name",
  "brgy",
  "brgy_name",
  "adm4_en",
  "name_4",
];

const BARANGAY_NAME_ALIASES = new Map([
  ["isok i (pob.)", "isok 1 (poblacion)"],
  ["isok ii pob. (kalamias)", "isok 2 (poblacion)"],
  ["malusak (pob.)", "malusak (poblacion)"],
  ["mataas na bayan (pob.)", "mataas na bayan (poblacion)"],
  ["mercado (pob.)", "mercado (poblacion)"],
  ["murallon (pob.)", "murallon (poblacion)"],
  ["puting buhangin", "putting buhangin"],
  ["san miguel (pob.)", "san miguel (poblacion)"],
  ["tampus (pob.)", "tampus (poblacion)"],
]);

export function normalizeBarangayName(name) {
  const normalized = String(name || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return BARANGAY_NAME_ALIASES.get(normalized) || normalized;
}

export function getBoundaryName(feature) {
  const properties = feature?.properties || {};
  const normalizedProperties = new Map(
    Object.entries(properties).map(([key, value]) => [key.toLocaleLowerCase(), value]),
  );
  for (const key of BOUNDARY_NAME_KEYS) {
    const value = normalizedProperties.get(key);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pointInRing([longitude, latitude], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crossesLatitude = (yi > latitude) !== (yj > latitude);
    if (crossesLatitude &&
        longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonCoordinates(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

function distanceToSegment(point, start, end) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared))
    : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function polygonCentroid(ring) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    twiceArea += cross;
    x += (ring[j][0] + ring[i][0]) * cross;
    y += (ring[j][1] + ring[i][1]) * cross;
  }
  return twiceArea === 0 ? null : [x / (3 * twiceArea), y / (3 * twiceArea)];
}

function polygonArea(rings) {
  const ring = rings[0] || [];
  let twiceArea = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twiceArea += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(twiceArea) / 2;
}

function polygonInteriorPoint(rings) {
  const shell = rings[0];
  if (!shell?.length) return null;
  const centroid = polygonCentroid(shell);
  if (centroid && pointInPolygonCoordinates(centroid, rings)) return centroid;

  const longitudes = shell.map(([longitude]) => longitude);
  const latitudes = shell.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  let bestPoint = null;
  let bestClearance = 0;

  for (const divisions of [24, 48, 96]) {
    for (let x = 0; x < divisions; x++) {
      for (let y = 0; y < divisions; y++) {
        const point = [
          minLongitude + ((x + 0.5) / divisions) * (maxLongitude - minLongitude),
          minLatitude + ((y + 0.5) / divisions) * (maxLatitude - minLatitude),
        ];
        if (!pointInPolygonCoordinates(point, rings)) continue;
        const clearance = Math.min(...rings.flatMap((ring) =>
          ring.slice(1).map((vertex, index) =>
            distanceToSegment(point, ring[index], vertex),
          ),
        ));
        if (clearance > bestClearance) {
          bestPoint = point;
          bestClearance = clearance;
        }
      }
    }
    if (bestPoint) return bestPoint;
  }
  return bestPoint;
}

export function pointInBarangayBoundary(latitude, longitude, geometry) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !geometry) {
    return false;
  }
  const point = [longitude, latitude];
  if (geometry.type === "Polygon") {
    return pointInPolygonCoordinates(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointInPolygonCoordinates(point, polygon),
    );
  }
  return false;
}

export function representativePointInBoundary(geometry) {
  if (geometry?.type === "Polygon") {
    const point = polygonInteriorPoint(geometry.coordinates);
    return point ? [point[1], point[0]] : null;
  }
  if (geometry?.type === "MultiPolygon") {
    const largestPolygon = geometry.coordinates
      .slice()
      .sort((a, b) => polygonArea(b) - polygonArea(a))[0];
    const point = largestPolygon && polygonInteriorPoint(largestPolygon);
    return point ? [point[1], point[0]] : null;
  }
  return null;
}
