import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import OperatorToggle from "../components/OperatorToggle.jsx";
import "../App.css";

const busTypeOptions = ["Non-AC", "AC", "Electric"];
const fuelTypeOptions = ["Diesel", "CNG", "Electric"];
const statusOptions = ["Active", "Breakdown", "UnderMaintenance"];
const crewPolicyOptions = ["FLEXIBLE", "FIXED"];

const initialForm = {
  busNumber: "",
  depotId: "",
  ownerId: "",
  busType: "Non-AC",
  seatingCapacity: "",
  fuelType: "Diesel",
  operatorType: "WBTC",
  crewPolicy: "FLEXIBLE",
  status: "Active",
};

function BusEntry({ apiBase, token, operatorScope, setOperatorScope }) {
  const [form, setForm] = useState(initialForm);
  const [editingBusId, setEditingBusId] = useState(null);
  const [depots, setDepots] = useState([]);
  const [owners, setOwners] = useState([]);
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routeSelectionByBus, setRouteSelectionByBus] = useState({});
  const [attachBusyByBus, setAttachBusyByBus] = useState({});
  const [notice, setNotice] = useState(null);
  const [qrValue, setQrValue] = useState("");
  const [activeQr, setActiveQr] = useState(null);
  const [documents, setDocuments] = useState({
    pollution: null,
    insurance: null,
    permit: null,
    fitness: null,
  });

  useEffect(() => {
    setForm((prev) => {
      const nextPolicy = operatorScope === "PRIVATE" ? "FIXED" : "FLEXIBLE";
      if (prev.operatorType === operatorScope && prev.crewPolicy === nextPolicy) return prev;
      return { ...prev, operatorType: operatorScope, crewPolicy: nextPolicy };
    });
  }, [operatorScope]);

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
      } catch (error) {
        setNotice({ type: "error", message: error.message });
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
        const busRows = data.buses || [];
        setBuses(busRows);
        setRouteSelectionByBus(
          busRows.reduce((acc, bus) => {
            if (!bus?._id) return acc;
            acc[bus._id] = bus.attachedRouteId?._id || "";
            return acc;
          }, {})
        );
      } catch (error) {
        setNotice({ type: "error", message: error.message });
      }
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
        setNotice({ type: "error", message: error.message });
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
        setNotice({ type: "error", message: error.message });
      }
    };

    loadDepots();
    loadBuses();
    loadRoutes();
    loadOwners();
  }, [apiBase, token, operatorScope]);

  const qrUrl = useMemo(() => {
    if (!qrValue) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrValue)}`;
  }, [qrValue]);

  const activeQrUrl = useMemo(() => {
    if (!activeQr) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(activeQr.payload)}`;
  }, [activeQr]);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleGenerateQr = () => {
    if (!form.busNumber) {
      showNotice("error", "Bus number is required to generate a QR code.");
      return;
    }
    const payload = {
      busNumber: form.busNumber.trim(),
      depotId: form.depotId || null,
      busType: form.busType,
    };
    setQrValue(JSON.stringify(payload));
    showNotice("success", "QR code generated.");
  };

  const startEditBus = (bus) => {
    setEditingBusId(bus._id);
    setForm({
      busNumber: bus.busNumber || "",
      depotId: bus.depotId?._id || bus.depotId || "",
      ownerId: bus.ownerId?._id || bus.ownerId || "",
      busType: bus.busType || "Non-AC",
      seatingCapacity: bus.seatingCapacity ?? "",
      fuelType: bus.fuelType || "Diesel",
      operatorType: bus.operatorType || "WBTC",
      crewPolicy: bus.crewPolicy || (bus.operatorType === "PRIVATE" ? "FIXED" : "FLEXIBLE"),
      status: bus.status || "Active",
    });
  };

  const cancelEdit = () => {
    setEditingBusId(null);
    setForm({
      ...initialForm,
      operatorType: operatorScope,
      crewPolicy: operatorScope === "PRIVATE" ? "FIXED" : "FLEXIBLE",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.busNumber || !form.depotId) {
      showNotice("error", "Bus number and depot are required.");
      return;
    }

    try {
      const payload = {
        busNumber: form.busNumber.trim(),
        depotId: form.depotId,
        ownerId: form.ownerId || null,
        busType: form.busType,
        seatingCapacity: form.seatingCapacity ? Number(form.seatingCapacity) : 0,
        fuelType: form.fuelType,
        operatorType: form.operatorType,
        crewPolicy: form.crewPolicy,
        status: form.status,
      };

      const isEdit = Boolean(editingBusId);
      const response = await fetch(isEdit ? `${apiBase}/api/buses/${editingBusId}` : `${apiBase}/api/buses`, {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || `Failed to ${isEdit ? "update" : "create"} bus`);

      const hasDocs = Object.values(documents).some(Boolean);
      const savedBus = data.bus || payload;
      if (isEdit) {
        setBuses((prev) => prev.map((item) => (item._id === savedBus._id ? savedBus : item)));
      } else {
        setBuses((prev) => [savedBus, ...prev]);
      }
      showNotice(
        "success",
        isEdit
          ? "Bus updated."
          : hasDocs
            ? "Bus created. Documents are ready to upload."
            : "Bus created."
      );
      if (!qrValue) {
        setQrValue(JSON.stringify({ busNumber: payload.busNumber, depotId: payload.depotId }));
      }
      setEditingBusId(null);
      setForm({
        ...initialForm,
        operatorType: operatorScope,
        crewPolicy: operatorScope === "PRIVATE" ? "FIXED" : "FLEXIBLE",
      });
      setDocuments({
        pollution: null,
        insurance: null,
        permit: null,
        fitness: null,
      });
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const openQrModal = (bus) => {
    if (!bus?.busNumber) {
      showNotice("error", "Bus number is missing for this entry.");
      return;
    }
    const payload = JSON.stringify({
      busNumber: bus.busNumber,
      depotId: bus.depotId?._id || bus.depotId || null,
      busType: bus.busType || null,
      fuelType: bus.fuelType || null,
    });
    setActiveQr({ bus, payload });
  };

  const getBusDepotId = (bus) => bus?.depotId?._id || bus?.depotId || "";

  const handleAttachRoute = async (bus) => {
    const busId = bus?._id;
    if (!busId) {
      showNotice("error", "Bus id missing for this row.");
      return;
    }

    const selectedRouteId = String(routeSelectionByBus[busId] || "").trim();
    setAttachBusyByBus((prev) => ({ ...prev, [busId]: true }));

    try {
      const response = await fetch(`${apiBase}/api/buses/${busId}/attach-route`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ routeId: selectedRouteId || null }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to attach route");

      if (data.bus) {
        setBuses((prev) => prev.map((item) => (item._id === data.bus._id ? data.bus : item)));
        setRouteSelectionByBus((prev) => ({
          ...prev,
          [busId]: data.bus.attachedRouteId?._id || "",
        }));
      }
      showNotice("success", selectedRouteId ? "Route attached to bus." : "Route detached from bus.");
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setAttachBusyByBus((prev) => ({ ...prev, [busId]: false }));
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
              <span className="pill">Bus entry</span>
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
                <h1>Bus onboarding</h1>
                <span className="pill">Create + QR</span>
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
                  <h3>Bus details</h3>
                  <span className="pill">/api/buses</span>
                </div>
                <form className="form" onSubmit={handleSubmit}>
                  <label className="field">
                    Bus number
                    <input
                      value={form.busNumber}
                      onChange={(event) => setForm({ ...form, busNumber: event.target.value })}
                      placeholder="WBTC-2026-014"
                    />
                  </label>
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
                  <div className="inline">
                    <label className="field">
                      Bus type
                      <select
                        value={form.busType}
                        onChange={(event) => setForm({ ...form, busType: event.target.value })}
                      >
                        {busTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Seating capacity
                      <input
                        type="number"
                        value={form.seatingCapacity}
                        onChange={(event) => setForm({ ...form, seatingCapacity: event.target.value })}
                        placeholder="40"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      Fuel type
                      <select
                        value={form.fuelType}
                        onChange={(event) => setForm({ ...form, fuelType: event.target.value })}
                      >
                        {fuelTypeOptions.map((option) => (
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
                    <label className="field">
                      Operator type
                      <input value={form.operatorType} readOnly />
                    </label>
                    <label className="field">
                      Crew policy
                      <select
                        value={form.crewPolicy}
                        onChange={(event) => setForm({ ...form, crewPolicy: event.target.value })}
                        disabled
                      >
                        {crewPolicyOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="panel" style={{ background: "var(--panel-strong)" }}>
                    <div className="panel-header">
                      <h3>Bus documents</h3>
                      <span className="pill">Uploads</span>
                    </div>
                    <div className="inline">
                      <label className="field">
                        Pollution
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(event) =>
                            setDocuments({ ...documents, pollution: event.target.files?.[0] || null })
                          }
                        />
                      </label>
                      <label className="field">
                        Insurance
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(event) =>
                            setDocuments({ ...documents, insurance: event.target.files?.[0] || null })
                          }
                        />
                      </label>
                    </div>
                    <div className="inline">
                      <label className="field">
                        Permit
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(event) =>
                            setDocuments({ ...documents, permit: event.target.files?.[0] || null })
                          }
                        />
                      </label>
                      <label className="field">
                        Fitness
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(event) =>
                            setDocuments({ ...documents, fitness: event.target.files?.[0] || null })
                          }
                        />
                      </label>
                    </div>
                    <p className="pill">
                      Selected:{" "}
                      {Object.entries(documents)
                        .filter(([, file]) => file)
                        .map(([key]) => key)
                        .join(", ") || "none"}
                    </p>
                  </div>
                  <div className="inline">
                    <button className="btn outline" type="button" onClick={handleGenerateQr}>
                      Generate QR
                    </button>
                    <button className="btn primary" type="submit">
                      {editingBusId ? "Update bus" : "Save bus"}
                    </button>
                    {editingBusId && (
                      <button className="btn ghost" type="button" onClick={cancelEdit}>
                        Cancel edit
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Bus QR code</h3>
                  <span className="pill">Unique code</span>
                </div>
                {qrUrl ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    <img src={qrUrl} alt="Bus QR code" style={{ width: "220px", borderRadius: "12px" }} />
                    <div className="list-item">
                      <div>
                        <strong>QR payload</strong>
                        <span style={{ wordBreak: "break-word" }}>{qrValue}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="list-item">
                    <div>
                      <strong>No QR generated</strong>
                      <span>Fill the bus number and click Generate QR.</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <h3>Added buses</h3>
                <span className="pill">{buses.length} total</span>
              </div>
              {buses.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No buses yet</strong>
                    <span>Create a bus to see it listed here.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bus</th>
                      <th>Depot</th>
                      <th>Type</th>
                      <th>Fuel</th>
                      <th>Owner</th>
                      <th>Operator</th>
                      <th>Crew Policy</th>
                      <th>Status</th>
                      <th>Current Route</th>
                      <th>Attach Route</th>
                      <th>Actions</th>
                      <th>QR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buses.map((bus) => {
                      const busId = bus._id;
                      const busDepotId = getBusDepotId(bus);
                      const busOperatorType = bus.operatorType || "WBTC";
                      const routeOptions = routes.filter((route) => {
                        const routeDepotId = route?.depotId?._id || route?.depotId || "";
                        const routeOperatorType = route?.operatorType || "WBTC";
                        return String(routeDepotId) === String(busDepotId) && String(routeOperatorType) === String(busOperatorType);
                      });
                      return (
                      <tr key={busId || bus.busNumber}>
                        <td>{bus.busNumber}</td>
                        <td>
                          {bus.depotId?.depotName ||
                            depots.find((depot) => depot._id === bus.depotId)?.depotName ||
                            bus.depotId}
                        </td>
                        <td>{bus.busType}</td>
                        <td>{bus.fuelType}</td>
                        <td>
                          {bus.ownerId?.name ||
                            owners.find((owner) => String(owner.id) === String(bus.ownerId || ""))?.name ||
                            "--"}
                        </td>
                        <td>{bus.operatorType || "WBTC"}</td>
                        <td>{bus.crewPolicy || "FLEXIBLE"}</td>
                        <td>
                          <span className="chip">{bus.status}</span>
                        </td>
                        <td>{bus.attachedRouteId ? `${bus.attachedRouteId.routeCode} - ${bus.attachedRouteId.routeName}` : "--"}</td>
                        <td>
                          <div style={{ display: "grid", gap: "8px", minWidth: "220px" }}>
                            <select
                              value={routeSelectionByBus[busId] ?? (bus.attachedRouteId?._id || "")}
                              onChange={(event) =>
                                setRouteSelectionByBus((prev) => ({ ...prev, [busId]: event.target.value }))
                              }
                              disabled={!busId}
                            >
                              <option value="">No route</option>
                              {routeOptions.map((route) => (
                                <option key={route._id} value={route._id}>
                                  {route.routeCode} - {route.routeName}
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn outline"
                              type="button"
                              onClick={() => handleAttachRoute(bus)}
                              disabled={!busId || Boolean(attachBusyByBus[busId])}
                            >
                              {attachBusyByBus[busId] ? "Saving..." : "Attach"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <button className="btn ghost" type="button" onClick={() => startEditBus(bus)}>
                            Edit
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => openQrModal(bus)}
                          >
                            View QR
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              )}
            </section>
          </main>
        </div>
      </div>
      {activeQr && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="panel-header">
              <h3>Bus QR Code</h3>
              <button className="btn ghost" type="button" onClick={() => setActiveQr(null)}>
                Close
              </button>
            </div>
            <div style={{ display: "grid", gap: "12px", justifyItems: "center" }}>
              <img src={activeQrUrl} alt={`QR code for ${activeQr.bus.busNumber}`} />
              <div className="list-item" style={{ width: "100%" }}>
                <div>
                  <strong>{activeQr.bus.busNumber}</strong>
                  <span style={{ wordBreak: "break-word" }}>{activeQr.payload}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BusEntry;


