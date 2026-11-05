export function expectedHarvest(areaHa, averageYieldKgPerHa) {
  const area = Number(areaHa);
  const yieldRate = Number(averageYieldKgPerHa);
  if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(yieldRate) || yieldRate <= 0) {
    throw new RangeError("Area and crop yield must be positive finite numbers");
  }
  return area * yieldRate;
}

export function estimatedHarvestDate(plantingDate, maturityDays) {
  const date = new Date(`${plantingDate}T00:00:00Z`);
  const days = Number(maturityDays);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(days) || days <= 0) {
    throw new RangeError("A valid planting date and positive maturity period are required");
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weeklyDemand(population, perCapitaKgPerYear) {
  const people = Number(population);
  const consumption = Number(perCapitaKgPerYear);
  if (!Number.isFinite(people) || people < 0 || !Number.isFinite(consumption) || consumption < 0) {
    throw new RangeError("Population and per-capita consumption must be non-negative finite numbers");
  }
  return people * consumption / 52;
}

export function supplyStatus(harvestKg, demandKg) {
  const supply = Number(harvestKg);
  const demand = Number(demandKg);
  if (!Number.isFinite(supply) || supply < 0 || !Number.isFinite(demand) || demand < 0) {
    throw new RangeError("Supply and demand must be non-negative finite numbers");
  }
  if (supply > demand) return "oversupply";
  if (supply < demand) return "shortage";
  return "balanced";
}

export function allocationPlan(surplusKg, destinations) {
  let remaining = Number(surplusKg);
  if (!Number.isFinite(remaining) || remaining < 0) throw new RangeError("Surplus must be non-negative");
  return [...destinations]
    .sort((a, b) => Number(b.remaining_demand_kg) - Number(a.remaining_demand_kg))
    .flatMap((destination) => {
      const demand = Number(destination.remaining_demand_kg);
      if (!Number.isFinite(demand) || demand < 0) throw new RangeError("Destination demand must be non-negative");
      const recommendedKg = Math.min(remaining, demand);
      remaining -= recommendedKg;
      return recommendedKg > 0 ? [{ ...destination, recommended_kg: recommendedKg }] : [];
    });
}
