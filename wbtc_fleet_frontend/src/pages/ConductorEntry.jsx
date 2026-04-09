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
      });

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
      showNotice(
        "success",
        isEdit
          ? "Conductor updated."
          : "Conductor created. Temporary credentials are ready to copy/share."
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
              <p className="sidebar-title">WBTC Fleet</p>
              <span className="pill">Conductor entry</span>
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
                <h1>Conductor onboarding</h1>
                <span className="pill">Create + list</span>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn outline" type="button" onClick={loadConductors}>
                Refresh conductors
              </button>
              <OperatorToggle value={operatorScope} onChange={setOperatorScope} />
              <Link className="btn ghost" to="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}
            {credentials && (
              <section className="panel">
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
                    <button className="btn outline" type="button" onClick={copyCredentials}>
                      Copy
                    </button>
                    <button className="btn primary" type="button" onClick={shareCredentials}>
                      Share
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setCredentials(null)}>
                      Close
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section className="grid two">
              <div className="panel">
                <div className="panel-header">
                  <h3>Conductor details</h3>
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
                  <label className="field">
                    Operator scope
                    <input value={operatorScope} readOnly />
                  </label>
                  <div className="inline">
                    <label className="field">
                      Shift
                      <select
                        value={form.shiftType}
                        onChange={(event) => setForm({ ...form, shiftType: event.target.value })}
                      >
                        {shiftOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
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
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="inline">
                    <button className="btn primary" type="submit">
                      {editingConductorId ? "Update conductor" : "Create conductor"}
                    </button>
                    {editingConductorId && (
                      <button className="btn ghost" type="button" onClick={cancelEdit}>
                        Cancel edit
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Conductor list</h3>
                  <span className="pill">{conductors.length} total</span>
                </div>
                {conductors.length === 0 ? (
                  <div className="list-item">
                    <div>
                      <strong>No conductors loaded</strong>
                      <span>Create a conductor to see it listed here.</span>
                    </div>
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Emp ID</th>
                        <th>Owner</th>
                        <th>Depot</th>
                        <th>Shift</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conductors.map((conductor) => (
                        <tr key={conductor._id || conductor.empId}>
                          <td>{conductor.name}</td>
                          <td>{conductor.empId}</td>
                          <td>
                            {conductor.ownerId?.name ||
                              owners.find((owner) => String(owner.id) === String(conductor.ownerId || ""))?.name ||
                              "--"}
                          </td>
                          <td>
                            {conductor.depotId?.depotName ||
                              depots.find((depot) => depot._id === conductor.depotId)?.depotName ||
                              conductor.depotId}
                          </td>
                          <td>{conductor.shiftType}</td>
                          <td>
                            <span className="chip">{conductor.status}</span>
                          </td>
                          <td>
                            <button className="btn ghost" type="button" onClick={() => startEditConductor(conductor)}>
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default ConductorEntry;


