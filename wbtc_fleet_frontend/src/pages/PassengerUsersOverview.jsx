import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const formatDateTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const bookingChipClass = (status) => {
  if (status === "Active") return "chip chip-live";
  if (status === "Scheduled") return "chip chip-scheduled";
  if (status === "Cancelled") return "chip chip-cancelled";
  return "chip";
};

function PassengerUsersOverview({ apiBase, token }) {
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [depots, setDepots] = useState([]);
  const [expandedUserId, setExpandedUserId] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    depotId: "",
    liveOnly: false,
    limit: "200",
  });

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadDepots = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/depots`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load depots");
      setDepots(data.depots || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  }, [apiBase, token]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.depotId) params.set("depotId", filters.depotId);
      if (filters.liveOnly) params.set("liveOnly", "true");
      if (filters.limit) params.set("limit", filters.limit);

      const response = await fetch(`${apiBase}/api/public/bookings/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load passenger registry");

      setSummary(data.summary || null);
      setUsers(data.users || []);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, filters, token]);

  useEffect(() => {
    loadDepots();
  }, [loadDepots]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const usersWithRecentActivity = useMemo(
    () => users.filter((row) => row.stats?.lastBookingAt || row.stats?.activeLiveBookings > 0).length,
    [users]
  );

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
              <span className="pill">Passengers</span>
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
                <h1>Registered Passenger Users</h1>
                <span className="pill">Accounts, booking activity, live bookings</span>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn outline" type="button" onClick={loadUsers}>
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
                <h3>Filters</h3>
                <span className="pill">Passenger registry query</span>
              </div>
              <div className="inline">
                <label className="field">
                  Search
                  <input
                    value={filters.q}
                    onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                    placeholder="Name, email, phone"
                  />
                </label>
                <label className="field">
                  Depot
                  <select
                    value={filters.depotId}
                    onChange={(event) => setFilters((prev) => ({ ...prev, depotId: event.target.value }))}
                  >
                    <option value="">All depots</option>
                    {depots.map((depot) => (
                      <option key={depot._id} value={depot._id}>
                        {depot.depotName} ({depot.depotCode})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Limit
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={filters.limit}
                    onChange={(event) => setFilters((prev) => ({ ...prev, limit: event.target.value }))}
                  />
                </label>
                <label className="field">
                  Live only
                  <select
                    value={filters.liveOnly ? "true" : "false"}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, liveOnly: event.target.value === "true" }))
                    }
                  >
                    <option value="false">All users</option>
                    <option value="true">Only users with live bookings</option>
                  </select>
                </label>
                <button className="btn primary" type="button" onClick={loadUsers}>
                  Load users
                </button>
              </div>
            </section>

            <section className="grid three">
              <div className="stat">
                <span>Registered users</span>
                <strong>{summary?.totalUsers ?? 0}</strong>
              </div>
              <div className="stat stat-live">
                <span>Users with recent activity</span>
                <strong>{usersWithRecentActivity}</strong>
              </div>
              <div className="stat stat-active">
                <span>Active live bookings</span>
                <strong>{summary?.activeLiveBookings ?? 0}</strong>
              </div>
              <div className="stat">
                <span>Users with bookings</span>
                <strong>{summary?.usersWithBookings ?? 0}</strong>
              </div>
              <div className="stat">
                <span>Profile complete</span>
                <strong>{summary?.profileCompleteUsers ?? 0}</strong>
              </div>
              <div className="stat">
                <span>Total revenue</span>
                <strong>Rs {formatMoney(summary?.totalRevenue ?? 0)}</strong>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Passenger activity table</h3>
                <span className="pill">{users.length} rows</span>
              </div>

              {loading ? (
                <div className="list-item">
                  <div>
                    <strong>Loading passenger registry...</strong>
                  </div>
                </div>
              ) : users.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No passengers found</strong>
                    <span>Try clearing filters or expanding the search scope.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Contact</th>
                      <th>Registered</th>
                      <th>Profile</th>
                      <th>Bookings</th>
                      <th>Revenue</th>
                      <th>Live</th>
                      <th>Last activity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const expanded = expandedUserId === user.id;
                      return (
                        <Fragment key={user.id}>
                          <tr>
                            <td>
                              <strong>{user.name}</strong>
                              <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{user.email}</div>
                            </td>
                            <td>
                              <div>{user.phone}</div>
                            </td>
                            <td>{formatDateTime(user.createdAt)}</td>
                            <td>
                              <span className={`chip ${user.profileComplete ? "chip-live" : ""}`}>
                                {user.profileComplete ? "Complete" : "Pending"}
                              </span>
                            </td>
                            <td>
                              {user.stats.totalBookings}
                              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                                Pax {user.stats.totalPassengers}
                              </div>
                            </td>
                            <td>Rs {formatMoney(user.stats.totalSpent)}</td>
                            <td>
                              <span className={bookingChipClass(user.stats.activeLiveBookings > 0 ? "Active" : "Completed")}>
                                {user.stats.activeLiveBookings}
                              </span>
                            </td>
                            <td>{formatDateTime(user.stats.lastBookingAt || user.updatedAt)}</td>
                            <td>
                              <button
                                className="btn outline"
                                type="button"
                                onClick={() => setExpandedUserId(expanded ? "" : user.id)}
                              >
                                {expanded ? "Hide" : "View"}
                              </button>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr>
                              <td colSpan="9" style={{ padding: "14px 8px 18px" }}>
                                <div className="grid two">
                                  <div className="panel" style={{ background: "var(--panel-strong)" }}>
                                    <div className="panel-header">
                                      <h3>Live bookings</h3>
                                      <span className="pill">{user.liveBookings.length} active</span>
                                    </div>
                                    {user.liveBookings.length === 0 ? (
                                      <div className="list-item">
                                        <div>
                                          <strong>No active live bookings</strong>
                                          <span>This user has no currently active trip-linked ticket.</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="list">
                                        {user.liveBookings.map((booking) => (
                                          <div className="list-item" key={`${user.id}-${booking.bookingId}-live`}>
                                            <div>
                                              <strong>{booking.bookingId}</strong>
                                              <span>
                                                {booking.routeCode} · {booking.source} → {booking.destination} · {booking.tripWindow || "--"}
                                              </span>
                                            </div>
                                            <span className={bookingChipClass(booking.tripStatus)}>{booking.tripStatus || "Live"}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="panel" style={{ background: "var(--panel-strong)" }}>
                                    <div className="panel-header">
                                      <h3>Recent history</h3>
                                      <span className="pill">{user.recentHistory.length} recent bookings</span>
                                    </div>
                                    {user.recentHistory.length === 0 ? (
                                      <div className="list-item">
                                        <div>
                                          <strong>No history yet</strong>
                                          <span>This registered user has not booked a ticket yet.</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <table className="table">
                                        <thead>
                                          <tr>
                                            <th>Booking</th>
                                            <th>Trip</th>
                                            <th>Fare</th>
                                            <th>Status</th>
                                            <th>Booked at</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {user.recentHistory.map((booking) => (
                                            <tr key={`${user.id}-${booking.bookingId}-history`}>
                                              <td>
                                                <strong>{booking.bookingId}</strong>
                                                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                                                  {booking.busNumber} · {booking.paymentMode}
                                                </div>
                                              </td>
                                              <td>
                                                {booking.routeCode} · {booking.source} → {booking.destination}
                                                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                                                  {booking.routeName}
                                                </div>
                                              </td>
                                              <td>
                                                Rs {formatMoney(booking.fare)}
                                                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                                                  Pax {booking.passengerCount}
                                                </div>
                                              </td>
                                              <td>
                                                <span className={bookingChipClass(booking.tripStatus || booking.status)}>
                                                  {booking.tripStatus || booking.status}
                                                </span>
                                              </td>
                                              <td>{formatDateTime(booking.bookedAt)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
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

export default PassengerUsersOverview;
