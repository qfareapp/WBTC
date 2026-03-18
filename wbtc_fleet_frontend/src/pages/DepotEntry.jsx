import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OperatorToggle from "../components/OperatorToggle.jsx";
import "../App.css";

const initialForm = {
  depotCode: "",
  depotName: "",
  location: "",
  address: "",
  contactPerson: "",
  contactNumber: "",
  capacity: "",
  operational: true,
};

function DepotEntry({ apiBase, token, operatorScope, setOperatorScope }) {
  const [form, setForm] = useState(initialForm);
  const [depots, setDepots] = useState([]);
  const [notice, setNotice] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
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

  useEffect(() => {
    loadDepots();
  }, [apiBase, token, operatorScope]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.depotCode || !form.depotName) {
      showNotice("error", "Depot code and name are required.");
      return;
    }

    try {
      const payload = {
        ...form,
        capacity: form.capacity ? Number(form.capacity) : 0,
        operatorType: operatorScope,
      };

      const response = await fetch(`${apiBase}/api/depots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to create depot");

      setDepots((prev) => [data.depot, ...prev]);
      setForm(initialForm);
      showNotice("success", "Depot created.");
    } catch (error) {
      showNotice("error", error.message);
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
              <p className="sidebar-title">WBTC Fleet</p>
              <span className="pill">Depot entry</span>
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
                <h1>Depot onboarding</h1>
                <span className="pill">Create + list</span>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn outline" type="button" onClick={loadDepots}>
                Refresh depots
              </button>
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
                  <h3>Depot details</h3>
                  <span className="pill">/api/depots</span>
                </div>
                <form className="form" onSubmit={handleSubmit}>
                  <div className="inline">
                    <label className="field">
                      Depot code
                      <input
                        value={form.depotCode}
                        onChange={(event) => setForm({ ...form, depotCode: event.target.value })}
                        placeholder="DPT-101"
                      />
                    </label>
                    <label className="field">
                      Depot name
                      <input
                        value={form.depotName}
                        onChange={(event) => setForm({ ...form, depotName: event.target.value })}
                        placeholder="Howrah Central"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      Location
                      <input
                        value={form.location}
                        onChange={(event) => setForm({ ...form, location: event.target.value })}
                        placeholder="Howrah"
                      />
                    </label>
                    <label className="field">
                      Capacity
                      <input
                        type="number"
                        value={form.capacity}
                        onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                        placeholder="120"
                      />
                    </label>
                  </div>
                  <label className="field">
                    Operator scope
                    <input value={operatorScope} readOnly />
                  </label>
                  <label className="field">
                    Address
                    <input
                      value={form.address}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
                      placeholder="22 Depot Road"
                    />
                  </label>
                  <div className="inline">
                    <label className="field">
                      Contact person
                      <input
                        value={form.contactPerson}
                        onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
                        placeholder="Manager name"
                      />
                    </label>
                    <label className="field">
                      Contact number
                      <input
                        value={form.contactNumber}
                        onChange={(event) => setForm({ ...form, contactNumber: event.target.value })}
                        placeholder="Phone"
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={form.operational}
                        onChange={(event) => setForm({ ...form, operational: event.target.checked })}
                      />
                      Operational
                    </span>
                  </label>
                  <button className="btn primary" type="submit">
                    Create depot
                  </button>
                </form>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Depot list</h3>
                  <span className="pill">{depots.length} total</span>
                </div>
                <div className="list">
                  {depots.length === 0 ? (
                    <div className="list-item">
                      <div>
                        <strong>No depots loaded</strong>
                        <span>Create a depot to see it listed here.</span>
                      </div>
                    </div>
                  ) : (
                    depots.map((depot) => (
                      <div className="list-item" key={depot._id || depot.depotCode}>
                        <div>
                          <strong>{depot.depotName}</strong>
                          <span>
                            {depot.depotCode} - {depot.location || "Location unset"}
                          </span>
                        </div>
                        <span className="pill">Cap {depot.capacity || 0}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default DepotEntry;


