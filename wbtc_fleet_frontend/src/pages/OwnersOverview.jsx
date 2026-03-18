import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";

function OwnersOverview({ apiBase, token }) {
  const [owners, setOwners] = useState([]);
  const [tagOwners, setTagOwners] = useState([]);
  const [tagBuses, setTagBuses] = useState([]);
  const [createOwnerForm, setCreateOwnerForm] = useState({
    name: "",
    username: "",
    password: "",
  });
  const [createOwnerBusy, setCreateOwnerBusy] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [selectedBusRoutes, setSelectedBusRoutes] = useState([]);
  const [tagBusy, setTagBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadOwners = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/owners`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load owners");
      setOwners(data.owners || []);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTagContext = async () => {
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/tag-context`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load tag context");
      const ownersPayload = data.owners || [];
      const busesPayload = data.buses || [];
      setTagOwners(ownersPayload);
      setTagBuses(busesPayload);
      if (!selectedOwnerId && ownersPayload.length) setSelectedOwnerId(String(ownersPayload[0].id));
      if (!selectedBusId && busesPayload.length) setSelectedBusId(String(busesPayload[0].id));
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const loadBusRoutes = async (busId) => {
    if (!busId) {
      setSelectedBusRoutes([]);
      return;
    }
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/buses/${busId}/routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load bus routes");
      setSelectedBusRoutes(data.routes || []);
    } catch (error) {
      showNotice("error", error.message);
      setSelectedBusRoutes([]);
    }
  };

  const handleTagBus = async () => {
    if (!selectedOwnerId || !selectedBusId) {
      showNotice("error", "Select both owner and bus.");
      return;
    }
    setTagBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/${selectedOwnerId}/tag-bus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ busId: selectedBusId }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to tag bus");
      showNotice("success", `Bus ${data.bus?.busNumber || ""} tagged successfully.`);
      await Promise.all([loadOwners(), loadTagContext()]);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setTagBusy(false);
    }
  };

  const handleCreateOwner = async (event) => {
    event.preventDefault();

    const payload = {
      name: createOwnerForm.name.trim(),
      username: createOwnerForm.username.trim(),
      password: createOwnerForm.password,
      role: "OWNER",
    };

    if (!payload.name || !payload.username || !payload.password) {
      showNotice("error", "Name, username, and password are required.");
      return;
    }

    setCreateOwnerBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to create owner");
      showNotice("success", `Owner ${payload.name} created successfully.`);
      setCreateOwnerForm({ name: "", username: "", password: "" });
      await Promise.all([loadOwners(), loadTagContext()]);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setCreateOwnerBusy(false);
    }
  };

  useEffect(() => {
    loadOwners();
    loadTagContext();
  }, [apiBase, token]);

  useEffect(() => {
    loadBusRoutes(selectedBusId);
  }, [selectedBusId, apiBase, token]);

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
              <span className="pill">Owner details</span>
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
                <h1>Bus Owner Registry</h1>
                <span className="pill">Owners + buses + routes</span>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn outline" type="button" onClick={loadOwners}>
                Refresh
              </button>
              <Link className="btn ghost" to="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            <section className="panel">
              <div className="panel-header">
                <h3>Add new owner</h3>
                <span className="pill">Admin action</span>
              </div>
              <form className="form" onSubmit={handleCreateOwner}>
                <div className="inline">
                  <label className="field">
                    Owner name
                    <input
                      value={createOwnerForm.name}
                      onChange={(event) =>
                        setCreateOwnerForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="Full name"
                    />
                  </label>
                  <label className="field">
                    Username
                    <input
                      value={createOwnerForm.username}
                      onChange={(event) =>
                        setCreateOwnerForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                      placeholder="owner_username"
                    />
                  </label>
                  <label className="field">
                    Password
                    <input
                      type="password"
                      value={createOwnerForm.password}
                      onChange={(event) =>
                        setCreateOwnerForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      placeholder="Create password"
                    />
                  </label>
                </div>
                <button className="btn primary" type="submit" disabled={createOwnerBusy}>
                  {createOwnerBusy ? "Creating..." : "Create owner"}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Tag bus to owner</h3>
                <span className="pill">Admin action</span>
              </div>
              <div className="inline">
                <label className="field">
                  Owner
                  <select value={selectedOwnerId} onChange={(e) => setSelectedOwnerId(e.target.value)}>
                    <option value="">Select owner</option>
                    {tagOwners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name} ({owner.username})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Bus
                  <select value={selectedBusId} onChange={(e) => setSelectedBusId(e.target.value)}>
                    <option value="">Select bus</option>
                    {tagBuses.map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.busNumber} | {bus.operatorType} | {bus.depotName} ({bus.depotCode})
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn primary" type="button" onClick={handleTagBus} disabled={tagBusy}>
                  {tagBusy ? "Tagging..." : "Tag bus"}
                </button>
              </div>
              <div className="panel" style={{ marginTop: "12px", background: "var(--panel-strong)" }}>
                <div className="panel-header">
                  <h3>Routes attached to selected bus</h3>
                  <span className="pill">{selectedBusRoutes.length} routes</span>
                </div>
                {selectedBusRoutes.length === 0 ? (
                  <div className="list-item">
                    <div>
                      <strong>No attached routes found</strong>
                      <span>Routes appear after this bus is used in trips.</span>
                    </div>
                  </div>
                ) : (
                  <div className="list">
                    {selectedBusRoutes.map((route) => (
                      <div className="list-item" key={route.id}>
                        <div>
                          <strong>{route.routeCode}</strong>
                          <span>{route.routeName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Owner accounts</h3>
                <span className="pill">{owners.length} total</span>
              </div>
              {loading ? (
                <div className="list-item">
                  <div>
                    <strong>Loading owners...</strong>
                  </div>
                </div>
              ) : owners.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No owner accounts found</strong>
                    <span>Create users with role OWNER and tag buses with owner id.</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {owners.map((entry) => (
                    <div className="panel" key={entry.owner.id} style={{ background: "var(--panel-strong)" }}>
                      <div className="panel-header">
                        <h3>{entry.owner.name}</h3>
                        <span className="pill">{entry.owner.username}</span>
                      </div>
                      <div className="inline">
                        <span className="pill">Status: {entry.owner.active ? "Active" : "Inactive"}</span>
                        <span className="pill">Buses: {entry.totalBuses}</span>
                        <span className="pill">Routes: {entry.totalRoutes}</span>
                      </div>
                      <div className="grid two" style={{ marginTop: "10px" }}>
                        <div>
                          <h3 style={{ margin: "0 0 8px 0" }}>Buses</h3>
                          {entry.buses.length === 0 ? (
                            <div className="list-item">
                              <div>
                                <strong>No buses tagged</strong>
                              </div>
                            </div>
                          ) : (
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Bus</th>
                                  <th>Depot</th>
                                  <th>Operator</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.buses.map((bus) => (
                                  <tr key={bus.id}>
                                    <td>{bus.busNumber}</td>
                                    <td>{bus.depotName} ({bus.depotCode})</td>
                                    <td>{bus.operatorType}</td>
                                    <td>{bus.status}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                        <div>
                          <h3 style={{ margin: "0 0 8px 0" }}>Associated routes</h3>
                          {entry.routes.length === 0 ? (
                            <div className="list-item">
                              <div>
                                <strong>No routes observed yet</strong>
                                <span>Routes appear once owner buses are used in trips.</span>
                              </div>
                            </div>
                          ) : (
                            <div className="list">
                              {entry.routes.map((route) => (
                                <div className="list-item" key={route.id}>
                                  <div>
                                    <strong>{route.routeCode}</strong>
                                    <span>{route.routeName}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
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

export default OwnersOverview;


