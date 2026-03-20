import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OperatorToggle from "../components/OperatorToggle.jsx";
import "../App.css";

const shiftOptions = ["Morning", "Evening", "General"];
const statusOptions = ["Available", "OnLeave", "Suspended"];

const initialForm = {
  name: "",
  empId: "",
  govtId: "",
  phone: "",
  depotId: "",
  ownerId: "",
  licenseNumber: "",
  licenseExpiry: "",
  shiftType: "General",
  status: "Available",
};

function DriverEntry({ apiBase, token, operatorScope, setOperatorScope }) {
  const [form, setForm] = useState(initialForm);
  const [editingDriverId, setEditingDriverId] = useState(null);
  const [depots, setDepots] = useState([]);
  const [owners, setOwners] = useState([]);
  const [drivers, setDrivers] = useState([]);
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

  const loadOwners = async () => {
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/tag-context`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    loadDrivers();
    loadOwners();
  }, [apiBase, token, operatorScope]);

  const toDateInput = (value) => {
    if (!value) return "";
    const direct = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  const startEditDriver = (driver) => {
    setEditingDriverId(driver._id);
    setForm({
      name: driver.name || "",
      empId: driver.empId || "",
      govtId: driver.govtId || "",
      phone: driver.phone || "",
      depotId: driver.depotId?._id || driver.depotId || "",
      ownerId: driver.ownerId?._id || driver.ownerId || "",
      licenseNumber: driver.licenseNumber || "",
      licenseExpiry: toDateInput(driver.licenseExpiry),
      shiftType: driver.shiftType || "General",
      status: driver.status || "Available",
    });
  };

  const cancelEdit = () => {
    setEditingDriverId(null);
    setForm(initialForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name || !form.empId || !form.depotId) {
      showNotice("error", "Name, employee ID, and depot are required.");
      return;
    }
    if (!form.licenseNumber || !form.licenseExpiry) {
      showNotice("error", "License number and expiry are required.");
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        empId: form.empId.trim(),
        govtId: form.govtId.trim() || null,
        phone: form.phone.trim() || null,
        depotId: form.depotId,
        ownerId: form.ownerId || null,
        licenseNumber: form.licenseNumber.trim(),
        licenseExpiry: form.licenseExpiry,
        shiftType: form.shiftType,
        status: form.status,
        operatorType: operatorScope,
      };

      const isEdit = Boolean(editingDriverId);
      const response = await fetch(
        isEdit ? `${apiBase}/api/drivers/${editingDriverId}` : `${apiBase}/api/drivers`,
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
      if (!response.ok) throw new Error(data.message || `Failed to ${isEdit ? "update" : "create"} driver`);

      if (isEdit) {
        setDrivers((prev) => prev.map((item) => (item._id === data.driver._id ? data.driver : item)));
      } else {
        setDrivers((prev) => [data.driver, ...prev]);
      }
      setForm(initialForm);
      setEditingDriverId(null);
      showNotice("success", `Driver ${isEdit ? "updated" : "created"}.`);
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
              <span className="pill">Driver entry</span>
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
                <h1>Driver onboarding</h1>
                <span className="pill">Create + list</span>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn outline" type="button" onClick={loadDrivers}>
                Refresh drivers
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
                  <h3>Driver details</h3>
                  <span className="pill">/api/drivers</span>
                </div>
                <form className="form" onSubmit={handleSubmit}>
                  <div className="inline">
                    <label className="field">
                      Driver name
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder="Driver name"
                      />
                    </label>
                    <label className="field">
                      Employee ID
                      <input
                        value={form.empId}
                        onChange={(event) => setForm({ ...form, empId: event.target.value })}
                        placeholder="EMP-2045"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      Govt ID
                      <input
                        value={form.govtId}
                        onChange={(event) => setForm({ ...form, govtId: event.target.value })}
                        placeholder="Govt ID"
                      />
                    </label>
                    <label className="field">
                      Phone number
                      <input
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                        placeholder="Phone"
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
                      License number
                      <input
                        value={form.licenseNumber}
                        onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })}
                        placeholder="License number"
                      />
                    </label>
                    <label className="field">
                      License expiry
                      <input
                        type="date"
                        value={form.licenseExpiry}
                        onChange={(event) => setForm({ ...form, licenseExpiry: event.target.value })}
                      />
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
                      {editingDriverId ? "Update driver" : "Create driver"}
                    </button>
                    {editingDriverId && (
                      <button className="btn ghost" type="button" onClick={cancelEdit}>
                        Cancel edit
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Driver list</h3>
                  <span className="pill">{drivers.length} total</span>
                </div>
                {drivers.length === 0 ? (
                  <div className="list-item">
                    <div>
                      <strong>No drivers loaded</strong>
                      <span>Create a driver to see it listed here.</span>
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
                      {drivers.map((driver) => (
                        <tr key={driver._id || driver.empId}>
                          <td>{driver.name}</td>
                          <td>{driver.empId}</td>
                          <td>
                            {driver.ownerId?.name ||
                              owners.find((owner) => String(owner.id) === String(driver.ownerId || ""))?.name ||
                              "--"}
                          </td>
                          <td>
                            {driver.depotId?.depotName ||
                              depots.find((depot) => depot._id === driver.depotId)?.depotName ||
                              driver.depotId}
                          </td>
                          <td>{driver.shiftType}</td>
                          <td>
                            <span className="chip">{driver.status}</span>
                          </td>
                          <td>
                            <button className="btn ghost" type="button" onClick={() => startEditDriver(driver)}>
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

export default DriverEntry;


