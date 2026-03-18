import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";

const today = () => new Date().toISOString().slice(0, 10);

const monthFromDate = (isoDate) => String(isoDate || today()).slice(0, 7);

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

function PaymentsOverview({ apiBase, token }) {
  const [mode, setMode] = useState("monthly");
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(monthFromDate(today()));
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [period, setPeriod] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activePaymentRow, setActivePaymentRow] = useState(null);
  const [commissionInput, setCommissionInput] = useState("0");
  const [gatewayStage, setGatewayStage] = useState("form");
  const [paying, setPaying] = useState(false);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode });
      if (mode === "daily") params.set("date", date);
      if (mode === "monthly") params.set("month", month);
      if (mode === "custom") {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }

      const response = await fetch(`${apiBase}/api/admin/owners/payments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load owner due payments");

      setSummary(data.summary || null);
      setPayments(data.payments || []);
      setPeriod(data.period || null);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, date, endDate, mode, month, startDate, token]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const currentDue = Number(activePaymentRow?.dueAmount || 0);
  const commissionAmount = Number(commissionInput || 0);
  const netPayout = Number.isFinite(commissionAmount) ? Math.max(currentDue - commissionAmount, 0) : 0;

  const openPaymentPopup = (row) => {
    setActivePaymentRow(row);
    setCommissionInput("0");
    setGatewayStage("form");
  };

  const closePaymentPopup = () => {
    setActivePaymentRow(null);
    setCommissionInput("0");
    setGatewayStage("form");
    setPaying(false);
  };

  const proceedToGateway = () => {
    if (!activePaymentRow) return;
    if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
      showNotice("error", "Commission must be a non-negative number.");
      return;
    }
    if (commissionAmount > currentDue) {
      showNotice("error", "Commission cannot be greater than due amount.");
      return;
    }
    setGatewayStage("gateway");
  };

  const completeVirtualPayment = async () => {
    if (!activePaymentRow) return;
    setPaying(true);
    try {
      const payload = {
        mode,
        date,
        month,
        startDate,
        endDate,
        commissionAmount: commissionAmount || 0,
      };
      const response = await fetch(`${apiBase}/api/admin/owners/${activePaymentRow.owner.id}/payments/virtual-pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Virtual payment failed");
      showNotice("success", `Virtual payment completed. Txn: ${data.settlement?.gatewayTxnRef || "--"}`);
      closePaymentPopup();
      await loadPayments();
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setPaying(false);
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
              <span className="pill">Payments</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/dashboard">Dashboard</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/payments">Payment</Link>
            <Link className="nav-item" to="/buses">Bus entry</Link>
            <Link className="nav-item" to="/depots">Depot entry</Link>
            <Link className="nav-item" to="/drivers">Driver entry</Link>
            <Link className="nav-item" to="/conductors">Conductor entry</Link>
            <Link className="nav-item" to="/bus-crew">Bus crew mapping</Link>
            <Link className="nav-item" to="/routes">Route entry</Link>
            <Link className="nav-item" to="/scheduling">Trip scheduling</Link>
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
                <h1>Owner Due Payments</h1>
                <span className="pill">
                  {period ? `${period.startDate} to ${period.endDate}` : "Period pending"}
                </span>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="btn outline" type="button" onClick={loadPayments}>
                Refresh
              </button>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            <section className="panel">
              <div className="panel-header">
                <h3>Filters</h3>
                <span className="pill">Owner payout period</span>
              </div>
              <div className="inline">
                <label className="field">
                  Mode
                  <select value={mode} onChange={(event) => setMode(event.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {mode === "daily" && (
                  <label className="field">
                    Date
                    <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                  </label>
                )}
                {mode === "monthly" && (
                  <label className="field">
                    Month
                    <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                  </label>
                )}
                {mode === "custom" && (
                  <>
                    <label className="field">
                      Start date
                      <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                    </label>
                    <label className="field">
                      End date
                      <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                    </label>
                  </>
                )}
                <button className="btn primary" type="button" onClick={loadPayments}>
                  Load dues
                </button>
              </div>
            </section>

            <section className="grid three">
              <div className="stat">
                <span>Owners with dues</span>
                <strong>{summary?.owners ?? 0}</strong>
              </div>
              <div className="stat">
                <span>Tickets</span>
                <strong>{summary?.tickets ?? 0}</strong>
              </div>
              <div className="stat">
                <span>Total due amount</span>
                <strong>Rs {formatMoney(summary?.dueAmount ?? 0)}</strong>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Due payment table</h3>
                <span className="pill">{payments.length} owners</span>
              </div>
              {loading ? (
                <div className="list-item">
                  <div>
                    <strong>Loading due payments...</strong>
                  </div>
                </div>
              ) : payments.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No due payment rows found</strong>
                    <span>Try another period or verify owner ticket transactions exist.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th>Username</th>
                      <th>Buses</th>
                      <th>Tickets</th>
                      <th>Payable (Rs)</th>
                      <th>Commission (Rs)</th>
                      <th>Paid (Rs)</th>
                      <th>Due (Rs)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((row) => (
                      <tr key={row.owner?.id}>
                        <td>{row.owner?.name || "--"}</td>
                        <td>{row.owner?.username || "--"}</td>
                        <td>{row.totalBuses ?? 0}</td>
                        <td>{row.ticketsGenerated ?? 0}</td>
                        <td>{formatMoney(row.payableAmount)}</td>
                        <td>{formatMoney(row.commissionAmount)}</td>
                        <td>{formatMoney(row.paidAmount)}</td>
                        <td>{formatMoney(row.dueAmount)}</td>
                        <td>
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => openPaymentPopup(row)}
                            disabled={Number(row.dueAmount || 0) <= 0}
                          >
                            Pay now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </main>
        </div>
      </div>
      {activePaymentRow && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="panel-header">
              <h3>Owner Payment Gateway</h3>
              <button className="btn ghost" type="button" onClick={closePaymentPopup}>
                Close
              </button>
            </div>
            {gatewayStage === "form" ? (
              <div style={{ display: "grid", gap: "12px" }}>
                <div className="list-item">
                  <div>
                    <strong>{activePaymentRow.owner?.name || "--"}</strong>
                    <span>Current due: Rs {formatMoney(activePaymentRow.dueAmount)}</span>
                  </div>
                </div>
                <label className="field">
                  Commission / Charges (Rs)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={commissionInput}
                    onChange={(event) => setCommissionInput(event.target.value)}
                  />
                </label>
                <div className="list-item">
                  <div>
                    <strong>Net payout to owner</strong>
                    <span>Rs {formatMoney(netPayout)}</span>
                  </div>
                </div>
                <button className="btn primary" type="button" onClick={proceedToGateway}>
                  Proceed to Virtual Gateway
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                <div className="list-item">
                  <div>
                    <strong>Virtual Payment Gateway</strong>
                    <span>
                      Pay Rs {formatMoney(netPayout)} to {activePaymentRow.owner?.name || "--"} (commission Rs{" "}
                      {formatMoney(commissionAmount)})
                    </span>
                  </div>
                </div>
                <button className="btn primary" type="button" onClick={completeVirtualPayment} disabled={paying}>
                  {paying ? "Processing..." : "Complete Virtual Payment"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentsOverview;
