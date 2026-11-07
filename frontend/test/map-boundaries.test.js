import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { barangays } from "../src/data.js";
import {
  getBoundaryName,
  normalizeBarangayName,
  pointInBarangayBoundary,
  representativePointInBoundary,
} from "../src/map-geometry.js";

const boundaryData = JSON.parse(await readFile(
  new URL("../public/data/boac-barangay-boundaries.geojson", import.meta.url),
  "utf8",
));

test("Boac GeoJSON covers every dashboard barangay with one matched PSGC polygon", () => {
  assert.equal(boundaryData.type, "FeatureCollection");
  assert.equal(boundaryData.features.length, 61);
  const names = new Set();
  for (const feature of boundaryData.features) {
    const name = getBoundaryName(feature);
    const normalizedName = normalizeBarangayName(name);
    assert.ok(name);
    assert.ok(!names.has(normalizedName), `Duplicate barangay polygon: ${name}`);
    assert.equal(feature.properties.ADM3_PCODE, "PH1704001");
    assert.equal(feature.properties.psgc_status, "matched");
    assert.equal(feature.properties.match_confidence, 1);
    assert.equal(feature.properties.psgc_type, "barangay");
    names.add(normalizedName);
  }
  assert.deepEqual(
    barangays.filter((name) => !names.has(normalizeBarangayName(name))),
    [],
  );
});

test("every Boac polygon produces a representative point within its assigned boundary", () => {
  for (const feature of boundaryData.features) {
    const name = getBoundaryName(feature);
    const point = representativePointInBoundary(feature.geometry);
    assert.ok(point, `No interior point for ${name}`);
    assert.ok(
      pointInBarangayBoundary(point[0], point[1], feature.geometry),
      `Representative point is outside ${name}`,
    );
  }
});
