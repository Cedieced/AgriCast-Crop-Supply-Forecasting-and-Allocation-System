import test from "node:test";
import assert from "node:assert/strict";
import {
  getBoundaryName,
  normalizeBarangayName,
  pointInBarangayBoundary,
  representativePointInBoundary,
} from "../src/map-geometry.js";

const square = {
  type: "Polygon",
  coordinates: [[[121, 13], [122, 13], [122, 14], [121, 14], [121, 13]]],
};

test("validates points against polygon and multipolygon barangay geometry", () => {
  assert.equal(pointInBarangayBoundary(13.5, 121.5, square), true);
  assert.equal(pointInBarangayBoundary(14.5, 121.5, square), false);
  assert.equal(pointInBarangayBoundary(13.5, 121.5, {
    type: "MultiPolygon",
    coordinates: [square.coordinates, [[[123, 13], [124, 13], [124, 14], [123, 14], [123, 13]]]],
  }), true);
});

test("excludes points in polygon holes and rejects unsupported geometry", () => {
  assert.equal(pointInBarangayBoundary(13.5, 121.5, {
    type: "Polygon",
    coordinates: [
      square.coordinates[0],
      [[121.4, 13.4], [121.6, 13.4], [121.6, 13.6], [121.4, 13.6], [121.4, 13.4]],
    ],
  }), false);
  assert.equal(pointInBarangayBoundary(13.5, 121.5, { type: "Point", coordinates: [121.5, 13.5] }), false);
  assert.equal(pointInBarangayBoundary(Number.NaN, 121.5, square), false);
});

test("matches barangay property names case-insensitively", () => {
  assert.equal(getBoundaryName({ properties: { BRGY_NAME: "Agumaymayan" } }), "Agumaymayan");
  assert.equal(normalizeBarangayName("  Agumaymayan "), "agumaymayan");
});

test("matches NAMRIA spelling and Poblacion aliases to dashboard barangay names", () => {
  const aliases = [
    ["Isok I (Pob.)", "Isok 1 (Poblacion)"],
    ["Isok II Pob. (Kalamias)", "Isok 2 (Poblacion)"],
    ["Malusak (Pob.)", "Malusak (Poblacion)"],
    ["Mataas Na Bayan (Pob.)", "Mataas na Bayan (Poblacion)"],
    ["Mercado (Pob.)", "Mercado (Poblacion)"],
    ["Murallon (Pob.)", "Murallon (Poblacion)"],
    ["Puting Buhangin", "Putting Buhangin"],
    ["San Miguel (Pob.)", "San Miguel (Poblacion)"],
    ["Tampus (Pob.)", "Tampus (Poblacion)"],
  ];
  for (const [boundaryName, dashboardName] of aliases) {
    assert.equal(normalizeBarangayName(boundaryName), normalizeBarangayName(dashboardName));
  }
});

test("generates a representative point inside concave barangay geometry", () => {
  const concave = {
    type: "Polygon",
    coordinates: [[
      [121, 13], [123, 13], [123, 14], [122, 14],
      [122, 13.2], [121.2, 13.2], [121.2, 14], [121, 14], [121, 13],
    ]],
  };
  const point = representativePointInBoundary(concave);
  assert.ok(point);
  assert.equal(pointInBarangayBoundary(point[0], point[1], concave), true);
});

test("chooses an interior point from the largest multipolygon component", () => {
  const geometry = {
    type: "MultiPolygon",
    coordinates: [
      [[[121, 13], [121.1, 13], [121.1, 13.1], [121, 13.1], [121, 13]]],
      [[[122, 13], [123, 13], [123, 14], [122, 14], [122, 13]]],
    ],
  };
  const point = representativePointInBoundary(geometry);
  assert.ok(point);
  assert.ok(point[1] > 122 && point[1] < 123);
  assert.ok(pointInBarangayBoundary(point[0], point[1], geometry));
});
