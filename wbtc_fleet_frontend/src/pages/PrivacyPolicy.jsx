import { Link } from "react-router-dom";

const sections = [
  {
    title: "Information We Collect",
    body:
      "Qfare may collect account details such as employee ID, username, role, password reset status, and profile information entered by admins or owners. We also collect operational data including route and stop information, crew assignment data, trip timing, kilometer readings, live trip status, passenger waiting counts, and push token data needed to operate transport services.",
  },
  {
    title: "Location Data",
    body:
      "Qfare may collect precise location while the app is in use and background location during an active live trip. This supports live trip tracking, route progress, dispatch visibility, operational monitoring, and active service management.",
  },
  {
    title: "How We Use Data",
    body:
      "We use collected data to authenticate users, assign and manage trips, run owner and crew operations, send operational notifications, support password reset flows, monitor live transport activity, improve reliability, and investigate misuse or technical issues.",
  },
  {
    title: "Sharing",
    body:
      "Qfare does not sell personal information. Data may be available to authorized admins, owners, depot managers, and infrastructure providers only to the extent necessary to operate the platform, maintain services, or comply with legal obligations.",
  },
  {
    title: "Retention and Security",
    body:
      "We retain data as long as required for operations, records, compliance, dispute handling, and security. We apply reasonable technical and organizational measures to protect data, but no system can guarantee absolute security.",
  },
  {
    title: "Notifications and Password Reset",
    body:
      "Qfare may send trip and service notifications needed for app functionality. Passwords are not displayed after being set. Authorized admins or owners may issue temporary passwords for reset purposes, after which users may be required to set a new password.",
  },
  {
    title: "Contact",
    body:
      "Replace this section before public release with your final support email, phone number, and business address for privacy or data requests.",
  },
];

export default function PrivacyPolicy() {
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
            <Link className="nav-item" to="/dashboard">Overview</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/privacy-policy">Privacy Policy</Link>
          </nav>
        </aside>

        <div className="content">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <h1>Privacy Policy</h1>
                <span className="pill">Qfare data handling summary</span>
              </div>
            </div>
          </header>

          <main className="main">
            <section className="panel reveal" style={{ "--delay": "40ms" }}>
              <div className="panel-header">
                <h3>Qfare Privacy Policy</h3>
                <span className="pill">Effective date: April 9, 2026</span>
              </div>
              <p style={{ margin: 0, color: "rgba(226,232,240,0.84)", lineHeight: 1.7 }}>
                Qfare provides transport operations tools for drivers, conductors, owners, and operations staff. This
                page explains the categories of information collected and how that data supports live trip, crew, and
                fleet operations.
              </p>
            </section>

            {sections.map((section, index) => (
              <section key={section.title} className="panel reveal" style={{ "--delay": `${80 + index * 40}ms` }}>
                <div className="panel-header">
                  <h3>{section.title}</h3>
                </div>
                <p style={{ margin: 0, color: "rgba(226,232,240,0.84)", lineHeight: 1.7 }}>{section.body}</p>
              </section>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
