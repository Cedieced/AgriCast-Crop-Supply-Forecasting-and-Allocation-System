import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Boxes, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardCheck, Cloud, Download, FileSpreadsheet, FileText, Filter, LayoutDashboard,
  Leaf, LocateFixed, LogOut, Map as MapIcon, MapPin, Menu, Plus, Search, Settings, ShieldCheck,
  Sprout, TrendingUp, Users, X, AlertTriangle,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "./api.js";
import { barangays, crops, forecastRows, initialReports, notifications as demoNotifications } from "./data.js";

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
  const labels = { approved: "Approved", submitted: "For review", rejected: "Rejected", draft: "Draft", oversupply: "Surplus", shortage: "Shortage", balanced: "Balanced", green: "Low risk", yellow: "Watch", red: "High risk" };
  return <span className={`badge badge-${status}`}>{labels[status] || status}</span>;
}

function Login({ onLogin, onPreview }) {
  const [email, setEmail] = useState("admin@boac.gov.ph");
  const [password, setPassword] = useState("BoacDemo123!");
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
      <div className="visual-brand"><span className="brand-icon"><Sprout size={24} /></span> AgriCast <span className="brand-tag">BOAC</span></div>
      <div className="visual-copy"><p className="eyebrow">MUNICIPAL AGRICULTURE OFFICE · MARINDUQUE</p><h1>Better harvests<br />start with better<br /><em>insights.</em></h1><p>One shared view of the crops, people, and possibilities growing across Boac.</p></div>
      <div className="visual-footer"><span><span className="online-dot" /> Boac, Marinduque</span><span>Crop supply intelligence</span></div>
    </div>
    <div className="login-form-wrap"><form className="login-form" onSubmit={submit}>
      <div className="login-mobile-brand"><span className="brand-icon"><Sprout size={22} /></span> AgriCast</div>
      <p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace</h2><p className="muted">Use your municipal or field officer account.</p>
      {error && <div className="error-box">{error}<br /><button type="button" className="text-button" onClick={onPreview}>Open local demo instead</button></div>}
      <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button className="button button-primary login-submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"} <ChevronRight size={17} /></button>
      <button type="button" className="demo-link" onClick={onPreview}>Explore dashboard demo <ArrowUpRight size={14} /></button>
      <p className="login-note"><ShieldCheck size={15} /> Protected access for authorized agriculture personnel</p>
    </form></div>
  </main>;
}

function riskForForecast(row) {
  if (row.risk_status) return row.risk_status;
  const supply = Number(row.expected_harvest_kg ?? row.supply ?? 0);
  const demand = Number(row.weekly_demand_kg ?? row.demand ?? 0);
  if (supply === demand) return "green";
  if (demand === 0 || Math.abs(supply - demand) >= demand * 0.25) return "red";
  return "yellow";
}

function MapPanel({ onSelect, selected, compact = false, forecasts = [] }) {
  const mapId = compact ? "dashboard-map" : "full-map";
  useEffect(() => {
    const node = document.getElementById(mapId);
    if (!node || node._leaflet_id) return;
    const map = L.map(node, { zoomControl: true, scrollWheelZoom: false }).setView([13.445, 121.83], compact ? 12 : 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);
    barangays.forEach((name, index) => {
      const position = [13.43 + (index % 9) * 0.008, 121.82 + Math.floor(index / 9) * 0.01];
      const rows = forecasts.filter((item) => (item.barangay_name || item.barangay) === name);
      const order = { red: 0, yellow: 1, green: 2 };
      const risk = rows.map(riskForForecast).sort((a, b) => order[a] - order[b])[0] || (index % 5 === 3 ? "yellow" : "green");
      const icon = L.divIcon({ className: "map-marker-wrap", html: `<span class="map-marker marker-${risk}"></span>`, iconSize: [15, 15], iconAnchor: [7, 7] });
      L.marker(position, { icon }).addTo(map).bindTooltip(name, { direction: "top", offset: [0, -6] }).on("click", () => onSelect(name));
    });
    map.whenReady(() => window.setTimeout(() => map.invalidateSize(), 100));
    return () => map.remove();
  }, [mapId, onSelect, forecasts]);
  return <div className={`map-canvas ${compact ? "map-compact" : ""}`} id={mapId} aria-label={`Map of Boac barangays${selected ? `, selected ${selected}` : ""}`} />;
}

function MetricCard({ label, value, unit, change, icon: Icon, tone }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-foot"><span className={change.startsWith("+") ? "trend-up" : "trend-neutral"}>{change.startsWith("+") ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span>vs last month</span></div></article>;
}

function MiniBars() {
  const values = [32, 46, 38, 58, 52, 72, 64, 82, 58, 74, 92, 76];
  return <div className="mini-chart" role="img" aria-label="Monthly crop harvest forecast trend">
    <div className="chart-grid"><span>40k</span><span>30k</span><span>20k</span><span>10k</span></div>
    <div className="chart-bars">{values.map((height, i) => <div key={i} className={`chart-bar ${i === 10 ? "chart-highlight" : ""}`} style={{ height: `${height}%` }} title={`${height * 500} kg forecast`} />)}</div>
    <div className="chart-labels"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span></div>
  </div>;
}

function DashboardHome({ reports, forecasts, selectedBarangay, setSelectedBarangay, setPage }) {
  const pending = reports.filter((report) => report.status === "submitted").length;
  const approved = reports.filter((report) => report.status === "approved");
  const hectares = approved.reduce((sum, report) => sum + Number(report.area || 0), 0);
  const expected = approved.reduce((sum, report) => sum + Number(report.volume || 0), 0);
  const upcoming = reports.filter((report) => report.status === "approved").slice(0, 4);
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()} <span className="heading-dot">·</span> BOAC, MARINDUQUE</p><h1>Good morning, Alex <span className="wave">✳</span></h1><p className="muted">Here’s what’s happening across your agricultural landscape.</p></div><button className="button button-primary" onClick={() => setPage("Field reports")}><Plus size={16} /> New field report</button></div>
    <section className="metric-grid">
      <MetricCard label="Expected harvest" value={`${(expected / 1000).toFixed(1)}k`} unit="kg" change="+12.8%" icon={Sprout} tone="green" />
      <MetricCard label="Planted area" value={hectares.toFixed(1)} unit="ha" change="+4.2%" icon={MapPin} tone="blue" />
      <MetricCard label="Reports to review" value={String(pending).padStart(2, "0")} unit="" change="needs attention" icon={ClipboardCheck} tone="orange" />
      <MetricCard label="Barangays reporting" value="48" unit="/ 61" change="+6 this month" icon={Users} tone="purple" />
    </section>
    <section className="overview-grid">
      <article className="panel harvest-panel"><div className="panel-heading"><div><h2>Harvest outlook</h2><p className="muted">Projected crop volume · this season</p></div><button className="select-button">All crops <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot green-dot" /> Forecast harvest</span><span><i className="legend-line" /> Market demand</span><b>Nov 2026</b></div><MiniBars /><div className="chart-caption">Supply is tracking <strong>14% above</strong> seasonal demand <span>+5,840 kg vs target</span></div></article>
      <article className="panel map-panel"><div className="panel-heading"><div><h2>Production by barangay</h2><p className="muted">Live crop activity across Boac</p></div><button className="icon-button" aria-label="Open full map" onClick={() => setPage("Map view")}><ArrowUpRight size={17} /></button></div><MapPanel compact forecasts={forecasts} onSelect={setSelectedBarangay} selected={selectedBarangay} /><div className="map-legend"><span><i className="legend-dot green-dot" /> Demand met</span><span><i className="legend-dot yellow-dot" /> Watch</span><span><i className="legend-dot red-dot" /> Significant risk</span><button onClick={() => setPage("Map view")}>Explore map <ChevronRight size={13} /></button></div></article>
    </section>
    <section className="overview-grid bottom-grid">
      <article className="panel table-panel"><div className="panel-heading"><div><h2>Upcoming harvests</h2><p className="muted">Next expected harvest windows</p></div><button className="subtle-link" onClick={() => setPage("Forecasting")}>View forecast <ChevronRight size={14} /></button></div><div className="table-scroll"><table><thead><tr><th>BARANGAY / CROP</th><th>HARVEST WINDOW</th><th>VOLUME</th><th>RISK</th></tr></thead><tbody>{upcoming.map((r) => <tr key={r.id}><td><strong>{r.barangay}</strong><small>{r.crop}</small></td><td>{r.harvest}</td><td>{formatNumber(r.volume)} kg</td><td><StatusBadge status={r.volume > 7000 ? "oversupply" : "balanced"} /></td></tr>)}</tbody></table></div></article>
      <article className="panel attention-panel"><div className="panel-heading"><div><h2>Needs your attention</h2><p className="muted">Action items for today</p></div><span className="count-pill">{pending + 2}</span></div><button className="attention-item" onClick={() => setPage("Field reports")}><span className="attention-icon orange"><ClipboardCheck size={16} /></span><span><strong>{pending} reports</strong><small>Waiting for your review</small></span><ChevronRight size={15} /></button><button className="attention-item" onClick={() => setPage("Supply allocation")}><span className="attention-icon green"><Boxes size={16} /></span><span><strong>Tomato surplus</strong><small>3,000 kg can be allocated to Gasan</small></span><ChevronRight size={15} /></button><button className="attention-item" onClick={() => setPage("Notifications")}><span className="attention-icon blue"><Bell size={16} /></span><span><strong>Harvest in 18 days</strong><small>Rice · Agumaymayan barangay</small></span><ChevronRight size={15} /></button></article>
    </section>
  </div>;
}

function ReportsPage({ reports, onReview, onNew, onExport, apiOnline }) {
  const [filter, setFilter] = useState("all");
  const visible = reports.filter((report) => filter === "all" || report.status === filter);
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">OPERATIONS</p><h1>Field reports</h1><p className="muted">Review submissions and keep crop production records up to date.</p></div><button className="button button-primary" onClick={onNew}><Plus size={16} /> New report</button></div>
    {!apiOnline && <div className="info-banner"><Cloud size={16} /> Demo data is stored in this browser session. Connect the API to save submissions centrally.</div>}
    <section className="metric-grid compact-metrics"><MetricCard label="Total reports" value={reports.length} unit="" change="+8 this month" icon={FileText} tone="blue" /><MetricCard label="Awaiting review" value={reports.filter((r) => r.status === "submitted").length} unit="" change="needs attention" icon={ClipboardCheck} tone="orange" /><MetricCard label="Approved" value={reports.filter((r) => r.status === "approved").length} unit="" change="+5 this month" icon={Check} tone="green" /></section>
    <article className="panel full-panel"><div className="panel-heading"><div className="tab-buttons">{["all", "submitted", "approved", "rejected"].map((item) => <button key={item} className={filter === item ? "tab-active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All reports" : item === "submitted" ? "For review" : item[0].toUpperCase() + item.slice(1)}{item === "submitted" && <span>{reports.filter((r) => r.status === "submitted").length}</span>}</button>)}</div><div className="table-tools"><button className="button button-light" onClick={() => onExport("excel")}><Download size={15} /> Export</button><button className="icon-button"><Filter size={16} /></button></div></div>
      <div className="table-scroll"><table><thead><tr><th>REPORT / FARMER</th><th>BARANGAY</th><th>CROP</th><th>AREA</th><th>EXPECTED HARVEST</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{visible.map((r) => <tr key={r.id}><td><strong>{r.displayId || r.id}</strong><small>{r.farmer}</small></td><td>{r.barangay}</td><td><span className="crop-cell"><i style={{ background: crops.find((crop) => crop.name === r.crop)?.color || "#39834c" }} />{r.crop}</span></td><td>{Number(r.area).toFixed(1)} ha</td><td><strong>{formatNumber(r.volume)} kg</strong><small>{r.harvest}</small></td><td><StatusBadge status={r.status} /></td><td>{r.status === "submitted" ? <div className="row-actions"><button title="Approve" className="action-check" onClick={() => onReview(r, "approved")}><Check size={16} /></button><button title="Reject" className="action-reject" onClick={() => onReview(r, "rejected")}><X size={16} /></button></div> : <button className="subtle-link">Details <ChevronRight size={13} /></button>}</td></tr>)}</tbody></table></div>
      {!visible.length && <div className="empty-state">No reports in this category yet.</div>}
    </article>
  </div>;
}

function ForecastPage({ forecasts, onExport }) {
  const rows = forecasts?.length ? forecasts : forecastRows();
  const total = rows.reduce((sum, row) => sum + Number(row.expected_harvest_kg ?? row.supply ?? 0), 0);
  const surplus = rows.filter((row) => (row.supply_status ?? row.status) === "oversupply").length;
  const shortages = rows.filter((row) => (row.supply_status ?? row.status) === "shortage").length;
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">PLANNING & INSIGHTS</p><h1>Forecasting analytics</h1><p className="muted">Supply outlook compared with estimated weekly local market capacity.</p></div><button className="button button-light" onClick={() => onExport("excel")}><Download size={15} /> Export forecast</button></div>
    <div className="formula-banner"><span className="formula-icon"><Activity size={17} /></span><div><strong>Forecast model</strong><p>Expected harvest = planted area × average yield <span>·</span> Weekly demand = population × per-capita consumption ÷ 52</p></div><span className="model-tag">MODEL V1.0</span></div>
    <section className="metric-grid"><MetricCard label="Forecast harvest" value={`${(total / 1000).toFixed(1)}k`} unit="kg" change="+9.4%" icon={Sprout} tone="green" /><MetricCard label="Surplus barangays" value={surplus} unit="" change="allocation opportunity" icon={TrendingUp} tone="blue" /><MetricCard label="Shortage alerts" value={shortages} unit="" change="watch list" icon={AlertTriangle} tone="orange" /><MetricCard label="Demand covered" value="112" unit="%" change="+6.2%" icon={Activity} tone="purple" /></section>
    <article className="panel full-panel"><div className="panel-heading"><div><h2>Barangay supply outlook</h2><p className="muted">Approved crop reports aggregated by barangay</p></div><button className="select-button">Harvest season <ChevronDown size={14} /></button></div><div className="table-scroll"><table><thead><tr><th>BARANGAY</th><th>CROP</th><th>AREA</th><th>EXPECTED HARVEST</th><th>WEEKLY DEMAND</th><th>HARVEST WINDOW</th><th>STATUS</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.barangay_name || r.barangay}-${r.crop_name || r.crop}-${i}`}><td><strong>{r.barangay_name || r.barangay}</strong></td><td>{r.crop_name || r.crop}</td><td>{Number(r.total_area_ha ?? r.area).toFixed(1)} ha</td><td><strong>{formatNumber(r.expected_harvest_kg ?? r.supply)} kg</strong></td><td>{formatNumber(r.weekly_demand_kg ?? r.demand)} kg</td><td>{r.harvest || (r.first_harvest ? `${formatDate(r.first_harvest)} – ${formatDate(r.last_harvest)}` : "—")}</td><td><StatusBadge status={r.supply_status || r.status} /></td></tr>)}</tbody></table></div><div className="table-footer">Showing {rows.length} barangay and crop combinations <span>Demand estimate based on population and crop consumption profile</span></div></article>
  </div>;
}

function MapPage({ selected, setSelected, forecasts }) {
  const row = (forecasts?.length ? forecasts : forecastRows())
    .filter((item) => (item.barangay_name || item.barangay) === selected)
    .sort((a, b) => Number(b.expected_harvest_kg ?? b.supply ?? 0) - Number(a.expected_harvest_kg ?? a.supply ?? 0))[0];
  const expectedSupply = Number(row?.expected_harvest_kg ?? row?.supply ?? 37800);
  const localDemand = Number(row?.weekly_demand_kg ?? row?.demand ?? 12780);
  const projectedDifference = expectedSupply - localDemand;
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">GEOGRAPHIC INTELLIGENCE</p><h1>Boac crop map</h1><p className="muted">Explore farm activity and crop supply outlook by barangay.</p></div><div className="map-date-chip"><span className="online-dot" /> 61 barangays <span>·</span> Live overview</div></div>
    <div className="map-layout"><article className="panel map-main"><MapPanel forecasts={forecasts} onSelect={setSelected} selected={selected} /><div className="map-legend map-legend-full"><span><i className="legend-dot green-dot" /> Demand met</span><span><i className="legend-dot yellow-dot" /> Potential imbalance</span><span><i className="legend-dot red-dot" /> Significant risk</span><small>Illustrative barangay markers · verify locations against official GIS data</small></div></article>
      <aside className="panel barangay-details"><p className="eyebrow">SELECTED BARANGAY</p><h2>{selected}</h2><p className="muted">Boac Municipality · Marinduque</p><div className="detail-crop"><span className="crop-avatar">🌾</span><span><strong>{row?.crop_name || row?.crop || "Rice"}</strong><small>Primary forecast crop</small></span><StatusBadge status={row?.supply_status || row?.status || "oversupply"} /></div><div className="detail-stat"><span>Risk status</span><StatusBadge status={row ? riskForForecast(row) : "yellow"} /></div><div className="detail-stat"><span>Total planted area</span><strong>{Number(row?.total_area_ha ?? row?.area ?? 8.4).toFixed(1)} ha</strong></div><div className="detail-stat"><span>Expected harvest</span><strong>{formatNumber(expectedSupply)} kg</strong></div><div className="detail-stat"><span>Weekly market capacity</span><strong>{formatNumber(localDemand)} kg</strong></div><div className="detail-stat"><span>Projected {projectedDifference >= 0 ? "oversupply" : "shortage"}</span><strong>{formatNumber(Math.abs(projectedDifference))} kg</strong></div><div className="detail-stat"><span>Harvest period</span><strong>{row?.harvest || "Jul 18 – Aug 02"}</strong></div><div className="risk-note"><AlertTriangle size={16} /><span><strong>Supply forecast: {row?.supply_status || row?.status || "oversupply"}</strong><small>Recommendations account for projected supply and neighboring demand.</small></span></div><button className="button button-primary full-button">View barangay reports <ChevronRight size={15} /></button></aside>
    </div>
  </div>;
}

function AllocationPage({ token }) {
  const [recommendations, setRecommendations] = useState([
    { crop: "Tomato", source: "Laylay, Boac", target: "Gasan", surplus: 5000, recommend: 3000, status: "proposed", color: "tomato" },
    { crop: "Rice", source: "Agumaymayan, Boac", target: "Mogpog", surplus: 6400, recommend: 4200, status: "proposed", color: "rice" },
    { crop: "Corn", source: "Caganhao, Boac", target: "Buenavista", surplus: 2800, recommend: 1800, status: "accepted", color: "corn" },
  ]);
  useEffect(() => {
    if (!token) return;
    api("/recommendations", { token }).then((items) => setRecommendations(items.map((item) => ({
      id: item.id, crop: item.crop_name, source: `${item.source_barangay}, Boac`, target: item.target_municipality,
      surplus: Number(item.surplus_kg), recommend: Number(item.recommended_kg), status: item.status,
      color: item.crop_name.toLowerCase() === "tomato" ? "tomato" : item.crop_name.toLowerCase() === "corn" ? "corn" : "rice",
    })))).catch((error) => console.error("Could not load allocation recommendations:", error));
  }, [token]);
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
    <div className="page-heading"><div><p className="eyebrow">PROVINCIAL COORDINATION</p><h1>Supply allocation</h1><p className="muted">Turn local surpluses into reliable supply for neighboring municipalities.</p></div><button className="button button-primary"><Plus size={16} /> Generate recommendations</button></div>
    <section className="allocation-hero"><div className="allocation-illustration"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="allocation-center"><Sprout size={29} /></span><span className="orbit-label label-boac">BOAC<br /><b>+5.0t</b></span><span className="orbit-label label-gasan">GASAN<br /><b>3.0t need</b></span><span className="orbit-label label-mogpog">MOGPOG<br /><b>4.2t need</b></span></div><div className="allocation-copy"><p className="eyebrow">SMART REDISTRIBUTION</p><h2>Move the harvest<br />where it’s needed.</h2><p>Recommendations compare projected municipal supply against weekly demand, then suggest transfer volumes that reduce waste and help close shortages.</p><div className="allocation-stats"><div><strong>12.4t</strong><small>Available surplus</small></div><div><strong>3</strong><small>Municipalities at risk</small></div><div><strong>6</strong><small>Recommendations</small></div></div></div></section>
    <article className="panel full-panel"><div className="panel-heading"><div><h2>Recommended transfers</h2><p className="muted">Illustrative allocation plan based on current forecast and demand records</p></div><button className="select-button">All municipalities <ChevronDown size={14} /></button></div><div className="table-scroll"><table><thead><tr><th>CROP</th><th>SOURCE</th><th>DESTINATION</th><th>SURPLUS</th><th>RECOMMENDED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{recommendations.map((item, index) => <tr key={item.crop + item.target}><td><span className={`crop-avatar small-avatar ${item.color}`}>{item.crop === "Tomato" ? "●" : item.crop === "Corn" ? "◉" : "▤"}</span><strong>{item.crop}</strong></td><td>{item.source}</td><td><span className="route-cell"><MapPin size={14} />{item.target}, Marinduque</span></td><td>{formatNumber(item.surplus)} kg</td><td><strong>{formatNumber(item.recommend)} kg</strong></td><td><StatusBadge status={item.status === "proposed" ? "submitted" : "approved"} /></td><td>{item.status === "proposed" ? <button className="button button-small" onClick={() => accept(index)}>Accept</button> : <span className="accepted-label"><Check size={14} /> Accepted</span>}</td></tr>)}</tbody></table></div></article>
    <div className="note-banner"><CircleHelp size={17} /><span><strong>How recommendations work</strong> Destination demand is calculated from municipal population × crop per-capita consumption ÷ 52 weeks. Transfer volumes are capped at the destination's remaining projected demand.</span></div>
  </div>;
}

function NotificationsPage({ token }) {
  const [items, setItems] = useState(demoNotifications);
  useEffect(() => {
    if (!token) return;
    api("/notifications", { token }).then((data) => {
      if (data.length) setItems(data.map((item) => ({
        title: item.title, detail: item.message, time: new Date(item.created_at).toLocaleDateString(),
        tone: item.risk_status === "oversupply" ? "green" : item.risk_status === "shortage" ? "amber" : "blue",
      })));
    }).catch((error) => console.error("Could not load notifications:", error));
  }, [token]);
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">STAY IN THE LOOP</p><h1>Notifications</h1><p className="muted">Harvest alerts, review reminders, and supply signals.</p></div><button className="button button-light">Mark all as read</button></div><article className="panel notification-list"><div className="notification-date">LATEST <span>{items.length} alerts</span></div>{items.map((item, i) => <div className="notification-row" key={`${item.title}-${i}`}><span className={`notification-symbol ${item.tone}`}>{i === 0 ? <Sprout size={17} /> : i === 1 ? <Boxes size={17} /> : <ClipboardCheck size={17} />}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.time} · Agriculture Office</small></div><span className="unread-dot" /></div>)}</article></div>;
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

function SettingsPage({ token, user }) {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
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
    {isAdmin && <article className="panel full-panel user-panel"><div className="panel-heading"><div><h2>User management</h2><p className="muted">Manage administrator, municipal, provincial, and field accounts.</p></div><button className="button button-primary" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Add user</button></div>
      {error && <div className="error-box">{error}</div>}
      {showForm && <form className="user-create-form" onSubmit={createUser}><input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="admin">Admin</option><option value="municipal_officer">Municipal Officer</option><option value="provincial_officer">Provincial Officer</option><option value="field_officer">Field Officer</option></select><input type="password" minLength="12" required placeholder="Temporary password (12+ chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button className="button button-primary">Create account</button></form>}
      <div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th></tr></thead><tbody>{users.map((account) => <tr key={account.id}><td><strong>{account.name}</strong></td><td>{account.email}</td><td>{account.role.replaceAll("_", " ")}</td><td><StatusBadge status={account.is_active ? "approved" : "rejected"} /></td></tr>)}</tbody></table></div>
    </article>}
  </div>;
}

function ReportModal({ onClose, onSave }) {
  const [form, setForm] = useState({ farmer: "", barangay: "Agumaymayan", crop: "Rice", area: "", planted: new Date().toISOString().slice(0, 10), method: "Transplanting" });
  const [position, setPosition] = useState(null);
  const crop = crops.find((item) => item.name === form.crop);
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
    <div className="form-grid"><label className="wide-field">Farmer name<input required value={form.farmer} onChange={(e) => update("farmer", e.target.value)} placeholder="Enter farmer's full name" /></label><label>Barangay<select value={form.barangay} onChange={(e) => update("barangay", e.target.value)}>{barangays.map((name) => <option key={name}>{name}</option>)}</select></label><label>Crop type<select value={form.crop} onChange={(e) => update("crop", e.target.value)}>{crops.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Planted area (hectares)<input type="number" min="0.01" step="0.01" required value={form.area} onChange={(e) => update("area", e.target.value)} placeholder="e.g. 1.5" /></label><label>Planting date<input type="date" required value={form.planted} onChange={(e) => update("planted", e.target.value)} /></label><label>Planting method<select value={form.method} onChange={(e) => update("method", e.target.value)}><option>Direct Seeding</option><option>Transplanting</option></select></label><div className="location-field"><div><strong>Farm GPS location</strong><small>{position ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : "Capture coordinates at the farm visit"}</small></div><button type="button" className="button button-light" onClick={locate}><LocateFixed size={15} /> {position ? "Captured" : "Capture GPS"}</button></div></div>
    <div className="calculation-box"><div><span>Expected harvest</span><strong>{formatNumber(volume)} kg</strong><small>{form.area || "0"} ha × {formatNumber(crop?.yield)} kg/ha</small></div><div><span>Estimated harvest date</span><strong>{harvestDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</strong><small>{crop?.maturity} days after planting</small></div></div>
    <div className="modal-footer"><button type="button" className="button button-light" onClick={() => onSave({ ...form, ...position, volume, harvest: harvestDate.toISOString().slice(0, 10), status: "draft" })}>Save draft</button><button className="button button-primary"><Check size={15} /> Submit report</button></div>
  </form></div>;
}

function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("agriflow_user")); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("agriflow_token"));
  const [page, setPage] = useState("Dashboard");
  const [reports, setReports] = useState(initialReports);
  const [forecasts, setForecasts] = useState(forecastRows());
  const [apiOnline, setApiOnline] = useState(false);
  const [modal, setModal] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState("Agumaymayan");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const setSelected = useMemo(() => (name) => setSelectedBarangay(name), []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([api("/reports", { token }), api("/forecasts", { token })]).then(([reportData, forecastData]) => {
      if (!active) return;
      setReports(reportData.map((item) => ({
        id: item.id, displayId: item.id.slice(0, 8).toUpperCase(), farmer: item.farmer_name, barangay: item.barangay_name, crop: item.crop_name,
        area: Number(item.area_ha), planted: item.planting_date?.slice(0, 10),
        harvest: item.planting_date ? formatDate(new Date(new Date(item.planting_date).getTime() + (crops.find((c) => c.name === item.crop_name)?.maturity || 0) * 86400000).toISOString().slice(0, 10)) : "—",
        volume: Number(item.area_ha) * (crops.find((c) => c.name === item.crop_name)?.yield || 0), status: item.status, method: item.planting_method,
      })));
      setForecasts(forecastData);
      setApiOnline(true);
    }).catch(() => setApiOnline(false));
    return () => { active = false; };
  }, [token]);

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
  async function saveReport(form) {
    if (token) {
      try {
        await api("/reports", { method: "POST", token, body: JSON.stringify({
          barangayName: form.barangay, cropName: form.crop, farmerName: form.farmer,
          areaHa: Number(form.area), plantingDate: form.planted, plantingMethod: form.method,
          latitude: form.latitude, longitude: form.longitude, status: form.status || "submitted",
        }) });
      } catch (error) { window.alert(error.message); return; }
    }
    const newReport = { id: `BO-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`, ...form, status: form.status || "submitted" };
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
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><span className="brand-icon"><Sprout size={21} /></span><span>AgriCast<small>BOAC AGRICULTURE</small></span><button className="close-sidebar" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-seal">B</span><span><strong>Boac Municipality</strong><small>Marinduque Province</small></span><ChevronDown size={14} /></div>
      <nav className="side-nav">{navigation.map((group) => <div key={group.section}><p className="nav-section">{group.section}</p>{group.items.map(([label, Icon]) => <button key={label} className={`nav-item ${page === label ? "nav-active" : ""}`} onClick={() => { setPage(label); setMobileNav(false); }}><Icon size={17} /><span>{label}</span>{label === "Notifications" && <i className="nav-notification" />}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sync-status"><span className="sync-icon"><Cloud size={16} /></span><span><strong>{apiOnline ? "Connected to server" : "Demo workspace"}</strong><small>{apiOnline ? "All data is up to date" : "Local preview mode"}</small></span><span className={`online-dot ${apiOnline ? "" : "dot-muted"}`} /></div><button className="profile-button"><span className="avatar">AM</span><span><strong>{user.name || "Alex Morgan"}</strong><small>{user.role?.replaceAll("_", " ") || "Municipal Officer"}</small></span><ChevronDown size={14} /></button></div>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><span className="breadcrumb">Workspace <ChevronRight size={14} /> <PageIcon size={15} /> <strong>{page}</strong></span></div><div className="topbar-actions"><label className="global-search"><Search size={16} /><input placeholder="Search reports, crops..." value={search} onChange={(e) => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label><button className="top-icon" onClick={() => setPage("Notifications")} aria-label="Notifications"><Bell size={18} /><i /></button><span className="top-divider" /><button className="top-avatar" title="Sign out" onClick={signOut}>AM</button></div></header>
      {page === "Dashboard" && <DashboardHome reports={reports} forecasts={forecasts} selectedBarangay={selectedBarangay} setSelectedBarangay={setSelected} setPage={setPage} />}
      {page === "Field reports" && <ReportsPage reports={reports} onReview={review} onNew={() => setModal(true)} onExport={exportData} apiOnline={apiOnline} />}
      {page === "Forecasting" && <ForecastPage forecasts={forecasts} onExport={exportData} />}
      {page === "Map view" && <MapPage selected={selectedBarangay} setSelected={setSelected} forecasts={forecasts} />}
      {page === "Supply allocation" && <AllocationPage token={token} />}
      {page === "Notifications" && <NotificationsPage token={token} />}
      {page === "Reports" && <ReportsExportPage reports={reports} onExport={exportData} />}
      {page === "Settings" && <SettingsPage token={token} user={user} />}
      <footer className="app-footer"><span>AgriCast <span>·</span> Municipal Agriculture Office of Boac</span><span>Data for planning purposes <span>·</span> v1.0.0</span></footer>
    </main>
    {modal && <ReportModal onClose={() => setModal(false)} onSave={saveReport} />}
  </div>;
}

export default App;
