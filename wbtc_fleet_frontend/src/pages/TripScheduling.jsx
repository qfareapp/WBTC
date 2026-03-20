import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import OperatorToggle from "../components/OperatorToggle.jsx";
import "../App.css";
import { getOpsDate } from "../utils/opsTime.js";

const today = getOpsDate();
const frequencyMin = 30;

function TripScheduling({ apiBase, token, operatorScope, setOperatorScope }) {
  const navigate = useNavigate();
  const [depots, setDepots] = useState([]);
  const [selectedDepot, setSelectedDepot] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [notice, setNotice] = useState(null);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadRoutes = useCallback(async () => {
    try {
      const stamp = Date.now();
      const response = await fetch(
        `${apiBase}/api/routes?operatorType=${encodeURIComponent(operatorScope)}&t=${stamp}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load routes");
      setRoutes(data.routes || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  }, [apiBase, operatorScope, token]);

  useEffect(() => {
    const loadDepots = async () => {
      try {
        const response = await fetch(`${apiBase}/api/depots?operatorType=${encodeURIComponent(operatorScope)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(data.message || "Failed to load depots");
        setDepots(data.depots || []);
        const nextDepots = data.depots || [];
        if (!nextDepots.some((item) => item._id === selectedDepot)) {
          setSelectedDepot(nextDepots[0]?._id || "");
        }
      } catch (error) {
        showNotice("error", error.message);
      }
    };

    const loadBuses = async () => {
      try {
        const response = await fetch(`${apiBase}/api/buses?operatorType=${encodeURIComponent(operatorScope)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(data.message || "Failed to load buses");
        setBuses(data.buses || []);
      } catch (error) {
        showNotice("error", error.message);
      }
    };

    const loadDrivers = async () => {
      try {
        const response = await fetch(`${apiBase}/api/drivers?operatorType=${encodeURIComponent(operatorScope)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(data.message || "Failed to load drivers");
        setDrivers(data.drivers || []);
      } catch (error) {
        showNotice("error", error.message);
      }
    };

    loadDepots();
    loadBuses();
    loadDrivers();
    loadRoutes();
  }, [apiBase, token, operatorScope, loadRoutes]);

  const filteredBuses = useMemo(
    () => buses.filter((bus) => (bus.depotId?._id || bus.depotId) === selectedDepot),
    [buses, selectedDepot]
  );
  const filteredDrivers = useMemo(
    () => drivers.filter((driver) => (driver.depotId?._id || driver.depotId) === selectedDepot),
    [drivers, selectedDepot]
  );
  const filteredRoutes = useMemo(
    () => routes.filter((route) => (route.depotId?._id || route.depotId) === selectedDepot),
    [routes, selectedDepot]
  );

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
              <p className="sidebar-title">WBTC Fleet</p>
              <span className="pill">Trip scheduling</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/dashboard">Dashboard</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/buses">Bus entry</Link>
            <Link className="nav-item" to="/depots">Depot entry</Link>
            <Link className="nav-item" to="/drivers">Driver entry</Link>
            <Link className="nav-item" to="/conductors">Conductor entry</Link>
            <Link className="nav-item" to="/bus-crew">Bus crew mapping</Link>
            <Link className="nav-item" to="/routes">Route entry</Link>
            <Link className="nav-item" to="/scheduling">Trip scheduling</Link>
            <Link className="nav-item" to="/payments">Payment</Link>
            <Link className="nav-item live-nav" to="/live-trips">Live trips</Link>
          </nav>
          <div className="sidebar-footer">
            <span className="pill">Frequency {frequencyMin} min</span>
            <span className="pill">API: {apiBase}</span>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <h1>Depot scheduler</h1>
                <span className="pill">Time-slot based</span>
              </div>
            </div>
            <div className="topbar-actions">
              <OperatorToggle value={operatorScope} onChange={setOperatorScope} />
              <Link className="btn ghost" to="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}
            <section className="panel">
              <div className="panel-header">
                <h3>Scheduling controls</h3>
                <span className="pill">{operatorScope} depot scheduler</span>
              </div>
              <div className="grid three" style={{ marginBottom: "16px" }}>
                <div className="stat">
                  <span>Buses in depot</span>
                  <strong>{selectedDepot ? filteredBuses.length : 0}</strong>
                </div>
                <div className="stat">
                  <span>Drivers in depot</span>
                  <strong>{selectedDepot ? filteredDrivers.length : 0}</strong>
                </div>
                <div className="stat">
                  <span>Routes in depot</span>
                  <strong>{selectedDepot ? filteredRoutes.length : 0}</strong>
                </div>
              </div>
              <div className="inline">
                <label className="field">
                  Depot
                  <select
                    value={selectedDepot}
                    onChange={(event) => setSelectedDepot(event.target.value)}
                  >
                    <option value="">Select depot</option>
                    {depots.map((depot) => (
                      <option key={depot._id} value={depot._id}>
                        {depot.depotName} ({depot.depotCode})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Date
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Depot routes</h3>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="pill">{selectedDate}</span>
                  <button className="btn ghost" type="button" onClick={loadRoutes}>
                    Refresh routes
                  </button>
                </div>
              </div>
              {selectedDepot && filteredRoutes.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No routes for this depot</strong>
                    <span>Add routes with an associated depot to schedule trips.</span>
                  </div>
                </div>
              ) : (
                <div className="list">
                  {filteredRoutes.map((route) => (
                    <div className="list-item" key={route._id}>
                      <div>
                        <strong>{route.routeCode}</strong>
                        <span>
                          {route.routeName} • {route.source || "--"} to {route.destination || "--"} •
                          {" "}UP {route.firstTripTimeUp || "--"} / DOWN {route.firstTripTimeDown || "--"} to {route.lastTripTime || "--"} •
                          {" "}{route.frequencyMin || "--"} min
                        </span>
                      </div>
                      <button
                        className="btn outline"
                        type="button"
                        onClick={() => navigate(`/scheduling/${route._id}`)}
                      >
                        Trip timeline
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

    </div>
  );
}

export default TripScheduling;


