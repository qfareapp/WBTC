import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OperatorToggle from "./components/OperatorToggle.jsx";
import "./App.css";
import { getOpsDate } from "./utils/opsTime.js";

const roleOptions = ["OWNER", "ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"];

const today = getOpsDate();
const thisMonth = today.slice(0, 7);

const createActivity = (type, message) => ({
  id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  type,
  message,
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
});

function Dashboard({ apiBase, setApiBase, token, setToken, user, setUser, operatorScope, setOperatorScope }) {
  const [notice, setNotice] = useState(null);
  const [activity, setActivity] = useState([]);

  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    username: "",
    password: "",
    role: "VIEWER",
    depotId: "",
  });

  const [otpQuery, setOtpQuery] = useState({
    date: today,
    depotId: "",
    windowMin: "10",
  });
  const [otpSummary, setOtpSummary] = useState(null);
  const [passengerQuery, setPassengerQuery] = useState({
    days: "30",
    months: "6",
    depotId: "",
  });
  const [passengerAnalytics, setPassengerAnalytics] = useState(null);
  const [todaySummary, setTodaySummary] = useState(null);
  const [routeKpiQuery, setRouteKpiQuery] = useState({
    mode: "daily",
    date: today,
    month: thisMonth,
    startDate: today,
    endDate: today,
    depotId: "",
  });
  const [routeKpiData, setRouteKpiData] = useState(null);
  const [kpiDepots, setKpiDepots] = useState([]);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const addActivity = (type, message) => {
    setActivity((prev) => [createActivity(type, message), ...prev].slice(0, 8));
  };

  const apiFetch = async (path, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      const errorMessage = data.message || data.error || `Request failed (${response.status})`;
      throw new Error(errorMessage);
    }

    return data;
  };

  const requireToken = () => {
    if (!token) {
      showNotice("error", "Login required before calling protected routes.");
      return false;
    }
    return true;
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        username: authForm.username,
        password: authForm.password,
      };

      if (authMode === "register") {
        payload.name = authForm.name;
        payload.role = authForm.role;
        payload.depotId = authForm.depotId || null;
      }

      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setToken(data.token || "");
      setUser(data.user || null);
      showNotice("success", authMode === "register" ? "Account created." : "Welcome back.");
      addActivity("auth", `${authMode === "register" ? "Registered" : "Logged in"} as ${data.user?.role || "User"}.`);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const fetchOtpSummary = async ({ date, depotId, windowMin }, { silent = false } = {}) => {
    if (!requireToken()) return null;
    try {
      const query = new URLSearchParams({
        date,
        depotId: depotId || "",
        windowMin: String(windowMin || 10),
        operatorType: operatorScope,
      });
      const data = await apiFetch(`/api/trips/otp-summary?${query.toString()}`);
      setOtpSummary(data);
      if (!silent) {
        showNotice("success", "OTP summary loaded.");
        addActivity("otp", `OTP ${data.overall?.otpPct ?? 0}% for ${data.date}.`);
      }
      return data;
    } catch (error) {
      if (!silent) showNotice("error", error.message);
      return null;
    }
  };

  const handleOtpSubmit = async (event) => {
    event.preventDefault();
    await fetchOtpSummary(otpQuery);
  };

  const fetchPassengerAnalytics = async ({ days, months, depotId }, { silent = false } = {}) => {
    if (!requireToken()) return null;
    try {
      const query = new URLSearchParams({
        days: String(days || 30),
        months: String(months || 6),
        depotId: depotId || "",
        operatorType: operatorScope,
      });
      const data = await apiFetch(`/api/public/bookings/analytics?${query.toString()}`);
      setPassengerAnalytics(data);
      if (!silent) {
        showNotice("success", "Passenger analytics loaded.");
        addActivity("passenger", `Passenger trend loaded (${data.days}d/${data.months}m).`);
      }
      return data;
    } catch (error) {
      if (!silent) showNotice("error", error.message);
      return null;
    }
  };

  const handlePassengerSubmit = async (event) => {
    event.preventDefault();
    await fetchPassengerAnalytics(passengerQuery);
  };

  const fetchRoutePerformance = async (
    { mode, date, month, startDate, endDate, depotId },
    { silent = false } = {}
  ) => {
    if (!requireToken()) return null;
    try {
      const query = new URLSearchParams({
        mode: mode || "daily",
        depotId: depotId || "",
        operatorType: operatorScope,
      });
      if (mode === "daily") query.set("date", date || today);
      if (mode === "monthly") query.set("month", month || thisMonth);
      if (mode === "custom") {
        query.set("startDate", startDate || today);
        query.set("endDate", endDate || today);
      }
      const data = await apiFetch(`/api/routes/performance?${query.toString()}`);
      setRouteKpiData(data);
      if (!silent) {
        showNotice("success", "Route performance loaded.");
        addActivity("route-kpi", `Route KPI loaded (${data.period?.startDate} to ${data.period?.endDate}).`);
      }
      return data;
    } catch (error) {
      if (!silent) showNotice("error", error.message);
      return null;
    }
  };

  const handleRouteKpiSubmit = async (event) => {
    event.preventDefault();
    await fetchRoutePerformance(routeKpiQuery);
  };

  const fetchTodaySummary = async (depotId = "", { silent = true } = {}) => {
    if (!requireToken()) return null;
    try {
      const query = new URLSearchParams({
        date: today,
        depotId: depotId || "",
        operatorType: operatorScope,
      });
      const data = await apiFetch(`/api/trips/today-summary?${query.toString()}`);
      setTodaySummary(data);
      if (!silent) {
        showNotice("success", "Today snapshot loaded.");
        addActivity("summary", `Snapshot loaded for ${data.date}.`);
      }
      return data;
    } catch (error) {
      if (!silent) showNotice("error", error.message);
      return null;
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchTodaySummary(otpQuery.depotId || passengerQuery.depotId, { silent: true });
    fetchOtpSummary(
      {
        date: otpQuery.date,
        depotId: otpQuery.depotId,
        windowMin: otpQuery.windowMin,
      },
      { silent: true }
    );
    fetchPassengerAnalytics(
      {
        days: passengerQuery.days,
        months: passengerQuery.months,
        depotId: passengerQuery.depotId,
      },
      { silent: true }
    );
    fetchRoutePerformance(
      {
        mode: routeKpiQuery.mode,
        date: routeKpiQuery.date,
        month: routeKpiQuery.month,
        startDate: routeKpiQuery.startDate,
        endDate: routeKpiQuery.endDate,
        depotId: routeKpiQuery.depotId,
      },
      { silent: true }
    );
  }, [
    token,
    operatorScope,
    otpQuery.date,
    otpQuery.depotId,
    otpQuery.windowMin,
    passengerQuery.days,
    passengerQuery.months,
    passengerQuery.depotId,
    routeKpiQuery.mode,
    routeKpiQuery.date,
    routeKpiQuery.month,
    routeKpiQuery.startDate,
    routeKpiQuery.endDate,
    routeKpiQuery.depotId,
  ]);

  useEffect(() => {
    if (!token) return;
    const loadKpiDepots = async () => {
      try {
        const query = new URLSearchParams({ operatorType: operatorScope });
        const data = await apiFetch(`/api/depots?${query.toString()}`);
        const depots = data.depots || [];
        setKpiDepots(depots);
        if (routeKpiQuery.depotId && !depots.some((item) => item._id === routeKpiQuery.depotId)) {
          setRouteKpiQuery((prev) => ({ ...prev, depotId: "" }));
        }
      } catch {
        setKpiDepots([]);
      }
    };
    loadKpiDepots();
  }, [token, operatorScope]);

  const formatGrowth = (value) => {
    if (value === null || value === undefined) return "--";
    return `${value > 0 ? "+" : ""}${value}%`;
  };

  const formatKm = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
  };

  const formatCurrency = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return num.toFixed(2);
  };

  const renderPassengerBars = (points, type) => {
    if (!points || points.length === 0) {
      return <p style={{ margin: 0, color: "var(--muted)" }}>No data available.</p>;
    }

    const maxValue = Math.max(...points.map((item) => item.passengers), 1);

    return (
      <div className="mini-chart">
        <div className="mini-chart-bars">
          {points.map((item) => {
            const heightPct = Math.max(6, (item.passengers / maxValue) * 100);
            const growth = type === "monthly" ? formatGrowth(item.growthPct) : null;
            return (
              <div className="mini-bar-wrap" key={item.label}>
                <div className="mini-bar-value">{item.passengers}</div>
                <div
                  className={`mini-bar ${type === "monthly" ? "monthly" : "daily"}`}
                  style={{ height: `${heightPct}%` }}
                  title={`${item.label}: ${item.passengers}`}
                />
                <span className="mini-bar-label">{item.label.slice(type === "monthly" ? 5 : 8)}</span>
                {type === "monthly" && <span className="mini-bar-growth">{growth}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
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
              <span className="pill">Ops console</span>
            </div>
          </div>
          <nav className="nav">
            <button className="nav-item" type="button">Overview</button>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/buses">Bus</Link>
            <Link className="nav-item" to="/depots">Depot</Link>
            <Link className="nav-item" to="/drivers">Driver</Link>
            <Link className="nav-item" to="/conductors">Conductor</Link>
            <Link className="nav-item" to="/bus-crew">Bus Crew</Link>
            <Link className="nav-item" to="/routes">Route</Link>
            <Link className="nav-item" to="/scheduling">Trip scheduling</Link>
            <Link className="nav-item" to="/payments">Payment</Link>
            <Link className="nav-item live-nav" to="/live-trips">Live trips</Link>
            <Link className="nav-item" to="/privacy-policy">Privacy Policy</Link>
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
              Clear session
            </button>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <h1>WBTC Fleet Ops</h1>
                <span className="pill">{operatorScope} operations console</span>
              </div>
            </div>
            <div className="topbar-actions">
              <OperatorToggle value={operatorScope} onChange={setOperatorScope} />
              <span className="pill">{user?.name || "Guest"}</span>
              <span className="pill">Role: {user?.role || "VIEWER"}</span>
            </div>
          </header>

          <main className="main">
        {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

        <section className="panel today-snapshot reveal" style={{ "--delay": "40ms" }}>
          <div className="panel-header">
            <h3>Today Snapshot</h3>
            <span className="pill">
              {operatorScope} | {new Date().toLocaleDateString(undefined, {
                weekday: "short",
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="grid three">
            <div className="stat">
              <span>Buses (Total / Active / Breakdown)</span>
              <strong>
                {todaySummary
                  ? `${todaySummary.buses?.total ?? 0} / ${todaySummary.buses?.active ?? 0} / ${todaySummary.buses?.breakdown ?? 0}`
                  : "--"}
              </strong>
            </div>
            <div className="stat">
              <span>Drivers (Total / On Duty)</span>
              <strong>
                {todaySummary
                  ? `${todaySummary.drivers?.total ?? 0} / ${todaySummary.drivers?.onDuty ?? 0}`
                  : "--"}
              </strong>
            </div>
            <div className="stat">
              <span>Trips (Live / Scheduled / Completed / Cancelled)</span>
              <strong>
                {todaySummary
                  ? `${todaySummary.trips?.live ?? 0} / ${todaySummary.trips?.scheduled ?? 0} / ${todaySummary.trips?.completed ?? 0} / ${todaySummary.trips?.cancelled ?? 0}`
                  : "--"}
              </strong>
            </div>
              <div className="stat">
                <span>Passengers travelled today (till now)</span>
                <strong>{todaySummary ? `${todaySummary.passengersToday ?? 0}` : "--"}</strong>
              </div>
              <div className="stat">
                <span>Total KM covered today</span>
                <strong>{todaySummary ? `${formatKm(todaySummary.totalKmCoveredToday)} km` : "--"}</strong>
              </div>
            </div>
          </section>

        <section className="grid three">
          <div className="stat reveal" style={{ "--delay": "300ms" }}>
            <span>Overall OTP</span>
            <strong>{otpSummary ? `${otpSummary.overall?.otpPct ?? 0}%` : "--"}</strong>
            <span>
              {otpSummary
                ? `On-time ${otpSummary.overall?.onTimeTrips ?? 0}/${otpSummary.overall?.eligibleTrips ?? 0}`
                : "Fetch OTP to view"}
            </span>
          </div>
          <div className="stat reveal" style={{ "--delay": "360ms" }}>
            <span>Trip Completion</span>
            <strong>{otpSummary ? `${otpSummary.completion?.completionRatePct ?? 0}%` : "--"}</strong>
            <span>
              {otpSummary
                ? `Executed ${otpSummary.completion?.executedTrips ?? 0}/${otpSummary.completion?.plannedTrips ?? 0}`
                : "Fetch OTP to view"}
            </span>
          </div>
          <div className="stat reveal" style={{ "--delay": "420ms" }}>
            <span>Fleet Utilization</span>
            <strong>{otpSummary ? `${otpSummary.fleet?.utilizationPct ?? 0}%` : "--"}</strong>
            <span>
              {otpSummary
                ? `Active ${otpSummary.fleet?.activeBuses ?? 0}/${otpSummary.fleet?.totalFleet ?? 0}`
                : "Fetch OTP to view"}
            </span>
          </div>
          <div className="stat reveal" style={{ "--delay": "480ms" }}>
            <span>Passenger Growth (MoM)</span>
            <strong>{passengerAnalytics ? formatGrowth(passengerAnalytics.monthlyGrowthPct) : "--"}</strong>
            <span>
              {passengerAnalytics
                ? `Current month: ${passengerAnalytics.currentMonthPassengers ?? 0}`
                : "Fetch passenger trends"}
            </span>
          </div>
        </section>

        <section className="grid two">
          {!token && (
            <div className="panel reveal" style={{ "--delay": "360ms" }}>
              <div className="panel-header">
                <h3>System access</h3>
                <div>
                  <button className="btn ghost" type="button" onClick={() => setAuthMode("login")}>
                    Login
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setAuthMode("register")}>
                    Register
                  </button>
                </div>
              </div>
              <form className="form" onSubmit={handleAuthSubmit}>
                {authMode === "register" && (
                  <label className="field">
                    Name
                    <input
                      value={authForm.name}
                      onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                      placeholder="Full name"
                    />
                  </label>
                )}
                <label className="field">
                  Username
                  <input
                    value={authForm.username}
                    onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })}
                    placeholder="Operator username"
                  />
                </label>
                <label className="field">
                  Password
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                    placeholder="Password"
                  />
                </label>
                {authMode === "register" && (
                  <div className="inline">
                    <label className="field">
                      Role
                      <select
                        value={authForm.role}
                        onChange={(event) => setAuthForm({ ...authForm, role: event.target.value })}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Depot ID (optional)
                      <input
                        value={authForm.depotId}
                        onChange={(event) => setAuthForm({ ...authForm, depotId: event.target.value })}
                        placeholder="Mongo object id"
                      />
                    </label>
                  </div>
                )}
                <button className="btn primary" type="submit">
                  {authMode === "register" ? "Create account" : "Sign in"}
                </button>
              </form>
            </div>
          )}

        </section>

        <section className="panel reveal" style={{ "--delay": "660ms" }}>
          <div className="panel-header">
            <h3>On-time performance (OTP)</h3>
            <span className="pill">Scheduled vs actual</span>
          </div>
          <form className="form" onSubmit={handleOtpSubmit}>
            <div className="inline">
              <label className="field">
                Date
                <input
                  type="date"
                  value={otpQuery.date}
                  onChange={(event) => setOtpQuery({ ...otpQuery, date: event.target.value })}
                />
              </label>
              <label className="field">
                Depot ID
                <input
                  value={otpQuery.depotId}
                  onChange={(event) => setOtpQuery({ ...otpQuery, depotId: event.target.value })}
                  placeholder="Depot id (optional for admin)"
                />
              </label>
              <label className="field">
                Grace window (min)
                <input
                  type="number"
                  min="0"
                  value={otpQuery.windowMin}
                  onChange={(event) => setOtpQuery({ ...otpQuery, windowMin: event.target.value })}
                />
              </label>
            </div>
            <button className="btn primary" type="submit">
              Fetch OTP
            </button>
          </form>
            {otpSummary && (
              <div className="grid three" style={{ marginTop: "16px" }}>
                <div className="stat">
                  <span>Fleet utilization</span>
                  <strong>{otpSummary.fleet?.utilizationPct ?? 0}%</strong>
                  <span>{`Active ${otpSummary.fleet?.activeBuses ?? 0}/${otpSummary.fleet?.totalFleet ?? 0}`}</span>
                </div>
                <div className="stat">
                  <span>Trip completion rate</span>
                  <strong>{otpSummary.completion?.completionRatePct ?? 0}%</strong>
                  <span>{`${otpSummary.completion?.executedTrips ?? 0}/${otpSummary.completion?.plannedTrips ?? 0} executed`}</span>
                  <span>{`Skipped: ${otpSummary.completion?.skippedTrips ?? 0}`}</span>
                </div>
                <div className="stat">
                  <span>Overall OTP</span>
                  <strong>{otpSummary.overall?.otpPct ?? 0}%</strong>
                  <span>{`${otpSummary.overall?.onTimeTrips ?? 0}/${otpSummary.overall?.eligibleTrips ?? 0} trips`}</span>
                </div>
              <div className="stat">
                <span>Departure OTP</span>
                <strong>{otpSummary.departure?.otpPct ?? 0}%</strong>
                <span>{`${otpSummary.departure?.onTimeTrips ?? 0}/${otpSummary.departure?.eligibleTrips ?? 0} trips`}</span>
              </div>
              <div className="stat">
                <span>Arrival OTP</span>
                <strong>{otpSummary.arrival?.otpPct ?? 0}%</strong>
                <span>{`${otpSummary.arrival?.onTimeTrips ?? 0}/${otpSummary.arrival?.eligibleTrips ?? 0} trips`}</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel reveal" style={{ "--delay": "720ms" }}>
          <div className="panel-header">
            <h3>Passenger booking trends</h3>
            <span className="pill">Daily + Monthly growth</span>
          </div>
          <form className="form" onSubmit={handlePassengerSubmit}>
            <div className="inline">
              <label className="field">
                Daily window (days)
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={passengerQuery.days}
                  onChange={(event) => setPassengerQuery({ ...passengerQuery, days: event.target.value })}
                />
              </label>
              <label className="field">
                Monthly window (months)
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={passengerQuery.months}
                  onChange={(event) => setPassengerQuery({ ...passengerQuery, months: event.target.value })}
                />
              </label>
              <label className="field">
                Depot ID
                <input
                  value={passengerQuery.depotId}
                  onChange={(event) => setPassengerQuery({ ...passengerQuery, depotId: event.target.value })}
                  placeholder="Depot id (optional for admin)"
                />
              </label>
            </div>
            <button className="btn primary" type="submit">
              Load passenger trends
            </button>
          </form>
          {passengerAnalytics && (
            <div className="grid two" style={{ marginTop: "16px" }}>
              <div className="panel">
                <div className="panel-header">
                  <h3>Daily passengers</h3>
                  <span className="pill">Last {passengerAnalytics.days} days</span>
                </div>
                {renderPassengerBars(passengerAnalytics.daily, "daily")}
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h3>Monthly passengers</h3>
                  <span className="pill">MoM: {formatGrowth(passengerAnalytics.monthlyGrowthPct)}</span>
                </div>
                {renderPassengerBars(passengerAnalytics.monthly, "monthly")}
              </div>
            </div>
          )}
        </section>

        <section className="panel reveal" style={{ "--delay": "760ms" }}>
          <div className="panel-header">
            <h3>Route-wise performance KPI</h3>
            <span className="pill">{operatorScope} routes</span>
          </div>
          <form className="form" onSubmit={handleRouteKpiSubmit}>
            <div className="inline">
              <label className="field">
                Period type
                <select
                  value={routeKpiQuery.mode}
                  onChange={(event) => setRouteKpiQuery({ ...routeKpiQuery, mode: event.target.value })}
                >
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="field">
                Depot
                <select
                  value={routeKpiQuery.depotId}
                  onChange={(event) => setRouteKpiQuery({ ...routeKpiQuery, depotId: event.target.value })}
                >
                  <option value="">All depots</option>
                  {kpiDepots.map((depot) => (
                    <option key={depot._id} value={depot._id}>
                      {depot.depotName} ({depot.depotCode})
                    </option>
                  ))}
                </select>
              </label>
              {routeKpiQuery.mode === "daily" && (
                <label className="field">
                  Date
                  <input
                    type="date"
                    value={routeKpiQuery.date}
                    onChange={(event) => setRouteKpiQuery({ ...routeKpiQuery, date: event.target.value })}
                  />
                </label>
              )}
              {routeKpiQuery.mode === "monthly" && (
                <label className="field">
                  Month
                  <input
                    type="month"
                    value={routeKpiQuery.month}
                    onChange={(event) => setRouteKpiQuery({ ...routeKpiQuery, month: event.target.value })}
                  />
                </label>
              )}
              {routeKpiQuery.mode === "custom" && (
                <>
                  <label className="field">
                    Start date
                    <input
                      type="date"
                      value={routeKpiQuery.startDate}
                      onChange={(event) => setRouteKpiQuery({ ...routeKpiQuery, startDate: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    End date
                    <input
                      type="date"
                      value={routeKpiQuery.endDate}
                      onChange={(event) => setRouteKpiQuery({ ...routeKpiQuery, endDate: event.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
            <button className="btn primary" type="submit">
              Load route KPI
            </button>
          </form>
          {routeKpiData && (
            <div style={{ marginTop: "16px", display: "grid", gap: "16px" }}>
              <div className="grid three">
                <div className="stat">
                  <span>Tickets generated</span>
                  <strong>{routeKpiData.summary?.totalTickets ?? 0}</strong>
                </div>
                <div className="stat">
                  <span>Sales amount</span>
                  <strong>Rs {formatCurrency(routeKpiData.summary?.totalSalesAmount)}</strong>
                </div>
                <div className="stat">
                  <span>Avg ticket price</span>
                  <strong>Rs {formatCurrency(routeKpiData.summary?.avgTicketPrice)}</strong>
                </div>
                <div className="stat">
                  <span>Trip completion</span>
                  <strong>{routeKpiData.summary?.completionRatePct ?? 0}%</strong>
                </div>
                <div className="stat">
                  <span>Tickets per trip</span>
                  <strong>{routeKpiData.summary?.avgTicketsPerTrip ?? 0}</strong>
                </div>
                <div className="stat">
                  <span>Revenue per trip</span>
                  <strong>Rs {formatCurrency(routeKpiData.summary?.avgRevenuePerTrip)}</strong>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h3>Route performance table</h3>
                  <span className="pill">
                    {routeKpiData.period?.startDate} to {routeKpiData.period?.endDate}
                  </span>
                </div>
                {routeKpiData.routes?.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Tickets</th>
                        <th>Sales</th>
                        <th>Avg fare</th>
                        <th>Trips</th>
                        <th>Completion</th>
                        <th>T/Trip</th>
                        <th>Rev/Trip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routeKpiData.routes.map((row) => (
                        <tr key={row.routeId || row.routeCode}>
                          <td>{row.routeCode} - {row.routeName}</td>
                          <td>{row.ticketsGenerated}</td>
                          <td>Rs {formatCurrency(row.salesAmount)}</td>
                          <td>Rs {formatCurrency(row.avgTicketPrice)}</td>
                          <td>{row.tripsTotal}</td>
                          <td>{row.completionRatePct}%</td>
                          <td>{row.ticketsPerTrip}</td>
                          <td>Rs {formatCurrency(row.revenuePerTrip)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="list-item">
                    <div>
                      <strong>No route KPI data</strong>
                      <span>Try another date/month/custom range or verify route/ticket data exists.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="panel reveal" style={{ "--delay": "780ms" }}>
          <div className="panel-header">
            <h3>Activity feed</h3>
            <span className="pill">Latest actions</span>
          </div>
          <div className="timeline">
            {activity.length === 0 ? (
              <div className="timeline-item">
                <p>No activity yet. Run a workflow to populate this feed.</p>
                <span>Actions will appear here in real time.</span>
              </div>
            ) : (
              activity.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <p>{item.message}</p>
                  <span>
                    {item.time} - {item.type}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;




