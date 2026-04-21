const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(0,184,135,0.14), transparent 26%), radial-gradient(circle at bottom left, rgba(39,122,255,0.16), transparent 30%), linear-gradient(180deg, #edf5ff 0%, #f7fbff 48%, #f2f7fb 100%)",
    padding: "32px 18px 56px",
    color: "#10243c",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "100%",
    maxWidth: "1120px",
    margin: "0 auto",
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,248,255,0.96) 55%, rgba(233,247,244,0.95) 100%)",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "32px",
    padding: "32px",
    boxShadow: "0 30px 80px rgba(31, 65, 114, 0.12)",
  },
  heroGlowA: {
    position: "absolute",
    width: "240px",
    height: "240px",
    borderRadius: "999px",
    background: "radial-gradient(circle, rgba(0,184,135,0.24), transparent 70%)",
    top: "-60px",
    right: "-40px",
    pointerEvents: "none",
  },
  heroGlowB: {
    position: "absolute",
    width: "260px",
    height: "260px",
    borderRadius: "999px",
    background: "radial-gradient(circle, rgba(39,122,255,0.18), transparent 72%)",
    bottom: "-120px",
    left: "-40px",
    pointerEvents: "none",
  },
  heroGrid: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.25fr) minmax(300px, 0.95fr)",
    gap: "24px",
    alignItems: "stretch",
  },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    background: "#ffffff",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "18px",
    padding: "10px 16px",
    fontSize: "1.9rem",
    fontWeight: 900,
    marginBottom: "18px",
    boxShadow: "0 12px 28px rgba(16,36,60,0.06)",
  },
  brandQ: { color: "#00b887" },
  brandFare: { color: "#10243c" },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "14px",
    padding: "7px 12px",
    borderRadius: "999px",
    background: "rgba(0,184,135,0.10)",
    color: "#008a65",
    fontWeight: 800,
    fontSize: "0.82rem",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(2.2rem, 5vw, 4rem)",
    lineHeight: 0.98,
    letterSpacing: "-0.05em",
    fontWeight: 900,
    maxWidth: "640px",
  },
  accentTitle: {
    color: "#00a97d",
  },
  intro: {
    margin: "18px 0 0",
    maxWidth: "720px",
    color: "rgba(16,36,60,0.78)",
    fontSize: "1.05rem",
    lineHeight: 1.8,
  },
  ctaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "24px",
  },
  primaryCta: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    background: "linear-gradient(135deg, #00b887 0%, #049f76 100%)",
    color: "#ffffff",
    borderRadius: "14px",
    padding: "13px 20px",
    fontWeight: 800,
    boxShadow: "0 18px 34px rgba(0, 184, 135, 0.22)",
  },
  secondaryCta: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    background: "#ffffff",
    color: "#10243c",
    border: "1px solid rgba(16,36,60,0.10)",
    borderRadius: "14px",
    padding: "13px 20px",
    fontWeight: 800,
  },
  assuranceRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
  },
  assuranceChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "9px 12px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(16,36,60,0.08)",
    color: "rgba(16,36,60,0.76)",
    fontSize: "0.92rem",
    fontWeight: 700,
  },
  heroAside: {
    display: "grid",
    gap: "14px",
    alignSelf: "stretch",
  },
  heroCard: {
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "26px",
    padding: "22px",
    boxShadow: "0 18px 46px rgba(31, 65, 114, 0.10)",
  },
  downloadCard: {
    background: "linear-gradient(135deg, #10243c 0%, #153458 100%)",
    color: "#ffffff",
    border: "1px solid rgba(16,36,60,0.10)",
    borderRadius: "26px",
    padding: "22px",
    boxShadow: "0 22px 56px rgba(16, 36, 60, 0.24)",
  },
  cardTitle: {
    margin: 0,
    fontSize: "1.18rem",
    fontWeight: 900,
  },
  cardText: {
    margin: "10px 0 0",
    lineHeight: 1.75,
    color: "rgba(16,36,60,0.74)",
  },
  downloadText: {
    margin: "10px 0 0",
    lineHeight: 1.75,
    color: "rgba(255,255,255,0.78)",
  },
  miniList: {
    display: "grid",
    gap: "10px",
    marginTop: "16px",
  },
  miniItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: "16px",
    background: "rgba(240,248,255,0.95)",
    border: "1px solid rgba(16,36,60,0.07)",
  },
  miniDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    background: "#00b887",
    marginTop: "7px",
    flexShrink: 0,
  },
  playBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "14px",
    marginTop: "18px",
    padding: "12px 16px",
    borderRadius: "18px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    textDecoration: "none",
    color: "#ffffff",
    width: "fit-content",
  },
  playLogoWrap: {
    width: "42px",
    height: "42px",
    borderRadius: "14px",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.14)",
    flexShrink: 0,
  },
  playMetaTop: {
    display: "block",
    fontSize: "0.78rem",
    color: "rgba(255,255,255,0.68)",
    marginBottom: "2px",
  },
  playMetaMain: {
    display: "block",
    fontWeight: 800,
    fontSize: "1rem",
  },
  playHint: {
    margin: "10px 0 0",
    fontSize: "0.86rem",
    color: "rgba(255,255,255,0.64)",
    lineHeight: 1.6,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
    marginTop: "20px",
  },
  card: {
    background: "#ffffff",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "22px",
    padding: "22px",
    boxShadow: "0 16px 36px rgba(31, 65, 114, 0.06)",
  },
  section: {
    marginTop: "18px",
    background: "#ffffff",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "22px",
    padding: "24px",
    boxShadow: "0 16px 36px rgba(31, 65, 114, 0.06)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "1.2rem",
    fontWeight: 900,
  },
  text: {
    margin: "12px 0 0",
    color: "rgba(16,36,60,0.78)",
    lineHeight: 1.8,
  },
  bullet: {
    margin: "10px 0 0",
    color: "rgba(16,36,60,0.78)",
    lineHeight: 1.7,
  },
  statValue: {
    fontSize: "1.45rem",
    fontWeight: 900,
    margin: 0,
  },
  statLabel: {
    margin: "6px 0 0",
    color: "rgba(16,36,60,0.66)",
    fontSize: "0.95rem",
    lineHeight: 1.6,
  },
  linksGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "14px",
  },
  linkCard: {
    display: "block",
    textDecoration: "none",
    color: "#10243c",
    background: "#f8fbff",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "18px",
    padding: "16px 18px",
  },
  linkTitle: {
    margin: 0,
    fontWeight: 800,
    fontSize: "1rem",
  },
  linkMeta: {
    margin: "6px 0 0",
    color: "rgba(16,36,60,0.68)",
    lineHeight: 1.6,
    fontSize: "0.95rem",
  },
  footer: {
    marginTop: "18px",
    color: "rgba(16,36,60,0.7)",
    fontSize: "0.92rem",
    lineHeight: 1.8,
  },
  disclaimer: {
    marginTop: "8px",
    color: "rgba(16,36,60,0.58)",
    fontSize: "0.86rem",
    lineHeight: 1.6,
  },
};

const highlights = [
  {
    value: "Passenger ticketing",
    label: "Digital bus ticket purchase for supported QFare-enabled routes.",
  },
  {
    value: "Live route access",
    label: "Route discovery, live trip visibility, and stop-level guidance for passengers.",
  },
  {
    value: "Support contact",
    label: "Email support: qfare.india@gmail.com",
  },
];

function PlayStoreMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 3.8L13.3 13L4 20.2V3.8Z" fill="#00D084" />
      <path d="M13.3 13L17.1 9.2L20.9 11.4C21.8 11.9 21.8 13.1 20.9 13.6L17.1 15.8L13.3 13Z" fill="#FFD84D" />
      <path d="M4 3.8L17.1 9.2L13.3 13L4 3.8Z" fill="#5AA9FF" />
      <path d="M4 20.2L13.3 13L17.1 15.8L4 20.2Z" fill="#FF6B57" />
    </svg>
  );
}

export default function QfareLandingPage() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.heroGlowA} />
          <div style={styles.heroGlowB} />
          <div style={styles.heroGrid}>
            <div>
              <div style={styles.brand}>
                <span style={styles.brandQ}>q</span>
                <span style={styles.brandFare}>fare</span>
              </div>
              <div style={styles.eyebrow}>Passenger Ticketing Platform</div>
              <h1 style={styles.title}>
                Smart bus travel, <span style={styles.accentTitle}>faster ticketing</span>, and a cleaner rider experience.
              </h1>
              <p style={styles.intro}>
                QFare is a passenger-facing digital bus ticketing platform operated under One20Minutes Solutions. It
                helps riders discover supported routes, choose boarding and destination stops, pay inside the app, and
                receive digital tickets for participating transport services.
              </p>
              <div style={styles.ctaRow}>
                <a href="/qfare-privacy-policy" style={styles.primaryCta}>Open Privacy Policy</a>
                <a href="/qfare-terms" style={styles.secondaryCta}>View Terms</a>
                <a href="/qfare-refund-policy" style={styles.secondaryCta}>Refund Policy</a>
              </div>
              <div style={styles.assuranceRow}>
                <span style={styles.assuranceChip}>OTP sign in</span>
                <span style={styles.assuranceChip}>Digital tickets after payment</span>
                <span style={styles.assuranceChip}>Public transport use case</span>
              </div>
            </div>

            <div style={styles.heroAside}>
              <section style={styles.downloadCard}>
                <h2 style={styles.cardTitle}>Download the QFare app</h2>
                <p style={styles.downloadText}>
                  Built for Android passengers who want quick route selection, ticket payment, and an in-app travel pass.
                </p>
                <a href="/qfare" style={styles.playBadge} aria-label="QFare Android app coming soon on Google Play">
                  <span style={styles.playLogoWrap}>
                    <PlayStoreMark />
                  </span>
                  <span>
                    <span style={styles.playMetaTop}>Android app</span>
                    <span style={styles.playMetaMain}>Google Play release coming soon</span>
                  </span>
                </a>
                <p style={styles.playHint}>
                  Play Store listing can be added here once the public app page is live.
                </p>
              </section>

              <section style={styles.heroCard}>
                <h2 style={styles.cardTitle}>Why passengers use QFare</h2>
                <div style={styles.miniList}>
                  <div style={styles.miniItem}>
                    <span style={styles.miniDot} />
                    <div>
                      <strong>Pick route and stops quickly</strong>
                      <p style={styles.cardText}>Choose your boarding and destination stops without paper ticket queues.</p>
                    </div>
                  </div>
                  <div style={styles.miniItem}>
                    <span style={styles.miniDot} />
                    <div>
                      <strong>Pay and receive a digital ticket</strong>
                      <p style={styles.cardText}>Ticket issuance happens after successful in-app payment confirmation.</p>
                    </div>
                  </div>
                  <div style={styles.miniItem}>
                    <span style={styles.miniDot} />
                    <div>
                      <strong>Access trip details inside the app</strong>
                      <p style={styles.cardText}>Passengers can keep route, stop, and ticket information available during travel.</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>

        <div style={styles.grid}>
          {highlights.map((item) => (
            <section key={item.value} style={styles.card}>
              <p style={styles.statValue}>{item.value}</p>
              <p style={styles.statLabel}>{item.label}</p>
            </section>
          ))}
        </div>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Service Overview</h2>
          <p style={styles.text}>
            The QFare Passenger App is built for digital ticketing on supported bus routes. Passengers can scan or
            enter bus details, choose stops, pay for their journey, and receive a digital ticket that remains available
            in the app while the trip is active.
          </p>
          <p style={styles.bullet}>• Passenger account creation and OTP-based sign in</p>
          <p style={styles.bullet}>• Route and stop selection for fare calculation</p>
          <p style={styles.bullet}>• Digital ticket issuance after successful payment</p>
          <p style={styles.bullet}>• Live route, stop, and bus-related passenger information</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Business Information</h2>
          <p style={styles.text}>
            Business / operator: <strong>One20Minutes Solutions</strong>
          </p>
          <p style={styles.text}>
            Product: <strong>QFare Passenger App</strong>
          </p>
          <p style={styles.text}>
            Support email: <strong>qfare.india@gmail.com</strong>
          </p>
          <p style={styles.text}>
            Use case: <strong>Digital public transport ticketing and passenger service support</strong>
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Policies and Public Information</h2>
          <div style={styles.linksGrid}>
            <a href="/qfare-privacy-policy" style={styles.linkCard}>
              <p style={styles.linkTitle}>Privacy Policy</p>
              <p style={styles.linkMeta}>How passenger information is collected, used, and protected.</p>
            </a>
            <a href="/qfare-terms" style={styles.linkCard}>
              <p style={styles.linkTitle}>Terms and Conditions</p>
              <p style={styles.linkMeta}>Passenger-facing usage terms for tickets, payments, and app access.</p>
            </a>
            <a href="/qfare-refund-policy" style={styles.linkCard}>
              <p style={styles.linkTitle}>Refund and Cancellation Policy</p>
              <p style={styles.linkMeta}>Rules for ticket refunds, cancellations, and service exceptions.</p>
            </a>
            <a href="/qfare-delete-account" style={styles.linkCard}>
              <p style={styles.linkTitle}>Account Deletion</p>
              <p style={styles.linkMeta}>How a passenger can request deletion of a QFare account.</p>
            </a>
          </div>
          <p style={styles.footer}>
            This public page is provided for passenger information, compliance review, and business verification.
          </p>
          <p style={styles.disclaimer}>
            The Google Play callout on this page is a product promotion section and should be updated with the final
            public store listing URL after app publication.
          </p>
        </section>
      </div>
    </div>
  );
}
