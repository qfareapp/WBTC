import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OperatorToggle from "../components/OperatorToggle.jsx";
import "../App.css";

const shiftOptions = ["Morning", "Evening", "General"];
const statusOptions = ["Available", "OnLeave", "Suspended"];

const initialForm = {
  name: "",
  empId: "",
  phone: "",
  depotId: "",
  ownerId: "",
  currentLocation: "",
  shiftType: "General",
  status: "Available",
};

function ConductorEntry({ apiBase, token, operatorScope, setOperatorScope }) {
  const [form, setForm] = useState(initialForm);
  const [editingConductorId, setEditingConductorId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [depots, setDepots] = useState([]);
  const [owners, setOwners] = useState([]);
  const [conductors, setConductors] = useState([]);
  const [notice, setNotice] = useState(null);
  const [credentials, setCredentials] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadDepots = async () => {
    try {
      const response = await fetch(`${apiBase}/api/depots?operatorType=${encodeURIComponent(operatorScope)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load depots");
      setDepots(data.depots || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const loadConductors = async () => {
    try {
      const response = await fetch(`${apiBase}/api/conductors?operatorType=${encodeURIComponent(operatorScope)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load conductors");
      setConductors(data.conductors || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const loadOwners = async () => {
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/tag-context`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load owners");
      setOwners(data.owners || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  useEffect(() => {
    loadDepots();
    loadConductors();
    loadOwners();
  }, [apiBase, token, operatorScope]);

  const startEditConductor = (conductor) => {
    setEditingConductorId(conductor._id);
    setFormOpen(true);
    setForm({
      name: conductor.name || "",
      empId: conductor.empId || "",
      phone: conductor.phone || "",
      depotId: conductor.depotId?._id || conductor.depotId || "",
      ownerId: conductor.ownerId?._id || conductor.ownerId || "",
      currentLocation: conductor.currentLocation || "",
      shiftType: conductor.shiftType || "General",
      status: conductor.status || "Available",
    });
  };

  const cancelEdit = () => {
    setEditingConductorId(null);
    setFormOpen(false);
    setForm(initialForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name || !form.empId || !form.depotId) {
      showNotice("error", "Name, employee ID, and depot are required.");
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        empId: form.empId.trim(),
        phone: form.phone.trim() || null,
        depotId: form.depotId,
        ownerId: form.ownerId || null,
        currentLocation: form.currentLocation.trim() || null,
        shiftType: form.shiftType,
        status: form.status,
        operatorType: operatorScope,
      };

      const isEdit = Boolean(editingConductorId);
      const response = await fetch(
        isEdit ? `${apiBase}/api/conductors/${editingConductorId}` : `${apiBase}/api/conductors`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || `Failed to ${isEdit ? "update" : "create"} conductor`);

      if (isEdit) {
        setConductors((prev) => prev.map((item) => (item._id === data.conductor._id ? data.conductor : item)));
      } else {
        setConductors((prev) => [data.conductor, ...prev]);
      }
      setForm(initialForm);
      setEditingConductorId(null);
      setFormOpen(false);
      showNotice(
        "success",
        isEdit ? "Conductor updated." : "Conductor created. Temporary credentials are ready to copy/share."
      );
      if (!isEdit && data.credentials) {
        setCredentials({
          name: payload.name,
          empId: data.credentials.empId,
          password: data.credentials.temporaryPassword,
        });
      }
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = `Employee ID: ${credentials.empId}\nTemporary password: ${credentials.password}`;
    await navigator.clipboard.writeText(text);
    showNotice("success", "Credentials copied.");
  };

  const shareCredentials = async () => {
    if (!credentials) return;
    const text = `Employee ID: ${credentials.empId}\nTemporary password: ${credentials.password}`;
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      showNotice("success", "Share not available. Credentials copied instead.");
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
              <p className="sidebar-title">Qfare Fleet</p>
              <span className="pill">Conductor entry</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/dashboard">Dashboard</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/passengers">Passengers</Link>
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
                <h1>Conductor onboarding</h1>
                <span className="pill">Manage conductors</span>
              </div>
            </div>
            <div className="topbar-actions">
              <OperatorToggle value={operatorScope} onChange={setOperatorScope} />
              <Link className="btn ghost" to="/dashboard">Back to dashboard</Link>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            {credentials && (
              <section className="panel" style={{ marginBottom: "16px" }}>
                <div className="panel-header">
                  <h3>Temporary credentials</h3>
                  <span className="pill">{credentials.name}</span>
                </div>
                <div className="form">
                  <label className="field">
                    Employee ID
                    <input value={credentials.empId} readOnly />
                  </label>
                  <label className="field">
                    Temporary password
                    <input value={credentials.password} readOnly />
                  </label>
                  <div className="inline">
                    <button className="btn outline" type="button" onClick={copyCredentials}>Copy</button>
                    <button className="btn primary" type="button" onClick={shareCredentials}>Share</button>
                    <button className="btn ghost" type="button" onClick={() => setCredentials(null)}>Close</button>
                  </div>
                </div>
              </section>
            )}

            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "17px", fontWeight: "700" }}>
                  {conductors.length > 0 ? `${conductors.length} conductor${conductors.length === 1 ? "" : "s"}` : "No conductors yet"}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.45, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {operatorScope}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="search"
                  placeholder="Search name or ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid var(--border, rgba(255,255,255,0.12))", background: "var(--panel-strong, rgba(255,255,255,0.05))", fontSize: "13px", minWidth: "180px" }}
                />
                <button className="btn ghost" type="button" onClick={loadConductors}>Refresh</button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    if (editingConductorId) cancelEdit();
                    else setFormOpen((prev) => !prev);
                  }}
                >
                  {formOpen ? "Close form" : "+ Add conductor"}
                </button>
              </div>
            </div>

            {/* Collapsible conductor form */}
            {formOpen && (
              <section className="panel" style={{ marginBottom: "16px" }}>
                <div className="panel-header">
                  <h3>{editingConductorId ? "Edit conductor" : "New conductor"}</h3>
                  <span className="pill">/api/conductors</span>
                </div>
                <form className="form" onSubmit={handleSubmit}>
                  <div className="inline">
                    <label className="field">
                      Conductor name
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder="Conductor name"
                      />
                    </label>
                    <label className="field">
                      Employee ID
                      <input
                        value={form.empId}
                        onChange={(event) => setForm({ ...form, empId: event.target.value })}
                        placeholder="CON-2045"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      Phone number
                      <input
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                        placeholder="Phone"
                      />
                    </label>
                    <label className="field">
                      Start location
                      <input
                        value={form.currentLocation}
                        onChange={(event) => setForm({ ...form, currentLocation: event.target.value })}
                        placeholder="Esplanade"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      Depot
                      <select
                        value={form.depotId}
                        onChange={(event) => setForm({ ...form, depotId: event.target.value })}
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
                      Owner
                      <select
                        value={form.ownerId}
                        onChange={(event) => setForm({ ...form, ownerId: event.target.value })}
                      >
                        <option value="">Select owner (optional)</option>
                        {owners.map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.name} ({owner.username})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      Shift
                      <select
                        value={form.shiftType}
                        onChange={(event) => setForm({ ...form, shiftType: event.target.value })}
                      >
                        {shiftOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Status
                      <select
                        value={form.status}
                        onChange={(event) => setForm({ ...form, status: event.target.value })}
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    Operator scope
                    <input value={operatorScope} readOnly />
                  </label>
                  <div className="inline">
                    <button className="btn primary" type="submit">
                      {editingConductorId ? "Update conductor" : "Create conductor"}
                    </button>
                    <button className="btn ghost" type="button" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* Conductor list */}
            <section className="panel">
              <div className="panel-header">
                <h3>Conductor list</h3>
                <span className="pill">{conductors.length} total</span>
              </div>
              {conductors.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No conductors yet</strong>
                    <span>Click "+ Add conductor" above to register the first conductor.</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {conductors.filter((conductor) => {
                    const q = searchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      conductor.name?.toLowerCase().includes(q) ||
                      conductor.empId?.toLowerCase().includes(q)
                    );
                  }).map((conductor) => {
                    const ownerName =
                      conductor.ownerId?.name ||
                      owners.find((o) => String(o.id) === String(conductor.ownerId || ""))?.name ||
                      "--";
                    const depotName =
                      conductor.depotId?.depotName ||
                      depots.find((d) => d._id === conductor.depotId)?.depotName ||
                      conductor.depotId ||
                      "--";
                    return (
                      <div
                        key={conductor._id || conductor.empId}
                        style={{
                          background: "var(--panel-bg, rgba(255,255,255,0.03))",
                          border: "1px solid var(--border, rgba(255,255,255,0.08))",
                          borderRadius: "14px",
                          padding: "14px 16px",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        {/* Header row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: "16px", fontWeight: "700" }}>{conductor.name}</div>
                            <div style={{ fontSize: "12px", opacity: 0.5, marginTop: "2px", fontFamily: "monospace" }}>{conductor.empId}</div>
                          </div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <span className="chip">{conductor.status}</span>
                            <button className="btn ghost" type="button" onClick={() => startEditConductor(conductor)}>
                              Edit
                            </button>
                          </div>
                        </div>

                        {/* Today's assignment — highlighted */}
                        {conductor.todayAssignment && (
                          <div style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            alignItems: "center",
                            background: conductor.todayAssignment.status === "Active"
                              ? "rgba(0,200,122,0.08)"
                              : "rgba(0,144,224,0.08)",
                            border: `1px solid ${conductor.todayAssignment.status === "Active" ? "rgba(0,200,122,0.3)" : "rgba(0,144,224,0.3)"}`,
                            borderRadius: "10px",
                            padding: "8px 12px",
                          }}>
                            <span style={{
                              fontSize: "10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.6px",
                              fontWeight: "700",
                              color: conductor.todayAssignment.status === "Active" ? "#00C87A" : "#0090E0",
                            }}>
                              {conductor.todayAssignment.status === "Active" ? "On trip" : "Scheduled"}
                            </span>
                            {conductor.todayAssignment.busNumber && (
                              <span style={{ fontSize: "13px", fontWeight: "700" }}>
                                {conductor.todayAssignment.busNumber}
                              </span>
                            )}
                            {conductor.todayAssignment.routeCode && (
                              <span style={{ fontSize: "13px", fontWeight: "600", opacity: 0.85 }}>
                                {conductor.todayAssignment.routeCode}
                                {conductor.todayAssignment.routeName ? ` — ${conductor.todayAssignment.routeName}` : ""}
                              </span>
                            )}
                            {conductor.todayAssignment.startTime && (
                              <span style={{ fontSize: "12px", opacity: 0.55, marginLeft: "auto" }}>
                                {conductor.todayAssignment.startTime}
                                {conductor.todayAssignment.endTime ? ` – ${conductor.todayAssignment.endTime}` : ""}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Metadata tags */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {[
                            ["Depot", depotName],
                            ["Owner", ownerName],
                            ["Shift", conductor.shiftType || "General"],
                          ].map(([label, value]) => (
                            <span
                              key={label}
                              style={{
                                display: "inline-flex",
                                gap: "6px",
                                alignItems: "center",
                                background: "var(--panel-strong, rgba(255,255,255,0.04))",
                                border: "1px solid var(--border, rgba(255,255,255,0.08))",
                                borderRadius: "999px",
                                padding: "3px 10px",
                                fontSize: "12px",
                              }}
                            >
                              <span style={{ opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "10px" }}>{label}</span>
                              {value}
                            </span>
                          ))}
                          {conductor.phone && (
                            <span
                              style={{
                                display: "inline-flex",
                                gap: "6px",
                                alignItems: "center",
                                background: "var(--panel-strong, rgba(255,255,255,0.04))",
                                border: "1px solid var(--border, rgba(255,255,255,0.08))",
                                borderRadius: "999px",
                                padding: "3px 10px",
                                fontSize: "12px",
                              }}
                            >
                              <span style={{ opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "10px" }}>Phone</span>
                              {conductor.phone}
                            </span>
                          )}
                          {conductor.currentLocation && (
                            <span
                              style={{
                                display: "inline-flex",
                                gap: "6px",
                                alignItems: "center",
                                background: "var(--panel-strong, rgba(255,255,255,0.04))",
                                border: "1px solid var(--border, rgba(255,255,255,0.08))",
                                borderRadius: "999px",
                                padding: "3px 10px",
                                fontSize: "12px",
                              }}
                            >
                              <span style={{ opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "10px" }}>Location</span>
                              {conductor.currentLocation}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default ConductorEntry;
