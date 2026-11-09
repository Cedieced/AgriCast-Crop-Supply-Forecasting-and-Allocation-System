export const crops = [
  { id: 1, name: "Rice", yield: 4500, maturity: 120, demandPerPerson: 115, color: "#42895c" },
  { id: 2, name: "Corn", yield: 4200, maturity: 110, demandPerPerson: 18, color: "#e5aa3d" },
  { id: 3, name: "Mongo", yield: 950, maturity: 90, demandPerPerson: 1.2, color: "#78964b" },
  { id: 4, name: "Tomato", yield: 18000, maturity: 75, demandPerPerson: 9, color: "#d96d54" },
];

export const barangays = [
  "Agot", "Agumaymayan", "Amoingon", "Apitong", "Balagasan", "Balaring", "Balimbing", "Balogo", "Bamban", "Bangbangalon",
  "Bantad", "Bantay", "Bayuti", "Binunga", "Boi", "Boton", "Buliasnin", "Bunganay", "Caganhao", "Canat",
  "Catubugan", "Cawit", "Daig", "Daypay", "Duyay", "Hinapulan", "Ihatub", "Isok 1 (Poblacion)", "Isok 2 (Poblacion)", "Laylay",
  "Lupac", "Mahinhin", "Mainit", "Malbog", "Maligaya", "Malusak (Poblacion)", "Mansiwat", "Mataas na Bayan (Poblacion)", "Maybo", "Mercado (Poblacion)",
  "Murallon (Poblacion)", "Ogbac", "Pawa", "Pili", "Poctoy", "Poras", "Putting Buhangin", "Puyog", "Sabong", "San Miguel (Poblacion)",
  "Santol", "Sawi", "Tabi", "Tabigue", "Tagwak", "Tambunan", "Tampus (Poblacion)", "Tanza", "Tugos", "Tumagabok", "Tumapon",
];

function report(id, farmer, barangay, crop, area, status, method, daysUntilHarvest) {
  const harvestDate = new Date();
  harvestDate.setDate(harvestDate.getDate() + daysUntilHarvest);
  const plantingDate = new Date(harvestDate);
  plantingDate.setDate(plantingDate.getDate() - crops.find((item) => item.name === crop).maturity);
  return {
    id, farmer, barangay, crop, area,
    planted: plantingDate.toISOString().slice(0, 10),
    harvestDate: harvestDate.toISOString().slice(0, 10),
    harvest: harvestDate.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    volume: area * crops.find((item) => item.name === crop).yield,
    status, method,
  };
}

export const initialReports = [
  report("BO-2026-041", "Maria L. Reyes", "Agumaymayan", "Rice", 1.8, "approved", "Transplanting", 18),
  report("BO-2026-040", "Ramon D. Cruz", "Amoingon", "Rice", 1.2, "submitted", "Direct Seeding", 22),
  report("BO-2026-039", "Elena M. Santos", "Balaring", "Corn", 0.9, "submitted", "Direct Seeding", 29),
  report("BO-2026-038", "Jose P. Mendoza", "Caganhao", "Rice", 1.4, "approved", "Transplanting", 25),
  report("BO-2026-037", "Lilia A. Garcia", "Laylay", "Tomato", 0.8, "approved", "Direct Seeding", 18),
  report("BO-2026-036", "Nestor R. Dela Cruz", "Pawa", "Rice", 2, "approved", "Transplanting", 31),
  report("BO-2026-035", "Celia V. Lim", "Tampus (Poblacion)", "Mongo", 0.7, "submitted", "Direct Seeding", 36),
  report("BO-2026-034", "Pedro S. Flores", "Murallon (Poblacion)", "Corn", 1.1, "rejected", "Direct Seeding", 42),
];

export const notifications = [
  { title: "Rice harvest window approaching", detail: "Agumaymayan · 8,100 kg expected · Jul 18", tone: "amber", time: "2 days" },
  { title: "Surplus opportunity identified", detail: "Tomato · 5,000 kg surplus · Gasan can absorb 3,000 kg", tone: "green", time: "5 hours" },
  { title: "Field report needs review", detail: "BO-2026-040 · Rice · Amoingon", tone: "blue", time: "Yesterday" },
];

export function forecastRows() {
  return [
    { barangay: "Agumaymayan", crop: "Rice", area: 18.4, supply: 82800, demand: 12780, harvest: "Jul 18 – Aug 02", status: "oversupply" },
    { barangay: "Amoingon", crop: "Rice", area: 8.2, supply: 36900, demand: 11920, harvest: "Jul 29 – Aug 02", status: "oversupply" },
    { barangay: "Caganhao", crop: "Corn", area: 5.8, supply: 24360, demand: 1865, harvest: "Aug 09 – Aug 21", status: "oversupply" },
    { barangay: "Laylay", crop: "Tomato", area: 1.2, supply: 21600, demand: 933, harvest: "Jul 18 – Jul 26", status: "oversupply" },
    { barangay: "Tampus (Poblacion)", crop: "Mongo", area: 4.1, supply: 3895, demand: 124, harvest: "Jul 26 – Aug 12", status: "oversupply" },
    { barangay: "Balaring", crop: "Rice", area: 2.4, supply: 10800, demand: 12340, harvest: "Aug 05 – Aug 18", status: "shortage" },
  ];
}
