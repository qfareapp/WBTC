import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";
import { getOpsDate } from "../utils/opsTime.js";

const today = getOpsDate();
const thisMonth = today.slice(0, 7);

function OwnerDashboard({ apiBase, token, user, setToken, setUser }) {
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState({
    mode: "daily",
    date: today,
    month: thisMonth,
    startDate: today,
    endDate: today,
  });
  const [data, setData] = useState(null);
  const [personnel, setPersonnel] = useState({ drivers: [], conductors: [] });
  const [crewDraft, setCrewDraft] = useState({});
  const [locationDraft, setLocationDraft] = useState({});
  const [locationSavingBusId, setLocationSavingBusId] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const formatMoney = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0.00";
    return num.toFixed(2);
  };

  const apiFetch = async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(payload.message || "Request failed");
    return payload;
  };

  const loadDashboard = async ({ silent = false } = {}) => {
    try {
      const params = new URLSearchParams({ mode: query.mode });
      if (query.mode === "daily") params.set("date", query.date);
      if (query.mode === "monthly") params.set("month", query.month);
      if (query.mode === "custom") {
        params.set("startDate", query.startDate);
        params.set("endDate", query.endDate);
      }
      const payload = await apiFetch(`/api/owner/dashboard?${params.toString()}`);
      setData(payload);
      setLastSyncAt(new Date());
      if (!silent) showNotice("success", "Owner fleet dashboard loaded.");
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const loadPersonnel = async () => {
    try {
      const payload = await apiFetch("/api/owner/personnel");
      setPersonnel({ drivers: payload.drivers || [], conductors: payload.conductors || [] });
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  useEffect(() => {
    loadDashboard({ silent: true });
  }, [query.mode, query.date, query.month, query.startDate, query.endDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadDashboard({ silent: true });
    }, 15000);
    return () => clearInterval(timer);
  }, [query.mode, query.date, query.month, query.startDate, query.endDate]);

  useEffect(() => {
    loadPersonnel();
  }, []);

  const onToggleBus = async (bus) => {
    const nextStatus = bus.status === "Active" ? "UnderMaintenance" : "Active";
    try {
      await apiFetch(`/api/owner/buses/${bus.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      showNotice("success", `${bus.busNumber} status set to ${nextStatus}.`);
      loadDashboard({ silent: true });
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const onAssignCrew = async (busId) => {
    const draft = crewDraft[busId] || {};
    if (!draft.driverId || !draft.conductorId) {
      showNotice("error", "Select driver and conductor first.");
      return;
    }
    try {
      await apiFetch(`/api/owner/buses/${busId}/assign-crew`, {
        method: "POST",
        body: JSON.stringify({
          driverId: draft.driverId,
          conductorId: draft.conductorId,
        }),
      });
      showNotice("success", "Crew assigned to bus.");
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const onUpdateLocation = async (bus) => {
    const busId = String(bus.id);
    const nextLocation = String(locationDraft[busId] || "").trim();
    if (!nextLocation) {
      showNotice("error", "Select start location first.");
      return;
    }
    setLocationSavingBusId(busId);
    try {
      await apiFetch(`/api/owner/buses/${busId}/location`, {
        method: "PATCH",
        body: JSON.stringify({ location: nextLocation }),
      });
      showNotice("success", `${bus.busNumber} location updated.`);
      await loadDashboard({ silent: true });
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLocationSavingBusId("");
    }
  };

  const summary = data?.summary || {};
  const buses = data?.buses || [];
  const routeDistribution = data?.routeDistribution || [];

  const driversByDepot = useMemo(() => personnel.drivers || [], [personnel.drivers]);
  const conductorsByDepot = useMemo(() => personnel.conductors || [], [personnel.conductors]);

  return (
    <div className="app">
      <div className="background">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="brand-mark" />
            <div>
              <p className="sidebar-title">Owner Fleet</p>
              <span className="pill">Bus owner console</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item live-nav" to="/owner">Fleet KPI</Link>
            <Link className="nav-item" to="/owner/assign-crew">Crew assign</Link>
          </nav>
          <div className="sidebar-footer">
            <span className="pill">API: {apiBase}</span>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setToken("");
                setUser(null);
              }}
            >
              Logout
            </button>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <h1>Fleet Owner Dashboard</h1>
                <span className="pill">{user?.name || "Owner"}</span>
              </div>
            </div>
            <div className="topbar-actions">
              <span className="pill">Role: OWNER</span>
              <span className="pill">
                Last sync: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "--"}
              </span>
              <button className="btn outline" type="button" onClick={() => loadDashboard()}>
                Refresh
              </button>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            <section className="panel">
              <div className="panel-header">
                <h3>KPI filter</h3>
                <span className="pill">{data?.period?.startDate || "--"} to {data?.period?.endDate || "--"}</span>
              </div>
              <div className="inline">
                <label className="field">
                  Period type
                  <select value={query.mode} onChange={(e) => setQuery({ ...query, mode: e.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {query.mode === "daily" && (
                  <label className="field">
                    Date
                    <input type="date" value={query.date} onChange={(e) => setQuery({ ...query, date: e.target.value })} />
                  </label>
                )}
                {query.mode === "monthly" && (
                  <label className="field">
                    Month
                    <input type="month" value={query.month} onChange={(e) => setQuery({ ...query, month: e.target.value })} />
                  </label>
                )}
                {query.mode === "custom" && (
                  <>
                    <label className="field">
                      Start date
                      <input type="date" value={query.startDate} onChange={(e) => setQuery({ ...query, startDate: e.target.value })} />
                    </label>
                    <label className="field">
                      End date
                      <input type="date" value={query.endDate} onChange={(e) => setQuery({ ...query, endDate: e.target.value })} />
                    </label>
                  </>
                )}
              </div>
            </section>

            <section className="grid three">
              <div className="stat"><span>Tagged buses</span><strong>{summary.totalBuses ?? 0}</strong></div>
              <div className="stat"><span>Total buses</span><strong>{summary.totalBuses ?? 0}</strong></div>
              <div className="stat"><span>Active buses</span><strong>{summary.activeBuses ?? 0}</strong></div>
              <div className="stat"><span>Live buses</span><strong>{summary.liveBuses ?? 0}</strong></div>
              <div className="stat"><span>Tickets generated</span><strong>{summary.ticketsGenerated ?? 0}</strong></div>
              <div className="stat"><span>Fare collected</span><strong>Rs {formatMoney(summary.fareCollected)}</strong></div>
              <div className="stat"><span>Trip completion</span><strong>{summary.completionRatePct ?? 0}%</strong></div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Route-wise fleet split</h3>
                <span className="pill">{summary.totalRoutes ?? 0} routes</span>
              </div>
              {routeDistribution.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No route data</strong>
                    <span>Trips for selected period will appear here.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Buses</th>
                      <th>Trips</th>
                      <th>Tickets</th>
                      <th>Fare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeDistribution.map((row) => (
                      <tr key={row.routeId}>
                        <td>{row.routeCode} - {row.routeName}</td>
                        <td>{row.buses}</td>
                        <td>{row.trips}</td>
                        <td>{row.ticketsGenerated}</td>
                        <td>Rs {Number(row.fareCollected || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Bus fleet controls</h3>
                <span className="pill">Assignments + activation</span>
              </div>
              {buses.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No buses assigned to this owner</strong>
                    <span>Ask admin to tag private buses with your owner account.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bus</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Live Route</th>
                      <th>Tickets</th>
                      <th>Fare</th>
                      <th>Driver</th>
                      <th>Conductor</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buses.map((bus) => (
                      <tr key={bus.id}>
                        <td>{bus.busNumber}</td>
                        <td><span className="chip">{bus.status}</span></td>
                        <td>
                          <div style={{ display: "grid", gap: "6px", minWidth: "220px" }}>
                            <span>
                              Current: <strong>{bus.currentLocation || "--"}</strong>
                            </span>
                            <span>
                              Live stop: <strong>{bus.liveCurrentStop?.name || "--"}</strong>
                            </span>
                            <span>
                              Last trip end: <strong>{bus.lastTripEndLocation?.name || "--"}</strong>
                            </span>
                            {bus.attachedRoute ? (
                              <span>
                                Route endpoints: {bus.attachedRoute.source} {"<->"} {bus.attachedRoute.destination}
                              </span>
                            ) : (
                              <span>Route endpoints: --</span>
                            )}
                            <div className="inline">
                              <select
                                value={locationDraft[String(bus.id)] ?? ""}
                                onChange={(e) =>
                                  setLocationDraft((prev) => ({ ...prev, [String(bus.id)]: e.target.value }))
                                }
                              >
                                <option value="">Select start point</option>
                                {bus.attachedRoute?.source && (
                                  <option value={bus.attachedRoute.source}>{bus.attachedRoute.source}</option>
                                )}
                                {bus.attachedRoute?.destination && (
                                  <option value={bus.attachedRoute.destination}>{bus.attachedRoute.destination}</option>
                                )}
                              </select>
                              <button
                                className="btn ghost"
                                type="button"
                                onClick={() => onUpdateLocation(bus)}
                                disabled={locationSavingBusId === String(bus.id) || !bus.attachedRoute}
                              >
                                {locationSavingBusId === String(bus.id) ? "Saving..." : "Set start point"}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td>{bus.liveRoute ? `${bus.liveRoute.routeCode}` : "--"}</td>
                        <td>{bus.ticketsGenerated}</td>
                        <td>Rs {Number(bus.fareCollected || 0).toFixed(2)}</td>
                        <td>
                          <select
                            value={crewDraft[bus.id]?.driverId || ""}
                            onChange={(e) =>
                              setCrewDraft((prev) => ({
                                ...prev,
                                [bus.id]: { ...(prev[bus.id] || {}), driverId: e.target.value },
                              }))
                            }
                          >
                            <option value="">Select driver</option>
                            {driversByDepot.map((driver) => (
                              <option key={driver._id} value={driver._id}>
                                {driver.name} ({driver.empId})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={crewDraft[bus.id]?.conductorId || ""}
                            onChange={(e) =>
                              setCrewDraft((prev) => ({
                                ...prev,
                                [bus.id]: { ...(prev[bus.id] || {}), conductorId: e.target.value },
                              }))
                            }
                          >
                            <option value="">Select conductor</option>
                            {conductorsByDepot.map((conductor) => (
                              <option key={conductor._id} value={conductor._id}>
                                {conductor.name} ({conductor.empId})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button className="btn outline" type="button" onClick={() => onAssignCrew(bus.id)}>
                              Assign crew
                            </button>
                            <button className="btn ghost" type="button" onClick={() => onToggleBus(bus)}>
                              {bus.status === "Active" ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default OwnerDashboard;
