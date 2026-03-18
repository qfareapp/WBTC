import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";

const today = new Date().toISOString().slice(0, 10);

const formatDateTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const parseApiText = (text) => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.startsWith("<!DOCTYPE") ? "Server returned HTML error response." : text };
  }
};

function LiveTrips({ apiBase, token }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [depotId, setDepotId] = useState("");
  const [routes, setRoutes] = useState([]);
  const [totalLiveTrips, setTotalLiveTrips] = useState(0);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mapView, setMapView] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadLiveTrips = async () => {
    setBusy(true);
    try {
      const query = new URLSearchParams({
        date: selectedDate,
        depotId: depotId || "",
      });
      const response = await fetch(`${apiBase}/api/trips/live?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to load live trips");
      setRoutes(data.routes || []);
      setTotalLiveTrips(data.totalLiveTrips || 0);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadLiveTrips();
  }, [selectedDate, depotId]);

  const routeCount = useMemo(() => routes.length, [routes]);
  const buildMapUrl = (latitude, longitude) => {
    const delta = 0.01;
    const left = longitude - delta;
    const right = longitude + delta;
    const top = latitude + delta;
    const bottom = latitude - delta;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  };

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
              <span className="pill">Live operations</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/dashboard">Dashboard</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/buses">Bus</Link>
            <Link className="nav-item" to="/depots">Depot</Link>
            <Link className="nav-item" to="/routes">Route</Link>
            <Link className="nav-item" to="/scheduling">Trip scheduling</Link>
            <Link className="nav-item" to="/payments">Payment</Link>
            <Link className="nav-item live-nav" to="/live-trips">Live trips</Link>
          </nav>
          <div className="sidebar-footer">
            <span className="pill">Monitoring</span>
            <span className="pill">{selectedDate}</span>
          </div>
        </aside>

        <main className="main">
          {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

          <section className="panel">
            <div className="panel-header">
              <h3>Live trips (route-wise)</h3>
              <button className="btn ghost" type="button" onClick={loadLiveTrips} disabled={busy}>
                {busy ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <div className="stats-row" style={{ marginBottom: "12px" }}>
              <div className="stat stat-live">
                <span>Total live trips</span>
                <strong>{totalLiveTrips}</strong>
              </div>
              <div className="stat">
                <span>Routes with live trips</span>
                <strong>{routeCount}</strong>
              </div>
            </div>
            <div className="inline">
              <label className="field">
                Date
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </label>
              <label className="field">
                Depot ID (optional)
                <input
                  value={depotId}
                  onChange={(e) => setDepotId(e.target.value)}
                  placeholder="Filter by depot object id"
                />
              </label>
            </div>
          </section>

          {routes.length === 0 ? (
            <section className="panel">
              <div className="list-item">
                <div>
                  <strong>No live trips found</strong>
                  <span>Try another date or remove depot filter.</span>
                </div>
              </div>
            </section>
          ) : (
            routes.map((route) => (
              <section className="panel" key={`live-route-${route.routeId || route.routeCode}`}>
                <div className="panel-header">
                  <div>
                    <h3>{route.routeCode} - {route.routeName}</h3>
                    <span className="trip-direction">{route.source} to {route.destination}</span>
                  </div>
                  <span className="pill pill-available">{route.tripCount} live</span>
                </div>
                <div className="timeline">
                  {route.trips.map((trip) => (
                    <div className="timeline-row timeline-row-live" key={`live-trip-${trip.tripInstanceId}`}>
                      <div className="timeline-time">{trip.startTime || "--"}</div>
                      <div>
                        <strong>{trip.direction || "--"} trip</strong>
                        <span>{trip.startTime || "--"}-{trip.endTime || "--"}</span>
                        <span>Actual start: {formatDateTime(trip.actualStartTime)}</span>
                        <span>Actual stop: {formatDateTime(trip.actualEndTime)}</span>
                        <span>Bus: {trip.bus?.busNumber || "--"} {trip.bus?.busType ? `(${trip.bus.busType})` : ""}</span>
                        <span>Driver: {trip.driver?.name || "--"} {trip.driver?.empId ? `(${trip.driver.empId})` : ""}</span>
                      </div>
                      <div className="timeline-action">
                        <span className="chip chip-live">Live</span>
                        <span className="chip">Opening KM: {trip.openingKm ?? "--"}</span>
                        <span className="chip">Closing KM: {trip.closingKm ?? "--"}</span>
                        <span className="chip">
                          Location: {trip.location?.latitude && trip.location?.longitude ? `${trip.location.latitude}, ${trip.location.longitude}` : "--"}
                        </span>
                        {trip.location?.latitude && trip.location?.longitude && (
                          <button
                            className="btn outline"
                            type="button"
                            onClick={() =>
                              setMapView({
                                latitude: trip.location.latitude,
                                longitude: trip.location.longitude,
                              })
                            }
                          >
                            Live tracking
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>
      {mapView && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: "min(720px, 95vw)" }}>
            <div className="panel-header">
              <h3>Live location</h3>
              <button className="btn ghost" type="button" onClick={() => setMapView(null)}>
                Close
              </button>
            </div>
            <div style={{ width: "100%", height: "360px", borderRadius: "14px", overflow: "hidden" }}>
              <iframe
                title="Trip live location"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                src={buildMapUrl(mapView.latitude, mapView.longitude)}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveTrips;


