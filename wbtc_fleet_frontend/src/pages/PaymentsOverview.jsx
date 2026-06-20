import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";
import { getOpsDate } from "../utils/opsTime.js";

const today = () => getOpsDate();

const monthFromDate = (isoDate) => String(isoDate || today()).slice(0, 7);

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const formatDateRange = (period) =>
  period ? `${period.startDate || "--"} to ${period.endDate || "--"}` : "Period pending";

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
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerDetails, setOwnerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activePaymentRow, setActivePaymentRow] = useState(null);
  const [commissionInput, setCommissionInput] = useState("0");
  const [gatewayStage, setGatewayStage] = useState("form");
  const [paying, setPaying] = useState(false);
  const noticeTimerRef = useRef(null);

  const showNotice = useCallback((type, message) => {
    setNotice({ type, message });
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const buildPeriodParams = useCallback(() => {
    const params = new URLSearchParams({ mode });
    if (mode === "daily") params.set("date", date);
    if (mode === "monthly") params.set("month", month);
    if (mode === "custom") {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    }
    return params;
  }, [date, endDate, mode, month, startDate]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/owners/payments?${buildPeriodParams().toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load owner payment report");

      const rows = data.payments || [];
      setSummary(data.summary || null);
      setPayments(rows);
      setPeriod(data.period || null);
      setSelectedOwnerId((current) => {
        if (current && rows.some((row) => String(row.owner?.id) === String(current))) return current;
        return rows[0]?.owner?.id ? String(rows[0].owner.id) : "";
      });
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, buildPeriodParams, showNotice, token]);

  const loadOwnerDetails = useCallback(
    async (ownerId) => {
      if (!ownerId) {
        setOwnerDetails(null);
        return;
      }

      setDetailsLoading(true);
      try {
        const response = await fetch(
          `${apiBase}/api/admin/owners/${ownerId}/payments/details?${buildPeriodParams().toString()}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(data.message || "Failed to load owner payment breakdown");
        setOwnerDetails(data);
      } catch (error) {
        setOwnerDetails(null);
        showNotice("error", error.message);
      } finally {
        setDetailsLoading(false);
      }
    },
    [apiBase, buildPeriodParams, showNotice, token]
  );

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimerRef.current);
    },
    []
  );

  useEffect(() => {
    loadOwnerDetails(selectedOwnerId);
  }, [loadOwnerDetails, selectedOwnerId]);

  const filteredPayments = useMemo(() => {
    const needle = ownerSearch.trim().toLowerCase();
    if (!needle) return payments;
    return payments.filter((row) => {
      const name = String(row.owner?.name || "").toLowerCase();
      const username = String(row.owner?.username || "").toLowerCase();
      return name.includes(needle) || username.includes(needle);
    });
  }, [ownerSearch, payments]);

  const selectedPaymentRow =
    payments.find((row) => String(row.owner?.id) === String(selectedOwnerId)) || activePaymentRow || null;

  const dateTotals = useMemo(() => {
    const rows = ownerDetails?.dateRows || [];
    return rows.reduce(
      (acc, row) => {
        acc.trips += Number(row.tripCount || 0);
        acc.onlinePax += Number(row.onlinePassengersCount || 0);
        acc.onlineAmount += Number(row.onlineAmount || 0);
        acc.cashPax += Number(row.cashPassengersCount || 0);
        acc.cashAmount += Number(row.cashAmount || 0);
        acc.totalAmount += Number(row.totalAmount || 0);
        return acc;
      },
      { trips: 0, onlinePax: 0, onlineAmount: 0, cashPax: 0, cashAmount: 0, totalAmount: 0 }
    );
  }, [ownerDetails]);

  const tripTotals = useMemo(() => {
    const rows = ownerDetails?.tripRows || [];
    return rows.reduce(
      (acc, row) => {
        acc.onlinePax += Number(row.onlinePassengersCount || 0);
        acc.onlineAmount += Number(row.onlineAmount || 0);
        acc.cashPax += Number(row.cashPassengersCount || 0);
        acc.cashAmount += Number(row.cashAmount || 0);
        acc.totalAmount += Number(row.totalAmount || 0);
        return acc;
      },
      { onlinePax: 0, onlineAmount: 0, cashPax: 0, cashAmount: 0, totalAmount: 0 }
    );
  }, [ownerDetails]);

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
      showNotice("error", "Commission cannot be greater than pending online payout.");
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
      await loadOwnerDetails(activePaymentRow.owner.id);
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
              <p className="sidebar-title">Qfare Fleet</p>
              <span className="pill">Payments</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/dashboard">Dashboard</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/passengers">Passengers</Link>
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
                <h1>Owner Payment Console</h1>
                <span className="pill">{formatDateRange(period)}</span>
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
                <span className="pill">Owner, date, trip reconciliation</span>
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
                <label className="field">
                  Search owner
                  <input
                    type="text"
                    value={ownerSearch}
                    onChange={(event) => setOwnerSearch(event.target.value)}
                    placeholder="Owner name or username"
                  />
                </label>
                <button className="btn primary" type="button" onClick={loadPayments}>
                  Load report
                </button>
              </div>
            </section>

            <section className="grid three">
              <div className="stat stat-up">
                <span>Online collections</span>
                <strong>Rs {formatMoney(summary?.onlineAmount ?? 0)}</strong>
              </div>
              <div className="stat stat-down">
                <span>Offline collections</span>
                <strong>Rs {formatMoney(summary?.cashAmount ?? 0)}</strong>
              </div>
              <div className="stat stat-live">
                <span>Pending owner payout</span>
                <strong>Rs {formatMoney(summary?.dueAmount ?? 0)}</strong>
              </div>
            </section>

            <section className="grid three">
              <div className="stat">
                <span>Owners in period</span>
                <strong>{summary?.owners ?? 0}</strong>
              </div>
              <div className="stat">
                <span>Passengers counted</span>
                <strong>{summary?.tickets ?? 0}</strong>
              </div>
              <div className="stat">
                <span>Total collections</span>
                <strong>Rs {formatMoney(summary?.totalAmount ?? 0)}</strong>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Owner-wise collections</h3>
                <span className="pill">{filteredPayments.length} owners</span>
              </div>
              {loading ? (
                <div className="list-item">
                  <div>
                    <strong>Loading payment report...</strong>
                  </div>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No payment rows found</strong>
                    <span>Try another period or verify ticket ownership snapshots exist.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th>Username</th>
                      <th>Buses</th>
                      <th>Online pax</th>
                      <th>Online (Rs)</th>
                      <th>Offline pax</th>
                      <th>Offline (Rs)</th>
                      <th>Total (Rs)</th>
                      <th>Paid online (Rs)</th>
                      <th>Pending online (Rs)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((row) => {
                      const isActive = String(row.owner?.id) === String(selectedOwnerId);
                      return (
                        <tr
                          key={row.owner?.id}
                          onClick={() => setSelectedOwnerId(String(row.owner?.id || ""))}
                          style={isActive ? { background: "rgba(27, 154, 170, 0.08)" } : undefined}
                        >
                          <td>{row.owner?.name || "--"}</td>
                          <td>{row.owner?.username || "--"}</td>
                          <td>{row.totalBuses ?? 0}</td>
                          <td>{row.onlineTicketsGenerated ?? 0}</td>
                          <td>{formatMoney(row.onlineAmount)}</td>
                          <td>{row.cashTicketsGenerated ?? 0}</td>
                          <td>{formatMoney(row.cashAmount)}</td>
                          <td>{formatMoney(row.totalAmount)}</td>
                          <td>{formatMoney(row.paidAmount)}</td>
                          <td>{formatMoney(row.dueAmount)}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="btn ghost"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedOwnerId(String(row.owner?.id || ""));
                                }}
                              >
                                View
                              </button>
                              <button
                                className="btn primary"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPaymentPopup(row);
                                }}
                                disabled={Number(row.dueAmount || 0) <= 0}
                              >
                                Pay
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel owner-breakdown">
              <div className="panel-header">
                <h3>Selected owner breakdown</h3>
                {ownerDetails?.owner?.name || selectedPaymentRow?.owner?.name ? (
                  <span className="owner-chip">
                    <span className="owner-avatar">
                      {(ownerDetails?.owner?.name || selectedPaymentRow?.owner?.name || "?").charAt(0).toUpperCase()}
                    </span>
                    {ownerDetails?.owner?.name || selectedPaymentRow?.owner?.name}
                  </span>
                ) : (
                  <span className="pill">Choose an owner</span>
                )}
              </div>

              {!selectedOwnerId ? (
                <div className="list-item">
                  <div>
                    <strong>No owner selected</strong>
                    <span>Select a row from the owner-wise table to inspect date-wise and trip-wise collections.</span>
                  </div>
                </div>
              ) : detailsLoading ? (
                <div className="list-item">
                  <div>
                    <strong>Loading owner breakdown...</strong>
                  </div>
                </div>
              ) : !ownerDetails ? (
                <div className="list-item">
                  <div>
                    <strong>Owner details unavailable</strong>
                    <span>Refresh the report and try again.</span>
                  </div>
                </div>
              ) : (
                <div className="grid" style={{ gap: 20 }}>
                  <div className="grid three">
                    <div className="stat stat-up">
                      <span>Owner total collection</span>
                      <strong>Rs {formatMoney(ownerDetails.summary?.totalAmount ?? 0)}</strong>
                    </div>
                    <div className={`stat ${Number(ownerDetails.summary?.dueAmount ?? 0) > 0 ? "stat-down" : "stat-live"}`}>
                      <span>Owner online payout due</span>
                      <strong>
                        Rs {formatMoney(ownerDetails.summary?.dueAmount ?? 0)}
                        {Number(ownerDetails.summary?.dueAmount ?? 0) > 0 ? (
                          <span className="due-flag pending">Pending</span>
                        ) : (
                          <span className="due-flag settled">Settled</span>
                        )}
                      </strong>
                    </div>
                    <div className="stat">
                      <span>Owner passengers</span>
                      <strong>{ownerDetails.summary?.ticketsGenerated ?? 0}</strong>
                    </div>
                  </div>

                  <div className="grid two">
                    <section className="panel" style={{ padding: 0, boxShadow: "none" }}>
                      <div className="panel-header" style={{ padding: "20px 22px 0" }}>
                        <h3>Date-wise collections</h3>
                        <span className="pill">{ownerDetails.dateRows?.length ?? 0} days</span>
                      </div>
                      {ownerDetails.dateRows?.length ? (
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Trips</th>
                              <th>Online pax</th>
                              <th>Online (Rs)</th>
                              <th>Offline pax</th>
                              <th>Offline (Rs)</th>
                              <th>Total (Rs)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ownerDetails.dateRows.map((row) => (
                              <tr key={row.date}>
                                <td>{row.date}</td>
                                <td>{row.tripCount ?? 0}</td>
                                <td>{row.onlinePassengersCount ?? 0}</td>
                                <td>{formatMoney(row.onlineAmount)}</td>
                                <td>{row.cashPassengersCount ?? 0}</td>
                                <td>{formatMoney(row.cashAmount)}</td>
                                <td>{formatMoney(row.totalAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td>Total</td>
                              <td>{dateTotals.trips}</td>
                              <td>{dateTotals.onlinePax}</td>
                              <td>{formatMoney(dateTotals.onlineAmount)}</td>
                              <td>{dateTotals.cashPax}</td>
                              <td>{formatMoney(dateTotals.cashAmount)}</td>
                              <td>{formatMoney(dateTotals.totalAmount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      ) : (
                        <div className="list-item" style={{ margin: 22 }}>
                          <div>
                            <strong>No date-wise collections</strong>
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="panel" style={{ padding: 0, boxShadow: "none" }}>
                      <div className="panel-header" style={{ padding: "20px 22px 0" }}>
                        <h3>Payout history</h3>
                        <span className="pill">{ownerDetails.settlementHistory?.length ?? 0} settlements</span>
                      </div>
                      {ownerDetails.settlementHistory?.length ? (
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Paid at</th>
                              <th>Window</th>
                              <th>Gross (Rs)</th>
                              <th>Commission (Rs)</th>
                              <th>Net (Rs)</th>
                              <th>Txn</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ownerDetails.settlementHistory.map((row) => (
                              <tr key={row.id}>
                                <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "--"}</td>
                                <td>{row.periodStart} to {row.periodEnd}</td>
                                <td>{formatMoney(row.grossDueAmount)}</td>
                                <td>{formatMoney(row.commissionAmount)}</td>
                                <td>
                                  <strong>Rs {formatMoney(row.netPaidAmount)}</strong>
                                  <span className="due-flag settled" style={{ marginLeft: 8 }}>
                                    Paid
                                  </span>
                                </td>
                                <td>{row.gatewayTxnRef || "--"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="list-item" style={{ margin: 22 }}>
                          <div>
                            <strong>No payout history in selected period</strong>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>

                  <section className="panel" style={{ padding: 0, boxShadow: "none" }}>
                    <div className="panel-header" style={{ padding: "20px 22px 0" }}>
                      <h3>Trip-wise collections</h3>
                      <span className="pill">{ownerDetails.tripRows?.length ?? 0} trips</span>
                    </div>
                    {ownerDetails.tripRows?.length ? (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Bus</th>
                            <th>Route</th>
                            <th>Direction</th>
                            <th>Online pax</th>
                            <th>Online (Rs)</th>
                            <th>Offline pax</th>
                            <th>Offline (Rs)</th>
                            <th>Total (Rs)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ownerDetails.tripRows.map((row) => {
                            const directionLower = String(row.direction || "").toLowerCase();
                            return (
                              <tr key={row.tripInstanceId || `${row.tripDate}-${row.busNumber}-${row.routeCode}`}>
                                <td>{row.tripDate || "--"}</td>
                                <td>{row.tripWindow || "--"}</td>
                                <td>{row.busNumber || "--"}</td>
                                <td>{row.routeCode || "--"} · {row.routeName || "Route"}</td>
                                <td>
                                  {row.direction ? (
                                    <span className={`direction-chip ${directionLower === "down" ? "down" : "up"}`}>
                                      {row.direction}
                                    </span>
                                  ) : (
                                    "--"
                                  )}
                                </td>
                                <td>{row.onlinePassengersCount ?? 0}</td>
                                <td>{formatMoney(row.onlineAmount)}</td>
                                <td>{row.cashPassengersCount ?? 0}</td>
                                <td>{formatMoney(row.cashAmount)}</td>
                                <td>{formatMoney(row.totalAmount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={5}>Total</td>
                            <td>{tripTotals.onlinePax}</td>
                            <td>{formatMoney(tripTotals.onlineAmount)}</td>
                            <td>{tripTotals.cashPax}</td>
                            <td>{formatMoney(tripTotals.cashAmount)}</td>
                            <td>{formatMoney(tripTotals.totalAmount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      <div className="list-item" style={{ margin: 22 }}>
                        <div>
                          <strong>No trip-wise collections</strong>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

      {activePaymentRow && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="panel-header">
              <h3>Owner Payout</h3>
              <button className="btn ghost" type="button" onClick={closePaymentPopup}>
                Close
              </button>
            </div>
            {gatewayStage === "form" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div className="list-item">
                  <div>
                    <strong>{activePaymentRow.owner?.name || "--"}</strong>
                    <span>
                      Online collected Rs {formatMoney(activePaymentRow.onlineAmount)} | pending payout Rs{" "}
                      {formatMoney(activePaymentRow.dueAmount)}
                    </span>
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
              <div style={{ display: "grid", gap: 12 }}>
                <div className="list-item">
                  <div>
                    <strong>Virtual Payment Gateway</strong>
                    <span>
                      Pay Rs {formatMoney(netPayout)} to {activePaymentRow.owner?.name || "--"} against online ticket
                      collections.
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
