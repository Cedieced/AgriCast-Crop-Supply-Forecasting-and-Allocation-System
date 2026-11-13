import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Boxes, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardCheck, Cloud, Download, FileSpreadsheet, FileText, Filter, LayoutDashboard,
  Leaf, LocateFixed, LogOut, Map as MapIcon, MapPin, Menu, Plus, Search, Settings, ShieldCheck,
  Sprout, TrendingUp, Users, X, AlertTriangle,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, subscribeToUpdates } from "./api.js";
import { barangays, crops, forecastRows, initialReports, notifications as demoNotifications } from "./data.js";
import { getBoundaryName, normalizeBarangayName, pointInBarangayBoundary, representativePointInBoundary } from "./map-geometry.js";

const navigation = [
  { section: "OVERVIEW", items: [["Dashboard", LayoutDashboard], ["Map view", MapIcon]] },
  { section: "OPERATIONS", items: [["Field reports", ClipboardCheck], ["Forecasting", TrendingUp], ["Supply allocation", Boxes]] },
  { section: "MANAGEMENT", items: [["Notifications", Bell], ["Reports", FileText], ["Settings", Settings]] },
];

const formatNumber = (value) => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Number(value) || 0);
const formatDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function StatusBadge({ status }) {
  const labels = { approved: "Approved", submitted: "For review", rejected: "Rejected", draft: "Draft", oversupply: "Surplus", shortage: "Shortage", balanced: "Balanced", green: "Low risk", yellow: "Moderate risk", red: "High risk", none: "No data" };
  return <span className={`badge badge-${status}`}>{labels[status] || status}</span>;
}

function Login({ onLogin, onPreview }) {
  const [email, setEmail] = useState("admin@boac.gov.ph");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onLogin(email, password); } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <div className="login-visual">
      <div className="visual-brand"><img className="brand-logo" src="/agricast-logo.png" alt="AgriCast" /></div>
      <div className="visual-copy"><p className="eyebrow">MUNICIPAL AGRICULTURE OFFICE · MARINDUQUE</p><h1>Better harvests<br />start with better<br /><em>insights.</em></h1><p>One shared view of the crops, people, and possibilities growing across Boac.</p></div>
      <div className="visual-footer"><span><span className="online-dot" /> Boac, Marinduque</span><span>Crop supply intelligence</span></div>
    </div>
    <div className="login-form-wrap"><form className="login-form" onSubmit={submit}>
      <div className="login-mobile-brand"><img className="brand-logo" src="/agricast-logo.png" alt="AgriCast" /></div>
      <p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace</h2><p className="muted">Use your municipal or field officer account.</p>
      {error && <div className="error-box" role="alert">{error}<br /><button type="button" className="text-button" onClick={onPreview}>Open local demo instead</button></div>}
      <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button className="button button-primary login-submit" disabled={busy} aria-busy={busy}>{busy ? "Signing in..." : "Sign in"} <ChevronRight size={17} /></button>
      <button type="button" className="demo-link" onClick={onPreview}>Explore dashboard demo <ArrowUpRight size={14} /></button>
      <p className="login-note"><ShieldCheck size={15} /> Protected access for authorized agriculture personnel</p>
    </form></div>
  </main>;
}

function riskForForecast(row) {
  if (row.risk_status) return row.risk_status;
  const supply = Number(row.expected_harvest_kg ?? row.supply ?? 0);
  const demand = Number(row.weekly_demand_kg ?? row.demand ?? 0);
  if (demand === 0) return supply === 0 ? "green" : "red";
  if (supply === 0) return "red";
  const relativeDifference = Math.abs(supply - demand) / demand;
  if (relativeDifference <= 0.25) return "green";
  if (relativeDifference <= 1) return "yellow";
  return "red";
}

function primaryForecastForBarangay(rows) {
  return rows
    .filter((row) => Number(row.total_area_ha ?? row.area ?? 0) > 0)
    .sort((left, right) =>
      Number(right.total_area_ha ?? right.area ?? 0) -
      Number(left.total_area_ha ?? left.area ?? 0))[0];
}

function mapCrop(item) {
  return {
    id: item.id,
    name: item.name,
    yield: Number(item.average_yield_kg_ha),
    maturity: Number(item.maturity_days),
    demandPerPerson: Number(item.per_capita_kg_year ?? item.demandPerPerson ?? 0),
    color: crops.find((crop) => crop.name === item.name)?.color || "#39834c",
  };
}

function MapPanel({ onSelect, selected, compact = false, forecasts = [], locations = [], boundaries = [], reports = [], debug = false }) {
  const mapId = compact ? "dashboard-map" : "full-map";
  useEffect(() => {
    const node = document.getElementById(mapId);
    if (!node || node._leaflet_id) return;
    const map = L.map(node, { zoomControl: true, scrollWheelZoom: false }).setView([13.445, 121.83], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);
    const boundaryByName = new Map();
    const boundaryLayer = L.geoJSON(boundaries, {
      style: { color: "#34764a", weight: 1.5, fillColor: "#69a875", fillOpacity: 0.12 },
      onEachFeature: (feature, layer) => {
        const name = getBoundaryName(feature);
        if (name) {
          boundaryByName.set(normalizeBarangayName(name), feature);
          layer.bindTooltip(name);
        }
      },
    }).addTo(map);
    if (boundaryLayer.getLayers().length && !compact) {
      map.fitBounds(boundaryLayer.getBounds(), { padding: [12, 12] });
    }
    if (debug) L.control.scale({ imperial: false }).addTo(map);
    for (const location of boundaries.length ? locations : []) {
      const name = location.name;
      const boundary = boundaryByName.get(normalizeBarangayName(name));
      if (!boundary) {
        console.error(`Skipping ${name}: no matching barangay boundary is loaded.`);
        continue;
      }
      let latitude = Number(location.latitude);
      let longitude = Number(location.longitude);
      let coordinateSource = "stored";
      const hasStoredCoordinates = location.latitude != null && location.longitude != null &&
        location.latitude !== "" && location.longitude !== "";
      const validCoordinates = hasStoredCoordinates && Number.isFinite(latitude) &&
        Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180;
      const contained = validCoordinates &&
        pointInBarangayBoundary(latitude, longitude, boundary.geometry);
      if (hasStoredCoordinates && !contained) {
        console.error(`Replacing ${name}: stored coordinates are invalid or outside its barangay boundary.`, { latitude, longitude });
      }
      if (!contained) {
        const representative = representativePointInBoundary(boundary.geometry);
        if (!representative) {
          console.error(`Skipping ${name}: no interior point could be calculated for its barangay boundary.`);
          continue;
        }
        [latitude, longitude] = representative;
        coordinateSource = "generated representative point";
      }
      if (!pointInBarangayBoundary(latitude, longitude, boundary.geometry)) {
        console.error(`Skipping ${name}: validated coordinates are outside its barangay boundary.`, { latitude, longitude });
        continue;
      }
      const rows = forecasts.filter((item) => (item.barangay_name || item.barangay) === name);
      const primaryForecast = primaryForecastForBarangay(rows);
      const risk = primaryForecast ? riskForForecast(primaryForecast) : "none";
      const icon = L.divIcon({ className: "map-marker-wrap", html: `<span class="map-marker marker-${risk}"></span>`, iconSize: [15, 15], iconAnchor: [7, 7] });
      const marker = L.marker([latitude, longitude], { icon }).addTo(map);
      marker.bindTooltip(debug ? `${name} · ${latitude.toFixed(5)}, ${longitude.toFixed(5)} · contained · ${coordinateSource}` : name, { direction: "top", offset: [0, -6] });
      marker.on("click", () => onSelect(name));
      if (debug) {
        const reportCount = reports.filter((report) => report.barangay === name).length;
        marker.bindPopup(`<strong>${name}</strong><br>Assignment: ${name}<br>Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>Location source: ${coordinateSource}<br>Boundary validation: passed<br>Reports: ${reportCount}`);
      }
    }
    map.whenReady(() => window.setTimeout(() => map.invalidateSize(), 100));
    return () => map.remove();
  }, [mapId, onSelect, forecasts, locations, boundaries, reports, compact, debug]);
  return <div className={`map-canvas ${compact ? "map-compact" : ""}`} id={mapId} aria-label={`Map of Boac barangays${selected ? `, selected ${selected}` : ""}`} />;
}

function MetricCard({ label, value, unit, change, icon: Icon, tone }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-foot"><span className={change.startsWith("+") ? "trend-up" : "trend-neutral"}>{change.startsWith("+") ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span>vs last month</span></div></article>;
}

function HarvestOutlook({ forecasts, reports }) {
  const [cropFilter, setCropFilter] = useState("all");
  const [monthOffset, setMonthOffset] = useState(0);
  const cropNames = [...new Set(forecasts.map((item) => item.crop_name || item.crop).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() + monthOffset);
  const monthlyTotals = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const projected = reports.reduce((sum, row) => {
      if (row.status !== "approved") return sum;
      if (cropFilter !== "all" && row.crop !== cropFilter) return sum;
      const harvestDate = row.harvestDate;
      if (!harvestDate || harvestDate.slice(0, 7) !== key) return sum;
      return sum + Number(row.volume || 0);
    }, 0);
    return {
      key,
      label: date.toLocaleDateString("en-PH", { month: "short" }),
      title: date.toLocaleDateString("en-PH", { month: "long", year: "numeric" }),
      projected,
    };
  });
  const maxValue = Math.max(1, ...monthlyTotals.map((item) => item.projected));
  const totalProjected = monthlyTotals.reduce((sum, item) => sum + item.projected, 0);
  const selectedMonth = monthlyTotals[0];
  const windowEnd = new Date(start.getFullYear(), start.getMonth() + 11, 1);
  const windowLabel = `${start.toLocaleDateString("en-PH", { month: "short", year: "numeric" })} – ${windowEnd.toLocaleDateString("en-PH", { month: "short", year: "numeric" })}`;

  return <article className="panel harvest-panel">
    <div className="panel-heading harvest-heading">
      <div><h2>Harvest outlook</h2><p className="muted">Monthly harvest projection · {windowLabel}</p></div>
      <label className="harvest-filter">
        <span className="sr-only">Filter harvest outlook by crop</span>
        <select className="select-button" value={cropFilter} onChange={(event) => setCropFilter(event.target.value)}>
          <option value="all">All crops</option>
          {cropNames.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </label>
    </div>
    <div className="chart-legend">
      <span><i className="legend-dot green-dot" /> Projected harvest (kg)</span>
    </div>
    {cropNames.length ? <div className="harvest-chart-scroll" role="region" aria-label={`Monthly projected harvest in kilograms, ${cropFilter === "all" ? "all crops" : cropFilter}`} tabIndex={0}>
      <div className="harvest-chart">
        {monthlyTotals.map((item, index) => <div className={`harvest-chart-group ${index === 0 ? "harvest-chart-current" : ""}`} key={item.key}>
          <strong className="harvest-chart-value" title={`${formatNumber(item.projected)} kg`}>{item.projected ? `${(item.projected / 1000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}k` : "—"}</strong>
          <div className="harvest-chart-bars">
            <div className="harvest-chart-bar forecast-bar" style={{ height: `${item.projected ? Math.max(3, item.projected / maxValue * 100) : 0}%` }} title={`${item.title}: ${formatNumber(item.projected)} kg projected`} />
          </div>
          <span className="harvest-chart-label" title={item.title}>{item.label}</span>
        </div>)}
      </div>
    </div> : <p className="harvest-empty">No crop forecasts are available.</p>}
    <div className="harvest-month-controls">
      <button className="text-button" type="button" onClick={() => setMonthOffset((value) => value - 12)} aria-label="Show previous 12 months">Previous 12 months</button>
      <button className="text-button" type="button" onClick={() => setMonthOffset((value) => value + 12)} aria-label="Show next 12 months">Next 12 months</button>
    </div>
    <div className="chart-caption" aria-live="polite">
      Total projected harvest in this 12-month outlook: <strong>{formatNumber(totalProjected)} kg</strong>
      <span>{selectedMonth.title}: {formatNumber(selectedMonth.projected)} kg projected</span>
    </div>
  </article>;
}

function DashboardHome({ reports, forecasts, locations, boundaries, selectedBarangay, setSelectedBarangay, setPage }) {
  const pending = reports.filter((report) => report.status === "submitted").length;
  const approved = reports.filter((report) => report.status === "approved");
  const hectares = approved.reduce((sum, report) => sum + Number(report.area || 0), 0);
  const expected = approved.reduce((sum, report) => sum + Number(report.volume || 0), 0);
  const upcoming = reports.filter((report) => report.status === "approved").slice(0, 4);
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()} <span className="heading-dot">·</span> BOAC, MARINDUQUE</p><h1>Good morning, Worker! <span className="farmer">🧑‍🌾</span></h1><p className="muted">Here’s what’s happening across your agricultural landscape.</p></div><button className="button button-primary" onClick={() => setPage("Field reports")}><Plus size={16} /> New field report</button></div>
    <section className="metric-grid">
      <MetricCard label="Expected harvest" value={`${(expected / 1000).toFixed(1)}k`} unit="kg" change="+12.8%" icon={Sprout} tone="green" />
      <MetricCard label="Planted area" value={hectares.toFixed(1)} unit="ha" change="+4.2%" icon={MapPin} tone="blue" />
      <MetricCard label="Reports to review" value={String(pending).padStart(2, "0")} unit="" change="needs attention" icon={ClipboardCheck} tone="orange" />
      <MetricCard label="Barangays reporting" value="48" unit="/ 61" change="+6 this month" icon={Users} tone="purple" />
    </section>
    <section className="overview-grid">
      <HarvestOutlook forecasts={forecasts} reports={reports} />
      <article className="panel map-panel"><div className="panel-heading"><div><h2>Production by barangay</h2><p className="muted">Live crop activity across Boac</p></div><button className="icon-button" aria-label="Open full map" onClick={() => setPage("Map view")}><ArrowUpRight size={17} /></button></div><MapPanel compact forecasts={forecasts} reports={reports} locations={locations} boundaries={boundaries} onSelect={setSelectedBarangay} selected={selectedBarangay} /><div className="map-legend"><span><i className="legend-dot green-dot" /> Demand met</span><span><i className="legend-dot yellow-dot" /> Watch</span><span><i className="legend-dot red-dot" /> Significant risk</span><small>{boundaries.length ? "Markers are shown only inside their matched barangay boundary." : "Map markers hidden until verified barangay boundaries are installed."}</small><button onClick={() => setPage("Map view")}>Explore map <ChevronRight size={13} /></button></div></article>
    </section>
    <section className="overview-grid bottom-grid">
      <article className="panel table-panel"><div className="panel-heading"><div><h2>Upcoming harvests</h2><p className="muted">Next expected harvest windows</p></div><button className="subtle-link" onClick={() => setPage("Forecasting")}>View forecast <ChevronRight size={14} /></button></div><div className="table-scroll"><table><thead><tr><th>BARANGAY / CROP</th><th>HARVEST WINDOW</th><th>VOLUME</th><th>RISK</th></tr></thead><tbody>{upcoming.map((r) => <tr key={r.id}><td><strong>{r.barangay}</strong><small>{r.crop}</small></td><td>{r.harvest}</td><td>{formatNumber(r.volume)} kg</td><td><StatusBadge status={r.volume > 7000 ? "oversupply" : "balanced"} /></td></tr>)}</tbody></table></div></article>
      <article className="panel attention-panel"><div className="panel-heading"><div><h2>Needs your attention</h2><p className="muted">Action items for today</p></div><span className="count-pill">{pending + 2}</span></div><button className="attention-item" onClick={() => setPage("Field reports")}><span className="attention-icon orange"><ClipboardCheck size={16} /></span><span><strong>{pending} reports</strong><small>Waiting for your review</small></span><ChevronRight size={15} /></button><button className="attention-item" onClick={() => setPage("Supply allocation")}><span className="attention-icon green"><Boxes size={16} /></span><span><strong>Tomato surplus</strong><small>3,000 kg can be allocated to Gasan</small></span><ChevronRight size={15} /></button><button className="attention-item" onClick={() => setPage("Notifications")}><span className="attention-icon blue"><Bell size={16} /></span><span><strong>Harvest in 18 days</strong><small>Rice · Agumaymayan barangay</small></span><ChevronRight size={15} /></button></article>
    </section>
  </div>;
}

function ReportsPage({ reports, crops: cropCatalog, onReview, onNew, onExport, apiOnline, searchQuery = "", onOpenDetails }) {
  const [filter, setFilter] = useState("all");
  const filterCycle = ["all", "submitted", "approved", "rejected"];
  const visible = reports.filter((report) => {
    const matchesStatus = filter === "all" || report.status === filter;
    const searchText = [
      report.displayId, report.id, report.farmer, report.barangay, report.crop, report.status,
    ].join(" ").toLowerCase();
    return matchesStatus && (!searchQuery || searchText.includes(searchQuery.toLowerCase()));
  });
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">OPERATIONS</p><h1>Field reports</h1><p className="muted">Review submissions and keep crop production records up to date.</p></div><button className="button button-primary" onClick={onNew}><Plus size={16} /> New report</button></div>
    {!apiOnline && <div className="info-banner"><Cloud size={16} /> Demo data is stored in this browser session. Connect the API to save submissions centrally.</div>}
    <section className="metric-grid compact-metrics"><MetricCard label="Total reports" value={reports.length} unit="" change="+8 this month" icon={FileText} tone="blue" /><MetricCard label="Awaiting review" value={reports.filter((r) => r.status === "submitted").length} unit="" change="needs attention" icon={ClipboardCheck} tone="orange" /><MetricCard label="Approved" value={reports.filter((r) => r.status === "approved").length} unit="" change="+5 this month" icon={Check} tone="green" /></section>
    <article className="panel full-panel"><div className="panel-heading"><div className="tab-buttons">{["all", "submitted", "approved", "rejected"].map((item) => <button key={item} className={filter === item ? "tab-active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All reports" : item === "submitted" ? "For review" : item[0].toUpperCase() + item.slice(1)}{item === "submitted" && <span>{reports.filter((r) => r.status === "submitted").length}</span>}</button>)}</div><div className="table-tools"><button className="button button-light" onClick={() => onExport("excel")}><Download size={15} /> Export</button><button type="button" className="icon-button" aria-label="Cycle report filters" onClick={() => { const index = filterCycle.indexOf(filter); setFilter(filterCycle[(index + 1) % filterCycle.length]); }}><Filter size={16} /></button></div></div>
      <div className="table-scroll"><table><thead><tr><th>REPORT / FARMER</th><th>BARANGAY</th><th>CROP</th><th>AREA</th><th>EXPECTED HARVEST</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{visible.map((r) => <tr key={r.id}><td><strong>{r.displayId || r.id}</strong><small>{r.farmer}</small></td><td>{r.barangay}</td><td><span className="crop-cell"><i style={{ background: cropCatalog.find((crop) => crop.name === r.crop)?.color || "#39834c" }} />{r.crop}</span></td><td>{Number(r.area).toFixed(1)} ha</td><td><strong>{formatNumber(r.volume)} kg</strong><small>{r.harvest}</small></td><td><StatusBadge status={r.status} /></td><td>{r.status === "submitted" ? <div className="row-actions"><button title="Approve" aria-label={`Approve report from ${r.farmer}`} className="action-check" onClick={() => onReview(r, "approved")}><Check size={16} /></button><button title="Reject" aria-label={`Reject report from ${r.farmer}`} className="action-reject" onClick={() => onReview(r, "rejected")}><X size={16} /></button></div> : <button type="button" className="subtle-link" onClick={() => onOpenDetails?.(r)}>Details <ChevronRight size={13} /></button>}</td></tr>)}</tbody></table></div>
      {!visible.length && <div className="empty-state">{searchQuery ? `No reports match “${searchQuery}”.` : "No reports in this category yet."}</div>}
    </article>
  </div>;
}

function ForecastPage({ forecasts, onExport }) {
  const rows = forecasts?.length ? forecasts : forecastRows();
  const total = rows.reduce((sum, row) => sum + Number(row.expected_harvest_kg ?? row.supply ?? 0), 0);
  const surplus = rows.filter((row) => (row.supply_status ?? row.status) === "oversupply").length;
  const shortages = rows.filter((row) => (row.supply_status ?? row.status) === "shortage").length;
  const [season, setSeason] = useState("current");
  const seasonLabel = season === "current" ? "Current season" : season === "next" ? "Next season" : "This year";
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">PLANNING & INSIGHTS</p><h1>Forecasting analytics</h1><p className="muted">Supply outlook compared with estimated weekly local market capacity.</p></div><button className="button button-light" onClick={() => onExport("excel")}><Download size={15} /> Export forecast</button></div>
    <div className="formula-banner"><span className="formula-icon"><Activity size={17} /></span><div><strong>Forecast model</strong><p>Expected harvest = planted area × average yield <span>·</span> Weekly demand = population × per-capita consumption ÷ 52</p></div></div>
    <section className="metric-grid"><MetricCard label="Forecast harvest" value={`${(total / 1000).toFixed(1)}k`} unit="kg" change="+9.4%" icon={Sprout} tone="green" /><MetricCard label="Surplus barangays" value={surplus} unit="" change="allocation opportunity" icon={TrendingUp} tone="blue" /><MetricCard label="Shortage alerts" value={shortages} unit="" change="watch list" icon={AlertTriangle} tone="orange" /><MetricCard label="Demand covered" value="112" unit="%" change="+6.2%" icon={Activity} tone="purple" /></section>
    <article className="panel full-panel"><div className="panel-heading"><div><h2>Barangay supply outlook</h2><p className="muted">Approved crop reports aggregated by barangay</p></div><button type="button" className="select-button" onClick={() => setSeason((value) => value === "current" ? "next" : value === "next" ? "year" : "current")}> {seasonLabel} <ChevronDown size={14} /></button></div><div className="table-scroll"><table><thead><tr><th>BARANGAY</th><th>CROP</th><th>AREA</th><th>EXPECTED HARVEST</th><th>WEEKLY DEMAND</th><th>HARVEST WINDOW</th><th>STATUS</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.barangay_name || r.barangay}-${r.crop_name || r.crop}-${i}`}><td><strong>{r.barangay_name || r.barangay}</strong></td><td>{r.crop_name || r.crop}</td><td>{Number(r.total_area_ha ?? r.area).toFixed(1)} ha</td><td><strong>{formatNumber(r.expected_harvest_kg ?? r.supply)} kg</strong></td><td>{formatNumber(r.weekly_demand_kg ?? r.demand)} kg</td><td>{r.harvest || (r.first_harvest ? `${formatDate(r.first_harvest)} – ${formatDate(r.last_harvest)}` : "—")}</td><td><StatusBadge status={r.supply_status || r.status} /></td></tr>)}</tbody></table></div><div className="table-footer">Showing {rows.length} barangay and crop combinations <span>Demand estimate based on population and crop consumption profile</span></div></article>
  </div>;
}

function MapPage({ selected, setSelected, forecasts, locations, boundaries, boundaryStatus, reloadBoundaries, reports, onViewBarangayReports }) {
  const row = primaryForecastForBarangay((forecasts?.length ? forecasts : forecastRows())
    .filter((item) => (item.barangay_name || item.barangay) === selected));
  const expectedSupply = Number(row?.expected_harvest_kg ?? row?.supply ?? 0);
  const localDemand = Number(row?.weekly_demand_kg ?? row?.demand ?? 0);
  const projectedDifference = expectedSupply - localDemand;
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">GEOGRAPHIC INTELLIGENCE</p><h1>Boac crop map</h1><p className="muted">Explore farm activity and crop supply outlook by barangay.</p></div><div className="map-date-chip"><span className="online-dot" /> 61 barangays <span>·</span> Live overview</div></div>
    {!boundaries.length && boundaryStatus === "loading" && <div className="info-banner" role="status">Loading the Boac barangay boundary layer...</div>}
    {!boundaries.length && boundaryStatus !== "loading" && <div className="info-banner" role="status">No verified Boac barangay boundary layer is installed. Map nodes are hidden to avoid misleading placement. Add the official GeoJSON at <code>/data/boac-barangay-boundaries.geojson</code> and reload the layer.</div>}
    {boundaryStatus === "error" && <div className="error-box" role="alert">The barangay boundary GeoJSON could not be loaded or is invalid.</div>}
    <div className="map-layout"><article className="panel map-main"><MapPanel forecasts={forecasts} locations={locations} boundaries={boundaries} reports={reports} debug={import.meta.env.DEV && new URLSearchParams(window.location.search).has("mapDebug")} onSelect={setSelected} selected={selected} /><div className="map-legend map-legend-full"><span><i className="legend-dot green-dot" /> Low risk</span><span><i className="legend-dot yellow-dot" /> Moderate risk</span><span><i className="legend-dot red-dot" /> High risk</span><span><i className="legend-dot none-dot" /> No approved crop data</span><small>{boundaries.length ? "Marker risk reflects the most-planted approved crop in each barangay; demand is estimated from that barangay's population." : "No markers are rendered without barangay polygons and contained coordinates."}</small><button className="subtle-link" onClick={reloadBoundaries}>Reload GIS layer</button></div></article>
      <aside className="panel barangay-details"><p className="eyebrow">SELECTED BARANGAY</p><h2>{selected}</h2><p className="muted">Boac Municipality · Marinduque</p><div className="detail-crop"><span className="crop-avatar">🌾</span><span><strong>{row?.crop_name || row?.crop || "No approved crops"}</strong><small>{row ? "Primary crop by planted area" : "No approved crop data"}</small></span><StatusBadge status={row?.supply_status || row?.status || "none"} /></div><div className="detail-stat"><span>Risk status</span><StatusBadge status={row ? riskForForecast(row) : "none"} /></div><div className="detail-stat"><span>Total planted area</span><strong>{Number(row?.total_area_ha ?? row?.area ?? 0).toFixed(1)} ha</strong></div><div className="detail-stat"><span>Expected harvest</span><strong>{formatNumber(expectedSupply)} kg</strong></div><div className="detail-stat"><span>Weekly market capacity</span><strong>{formatNumber(localDemand)} kg</strong></div><div className="detail-stat"><span>Projected {projectedDifference >= 0 ? "oversupply" : "shortage"}</span><strong>{formatNumber(Math.abs(projectedDifference))} kg</strong></div><div className="detail-stat"><span>Harvest period</span><strong>{row?.harvest || "—"}</strong></div><div className="risk-note"><AlertTriangle size={16} /><span><strong>Supply forecast: {row?.supply_status || row?.status || "No approved crop data"}</strong><small>Recommendations account for projected supply and neighboring demand.</small></span></div><button type="button" className="button button-primary full-button" onClick={() => onViewBarangayReports?.(selected)}>View barangay reports <ChevronRight size={15} /></button></aside>
    </div>
  </div>;
}

function AllocationPage({ token }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState("all");
  const mapRecommendations = (items) => items.map((item) => ({
    id: item.id, crop: item.crop_name, source: `${item.source_barangay}, Boac`, target: item.target_municipality,
    surplus: Number(item.surplus_kg), recommend: Number(item.recommended_kg), status: item.status,
    color: item.crop_name.toLowerCase() === "tomato" ? "tomato" : item.crop_name.toLowerCase() === "corn" ? "corn" : "rice",
  }));
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Sign in to load and generate recommendations.");
      return;
    }
    let active = true;
    const load = () => api("/recommendations", { token }).then((items) => {
      if (active) {
        setRecommendations(mapRecommendations(items));
        setError("");
        setLoading(false);
      }
    }).catch((reason) => {
      if (active) {
        setError(reason.message);
        setLoading(false);
      }
    });
    window.addEventListener("agricast:data-changed", load);
    load();
    return () => {
      active = false;
      window.removeEventListener("agricast:data-changed", load);
    };
  }, [token]);
  async function generate() {
    if (!token || generating) return;
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const items = await api("/recommendations/generate", { token, method: "POST" });
      setRecommendations(mapRecommendations(items));
      setMessage(items.length
        ? `Generated ${items.length} recommendation${items.length === 1 ? "" : "s"} from current approved reports.`
        : "No recommendations generated. Current approved reports show no surplus available for allocation.");
    } catch (reason) {
      setError(reason.message);
    } finally {
      setGenerating(false);
    }
  }
  async function accept(index) {
    const recommendation = recommendations[index];
    if (token && recommendation.id) {
      try {
        await api(`/recommendations/${recommendation.id}`, { token, method: "PATCH", body: JSON.stringify({ status: "accepted" }) });
      } catch (error) { window.alert(error.message); return; }
    }
    setRecommendations((items) => items.map((item, i) => i === index ? { ...item, status: "accepted" } : item));
  }
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">PROVINCIAL COORDINATION</p><h1>Supply allocation</h1><p className="muted">Turn local surpluses into reliable supply for neighboring municipalities.</p></div><button className="button button-primary" onClick={generate} disabled={generating || loading || !token}><Plus size={16} /> {generating ? "Generating..." : "Generate recommendations"}</button></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {message && <div className="info-banner" role="status">{message}</div>}
    <section className="allocation-hero"><div className="allocation-illustration"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="allocation-center"><Sprout size={29} /></span><span className="orbit-label label-boac">BOAC<br /><b>+5.0t</b></span><span className="orbit-label label-gasan">GASAN<br /><b>3.0t need</b></span><span className="orbit-label label-mogpog">MOGPOG<br /><b>4.2t need</b></span></div><div className="allocation-copy"><p className="eyebrow">SMART REDISTRIBUTION</p><h2>Move the harvest<br />where it’s needed.</h2><p>Recommendations compare projected municipal supply against weekly demand, then suggest transfer volumes that reduce waste and help close shortages.</p><div className="allocation-stats"><div><strong>12.4t</strong><small>Available surplus</small></div><div><strong>3</strong><small>Municipalities at risk</small></div><div><strong>6</strong><small>Recommendations</small></div></div></div></section>
    <article className="panel full-panel"><div className="panel-heading"><div><h2>Recommended transfers</h2><p className="muted">Generated from approved crop reports and neighboring municipalities’ remaining demand</p></div><button type="button" className="select-button" onClick={() => setScope((value) => value === "all" ? "boac" : value === "boac" ? "gasan" : "all")}>{scope === "all" ? "All municipalities" : scope === "boac" ? "Boac only" : "Gasan view"} <ChevronDown size={14} /></button></div><div className="table-scroll"><table><thead><tr><th>CROP</th><th>SOURCE</th><th>DESTINATION</th><th>SURPLUS</th><th>RECOMMENDED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{recommendations.map((item, index) => <tr key={item.id}><td><span className={`crop-avatar small-avatar ${item.color}`}>{item.crop === "Tomato" ? "●" : item.crop === "Corn" ? "◉" : "▤"}</span><strong>{item.crop}</strong></td><td>{item.source}</td><td><span className="route-cell"><MapPin size={14} />{item.target}, Marinduque</span></td><td>{formatNumber(item.surplus)} kg</td><td><strong>{formatNumber(item.recommend)} kg</strong></td><td><StatusBadge status={item.status === "proposed" ? "submitted" : item.status === "accepted" ? "approved" : item.status} /></td><td>{item.status === "proposed" ? <button className="button button-small" onClick={() => accept(index)}>Accept</button> : item.status === "accepted" ? <span className="accepted-label"><Check size={14} /> Accepted</span> : item.status}</td></tr>)}</tbody></table></div>{!loading && !recommendations.length && <div className="empty-state">No recommendations yet. Select “Generate recommendations” to calculate transfers from approved crop reports.</div>}{loading && <div className="empty-state">Loading recommendations…</div>}</article>
    <div className="note-banner"><CircleHelp size={17} /><span><strong>How recommendations work</strong> Destination demand is calculated from municipal population × crop per-capita consumption ÷ 52 weeks. Transfer volumes are capped at the destination's remaining projected demand.</span></div>
  </div>;
}

function NotificationsPage({ token }) {
  const [items, setItems] = useState(() => demoNotifications.map((item) => ({ ...item, read: Boolean(item.read) })));
  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = () => api("/notifications", { token }).then((data) => {
      if (active && data.length) setItems(data.map((item) => ({
        title: item.title, detail: item.message, time: new Date(item.created_at).toLocaleDateString(),
        tone: item.risk_status === "oversupply" ? "green" : item.risk_status === "shortage" ? "amber" : "blue",
        read: false,
      })));
    }).catch((error) => console.error("Could not load notifications:", error));
    window.addEventListener("agricast:data-changed", load);
    load();
    return () => {
      active = false;
      window.removeEventListener("agricast:data-changed", load);
    };
  }, [token]);
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">STAY IN THE LOOP</p><h1>Notifications</h1><p className="muted">Harvest alerts, review reminders, and supply signals.</p></div><button type="button" className="button button-light" onClick={() => setItems((current) => current.map((item) => ({ ...item, read: true })))}>Mark all as read</button></div><article className="panel notification-list"><div className="notification-date">LATEST <span>{items.length} alerts</span></div>{items.map((item, i) => <div className="notification-row" key={`${item.title}-${i}`}><span className={`notification-symbol ${item.tone}`}>{i === 0 ? <Sprout size={17} /> : i === 1 ? <Boxes size={17} /> : <ClipboardCheck size={17} />}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.time} · Agriculture Office</small></div>{!item.read && <span className="unread-dot" />}</div>)}</article></div>;
}

function ReportsExportPage({ reports, onExport }) {
  const items = [
    ["Crop production report", "Production volume, planted area, and crop mix by barangay", FileSpreadsheet, "excel"],
    ["Harvest forecast report", "Expected harvest volumes and seasonal timelines", TrendingUp, "excel"],
    ["Supply vs demand report", "Weekly market capacity compared with projected supply", BarChart3, "excel"],
    ["Oversupply monitoring report", "Barangays with surplus and redistribution opportunities", Boxes, "excel"],
    ["Barangay summary report", "Production profile and report status for each barangay", MapIcon, "excel"],
    ["Municipal summary report", "Consolidated crop outlook for municipal leadership", FileText, "pdf"],
  ];
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">DATA & EXPORTS</p><h1>Reports</h1><p className="muted">Create decision-ready summaries for municipal and provincial planning.</p></div></div><div className="report-card-grid">{items.map(([title, detail, Icon, format]) => <article className="panel report-card" key={title}><span className="report-icon"><Icon size={19} /></span><h2>{title}</h2><p>{detail}</p><div className="report-card-footer"><span><span className="format-tag">{format.toUpperCase()}</span> {reports.length} field records</span><button className="icon-button" aria-label={`Download ${title}`} onClick={() => onExport(format)}><Download size={16} /></button></div></article>)}</div><div className="export-note"><ShieldCheck size={17} /><span>Exports reflect the current dashboard dataset. Review sensitive farmer information before sharing reports outside authorized offices.</span></div></div>;
}

function CropCreateForm({ onSubmit, onCancel, onCreated, crop = null }) {
  const [form, setForm] = useState(() => ({
    name: crop?.name || "",
    averageYieldKgHa: crop?.yield?.toString() || "",
    perCapitaKgYear: crop?.demandPerPerson?.toString() || "0",
    maturityDays: crop?.maturity?.toString() || "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const crop = await onSubmit({
        ...form,
        averageYieldKgHa: Number(form.averageYieldKgHa),
        perCapitaKgYear: Number(form.perCapitaKgYear),
        maturityDays: Number(form.maturityDays),
      });
      onCreated?.(crop);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  return <form className="crop-create-form" onSubmit={submit}>
    {error && <div className="error-box" role="alert">{error}</div>}
    <label>Crop name<input required maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>Average yield (kg/ha)<input type="number" min="0.01" step="0.01" required value={form.averageYieldKgHa} onChange={(event) => setForm({ ...form, averageYieldKgHa: event.target.value })} /></label>
    <label>Days to maturity<input type="number" min="1" max="3650" step="1" required value={form.maturityDays} onChange={(event) => setForm({ ...form, maturityDays: event.target.value })} /></label>
    <label>Consumption (kg/person/year)<input type="number" min="0" step="0.01" required value={form.perCapitaKgYear} onChange={(event) => setForm({ ...form, perCapitaKgYear: event.target.value })} /></label>
    <div className="crop-create-actions">
      <button type="button" className="button button-light" onClick={onCancel} disabled={saving}>Cancel</button>
      <button className="button button-primary" disabled={saving}>{saving ? "Saving..." : crop ? "Save changes" : "Add crop"}</button>
    </div>
  </form>;
}

function SettingsPage({ token, user, cropCatalog, onAddCrop, onEditCrop }) {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showCropForm, setShowCropForm] = useState(false);
  const [editingCrop, setEditingCrop] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", role: "field_officer", password: "" });
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (!token || !isAdmin) return;
    api("/users", { token }).then(setUsers).catch((reason) => setError(reason.message));
  }, [token, isAdmin]);
  async function createUser(event) {
    event.preventDefault();
    try {
      const created = await api("/users", { token, method: "POST", body: JSON.stringify(form) });
      setUsers((current) => [...current, created]);
      setShowForm(false); setForm({ name: "", email: "", role: "field_officer", password: "" }); setError("");
    } catch (reason) { setError(reason.message); }
  }
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">WORKSPACE PREFERENCES</p><h1>Settings</h1><p className="muted">Configure your account, alerts, and municipal assumptions.</p></div></div><div className="settings-grid"><article className="panel setting-card"><span className="report-icon"><Users size={19} /></span><h2>Organization</h2><p>Municipal Agriculture Office of Boac</p><div className="setting-line"><span>Province</span><strong>Marinduque</strong></div><div className="setting-line"><span>Barangays</span><strong>61</strong></div></article><article className="panel setting-card"><span className="report-icon"><Bell size={19} /></span><h2>Harvest alerts</h2><p>Notify officers ahead of each expected harvest.</p><div className="setting-line"><span>Advance notice</span><strong>14–21 days</strong></div><div className="setting-line"><span>Recipients</span><strong>Municipal + Provincial</strong></div></article><article className="panel setting-card"><span className="report-icon"><Activity size={19} /></span><h2>Forecast assumptions</h2><p>Yield and consumption values are configurable by administrators.</p><div className="setting-line"><span>Demand baseline</span><strong>Population × per-capita ÷ 52</strong></div><div className="setting-line"><span>Yield profile</span><strong>Crop-type default</strong></div></article></div>
    <article className="panel full-panel user-panel">
      <div className="panel-heading"><div><h2>Crop catalog</h2><p className="muted">Add crop types shared by field reports, forecasts, and allocation.</p></div><button className="button button-primary" onClick={() => setShowCropForm((value) => !value)}><Plus size={15} /> Add crop</button></div>
      {showCropForm && <CropCreateForm onSubmit={onAddCrop} onCancel={() => setShowCropForm(false)} onCreated={() => setShowCropForm(false)} />}
      {editingCrop && <CropCreateForm key={editingCrop.id} crop={editingCrop} onSubmit={(input) => onEditCrop(editingCrop.id, input)} onCancel={() => setEditingCrop(null)} onCreated={() => setEditingCrop(null)} />}
      <div className="table-scroll"><table><thead><tr><th>CROP</th><th>AVERAGE YIELD</th><th>MATURITY</th><th>CONSUMPTION</th><th>ACTION</th></tr></thead><tbody>{cropCatalog.map((crop) => <tr key={crop.id}><td><strong>{crop.name}</strong></td><td>{formatNumber(crop.yield)} kg/ha</td><td>{crop.maturity} days</td><td>{formatNumber(crop.demandPerPerson || 0)} kg/person/year</td><td><button className="button button-small" type="button" onClick={() => { setShowCropForm(false); setEditingCrop(crop); }}>Edit</button></td></tr>)}</tbody></table></div>
    </article>
    {isAdmin && <article className="panel full-panel user-panel"><div className="panel-heading"><div><h2>User management</h2><p className="muted">Manage administrator, municipal, provincial, and field accounts.</p></div><button className="button button-primary" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Add user</button></div>
      {error && <div className="error-box">{error}</div>}
      {showForm && <form className="user-create-form" onSubmit={createUser}><input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="admin">Admin</option><option value="municipal_officer">Municipal Officer</option><option value="provincial_officer">Provincial Officer</option><option value="field_officer">Field Officer</option></select><input type="password" minLength="12" required placeholder="Temporary password (12+ chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button className="button button-primary">Create account</button></form>}
      <div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th></tr></thead><tbody>{users.map((account) => <tr key={account.id}><td><strong>{account.name}</strong></td><td>{account.email}</td><td>{account.role.replaceAll("_", " ")}</td><td><StatusBadge status={account.is_active ? "approved" : "rejected"} /></td></tr>)}</tbody></table></div>
    </article>}
  </div>;
}

function ReportModal({ onClose, onSave, crops: cropCatalog, onAddCrop }) {
  const [form, setForm] = useState({ farmer: "", barangay: "Agumaymayan", crop: "Rice", area: "", planted: new Date().toISOString().slice(0, 10), method: "Transplanting" });
  const [position, setPosition] = useState(null);
  const [showCropForm, setShowCropForm] = useState(false);
  const crop = cropCatalog.find((item) => item.name === form.crop);
  const harvestDate = new Date(`${form.planted}T00:00:00`);
  harvestDate.setDate(harvestDate.getDate() + (crop?.maturity || 0));
  const volume = Number(form.area || 0) * (crop?.yield || 0);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function locate() {
    if (!navigator.geolocation) return alert("GPS is not available on this device.");
    navigator.geolocation.getCurrentPosition(({ coords }) => setPosition({ latitude: coords.latitude, longitude: coords.longitude }), () => alert("Location permission was not granted. You can still save the report."), { enableHighAccuracy: true, timeout: 10000 });
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="report-modal" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, ...position, volume, harvest: harvestDate.toISOString().slice(0, 10) }); }}>
    <div className="modal-header"><div><p className="eyebrow">FIELD DATA COLLECTION</p><h2>New field report</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <div className="form-grid"><label className="wide-field">Farmer name<input required value={form.farmer} onChange={(e) => update("farmer", e.target.value)} placeholder="Enter farmer's full name" /></label><label>Barangay<select value={form.barangay} onChange={(e) => update("barangay", e.target.value)}>{barangays.map((name) => <option key={name}>{name}</option>)}</select></label><div className="crop-select-field"><label>Crop type<select value={form.crop} onChange={(e) => update("crop", e.target.value)}>{cropCatalog.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><button type="button" className="text-button" onClick={() => setShowCropForm(true)}>+ Add crop type</button></div><label>Planted area (hectares)<input type="number" min="0.01" step="0.01" required value={form.area} onChange={(e) => update("area", e.target.value)} placeholder="e.g. 1.5" /></label><label>Planting date<input type="date" required value={form.planted} onChange={(e) => update("planted", e.target.value)} /></label><label>Planting method<select value={form.method} onChange={(e) => update("method", e.target.value)}><option>Direct Seeding</option><option>Transplanting</option></select></label><div className="location-field"><div><strong>Farm GPS location</strong><small>{position ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : "Capture coordinates at the farm visit"}</small></div><button type="button" className="button button-light" onClick={locate}><LocateFixed size={15} /> {position ? "Captured" : "Capture GPS"}</button></div></div>
    <div className="calculation-box"><div><span>Expected harvest</span><strong>{formatNumber(volume)} kg</strong><small>{form.area || "0"} ha × {formatNumber(crop?.yield)} kg/ha</small></div><div><span>Estimated harvest date</span><strong>{harvestDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</strong><small>{crop?.maturity} days after planting</small></div></div>
    <div className="modal-footer"><button type="button" className="button button-light" onClick={() => onSave({ ...form, ...position, volume, harvest: harvestDate.toISOString().slice(0, 10), status: "draft" })}>Save draft</button><button className="button button-primary"><Check size={15} /> Submit report</button></div>
  </form>{showCropForm && <div className="crop-dialog-backdrop"><CropCreateForm onSubmit={onAddCrop} onCancel={() => setShowCropForm(false)} onCreated={(added) => { update("crop", added.name); setShowCropForm(false); }} /></div>}</div>;
}

function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("agriflow_user")); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("agriflow_token"));
  const [page, setPage] = useState("Dashboard");
  const [reports, setReports] = useState(initialReports);
  const [cropCatalog, setCropCatalog] = useState(crops);
  const [forecasts, setForecasts] = useState(forecastRows());
  const [barangayLocations, setBarangayLocations] = useState([]);
  const [boundaryFeatures, setBoundaryFeatures] = useState([]);
  const [boundaryStatus, setBoundaryStatus] = useState("not-loaded");
  const [boundaryReload, setBoundaryReload] = useState(0);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiError, setApiError] = useState("");
  const [modal, setModal] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState("Agumaymayan");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const setSelected = useMemo(() => (name) => setSelectedBarangay(name), []);
  const normalizedSearch = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedSearch) return [];
    return reports.filter((report) => [
      report.displayId, report.id, report.farmer, report.barangay, report.crop, report.status,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch))).slice(0, 6);
  }, [normalizedSearch, reports]);

  useEffect(() => {
    function focusSearch(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function refresh() {
      const cropRequest = api("/crops", { token }).then((cropData) => {
        if (!active) return;
        const updatedCrops = cropData.map(mapCrop);
        setCropCatalog(updatedCrops);
        return updatedCrops;
      });
      const catalogAndReports = Promise.all([
        api("/reports", { token }),
        cropRequest,
      ]).then(([reportData, updatedCrops]) => {
        if (!active) return;
        setReports(reportData.map((item) => ({
          id: item.id, displayId: item.id.slice(0, 8).toUpperCase(), farmer: item.farmer_name, barangay: item.barangay_name, crop: item.crop_name,
          area: Number(item.area_ha), planted: item.planting_date?.slice(0, 10),
          harvestDate: item.planting_date ? new Date(new Date(`${item.planting_date.slice(0, 10)}T00:00:00`).getTime() + (updatedCrops.find((crop) => crop.name === item.crop_name)?.maturity || 0) * 86400000).toISOString().slice(0, 10) : null,
          harvest: item.planting_date ? formatDate(new Date(new Date(`${item.planting_date.slice(0, 10)}T00:00:00`).getTime() + (updatedCrops.find((crop) => crop.name === item.crop_name)?.maturity || 0) * 86400000).toISOString().slice(0, 10)) : "—",
          volume: Number(item.area_ha) * (updatedCrops.find((crop) => crop.name === item.crop_name)?.yield || 0), status: item.status, method: item.planting_method,
        })));
      });
      const forecastsAndBarangays = Promise.all([
        api("/forecasts", { token }),
        api("/barangays", { token }),
      ]).then(([forecastData, barangayData]) => {
        if (!active) return;
        setBarangayLocations(barangayData);
        setForecasts(forecastData);
      });
      await Promise.all([catalogAndReports, forecastsAndBarangays]);
      if (!active) return;
      setApiOnline(true);
      setApiError("");
    }
    const initialLoad = () => refresh().catch((error) => {
      console.error("Could not refresh dashboard data from the API", error);
      setApiOnline(false);
      setApiError(error.message);
    });
    initialLoad();
    const unsubscribe = subscribeToUpdates(token, () => {
      initialLoad();
      window.dispatchEvent(new Event("agricast:data-changed"));
    }, (connected) => {
      if (!active) return;
      if (connected) {
        initialLoad();
      } else {
        setApiOnline(false);
      }
    });
    const refreshTimer = window.setInterval(initialLoad, 60000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      unsubscribe();
    };
  }, [token]);

  useEffect(() => {
    if (page !== "Map view") return;
    let active = true;
    async function loadBoundaries() {
      setBoundaryStatus("loading");
      try {
        const response = await fetch("/data/boac-barangay-boundaries.geojson", { cache: "no-store" });
        const contentType = response.headers.get("content-type") || "";
        if (response.status === 404 || !contentType.toLowerCase().includes("json")) {
          if (active) {
            setBoundaryFeatures([]);
            setBoundaryStatus("missing");
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`Boundary layer request failed (${response.status})`);
        }
        const geojson = await response.json();
        if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
          throw new Error("Boundary layer must be a GeoJSON FeatureCollection");
        }
        const features = geojson.features.filter((feature) =>
          ["Polygon", "MultiPolygon"].includes(feature?.geometry?.type),
        );
        const names = features.map(getBoundaryName).filter(Boolean);
        const uniqueNames = new Set(names.map(normalizeBarangayName));
        const missingBarangays = barangays.filter((name) =>
          !uniqueNames.has(normalizeBarangayName(name)),
        );
        if (features.length !== 61 || uniqueNames.size !== 61 || missingBarangays.length) {
          throw new Error(`Boundary layer must contain one named polygon for each of Boac's 61 barangays; found ${uniqueNames.size}.`);
        }
        if (active) {
          setBoundaryFeatures(features);
          setBoundaryStatus("ready");
        }
      } catch (error) {
        if (active) {
          setBoundaryFeatures([]);
          setBoundaryStatus("error");
          console.error("Could not load a complete Boac barangay boundary layer:", error);
        }
      }
    }
    loadBoundaries();
    return () => {
      active = false;
    };
  }, [page, boundaryReload]);

  async function login(email, password) {
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    localStorage.setItem("agriflow_token", result.token);
    localStorage.setItem("agriflow_user", JSON.stringify(result.user));
    setToken(result.token); setUser(result.user);
  }
  function preview() {
    const demoUser = { name: "Alex Morgan", role: "Municipal Officer", email: "admin@boac.gov.ph" };
    localStorage.removeItem("agriflow_token");
    localStorage.setItem("agriflow_user", JSON.stringify(demoUser));
    setToken(null); setUser(demoUser);
  }
  function signOut() {
    localStorage.removeItem("agriflow_token"); localStorage.removeItem("agriflow_user");
    setUser(null); setToken(null); setApiOnline(false);
  }
  async function review(report, status) {
    const remarks = status === "rejected" ? window.prompt("Add a reason for rejection:") : "";
    if (status === "rejected" && remarks === null) return;
    if (token) {
      try { await api(`/reports/${report.id}/review`, { method: "PATCH", token, body: JSON.stringify({ status, remarks }) }); }
      catch (error) { window.alert(error.message); return; }
    }
    setReports((items) => items.map((item) => item.id === report.id ? { ...item, status } : item));
  }

  async function addCrop(cropInput) {
    const item = await api("/crops", {
      token,
      method: "POST",
      body: JSON.stringify(cropInput),
    });
    const created = mapCrop(item);
    setCropCatalog((current) => [...current.filter((crop) => crop.id !== created.id), created]
      .sort((left, right) => left.name.localeCompare(right.name)));
    return created;
  }
  async function editCrop(cropId, cropInput) {
    const updated = mapCrop(await api(`/crops/${cropId}`, {
      token,
      method: "PUT",
      body: JSON.stringify(cropInput),
    }));
    const previous = cropCatalog.find((crop) => crop.id === cropId);
    setCropCatalog((current) => current.map((crop) => crop.id === cropId ? updated : crop)
      .sort((left, right) => left.name.localeCompare(right.name)));
    if (previous) {
      setReports((current) => current.map((report) => {
        if (report.crop !== previous.name) return report;
        const harvestDate = report.planted
          ? new Date(`${report.planted}T00:00:00`)
          : null;
        if (harvestDate) harvestDate.setDate(harvestDate.getDate() + updated.maturity);
        const harvestDateValue = harvestDate?.toISOString().slice(0, 10) || null;
        return {
          ...report,
          crop: updated.name,
          volume: Number(report.area) * updated.yield,
          harvestDate: harvestDateValue,
          harvest: harvestDateValue ? formatDate(harvestDateValue) : report.harvest,
        };
      }));
    }
    return updated;
  }
  async function saveReport(form) {
    let persisted;
    if (token) {
      try {
        persisted = await api("/reports", { method: "POST", token, body: JSON.stringify({
          barangayName: form.barangay, cropName: form.crop, farmerName: form.farmer,
          areaHa: Number(form.area), plantingDate: form.planted, plantingMethod: form.method,
          latitude: form.latitude, longitude: form.longitude, status: form.status || "submitted",
        }) });
      } catch (error) { window.alert(error.message); return; }
    }
    const newReport = {
      id: persisted?.id || `BO-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
      displayId: persisted?.id?.slice(0, 8).toUpperCase(),
      ...form,
      harvestDate: form.harvestDate || form.harvest,
      status: form.status || "submitted",
    };
    setReports((items) => [newReport, ...items]); setModal(false);
  }

  async function exportData(format) {
    const rows = reports.map((r) => ({ Report: r.id, Farmer: r.farmer, Barangay: r.barangay, Crop: r.crop, "Area (ha)": r.area, "Expected harvest (kg)": r.volume, "Harvest date": r.harvest, Status: r.status }));
    try {
      if (format === "pdf") {
        const { PDFDocument, StandardFonts } = await import("pdf-lib");
        const document = await PDFDocument.create();
        const font = await document.embedFont(StandardFonts.Helvetica);
        let currentPage = document.addPage([595, 842]);
        let y = 800;
        const drawLine = (text, size = 9) => {
          if (y < 45) { currentPage = document.addPage([595, 842]); y = 800; }
          currentPage.drawText(text, { x: 42, y, size, font });
          y -= size === 16 ? 27 : 18;
        };
        drawLine("Boac Crop Production Report", 16);
        drawLine(`Generated ${new Date().toLocaleDateString()} | ${rows.length} records`);
        y -= 5;
        rows.forEach((row, index) => drawLine(`${index + 1}. ${row.Farmer} | ${row.Barangay} | ${row.Crop} | ${row["Area (ha)"]} ha | ${row["Expected harvest (kg)"]} kg | ${row.Status}`));
        const bytes = await document.save();
        downloadFile(new Blob([bytes], { type: "application/pdf" }), "boac-crop-report.pdf");
      } else {
        const excelModule = await import("exceljs");
        const ExcelJS = excelModule.default || excelModule;
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Crop Production");
        sheet.columns = Object.keys(rows[0] || {}).map((key) => ({ header: key, key, width: Math.max(14, key.length + 2) }));
        sheet.addRows(rows);
        sheet.getRow(1).font = { bold: true, color: { argb: "FF2F7141" } };
        const bytes = await workbook.xlsx.writeBuffer();
        downloadFile(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "boac-crop-report.xlsx");
      }
    } catch (error) { window.alert(`Could not create export: ${error.message}`); }
  }

  if (!user) return <Login onLogin={login} onPreview={preview} />;
  const currentNav = navigation.flatMap((section) => section.items).find(([name]) => name === page);
  const PageIcon = currentNav?.[1] || LayoutDashboard;
  function openSearchResult() {
    setPage("Field reports");
    setSearchFocused(false);
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><img className="brand-logo" src="/agricast-logo.png" alt="AgriCast" /><button className="close-sidebar" aria-label="Close navigation menu" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-seal">B</span><span><strong>Boac Municipality</strong><small>Marinduque Province</small></span><ChevronDown size={14} /></div>
      <nav className="side-nav" id="primary-navigation" aria-label="Primary navigation">{navigation.map((group) => <div key={group.section}><p className="nav-section">{group.section}</p>{group.items.map(([label, Icon]) => <button key={label} className={`nav-item ${page === label ? "nav-active" : ""}`} aria-current={page === label ? "page" : undefined} onClick={() => { setPage(label); setMobileNav(false); }}><Icon size={18} aria-hidden="true" /><span>{label}</span>{label === "Notifications" && <i className="nav-notification" />}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sync-status"><span className="sync-icon"><Cloud size={16} /></span><span><strong>{apiOnline ? "Connected to server" : "Demo workspace"}</strong><small>{apiOnline ? "All data is up to date" : "Local preview mode"}</small></span><span className={`online-dot ${apiOnline ? "" : "dot-muted"}`} /></div><button type="button" className="profile-button" onClick={() => setPage("Settings")}><span className="avatar">AM</span><span><strong>{user.name || "Alex Morgan"}</strong><small>{user.role?.replaceAll("_", " ") || "Municipal Officer"}</small></span><ChevronDown size={14} /></button></div>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
    <main className="main-area" id="main-content" tabIndex={-1}>{apiError && <div className="error-box" role="alert">Dashboard data could not be refreshed: {apiError}</div>}<header className="topbar"><div className="topbar-left"><button className="mobile-menu" aria-label="Open navigation menu" aria-expanded={mobileNav} aria-controls="primary-navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><span className="breadcrumb">Workspace <ChevronRight size={14} /> <PageIcon size={15} /> <strong>{page}</strong></span></div><div className="topbar-actions"><div className="global-search-wrap" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false); }}><label className="global-search"><Search size={16} /><input ref={searchInputRef} aria-label="Search reports and crops" aria-expanded={searchFocused && Boolean(search)} aria-controls="global-search-results" placeholder="Search reports, crops..." value={search} onFocus={() => setSearchFocused(true)} onChange={(e) => setSearch(e.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSearchFocused(false); if (event.key === "Enter" && search.trim()) openSearchResult(); }} /><kbd>⌘ K</kbd>{search && <button className="search-clear" type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}</label>{searchFocused && search.trim() && <div className="search-results" id="global-search-results" role="listbox" aria-label="Matching field reports">{searchResults.length ? searchResults.map((report) => <button className="search-result" key={report.id} role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={openSearchResult}><span className="search-result-main"><strong>{report.farmer}</strong><small>{report.crop} · {report.barangay}</small></span><span className={`search-result-status status-${report.status}`}>{report.status === "submitted" ? "For review" : report.status}</span></button>) : <div className="search-no-results">No matching field reports</div>}<button className="search-all-results" onMouseDown={(event) => event.preventDefault()} onClick={openSearchResult}>View filtered results <ChevronRight size={14} /></button></div>}</div><button className="top-icon" onClick={() => setPage("Notifications")} aria-label="Notifications"><Bell size={18} /><i /></button><span className="top-divider" /><button className="top-avatar" title="Sign out" aria-label="Sign out" onClick={signOut}>AM</button></div></header>
      {page === "Dashboard" && <DashboardHome reports={reports} forecasts={forecasts} locations={barangayLocations} boundaries={boundaryFeatures} selectedBarangay={selectedBarangay} setSelectedBarangay={setSelected} setPage={setPage} />}
      {page === "Field reports" && <ReportsPage reports={reports} crops={cropCatalog} onReview={review} onNew={() => setModal(true)} onExport={exportData} apiOnline={apiOnline} searchQuery={search.trim()} onOpenDetails={(report) => { setSelectedBarangay(report.barangay); setPage("Map view"); setSearch(""); }} />}
      {page === "Forecasting" && <ForecastPage forecasts={forecasts} onExport={exportData} />}
      {page === "Map view" && <MapPage selected={selectedBarangay} setSelected={setSelected} forecasts={forecasts} locations={barangayLocations} boundaries={boundaryFeatures} boundaryStatus={boundaryStatus} reloadBoundaries={() => setBoundaryReload((value) => value + 1)} reports={reports} onViewBarangayReports={(barangay) => { setSelectedBarangay(barangay); setPage("Field reports"); setSearch(barangay); }} />}
      {page === "Supply allocation" && <AllocationPage token={token} />}
      {page === "Notifications" && <NotificationsPage token={token} />}
      {page === "Reports" && <ReportsExportPage reports={reports} onExport={exportData} />}
      {page === "Settings" && <SettingsPage token={token} user={user} cropCatalog={cropCatalog} onAddCrop={addCrop} onEditCrop={editCrop} />}
      <footer className="app-footer"><span>AgriCast <span>·</span> Municipal Agriculture Office of Boac</span><span>Data for planning purposes <span>·</span> v1.0.0</span></footer>
    </main>
    {modal && <ReportModal crops={cropCatalog} onClose={() => setModal(false)} onSave={saveReport} onAddCrop={addCrop} />}
  </div>;
}

export default App;
