import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import OperatorToggle from "../components/OperatorToggle.jsx";
import "../App.css";

  const initialRoute = {
    routeNo: "",
    routeName: "",
    depotId: "",
    estimatedTripDurationMin: "",
    frequencyMin: "",
    firstTripTimeUp: "",
    firstTripTimeDown: "",
    lastTripTime: "",
    assignmentMode: "MANUAL",
  };

const initialStop = { name: "" };
const initialSlab = { fromKm: "", toKm: "", fare: "" };

function RouteEntry({ apiBase, token, operatorScope, setOperatorScope }) {
  const [route, setRoute] = useState(initialRoute);
  const [stops, setStops] = useState([initialStop, initialStop]);
  const [fareSlabs, setFareSlabs] = useState([{ ...initialSlab }]);
  const [routes, setRoutes] = useState([]);
  const [depots, setDepots] = useState([]);
  const [notice, setNotice] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);
  const [activeFareTable, setActiveFareTable] = useState(null);
  const [editingRouteId, setEditingRouteId] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const addStop = () => setStops((prev) => [...prev, { name: "" }]);
  const removeStop = (index) => setStops((prev) => prev.filter((_, idx) => idx !== index));
  const moveStop = (index, direction) => {
    setStops((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addSlab = () => setFareSlabs((prev) => [...prev, { ...initialSlab }]);
  const removeSlab = (index) => setFareSlabs((prev) => prev.filter((_, idx) => idx !== index));

  const slabIssues = useMemo(() => {
    const slabs = fareSlabs
      .map((slab, idx) => ({
        idx,
        fromKm: Number(slab.fromKm),
        toKm: Number(slab.toKm),
        fare: Number(slab.fare),
      }))
      .sort((a, b) => a.fromKm - b.fromKm);

    const issues = [];
    for (const slab of slabs) {
      if (Number.isNaN(slab.fromKm) || Number.isNaN(slab.toKm) || Number.isNaN(slab.fare)) {
        issues.push("Fare slabs must be numeric.");
        break;
      }
      if (slab.fromKm > slab.toKm) {
        issues.push("Fare slab fromKm must be <= toKm.");
        break;
      }
    }
    for (let i = 1; i < slabs.length; i += 1) {
      if (slabs[i].fromKm <= slabs[i - 1].toKm) {
        issues.push("Fare slabs cannot overlap.");
        break;
      }
    }
    return issues;
  }, [fareSlabs]);

  const stopNames = stops.map((stop) => stop.name.trim()).filter(Boolean);

  const getFareForDistance = (distance) => {
    const slab = fareSlabs.find((item) => {
      const fromKm = Number(item.fromKm);
      const toKm = Number(item.toKm);
      if (Number.isNaN(fromKm) || Number.isNaN(toKm)) return false;
      return distance >= fromKm && distance <= toKm;
    });
    return slab ? Number(slab.fare).toFixed(2) : "--";
  };

  const fareTable = useMemo(() => {
    return stops.map((stop, rowIdx) => {
      return stops.map((colStop, colIdx) => {
        if (colIdx > rowIdx) return "";
        if (colIdx === rowIdx) return stop.name || "--";
        const distance = rowIdx - colIdx;
        return getFareForDistance(distance);
      });
    });
  }, [stops, fareSlabs]);

  const buildFareTable = (routeStops, slabs) => {
    const getFare = (distance) => {
      const slab = slabs.find((item) => distance >= item.fromKm && distance <= item.toKm);
      return slab ? Number(slab.fare).toFixed(2) : "--";
    };
    return routeStops.map((stop, rowIdx) => {
      return routeStops.map((colStop, colIdx) => {
        if (colIdx > rowIdx) return "";
        if (colIdx === rowIdx) return stop.name || "--";
        return getFare(rowIdx - colIdx);
      });
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!route.routeNo || !route.routeName) {
      showNotice("error", "Route number and name are required.");
      return;
    }
    if (!route.depotId) {
      showNotice("error", "Associated depot is required.");
      return;
    }
    if (stopNames.length < 2) {
      showNotice("error", "At least two stops are required.");
      return;
    }
    if (slabIssues.length) {
      showNotice("error", slabIssues[0]);
      return;
    }

    try {
      const payload = {
        routeNo: route.routeNo.trim(),
        routeName: route.routeName.trim(),
        depotId: route.depotId,
        estimatedTripDurationMin: route.estimatedTripDurationMin ? Number(route.estimatedTripDurationMin) : 0,
        frequencyMin: route.frequencyMin ? Number(route.frequencyMin) : 0,
        firstTripTimeUp: route.firstTripTimeUp || null,
        firstTripTimeDown: route.firstTripTimeDown || null,
        lastTripTime: route.lastTripTime || null,
        assignmentMode: route.assignmentMode || "MANUAL",
        operatorType: operatorScope,
        stops: stops.map((stop, idx) => ({ index: idx, name: stop.name.trim() })),
        fareSlabs: fareSlabs.map((slab) => ({
          fromKm: Number(slab.fromKm),
        toKm: Number(slab.toKm),
        fare: Number(slab.fare),
      })),
      };

      const url = editingRouteId ? `${apiBase}/api/routes/${editingRouteId}` : `${apiBase}/api/routes`;
      const response = await fetch(url, {
        method: editingRouteId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to save route");

      if (editingRouteId) {
        setRoutes((prev) =>
          prev.map((item) => (item._id === data.route._id ? data.route : item))
        );
        showNotice("success", "Route updated.");
      } else {
        setRoutes((prev) => [data.route, ...prev]);
        showNotice("success", "Route saved.");
      }
      setEditingRouteId(null);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const loadRouteDetails = async (routeId) => {
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load route");

      setEditingRouteId(routeId);
      setRoute({
        routeNo: data.route.routeCode || "",
        routeName: data.route.routeName || "",
        depotId: data.route.depotId?._id || data.route.depotId || "",
        estimatedTripDurationMin: data.route.standardTripTimeMin || "",
        frequencyMin: data.route.frequencyMin || "",
        firstTripTimeUp: data.route.firstTripTimeUp || "",
        firstTripTimeDown: data.route.firstTripTimeDown || "",
        lastTripTime: data.route.lastTripTime || "",
        assignmentMode: data.route.assignmentMode || "MANUAL",
      });
      setStops(
        (data.stops || [])
          .sort((a, b) => a.index - b.index)
          .map((stop) => ({ name: stop.name }))
      );
      setFareSlabs(
        (data.fareSlabs || [])
          .sort((a, b) => a.fromKm - b.fromKm)
          .map((slab) => ({ fromKm: slab.fromKm, toKm: slab.toKm, fare: slab.fare }))
      );
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingRouteId(null);
    setRoute(initialRoute);
    setStops([initialStop, initialStop]);
    setFareSlabs([{ ...initialSlab }]);
  };

  const loadRoutes = async () => {
    try {
      const response = await fetch(`${apiBase}/api/routes?operatorType=${encodeURIComponent(operatorScope)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load routes");
      setRoutes(data.routes || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

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
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const openRouteMatrix = async (routeItem) => {
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeItem._id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load route details");

      const routeStops = (data.stops || []).sort((a, b) => a.index - b.index);
      const slabs = (data.fareSlabs || []).sort((a, b) => a.fromKm - b.fromKm);
      setActiveRoute({ ...data.route, stops: routeStops });
      setActiveFareTable(buildFareTable(routeStops, slabs));
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const toggleAssignmentMode = async (routeItem) => {
    const nextMode = routeItem.assignmentMode === "AUTO" ? "MANUAL" : "AUTO";
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeItem._id}/assignment-mode`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assignmentMode: nextMode }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to update assignment mode");

      setRoutes((prev) =>
        prev.map((item) => (item._id === routeItem._id ? data.route : item))
      );
      showNotice("success", `Route mode set to ${nextMode}.`);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  useEffect(() => {
    loadRoutes();
    loadDepots();
    setRoute((prev) => ({ ...prev, depotId: "" }));
    setEditingRouteId(null);
  }, [apiBase, token, operatorScope]);

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
              <span className="pill">Route entry</span>
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
            <span className="pill">API: {apiBase}</span>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <h1>Route fare setup</h1>
                <span className="pill">Stops + slabs</span>
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

            <section className="grid two">
              <div className="panel">
                <div className="panel-header">
                  <h3>Route basic details</h3>
                  <span className="pill">Route</span>
                </div>
                <form className="form" onSubmit={handleSave}>
                  <label className="field">
                    Operator scope
                    <input value={operatorScope} readOnly />
                  </label>
                  <label className="field">
                    Route number
                    <input
                      value={route.routeNo}
                      onChange={(event) => setRoute({ ...route, routeNo: event.target.value })}
                      placeholder="212"
                    />
                  </label>
                  <label className="field">
                    Route name
                    <input
                      value={route.routeName}
                      onChange={(event) => setRoute({ ...route, routeName: event.target.value })}
                      placeholder="Palbazar - Howrah"
                    />
                  </label>
                  <label className="field">
                    Associated depot
                    <select
                      value={route.depotId}
                      onChange={(event) => setRoute({ ...route, depotId: event.target.value })}
                    >
                      <option value="">Select depot</option>
                      {depots.map((depot) => (
                        <option key={depot._id} value={depot._id}>
                          {depot.depotName} ({depot.depotCode})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inline">
                    <label className="field">
                      Estimated trip duration (min)
                      <input
                        type="number"
                        value={route.estimatedTripDurationMin}
                        onChange={(event) =>
                          setRoute({ ...route, estimatedTripDurationMin: event.target.value })
                        }
                        placeholder="60"
                      />
                    </label>
                    <label className="field">
                      Bus frequency (min)
                      <input
                        type="number"
                        value={route.frequencyMin}
                        onChange={(event) => setRoute({ ...route, frequencyMin: event.target.value })}
                        placeholder="30"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      First trip from A (Up)
                      <input
                        type="time"
                        value={route.firstTripTimeUp}
                        onChange={(event) => setRoute({ ...route, firstTripTimeUp: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      First trip from B (Down)
                      <input
                        type="time"
                        value={route.firstTripTimeDown}
                        onChange={(event) => setRoute({ ...route, firstTripTimeDown: event.target.value })}
                      />
                    </label>
                  <label className="field">
                    Daily last trip
                    <input
                      type="time"
                      value={route.lastTripTime}
                      onChange={(event) => setRoute({ ...route, lastTripTime: event.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  Assignment mode
                  <select
                    value={route.assignmentMode || "MANUAL"}
                    onChange={(event) => setRoute({ ...route, assignmentMode: event.target.value })}
                  >
                    <option value="MANUAL">Manual</option>
                    <option value="AUTO">Automatic</option>
                  </select>
                </label>
              </form>

                <div className="panel" style={{ background: "var(--panel-strong)" }}>
                  <div className="panel-header">
                    <h3>Stops entry</h3>
                    <span className="pill">Ordered list</span>
                  </div>
                  <div className="list">
                    {stops.map((stop, idx) => (
                      <div className="list-item" key={`stop-${idx}`}>
                        <div>
                          <strong>Stop {idx}</strong>
                          <input
                            value={stop.name}
                            onChange={(event) => {
                              const next = [...stops];
                              next[idx] = { ...next[idx], name: event.target.value };
                              setStops(next);
                            }}
                            placeholder="Stop name"
                            style={{ marginTop: "6px", width: "100%" }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn ghost" type="button" onClick={() => moveStop(idx, -1)}>
                            Up
                          </button>
                          <button className="btn ghost" type="button" onClick={() => moveStop(idx, 1)}>
                            Down
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => removeStop(idx)}
                            disabled={stops.length <= 2}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="btn outline" type="button" onClick={addStop}>
                    Add stop
                  </button>
                </div>

                <div className="panel" style={{ background: "var(--panel-strong)" }}>
                  <div className="panel-header">
                    <h3>Fare slabs</h3>
                    <span className="pill">Auto fare</span>
                  </div>
                  {slabIssues.length > 0 && (
                    <div className="notice error">{slabIssues[0]}</div>
                  )}
                  <div className="list">
                    {fareSlabs.map((slab, idx) => (
                      <div className="list-item" key={`slab-${idx}`}>
                        <div style={{ display: "grid", gap: "6px" }}>
                          <div className="inline">
                            <label className="field">
                              From KM
                              <input
                                type="number"
                                value={slab.fromKm}
                                onChange={(event) => {
                                  const next = [...fareSlabs];
                                  next[idx] = { ...next[idx], fromKm: event.target.value };
                                  setFareSlabs(next);
                                }}
                              />
                            </label>
                            <label className="field">
                              To KM
                              <input
                                type="number"
                                value={slab.toKm}
                                onChange={(event) => {
                                  const next = [...fareSlabs];
                                  next[idx] = { ...next[idx], toKm: event.target.value };
                                  setFareSlabs(next);
                                }}
                              />
                            </label>
                            <label className="field">
                              Fare
                              <input
                                type="number"
                                value={slab.fare}
                                onChange={(event) => {
                                  const next = [...fareSlabs];
                                  next[idx] = { ...next[idx], fare: event.target.value };
                                  setFareSlabs(next);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                        <button className="btn ghost" type="button" onClick={() => removeSlab(idx)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="btn outline" type="button" onClick={addSlab}>
                    Add fare slab
                  </button>
                </div>

                <div className="inline">
                  <button className="btn primary" type="button" onClick={handleSave}>
                    {editingRouteId ? "Update route" : "Save route"}
                  </button>
                  {editingRouteId && (
                    <button className="btn ghost" type="button" onClick={handleCancelEdit}>
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Generated fare table</h3>
                  <span className="pill">Read only</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>KM</th>
                        {stops.map((stop, idx) => (
                          <th key={`head-${idx}`}>{stop.name || `Stop ${idx}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fareTable.map((row, rowIdx) => (
                        <tr key={`row-${rowIdx}`}>
                          <td>{rowIdx}</td>
                          {row.map((cell, colIdx) => (
                            <td key={`cell-${rowIdx}-${colIdx}`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <h3>Entered routes</h3>
                <span className="pill">{routes.length} total</span>
              </div>
              {routes.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No routes yet</strong>
                    <span>Save a route to see it listed here.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Route No</th>
                      <th>Route Name</th>
                      <th>Depot</th>
                      <th>Source</th>
                      <th>Destination</th>
                      <th>Mode</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((item) => (
                      <tr key={item._id || item.routeCode}>
                        <td>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => openRouteMatrix(item)}
                          >
                            {item.routeCode}
                          </button>
                        </td>
                        <td>{item.routeName}</td>
                        <td>{item.depotId?.depotName || item.depotId}</td>
                        <td>{item.source}</td>
                        <td>{item.destination}</td>
                        <td>
                          <button
                            className={`btn ${item.assignmentMode === "AUTO" ? "outline" : "ghost"}`}
                            type="button"
                            onClick={() => toggleAssignmentMode(item)}
                          >
                            {item.assignmentMode || "MANUAL"}
                          </button>
                        </td>
                        <td>
                          <button className="btn ghost" type="button" onClick={() => loadRouteDetails(item._id)}>
                            Edit
                          </button>
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
      {activeRoute && activeFareTable && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: "min(900px, 95vw)" }}>
            <div className="panel-header">
              <h3>Fare Table of Route No {activeRoute.routeCode}</h3>
              <button className="btn ghost" type="button" onClick={() => setActiveRoute(null)}>
                Close
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>KM</th>
                    {activeRoute.stops.map((stop, idx) => (
                      <th key={`modal-head-${idx}`}>{stop.name || `Stop ${idx}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeFareTable.map((row, rowIdx) => (
                    <tr key={`modal-row-${rowIdx}`}>
                      <td>{rowIdx}</td>
                      {row.map((cell, colIdx) => (
                        <td key={`modal-cell-${rowIdx}-${colIdx}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouteEntry;


