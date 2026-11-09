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

export function validateCropInput(input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const averageYieldKgHa = Number(input?.averageYieldKgHa);
  const perCapitaKgYear = Number(input?.perCapitaKgYear ?? 0);
  const maturityDays = Number(input?.maturityDays);
  if (!name || name.length > 100 ||
      !Number.isFinite(averageYieldKgHa) || averageYieldKgHa <= 0 || averageYieldKgHa >= 1e10 ||
      !Number.isFinite(perCapitaKgYear) || perCapitaKgYear < 0 || perCapitaKgYear >= 1e8 ||
      !Number.isInteger(maturityDays) || maturityDays <= 0 || maturityDays > 3650) {
    throw new RangeError("Enter a crop name, positive yield, non-negative consumption, and maturity from 1 to 3650 days");
  }
  return { name, averageYieldKgHa, perCapitaKgYear, maturityDays };
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

export function riskStatus(harvestKg, demandKg) {
  const supply = Number(harvestKg);
  const demand = Number(demandKg);
  if (!Number.isFinite(supply) || supply < 0 || !Number.isFinite(demand) || demand < 0) {
    throw new RangeError("Supply and demand must be non-negative finite numbers");
  }
  if (demand === 0) return supply === 0 ? "green" : "red";
  if (supply === 0) return "red";
  const relativeDifference = Math.abs(supply - demand) / demand;
  if (relativeDifference <= 0.25) return "green";
  if (relativeDifference <= 1) return "yellow";
  return "red";
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
