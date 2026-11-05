import test from "node:test";
import assert from "node:assert/strict";
import {
  allocationPlan,
  estimatedHarvestDate,
  expectedHarvest,
  supplyStatus,
  weeklyDemand,
} from "../src/domain.js";

test("expected harvest and date follow crop area and maturity formulas", () => {
  assert.equal(expectedHarvest(2, 4500), 9000);
  assert.equal(estimatedHarvestDate("2026-01-01", 120), "2026-05-01");
});

test("weekly demand uses annual per-capita consumption divided by 52", () => {
  assert.equal(weeklyDemand(520, 52), 520);
});

test("supply analysis distinguishes shortage, balance, and oversupply", () => {
  assert.equal(supplyStatus(80, 100), "shortage");
  assert.equal(supplyStatus(100, 100), "balanced");
  assert.equal(supplyStatus(120, 100), "oversupply");
});

test("allocation stays within surplus and each destination's remaining demand", () => {
  const plan = allocationPlan(5000, [
    { municipality_id: 1, remaining_demand_kg: 3000 },
    { municipality_id: 2, remaining_demand_kg: 4000 },
  ]);
  assert.deepEqual(plan.map((item) => [item.municipality_id, item.recommended_kg]), [
    [2, 4000],
    [1, 1000],
  ]);
  assert.equal(plan.reduce((sum, item) => sum + item.recommended_kg, 0), 5000);
});

test("invalid forecast inputs fail rather than producing a misleading estimate", () => {
  assert.throws(() => expectedHarvest(-1, 4500), RangeError);
  assert.throws(() => weeklyDemand(100, -1), RangeError);
});
