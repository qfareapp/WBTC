import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";
import { getOpsDate } from "../utils/opsTime.js";

const today = getOpsDate();

function OwnerAssignCrew({ apiBase, token, user, setToken, setUser }) {
  const [date, setDate] = useState(today);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingBusId, setSavingBusId] = useState("");
  const [context, setContext] = useState({ buses: [], drivers: [], conductors: [], assignments: [] });
  const [draftByBus, setDraftByBus] = useState({});

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
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

  const loadContext = async ({ silent = false } = {}) => {
    setLoading(true);
    try {
      const payload = await apiFetch(`/api/owner/assign-crew?date=${encodeURIComponent(date)}`);
      const assignments = payload.assignments || [];
      const nextDraft = {};
      for (const item of assignments) {
        nextDraft[item.busId] = {
          driverId: item.driver?.id ? String(item.driver.id) : "",
          conductorId: item.conductor?.id ? String(item.conductor.id) : "",
        };
      }
      setContext({
        buses: payload.buses || [],
        drivers: payload.drivers || [],
        conductors: payload.conductors || [],
        assignments,
      });
      setDraftByBus(nextDraft);
      if (!silent) showNotice("success", "Crew data loaded.");
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContext({ silent: true });
  }, [date]);

  const assignmentByBus = useMemo(() => {
    return (context.assignments || []).reduce((acc, item) => {
      acc[String(item.busId)] = item;
      return acc;
    }, {});
  }, [context.assignments]);

  const setDraft = (busId, patch) => {
    setDraftByBus((prev) => ({ ...prev, [busId]: { ...(prev[busId] || {}), ...patch } }));
  };

  const onAssign = async (busId) => {
    const draft = draftByBus[busId] || {};
    if (!draft.driverId || !draft.conductorId) {
      showNotice("error", "Select driver and conductor.");
      return;
    }
    setSavingBusId(busId);
    try {
      await apiFetch("/api/owner/assign-crew", {
        method: "POST",
        body: JSON.stringify({
          busId,
          driverId: draft.driverId,
          conductorId: draft.conductorId,
          date,
        }),
      });
      showNotice("success", "Daily crew assignment saved.");
      await loadContext({ silent: true });
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setSavingBusId("");
    }
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
              <p className="sidebar-title">Owner Fleet</p>
              <span className="pill">Daily crew assignment</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/owner">Fleet KPI</Link>
            <Link className="nav-item live-nav" to="/owner/assign-crew">Assign crew</Link>
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
                <h1>Assign Crew</h1>
                <span className="pill">{user?.name || "Owner"}</span>
              </div>
            </div>
            <div className="topbar-actions">
              <label className="field" style={{ minWidth: "190px" }}>
                Assignment date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <button className="btn outline" type="button" onClick={() => loadContext()}>
                Refresh
              </button>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            <section className="panel">
              <div className="panel-header">
                <h3>Crew assignment by bus</h3>
                <span className="pill">{context.buses.length} buses</span>
              </div>
              {loading ? (
                <div className="list-item">
                  <div>
                    <strong>Loading...</strong>
                  </div>
                </div>
              ) : context.buses.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No tagged buses found</strong>
                    <span>Ask admin to tag buses to your owner account.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bus</th>
                      <th>Depot</th>
                      <th>Current assignment</th>
                      <th>Driver</th>
                      <th>Conductor</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {context.buses.map((bus) => {
                      const current = assignmentByBus[String(bus.id)] || null;
                      const draft = draftByBus[String(bus.id)] || {};
                      const drivers = (context.drivers || []).filter(
                        (driver) => String(driver.depotId || "") === String(bus.depotId || "")
                      );
                      const conductors = (context.conductors || []).filter(
                        (conductor) => String(conductor.depotId || "") === String(bus.depotId || "")
                      );
                      return (
                        <tr key={bus.id}>
                          <td>{bus.busNumber}</td>
                          <td>{bus.depotName} ({bus.depotCode})</td>
                          <td>
                            {current ? (
                              <span>
                                {current.driver?.name || "--"} / {current.conductor?.name || "--"}
                              </span>
                            ) : (
                              <span>Not assigned</span>
                            )}
                          </td>
                          <td>
                            <select
                              value={draft.driverId || ""}
                              onChange={(e) => setDraft(String(bus.id), { driverId: e.target.value })}
                            >
                              <option value="">Select driver</option>
                              {drivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name} ({driver.empId}) - {driver.status}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={draft.conductorId || ""}
                              onChange={(e) => setDraft(String(bus.id), { conductorId: e.target.value })}
                            >
                              <option value="">Select conductor</option>
                              {conductors.map((conductor) => (
                                <option key={conductor.id} value={conductor.id}>
                                  {conductor.name} ({conductor.empId}) - {conductor.status}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              className="btn primary"
                              type="button"
                              onClick={() => onAssign(String(bus.id))}
                              disabled={savingBusId === String(bus.id)}
                            >
                              {savingBusId === String(bus.id) ? "Saving..." : "Assign for day"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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

export default OwnerAssignCrew;
