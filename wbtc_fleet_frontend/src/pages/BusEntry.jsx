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
  const [activeRouteSelectionByBus, setActiveRouteSelectionByBus] = useState({});
  const [attachBusyByBus, setAttachBusyByBus] = useState({});
  const [expandedBus, setExpandedBus] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
            acc[bus._id] = Array.isArray(bus.attachedRouteIds)
              ? bus.attachedRouteIds.map((route) => route?._id).filter(Boolean)
              : bus.attachedRouteId?._id
              ? [bus.attachedRouteId._id]
              : [];
            return acc;
          }, {})
        );
        setActiveRouteSelectionByBus(
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
      activeRouteId: null,
    };
    setQrValue(JSON.stringify(payload));
    showNotice("success", "QR code generated.");
  };

  const startEditBus = (bus) => {
    setEditingBusId(bus._id);
    setFormOpen(true);
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
    setFormOpen(false);
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
      setFormOpen(false);
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
      activeRouteId: bus.attachedRouteId?._id || null,
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

    const selectedRouteIds = Array.isArray(routeSelectionByBus[busId])
      ? routeSelectionByBus[busId].map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const selectedActiveRouteId = String(activeRouteSelectionByBus[busId] || "").trim();
    setAttachBusyByBus((prev) => ({ ...prev, [busId]: true }));

    try {
      const response = await fetch(`${apiBase}/api/buses/${busId}/attach-route`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          routeIds: selectedRouteIds,
          activeRouteId: selectedActiveRouteId || selectedRouteIds[0] || null,
        }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to attach route");

      if (data.bus) {
        setBuses((prev) => prev.map((item) => (item._id === data.bus._id ? data.bus : item)));
        setRouteSelectionByBus((prev) => ({
          ...prev,
          [busId]: Array.isArray(data.bus.attachedRouteIds)
            ? data.bus.attachedRouteIds.map((route) => route?._id).filter(Boolean)
            : data.bus.attachedRouteId?._id
            ? [data.bus.attachedRouteId._id]
            : [],
        }));
        setActiveRouteSelectionByBus((prev) => ({
          ...prev,
          [busId]: data.bus.attachedRouteId?._id || "",
        }));
      }
      showNotice("success", selectedRouteIds.length ? "Routes updated for bus." : "Routes detached from bus.");
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
              <p className="sidebar-title">Qfare Fleet</p>
              <span className="pill">Bus entry</span>
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

            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "17px", fontWeight: "700" }}>
                  {buses.length > 0 ? `${buses.length} bus${buses.length === 1 ? "" : "es"}` : "No buses yet"}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.45, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {operatorScope}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="search"
                  placeholder="Search bus number…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid var(--border, rgba(255,255,255,0.12))", background: "var(--panel-strong, rgba(255,255,255,0.05))", fontSize: "13px", minWidth: "180px" }}
                />
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    if (editingBusId) cancelEdit();
                    else setFormOpen((prev) => !prev);
                  }}
                >
                  {formOpen ? "Close form" : "+ Add bus"}
                </button>
              </div>
            </div>

            {/* Collapsible form + QR */}
            {formOpen && (
              <section className="grid two" style={{ marginBottom: "16px" }}>
                <div className="panel">
                  <div className="panel-header">
                    <h3>{editingBusId ? "Edit bus" : "New bus"}</h3>
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
                            <option key={option} value={option}>{option}</option>
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
                            <option key={option} value={option}>{option}</option>
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
                      <button className="btn ghost" type="button" onClick={cancelEdit}>
                        Cancel
                      </button>
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
            )}
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
                <div style={{ display: "grid", gap: "12px" }}>
                  {buses.filter((bus) => {
                    const q = searchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return bus.busNumber?.toLowerCase().includes(q);
                  }).map((bus) => {
                    const busId = bus._id;
                    const busDepotId = getBusDepotId(bus);
                    const busOperatorType = bus.operatorType || "WBTC";
                    const routeOptions = routes.filter((route) => {
                      const routeDepotId = route?.depotId?._id || route?.depotId || "";
                      const routeOperatorType = route?.operatorType || "WBTC";
                      return String(routeDepotId) === String(busDepotId) && String(routeOperatorType) === String(busOperatorType);
                    });
                    const isExpanded = expandedBus === busId;
                    const ownerName =
                      bus.ownerId?.name ||
                      owners.find((o) => String(o.id) === String(bus.ownerId || ""))?.name ||
                      "--";
                    const depotName =
                      bus.depotId?.depotName ||
                      depots.find((d) => d._id === bus.depotId)?.depotName ||
                      bus.depotId ||
                      "--";
                    return (
                      <div
                        key={busId || bus.busNumber}
                        style={{
                          background: "var(--panel-bg, rgba(255,255,255,0.03))",
                          border: "1px solid var(--border, rgba(255,255,255,0.08))",
                          borderRadius: "14px",
                          padding: "16px",
                          display: "grid",
                          gap: "12px",
                        }}
                      >
                        {/* Header row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: "18px", fontWeight: "700" }}>{bus.busNumber}</div>
                            <div style={{ fontSize: "13px", opacity: 0.55, marginTop: "2px" }}>{depotName}</div>
                          </div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <span className="chip">{bus.status}</span>
                            <button className="btn ghost" type="button" onClick={() => startEditBus(bus)}>Edit</button>
                            <button className="btn ghost" type="button" onClick={() => openQrModal(bus)}>QR</button>
                          </div>
                        </div>

                        {/* Metadata tags */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {[
                            ["Type", bus.busType],
                            ["Fuel", bus.fuelType],
                            ["Crew", bus.crewPolicy || "FLEXIBLE"],
                            ["Operator", bus.operatorType || "WBTC"],
                            ["Owner", ownerName],
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
                        </div>

                        {/* Current route row */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid var(--border, rgba(255,255,255,0.07))" }}>
                          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.45 }}>Route</span>
                          <span style={{ fontSize: "13px", fontWeight: "600" }}>
                            {bus.attachedRouteId
                              ? `${bus.attachedRouteId.routeCode} — ${bus.attachedRouteId.routeName}`
                              : "—"}
                          </span>
                          <button
                            className="btn ghost"
                            type="button"
                            style={{ marginLeft: "auto", fontSize: "12px" }}
                            onClick={() => setExpandedBus(isExpanded ? null : busId)}
                          >
                            {isExpanded ? "Close" : "Manage routes"}
                          </button>
                        </div>

                        {/* Expandable route assignment panel */}
                        {isExpanded && (
                          <div style={{ display: "grid", gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--border, rgba(255,255,255,0.07))" }}>
                            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.6px", opacity: 0.45 }}>Assign routes (multi-select)</div>
                            <select
                              multiple
                              value={routeSelectionByBus[busId] ?? []}
                              onChange={(event) => {
                                const values = Array.from(event.target.selectedOptions).map((o) => o.value);
                                setRouteSelectionByBus((prev) => ({ ...prev, [busId]: values }));
                                setActiveRouteSelectionByBus((prev) => {
                                  const current = String(prev[busId] || "");
                                  return { ...prev, [busId]: values.includes(current) ? current : values[0] || "" };
                                });
                              }}
                              disabled={!busId}
                              size={Math.min(Math.max(routeOptions.length, 2), 5)}
                            >
                              {routeOptions.map((route) => (
                                <option key={route._id} value={route._id}>
                                  {route.routeCode} — {route.routeName}
                                </option>
                              ))}
                            </select>
                            <select
                              value={activeRouteSelectionByBus[busId] ?? (bus.attachedRouteId?._id || "")}
                              onChange={(event) =>
                                setActiveRouteSelectionByBus((prev) => ({ ...prev, [busId]: event.target.value }))
                              }
                              disabled={!busId || !(routeSelectionByBus[busId] || []).length}
                            >
                              <option value="">Set as current route</option>
                              {routeOptions
                                .filter((route) => (routeSelectionByBus[busId] || []).includes(route._id))
                                .map((route) => (
                                  <option key={`active-${route._id}`} value={route._id}>
                                    {route.routeCode} — {route.routeName}
                                  </option>
                                ))}
                            </select>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                className="btn outline"
                                type="button"
                                onClick={() => handleAttachRoute(bus)}
                                disabled={!busId || Boolean(attachBusyByBus[busId])}
                              >
                                {attachBusyByBus[busId] ? "Saving..." : "Save routes"}
                              </button>
                              <button
                                className="btn ghost"
                                type="button"
                                onClick={() => {
                                  setRouteSelectionByBus((prev) => ({ ...prev, [busId]: [] }));
                                  setActiveRouteSelectionByBus((prev) => ({ ...prev, [busId]: "" }));
                                }}
                                disabled={!busId || Boolean(attachBusyByBus[busId])}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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

