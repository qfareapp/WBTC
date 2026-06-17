import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import html2pdf from "html2pdf.js";
import "../App.css";
import { getOpsDate } from "../utils/opsTime.js";
import { ONE20MINUTES_LOGO_DATA_URI } from "../assets/one20minutesLogo.js";

const today = getOpsDate();
const thisMonth = today.slice(0, 7);

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const formatDisplayDate = (value) => {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-IN");
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toDateOnlyValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

function OwnerBilling({ apiBase, token, user, setToken, setUser }) {
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState({
    mode: "monthly",
    date: today,
    month: thisMonth,
    startDate: today,
    endDate: today,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const noticeTimerRef = useRef(null);

  const showNotice = useCallback((type, message) => {
    setNotice({ type, message });
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimerRef.current);
    },
    []
  );

  const apiFetch = async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(payload.message || "Request failed");
    return payload;
  };

  const buildQuery = () => {
    const params = new URLSearchParams({ mode: query.mode });
    if (query.mode === "daily") params.set("date", query.date);
    if (query.mode === "monthly") params.set("month", query.month);
    if (query.mode === "custom") {
      params.set("startDate", query.startDate);
      params.set("endDate", query.endDate);
    }
    return params.toString();
  };

  const loadBilling = useCallback(
    async ({ silent = false } = {}) => {
      setLoading(true);
      try {
        const payload = await apiFetch(`/api/owner/billing?${buildQuery()}`);
        setData(payload);
        setLastSyncAt(new Date());
        if (!silent) showNotice("success", "Billing data loaded.");
      } catch (error) {
        showNotice("error", error.message);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, query.mode, query.date, query.month, query.startDate, query.endDate, token, showNotice]
  );

  useEffect(() => {
    loadBilling({ silent: true });
  }, [loadBilling]);

  const summary = data?.summary || {};
  const dateRows = useMemo(() => data?.dateRows || [], [data]);
  const tripRows = useMemo(() => data?.tripRows || [], [data]);
  const settlementHistory = useMemo(() => data?.settlementHistory || [], [data]);

  const downloadSettlementInvoice = useCallback(
    async (settlement) => {
      if (!settlement) return;
      const settlementKey = settlement.id || `${settlement.periodStart}-${settlement.periodEnd}`;
      setDownloadingId(settlementKey);

      const startDate = settlement.periodStart;
      const endDate = settlement.periodEnd;
      const filteredTripRows = tripRows.filter((row) => {
        const tripDate = toDateOnlyValue(row.tripDate);
        return tripDate && tripDate >= startDate && tripDate <= endDate;
      });
      const filteredDateRows = dateRows.filter((row) => row.date >= startDate && row.date <= endDate);

      const tripTotals = filteredTripRows.reduce(
        (acc, row) => {
          acc.onlinePassengersCount += Number(row.onlinePassengersCount || 0);
          acc.cashPassengersCount += Number(row.cashPassengersCount || 0);
          acc.onlineAmount += Number(row.onlineAmount || 0);
          acc.cashAmount += Number(row.cashAmount || 0);
          acc.totalAmount += Number(row.totalAmount || 0);
          if (row.busNumber) acc.busNumbers.add(row.busNumber);
          return acc;
        },
        {
          onlinePassengersCount: 0,
          cashPassengersCount: 0,
          onlineAmount: 0,
          cashAmount: 0,
          totalAmount: 0,
          busNumbers: new Set(),
        }
      );

      const tripsCovered = filteredTripRows.length;
      const busesCovered = tripTotals.busNumbers.size;
      const invoiceNumber = `SET-${String(settlement.id || "").slice(-8).toUpperCase() || "NA"}`;
      const paymentDate = settlement.createdAt ? new Date(settlement.createdAt).toLocaleString("en-IN") : "--";
      const settlementDate = settlement.createdAt ? new Date(settlement.createdAt).toISOString().slice(0, 10) : "--";
      const transactionRef = settlement.gatewayTxnRef || "--";
      const payoutAccount = "----";
      const paymentMode = settlement.gatewayMode === "VIRTUAL" ? "Bank Transfer" : settlement.gatewayMode || "--";
      const ownerName = user?.name || "Owner";
      const ownerUsername = user?.username || "--";
      const statusRaw = String(settlement.status || "SUCCESS").toUpperCase();
      const statusModifier = statusRaw === "FAILED" ? "failed" : "success";
      const statusLabel = statusRaw === "FAILED" ? "Failed" : "Paid";
      const coveredDays = filteredDateRows.length;

      const annexureRows = filteredTripRows.length
        ? filteredTripRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.tripDate || "--")}</td>
                  <td>${escapeHtml(row.tripInstanceId || "--")}</td>
                  <td>${escapeHtml(row.busNumber || "--")}</td>
                  <td>${escapeHtml(`${row.routeCode || "--"} - ${row.routeName || "Route"}`)}</td>
                  <td class="num">${escapeHtml(row.onlinePassengersCount ?? 0)}</td>
                  <td class="num">Rs ${escapeHtml(formatMoney(row.onlineAmount))}</td>
                  <td class="num">${escapeHtml(row.cashPassengersCount ?? 0)}</td>
                  <td class="num">Rs ${escapeHtml(formatMoney(row.cashAmount))}</td>
                </tr>`
            )
            .join("")
        : `
          <tr>
            <td colspan="8" style="text-align:center;">No trip-level rows available for this settlement period.</td>
          </tr>`;

      const invoiceHtml = `
        <div class="invoice-doc">
          <style>
            .invoice-doc { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; width: 760px; margin: 0 auto; padding: 30px 34px; background: #ffffff; box-sizing: border-box; }
            .invoice-doc * { box-sizing: border-box; }
            .inv-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 16px; border-bottom: 4px solid #f47b20; }
            .inv-logo-block { display: flex; flex-direction: column; gap: 8px; }
            .inv-logo-block img { height: 54px; object-fit: contain; }
            .inv-company-line { font-size: 11px; color: #5d687a; line-height: 1.5; max-width: 320px; }
            .inv-title-block { text-align: right; }
            .inv-title { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #1b4f9c; font-weight: 700; margin: 0 0 6px; }
            .inv-number { font-size: 20px; font-weight: 800; color: #1f2937; margin: 0 0 8px; }
            .inv-status { display: inline-flex; padding: 4px 14px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
            .inv-status.success { background: rgba(22, 163, 74, 0.14); color: #166534; }
            .inv-status.failed { background: rgba(220, 38, 38, 0.14); color: #991b1b; }
            .inv-meta-strip { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 18px; padding: 12px 16px; background: #fdf6ee; border: 1px solid #f6d9b8; border-radius: 10px; page-break-inside: avoid; }
            .inv-meta-item { min-width: 130px; }
            .inv-meta-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #9a6a3a; margin: 0 0 2px; }
            .inv-meta-value { font-size: 12.5px; font-weight: 700; color: #1f2937; margin: 0; }
            .inv-parties { display: flex; gap: 16px; margin-top: 20px; page-break-inside: avoid; }
            .inv-party-card { flex: 1; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; background: #fafafa; }
            .inv-party-card h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #1b4f9c; }
            .inv-party-card p { margin: 2px 0; font-size: 12px; color: #374151; }
            .inv-party-card p strong { color: #111827; }
            .inv-section-title { font-size: 13px; font-weight: 700; color: #1f2937; margin: 22px 0 10px; padding-left: 10px; border-left: 4px solid #1b9aaa; }
            .inv-stats-grid { display: flex; gap: 10px; flex-wrap: wrap; page-break-inside: avoid; }
            .inv-stat { flex: 1; min-width: 105px; border-radius: 10px; padding: 10px 12px; border: 1px solid #e5e7eb; }
            .inv-stat span { display: block; font-size: 9.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
            .inv-stat strong { font-size: 14px; color: #111827; }
            .inv-stat.orange { background: rgba(244, 123, 32, 0.08); border-color: rgba(244, 123, 32, 0.3); }
            .inv-stat.teal { background: rgba(27, 154, 170, 0.08); border-color: rgba(27, 154, 170, 0.3); }
            table.inv-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            table.inv-table th, table.inv-table td { padding: 8px 10px; font-size: 11px; border-bottom: 1px solid #eef0f3; text-align: left; }
            table.inv-table th { background: #1b4f9c; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.03em; }
            table.inv-table tbody tr { page-break-inside: avoid; }
            table.inv-table tbody tr:nth-child(even) { background: #f8fafc; }
            table.inv-table td.num, table.inv-table th.num { text-align: right; }
            table.inv-table tfoot td { font-weight: 700; background: #eef2f7; border-top: 2px solid #1b4f9c; border-bottom: none; }
            .inv-summary-table { width: 62%; margin-left: auto; margin-top: 6px; border-collapse: collapse; page-break-inside: avoid; }
            .inv-summary-table td { padding: 7px 10px; font-size: 12.5px; border-bottom: 1px solid #eef0f3; }
            .inv-summary-table td:first-child { color: #4b5563; }
            .inv-summary-table td:last-child { text-align: right; font-weight: 600; color: #111827; }
            .inv-summary-table tr.total td { border-top: 2px solid #1b4f9c; border-bottom: none; padding-top: 10px; }
            .inv-summary-table tr.total td:first-child { font-size: 13.5px; font-weight: 700; color: #1b4f9c; }
            .inv-summary-table tr.total td:last-child { font-size: 17px; font-weight: 800; color: #1b4f9c; }
            .inv-footer { margin-top: 26px; padding-top: 14px; border-top: 1px dashed #d1d5db; font-size: 10.5px; color: #6b7280; line-height: 1.6; page-break-inside: avoid; }
            .inv-footer p { margin: 2px 0; }
          </style>

          <div class="inv-header">
            <div class="inv-logo-block">
              <img src="${ONE20MINUTES_LOGO_DATA_URI}" alt="One20Minutes" />
              <div class="inv-company-line">9/J Raipur Road East, Jadavpur, Kolkata - 700032, West Bengal<br/>Support: 9800162412</div>
            </div>
            <div class="inv-title-block">
              <p class="inv-title">Owner Settlement Invoice</p>
              <p class="inv-number">${escapeHtml(invoiceNumber)}</p>
              <span class="inv-status ${statusModifier}">${escapeHtml(statusLabel)}</span>
            </div>
          </div>

          <div class="inv-meta-strip">
            <div class="inv-meta-item"><p class="inv-meta-label">Invoice date</p><p class="inv-meta-value">${escapeHtml(settlementDate)}</p></div>
            <div class="inv-meta-item"><p class="inv-meta-label">Settlement period</p><p class="inv-meta-value">${escapeHtml(startDate)} to ${escapeHtml(endDate)}</p></div>
            <div class="inv-meta-item"><p class="inv-meta-label">Payment date</p><p class="inv-meta-value">${escapeHtml(paymentDate)}</p></div>
            <div class="inv-meta-item"><p class="inv-meta-label">Payment mode</p><p class="inv-meta-value">${escapeHtml(paymentMode)}</p></div>
            <div class="inv-meta-item"><p class="inv-meta-label">Txn reference</p><p class="inv-meta-value">${escapeHtml(transactionRef)}</p></div>
          </div>

          <div class="inv-parties">
            <div class="inv-party-card">
              <h4>Platform</h4>
              <p><strong>One20Minutes</strong></p>
              <p>9/J Raipur Road East, Jadavpur,<br/>Kolkata - 700032, West Bengal</p>
              <p>Support: 9800162412</p>
              <p>GSTIN: --</p>
            </div>
            <div class="inv-party-card">
              <h4>Owner / Payee</h4>
              <p><strong>${escapeHtml(ownerName)}</strong></p>
              <p>Owner ID: ${escapeHtml(ownerUsername)}</p>
              <p>Payout A/c (last 4): ${escapeHtml(payoutAccount)}</p>
              <p>Settlement batch: ${escapeHtml(settlement.id || "--")}</p>
            </div>
          </div>

          <p class="inv-section-title">Operational summary</p>
          <div class="inv-stats-grid">
            <div class="inv-stat teal"><span>Buses covered</span><strong>${escapeHtml(busesCovered)}</strong></div>
            <div class="inv-stat teal"><span>Trips covered</span><strong>${escapeHtml(tripsCovered)}</strong></div>
            <div class="inv-stat orange"><span>Online tickets</span><strong>${escapeHtml(tripTotals.onlinePassengersCount)}</strong></div>
            <div class="inv-stat orange"><span>Offline tickets</span><strong>${escapeHtml(tripTotals.cashPassengersCount)}</strong></div>
          </div>
          <div class="inv-stats-grid" style="margin-top: 10px;">
            <div class="inv-stat orange"><span>Online collection</span><strong>Rs ${escapeHtml(formatMoney(tripTotals.onlineAmount))}</strong></div>
            <div class="inv-stat orange"><span>Offline collection</span><strong>Rs ${escapeHtml(formatMoney(tripTotals.cashAmount))}</strong></div>
            <div class="inv-stat teal"><span>Total collection</span><strong>Rs ${escapeHtml(formatMoney(tripTotals.totalAmount))}</strong></div>
          </div>

          <p class="inv-section-title">Amount breakdown</p>
          <table class="inv-summary-table">
            <tbody>
              <tr><td>Gross payable amount</td><td>Rs ${escapeHtml(formatMoney(settlement.grossDueAmount))}</td></tr>
              <tr><td>Commission / platform fee</td><td>- Rs ${escapeHtml(formatMoney(settlement.commissionAmount))}</td></tr>
              <tr><td>Gateway charges</td><td>Rs 0.00</td></tr>
              <tr><td>Tax / TDS</td><td>Rs 0.00</td></tr>
              <tr><td>Other deductions</td><td>Rs 0.00</td></tr>
              <tr class="total"><td>Net paid to owner</td><td>Rs ${escapeHtml(formatMoney(settlement.netPaidAmount))}</td></tr>
            </tbody>
          </table>

          <p class="inv-section-title">Trip-wise annexure</p>
          <table class="inv-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Trip ID</th>
                <th>Bus</th>
                <th>Route</th>
                <th class="num">Online pax</th>
                <th class="num">Online amt</th>
                <th class="num">Offline pax</th>
                <th class="num">Offline amt</th>
              </tr>
            </thead>
            <tbody>${annexureRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="4">Total</td>
                <td class="num">${escapeHtml(tripTotals.onlinePassengersCount)}</td>
                <td class="num">Rs ${escapeHtml(formatMoney(tripTotals.onlineAmount))}</td>
                <td class="num">${escapeHtml(tripTotals.cashPassengersCount)}</td>
                <td class="num">Rs ${escapeHtml(formatMoney(tripTotals.cashAmount))}</td>
              </tr>
            </tfoot>
          </table>

          <div class="inv-footer">
            <p>Offline cash collected on bus is shown for reporting and may not be paid by the platform.</p>
            <p>This is a system-generated statement and does not require a physical signature.</p>
            <p>Dispute window / support contact: 9800162412.</p>
          </div>
        </div>`;

      // `position: fixed` is rendered relative to html2canvas's internal clone
      // viewport, not the real page, so a far off-screen fixed element ends up
      // outside the renderable area and the PDF comes out blank. `absolute`
      // keeps it part of normal document flow (just shifted out of view),
      // which html2canvas captures correctly.
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "-10000px";
      container.innerHTML = invoiceHtml;
      document.body.appendChild(container);

      // Let the browser paint the (off-screen) content, including the
      // base64 logo image, before html2canvas captures it.
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

      try {
        const target = container.querySelector(".invoice-doc") || container;
        await html2pdf()
          .set({
            margin: [10, 8, 12, 8],
            filename: `owner-settlement-${invoiceNumber}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              backgroundColor: "#ffffff",
              scrollX: 0,
              scrollY: 0,
              windowWidth: target.scrollWidth,
              windowHeight: target.scrollHeight,
            },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            pagebreak: { mode: ["css", "legacy"] },
          })
          .from(target)
          .save();
        showNotice("success", `Invoice PDF downloaded for ${coveredDays || 0} billing day(s).`);
      } catch (error) {
        showNotice("error", error?.message || "Failed to generate invoice PDF.");
      } finally {
        container.remove();
        setDownloadingId(null);
      }
    },
    [dateRows, showNotice, tripRows, user?.name, user?.username]
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
              <p className="sidebar-title">Owner Fleet</p>
              <span className="pill">Billing</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/owner">Fleet KPI</Link>
            <Link className="nav-item" to="/owner/assign-crew">Crew assign</Link>
            <Link className="nav-item live-nav" to="/owner/billing">Billing</Link>
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
              Logout
            </button>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <h1>Billing</h1>
                <span className="pill">{user?.name || "Owner"}</span>
              </div>
            </div>
            <div className="topbar-actions">
              <span className="pill">
                {data?.period ? `${data.period.startDate} to ${data.period.endDate}` : "Period pending"}
              </span>
              <span className="pill">
                Last sync: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "--"}
              </span>
              <button className="btn outline" type="button" onClick={() => loadBilling()}>
                Refresh
              </button>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            <section className="panel">
              <div className="panel-header">
                <h3>Billing filter</h3>
                <span className="pill">Online payout and collection split</span>
              </div>
              <div className="inline">
                <label className="field">
                  Period type
                  <select value={query.mode} onChange={(e) => setQuery({ ...query, mode: e.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {query.mode === "daily" && (
                  <label className="field">
                    Date
                    <input type="date" value={query.date} onChange={(e) => setQuery({ ...query, date: e.target.value })} />
                  </label>
                )}
                {query.mode === "monthly" && (
                  <label className="field">
                    Month
                    <input type="month" value={query.month} onChange={(e) => setQuery({ ...query, month: e.target.value })} />
                  </label>
                )}
                {query.mode === "custom" && (
                  <>
                    <label className="field">
                      Start date
                      <input type="date" value={query.startDate} onChange={(e) => setQuery({ ...query, startDate: e.target.value })} />
                    </label>
                    <label className="field">
                      End date
                      <input type="date" value={query.endDate} onChange={(e) => setQuery({ ...query, endDate: e.target.value })} />
                    </label>
                  </>
                )}
              </div>
            </section>

            <section className="grid three">
              <div className="stat stat-up"><span>Online collection</span><strong>Rs {formatMoney(summary.onlineAmount)}</strong></div>
              <div className="stat stat-down"><span>Offline collection</span><strong>Rs {formatMoney(summary.cashAmount)}</strong></div>
              <div className="stat stat-live"><span>Total collection</span><strong>Rs {formatMoney(summary.totalAmount)}</strong></div>
              <div className="stat"><span>Pending payout</span><strong>Rs {formatMoney(summary.dueAmount)}</strong></div>
              <div className="stat"><span>Settled amount</span><strong>Rs {formatMoney(summary.paidAmount)}</strong></div>
              <div className="stat"><span>Trips covered</span><strong>{tripRows.length}</strong></div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Date-wise billing</h3>
                <span className="pill">{dateRows.length} days</span>
              </div>
              {loading ? (
                <div className="list-item"><div><strong>Loading billing...</strong></div></div>
              ) : dateRows.length === 0 ? (
                <div className="list-item"><div><strong>No billing rows found</strong><span>Ticketed trips for the selected period will appear here.</span></div></div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Trips</th>
                      <th>Online tickets</th>
                      <th>Online amount</th>
                      <th>Offline tickets</th>
                      <th>Offline amount</th>
                      <th>Total amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateRows.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{row.tripCount ?? 0}</td>
                        <td>{row.onlinePassengersCount ?? 0}</td>
                        <td>Rs {formatMoney(row.onlineAmount)}</td>
                        <td>{row.cashPassengersCount ?? 0}</td>
                        <td>Rs {formatMoney(row.cashAmount)}</td>
                        <td>Rs {formatMoney(row.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Trip-wise billing</h3>
                <span className="pill">{tripRows.length} trips</span>
              </div>
              {tripRows.length === 0 ? (
                <div className="list-item"><div><strong>No trip billing found</strong></div></div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Bus</th>
                      <th>Route</th>
                      <th>Direction</th>
                      <th>Online tickets</th>
                      <th>Online amount</th>
                      <th>Offline tickets</th>
                      <th>Offline amount</th>
                      <th>Total amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripRows.map((row) => (
                      <tr key={row.tripInstanceId || `${row.tripDate}-${row.busNumber}-${row.routeCode}`}>
                        <td>{row.tripDate || "--"}</td>
                        <td>{row.tripWindow || "--"}</td>
                        <td>{row.busNumber || "--"}</td>
                        <td>{row.routeCode || "--"} - {row.routeName || "Route"}</td>
                        <td>{row.direction || "--"}</td>
                        <td>{row.onlinePassengersCount ?? 0}</td>
                        <td>Rs {formatMoney(row.onlineAmount)}</td>
                        <td>{row.cashPassengersCount ?? 0}</td>
                        <td>Rs {formatMoney(row.cashAmount)}</td>
                        <td>Rs {formatMoney(row.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Settlement history</h3>
                <span className="pill">{settlementHistory.length} settlements</span>
              </div>
              {settlementHistory.length === 0 ? (
                <div className="list-item"><div><strong>No settlements in selected period</strong></div></div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Paid at</th>
                      <th>Period</th>
                      <th>Gross due</th>
                      <th>Commission</th>
                      <th>Net paid</th>
                      <th>Txn ref</th>
                      <th>Status</th>
                      <th>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementHistory.map((row) => (
                      <tr key={row.id}>
                        <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : formatDisplayDate(row.createdAt)}</td>
                        <td>{row.periodStart} to {row.periodEnd}</td>
                        <td>Rs {formatMoney(row.grossDueAmount)}</td>
                        <td>Rs {formatMoney(row.commissionAmount)}</td>
                        <td>Rs {formatMoney(row.netPaidAmount)}</td>
                        <td>{row.gatewayTxnRef || "--"}</td>
                        <td>{row.status || "--"}</td>
                        <td>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => downloadSettlementInvoice(row)}
                            disabled={downloadingId === (row.id || `${row.periodStart}-${row.periodEnd}`)}
                          >
                            {downloadingId === (row.id || `${row.periodStart}-${row.periodEnd}`)
                              ? "Generating PDF..."
                              : "Download invoice"}
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
    </div>
  );
}

export default OwnerBilling;
