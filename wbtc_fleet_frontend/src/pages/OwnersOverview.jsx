import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const getInitials = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

const AVATAR_COLORS = [
  ["#f47b20", "#e05a00"],
  ["#1b9aaa", "#0f6c78"],
  ["#7c3aed", "#5b21b6"],
  ["#16a34a", "#166534"],
  ["#dc2626", "#991b1b"],
  ["#d97706", "#92400e"],
  ["#0284c7", "#075985"],
];

const getAvatarGradient = (name) => {
  const idx = (name || "").charCodeAt(0) % AVATAR_COLORS.length;
  const [a, b] = AVATAR_COLORS[idx];
  return `linear-gradient(135deg, ${a}, ${b})`;
};

function CollapsePanel({ open, children }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    if (open) {
      setHeight(ref.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [open, children]);

  return (
    <div
      style={{
        overflow: "hidden",
        maxHeight: open ? `${height}px` : "0px",
        transition: "max-height 0.32s cubic-bezier(0.4,0,0.2,1)",
      }}
      ref={ref}
    >
      {children}
    </div>
  );
}

function OwnerCard({
  entry,
  isOpen,
  onToggle,
  dueAmount,
  resettingOwnerId,
  onResetPassword,
  credentials,
  onCopyCredentials,
  onShareCredentials,
  onDismissCredentials,
}) {
  const { owner, buses, routes, totalBuses, totalRoutes } = entry;
  const ownerId = String(owner.id);
  const hasPending = dueAmount > 0;

  return (
    <div
      style={{
        borderRadius: 20,
        border: `1.5px solid ${isOpen ? "rgba(27,154,170,0.35)" : "var(--line)"}`,
        background: isOpen
          ? "linear-gradient(135deg,rgba(27,154,170,0.04),rgba(255,255,255,0.97))"
          : "var(--panel)",
        boxShadow: isOpen
          ? "0 8px 32px rgba(27,154,170,0.12)"
          : "var(--shadow)",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* — Collapsed header — */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "18px 22px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: getAvatarGradient(owner.name),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: "1.1rem",
            flexShrink: 0,
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            letterSpacing: "0.02em",
          }}
        >
          {getInitials(owner.name)}
        </div>

        {/* Info block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 6,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>
              {owner.name}
            </span>
            <span style={{ fontSize: "0.83rem", color: "var(--muted)", fontWeight: 500 }}>
              @{owner.username}
            </span>
            <span
              className={owner.active ? "chip chip-live" : "chip chip-cancelled"}
              style={{ fontSize: "0.74rem", fontWeight: 700 }}
            >
              {owner.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="pill" style={{ fontSize: "0.78rem" }}>
              {totalBuses} {totalBuses === 1 ? "bus" : "buses"}
            </span>
            <span className="pill" style={{ fontSize: "0.78rem" }}>
              {totalRoutes} {totalRoutes === 1 ? "route" : "routes"}
            </span>
            {owner.payoutBankDetails?.accountNumber ? (
              <span
                className="chip"
                style={{ fontSize: "0.74rem", background: "rgba(22,163,74,0.12)", color: "#166534" }}
              >
                Bank linked
              </span>
            ) : (
              <span
                className="chip chip-cancelled"
                style={{ fontSize: "0.74rem" }}
              >
                No bank
              </span>
            )}
          </div>
        </div>

        {/* Pending amount badge */}
        <div
          style={{
            textAlign: "right",
            flexShrink: 0,
            padding: "8px 16px",
            borderRadius: 14,
            background: hasPending ? "rgba(220,38,38,0.08)" : "rgba(22,163,74,0.08)",
            border: `1px solid ${hasPending ? "rgba(220,38,38,0.22)" : "rgba(22,163,74,0.22)"}`,
          }}
        >
          <div
            style={{
              fontSize: "1.05rem",
              fontWeight: 800,
              color: hasPending ? "#dc2626" : "#16a34a",
              lineHeight: 1.1,
            }}
          >
            Rs {formatMoney(dueAmount)}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2, fontWeight: 600 }}>
            {hasPending ? "Pending payout" : "All settled"}
          </div>
        </div>

        {/* Chevron */}
        <div
          style={{
            color: "var(--muted)",
            fontSize: "0.85rem",
            transition: "transform 0.28s ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
            marginLeft: 4,
          }}
        >
          ▼
        </div>
      </button>

      {/* — Expandable content — */}
      <CollapsePanel open={isOpen}>
        <div
          style={{
            borderTop: "1px solid var(--line)",
            padding: "20px 22px 22px",
            display: "grid",
            gap: 18,
          }}
        >
          {/* Temporary credentials banner */}
          {credentials && (
            <div
              style={{
                borderRadius: 14,
                background: "linear-gradient(135deg,rgba(240,196,76,0.15),rgba(244,123,32,0.08))",
                border: "1px solid rgba(240,196,76,0.4)",
                padding: "16px 18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: "0.9rem", color: "#92400e" }}>
                  Temporary credentials — {credentials.name}
                </strong>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn outline" type="button" style={{ padding: "6px 14px", fontSize: "0.82rem" }} onClick={onCopyCredentials}>
                    Copy
                  </button>
                  <button className="btn primary" type="button" style={{ padding: "6px 14px", fontSize: "0.82rem" }} onClick={onShareCredentials}>
                    Share
                  </button>
                  <button className="btn ghost" type="button" style={{ padding: "6px 14px", fontSize: "0.82rem" }} onClick={onDismissCredentials}>
                    Dismiss
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field">
                  Username
                  <input value={credentials.username} readOnly />
                </label>
                <label className="field">
                  Temporary password
                  <input value={credentials.password} readOnly />
                </label>
              </div>
            </div>
          )}

          {/* Bank details + Actions row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
            <div>
              <div
                style={{
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--muted)",
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                Owner details
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                {[
                  ["Phone", owner.phoneNumber],
                  ["WhatsApp", owner.whatsappNumber],
                  ["Email", owner.email],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "rgba(124,58,237,0.06)",
                      border: "1px solid rgba(124,58,237,0.14)",
                    }}
                  >
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 2 }}>
                      {label}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)" }}>
                      {val || "--"}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--muted)",
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                Payout bank details
              </div>
              {owner.payoutBankDetails?.accountNumber ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                    gap: 10,
                  }}
                >
                  {[
                    ["Account holder", owner.payoutBankDetails.accountHolderName],
                    ["Bank", owner.payoutBankDetails.bankName],
                    ["Account No.", owner.payoutBankDetails.accountNumber],
                    ["IFSC", owner.payoutBankDetails.ifscCode],
                    ["Branch", owner.payoutBankDetails.branchName],
                  ].map(([label, val]) => (
                    <div
                      key={label}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: "rgba(27,154,170,0.06)",
                        border: "1px solid rgba(27,154,170,0.14)",
                      }}
                    >
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 2 }}>
                        {label}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)" }}>
                        {val || "--"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    fontSize: "0.85rem",
                    color: "#991b1b",
                  }}
                >
                  No payout bank details added yet.
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 22 }}>
              <button
                className="btn outline"
                type="button"
                onClick={() => onResetPassword(owner)}
                disabled={resettingOwnerId === ownerId}
                style={{ whiteSpace: "nowrap" }}
              >
                {resettingOwnerId === ownerId ? "Resetting..." : "Reset password"}
              </button>
            </div>
          </div>

          {/* Buses */}
          <div>
            <div
              style={{
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted)",
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              Buses ({totalBuses})
            </div>
            {buses.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid var(--line)",
                  color: "var(--muted)",
                  fontSize: "0.85rem",
                }}
              >
                No buses tagged to this owner.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
                {buses.map((bus) => (
                  <div
                    key={bus.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "#fbfcfd",
                      border: "1px solid var(--line)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: "0.95rem" }}>{bus.busNumber}</strong>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontWeight: 700,
                          background:
                            bus.status === "ACTIVE"
                              ? "rgba(22,163,74,0.12)"
                              : bus.status === "INACTIVE"
                              ? "rgba(239,68,68,0.12)"
                              : "rgba(27,154,170,0.12)",
                          color:
                            bus.status === "ACTIVE"
                              ? "#166534"
                              : bus.status === "INACTIVE"
                              ? "#991b1b"
                              : "#0f6c78",
                        }}
                      >
                        {bus.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      {bus.depotName} ({bus.depotCode})
                    </div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(244,123,32,0.1)",
                        color: "#9a3412",
                        fontWeight: 600,
                        alignSelf: "flex-start",
                      }}
                    >
                      {bus.operatorType}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Routes */}
          <div>
            <div
              style={{
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted)",
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              Associated routes ({totalRoutes})
            </div>
            {routes.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid var(--line)",
                  color: "var(--muted)",
                  fontSize: "0.85rem",
                }}
              >
                No routes observed yet. Routes appear once owner buses are used in trips.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {routes.map((route) => (
                  <div
                    key={route.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 12,
                      background: "rgba(27,154,170,0.08)",
                      border: "1px solid rgba(27,154,170,0.2)",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f6c78" }}>
                      {route.routeCode}
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{route.routeName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CollapsePanel>
    </div>
  );
}

function OwnersOverview({ apiBase, token }) {
  const [owners, setOwners] = useState([]);
  const [tagOwners, setTagOwners] = useState([]);
  const [tagBuses, setTagBuses] = useState([]);
  const [createOwnerForm, setCreateOwnerForm] = useState({
    name: "",
    username: "",
    password: "",
    phoneNumber: "",
    whatsappNumber: "",
    email: "",
  });
  const [createOwnerBusy, setCreateOwnerBusy] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [selectedBusRoutes, setSelectedBusRoutes] = useState([]);
  const [tagBusy, setTagBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resettingOwnerId, setResettingOwnerId] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [credentialsOwnerId, setCredentialsOwnerId] = useState(null);
  const [openOwnerIds, setOpenOwnerIds] = useState(new Set());
  const [pendingAmounts, setPendingAmounts] = useState({});
  const [createOwnerOpen, setCreateOwnerOpen] = useState(false);

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

  const loadPendingAmounts = async () => {
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/payments?mode=monthly`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      const map = {};
      for (const payment of data.payments || []) {
        map[String(payment.owner.id)] = payment.dueAmount || 0;
      }
      setPendingAmounts(map);
    } catch (_) {}
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
    if (!busId) { setSelectedBusRoutes([]); return; }
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
    if (!selectedOwnerId || !selectedBusId) { showNotice("error", "Select both owner and bus."); return; }
    setTagBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/${selectedOwnerId}/tag-bus`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      phoneNumber: createOwnerForm.phoneNumber.trim(),
      whatsappNumber: createOwnerForm.whatsappNumber.trim(),
      email: createOwnerForm.email.trim(),
    };
    if (!payload.name || !payload.username || !payload.password) {
      showNotice("error", "Name, username, and password are required.");
      return;
    }
    setCreateOwnerBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to create owner");
      showNotice("success", `Owner ${payload.name} created successfully.`);
      setCreateOwnerForm({
        name: "",
        username: "",
        password: "",
        phoneNumber: "",
        whatsappNumber: "",
        email: "",
      });
      setCreateOwnerOpen(false);
      await Promise.all([loadOwners(), loadTagContext()]);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setCreateOwnerBusy(false);
    }
  };

  const handleResetOwnerPassword = async (owner) => {
    setResettingOwnerId(String(owner.id));
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/${owner.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to reset owner password");
      setCredentials({
        name: owner.name,
        username: data.credentials?.username || owner.username,
        password: data.credentials?.temporaryPassword || "",
      });
      setCredentialsOwnerId(String(owner.id));
      setOpenOwnerIds((prev) => { const next = new Set(prev); next.add(String(owner.id)); return next; });
      showNotice("success", `Temporary password generated for ${owner.name}.`);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setResettingOwnerId("");
    }
  };

  const handleCopyCredentials = async () => {
    if (!credentials) return;
    const text = `Username: ${credentials.username}\nTemporary password: ${credentials.password}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showNotice("success", "Credentials copied.");
      return;
    }
    showNotice("error", "Clipboard is not available in this browser.");
  };

  const handleShareCredentials = async () => {
    if (!credentials) return;
    const text = `Username: ${credentials.username}\nTemporary password: ${credentials.password}`;
    if (navigator.share) { await navigator.share({ text, title: `${credentials.name} credentials` }); return; }
    await handleCopyCredentials();
  };

  const toggleOwner = (id) => {
    const key = String(id);
    setOpenOwnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleRefresh = () => {
    loadOwners();
    loadPendingAmounts();
  };

  useEffect(() => {
    loadOwners();
    loadTagContext();
    loadPendingAmounts();
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
              <p className="sidebar-title">Qfare Fleet</p>
              <span className="pill">Owner details</span>
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
                <h1>Bus Owner Registry</h1>
                <span className="pill">Owners + buses + routes</span>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn outline" type="button" onClick={handleRefresh}>
                Refresh
              </button>
              <Link className="btn ghost" to="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            {/* Add new owner */}
            <section className="panel">
              <div className="panel-header">
                <h3>Add new owner</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => setCreateOwnerOpen((prev) => !prev)}
                  >
                    {createOwnerOpen ? "Hide form" : "Add new owner"}
                  </button>
                  <span className="pill">Admin action</span>
                </div>
              </div>
              {createOwnerOpen ? (
                <form className="form" onSubmit={handleCreateOwner}>
                  <div className="inline">
                    <label className="field">
                      Owner name
                      <input
                        value={createOwnerForm.name}
                        onChange={(e) => setCreateOwnerForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Full name"
                      />
                    </label>
                    <label className="field">
                      Username
                      <input
                        value={createOwnerForm.username}
                        onChange={(e) => setCreateOwnerForm((p) => ({ ...p, username: e.target.value }))}
                        placeholder="owner_username"
                      />
                    </label>
                    <label className="field">
                      Password
                      <input
                        type="password"
                        value={createOwnerForm.password}
                        onChange={(e) => setCreateOwnerForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Create password"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      Phone no
                      <input
                        value={createOwnerForm.phoneNumber}
                        onChange={(event) =>
                          setCreateOwnerForm((prev) => ({ ...prev, phoneNumber: event.target.value }))
                        }
                        placeholder="Owner phone number"
                      />
                    </label>
                    <label className="field">
                      WhatsApp no
                      <input
                        value={createOwnerForm.whatsappNumber}
                        onChange={(event) =>
                          setCreateOwnerForm((prev) => ({ ...prev, whatsappNumber: event.target.value }))
                        }
                        placeholder="WhatsApp number"
                      />
                    </label>
                    <label className="field">
                      Email ID
                      <input
                        type="email"
                        value={createOwnerForm.email}
                        onChange={(event) =>
                          setCreateOwnerForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        placeholder="owner@email.com"
                      />
                    </label>
                  </div>
                  <button className="btn primary" type="submit" disabled={createOwnerBusy}>
                    {createOwnerBusy ? "Creating..." : "Create owner"}
                  </button>
                </form>
              ) : null}
            </section>

            {/* Tag bus to owner */}
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
                    {tagOwners.map((o) => (
                      <option key={o.id} value={o.id}>{o.name} ({o.username})</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Bus
                  <select value={selectedBusId} onChange={(e) => setSelectedBusId(e.target.value)}>
                    <option value="">Select bus</option>
                    {tagBuses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.busNumber} | {b.operatorType} | {b.depotName} ({b.depotCode})
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn primary" type="button" onClick={handleTagBus} disabled={tagBusy}>
                  {tagBusy ? "Tagging..." : "Tag bus"}
                </button>
              </div>
              {selectedBusId && (
                <div
                  className="panel"
                  style={{ marginTop: 12, background: "var(--panel-strong)" }}
                >
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
              )}
            </section>

            {/* Owner accounts */}
            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Owner accounts</h2>
                  <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                    Click any card to view bank details, buses and routes
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="pill">{owners.length} total</span>
                  {owners.length > 0 && (
                    <button
                      className="btn ghost"
                      type="button"
                      style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                      onClick={() =>
                        setOpenOwnerIds(
                          openOwnerIds.size === owners.length
                            ? new Set()
                            : new Set(owners.map((e) => String(e.owner.id)))
                        )
                      }
                    >
                      {openOwnerIds.size === owners.length ? "Collapse all" : "Expand all"}
                    </button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="panel">
                  <div className="list-item">
                    <div>
                      <strong>Loading owners...</strong>
                      <span>Fetching owner accounts and their details.</span>
                    </div>
                  </div>
                </div>
              ) : owners.length === 0 ? (
                <div className="panel">
                  <div className="list-item">
                    <div>
                      <strong>No owner accounts found</strong>
                      <span>Create users with role OWNER and tag buses with owner id.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {owners.map((entry) => {
                    const ownerId = String(entry.owner.id);
                    const isOpen = openOwnerIds.has(ownerId);
                    const dueAmount = pendingAmounts[ownerId] ?? 0;
                    return (
                      <OwnerCard
                        key={ownerId}
                        entry={entry}
                        isOpen={isOpen}
                        onToggle={() => toggleOwner(entry.owner.id)}
                        dueAmount={dueAmount}
                        resettingOwnerId={resettingOwnerId}
                        onResetPassword={handleResetOwnerPassword}
                        credentials={credentialsOwnerId === ownerId ? credentials : null}
                        onCopyCredentials={handleCopyCredentials}
                        onShareCredentials={handleShareCredentials}
                        onDismissCredentials={() => { setCredentials(null); setCredentialsOwnerId(null); }}
                      />
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

export default OwnersOverview;
