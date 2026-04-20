const deletionSteps = [
  "Send an account deletion request to qfare.india@gmail.com from your registered QFare email address, or include your registered email in the request message.",
  "Use the subject line: QFare Account Deletion Request.",
  "Include your full name and phone number, if available, so we can verify the account and avoid accidental deletion.",
  "Our team will review the request and respond with confirmation after verification.",
];

const deletedData = [
  "Passenger profile information such as name, email address, phone number, and saved address details.",
  "Associated passenger account access and authentication records needed to disable sign-in.",
];

const retainedData = [
  "Ticketing, booking, payment-adjacent, audit, dispute-handling, fraud-prevention, or legal compliance records may be retained where required.",
  "Operational logs and backup copies may remain for a limited retention period before scheduled deletion.",
];

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f6f8fb 0%, #eef4f1 100%)",
    padding: "40px 18px 56px",
  },
  shell: {
    width: "100%",
    maxWidth: "920px",
    margin: "0 auto",
  },
  card: {
    background: "#ffffff",
    border: "1px solid rgba(19, 34, 61, 0.08)",
    borderRadius: "20px",
    padding: "28px",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
  },
  title: {
    margin: 0,
    color: "#13223d",
    fontSize: "2rem",
    fontWeight: 800,
  },
  intro: {
    margin: "14px 0 0",
    color: "#526079",
    lineHeight: 1.8,
    fontSize: "1rem",
  },
  section: {
    marginTop: "18px",
    background: "#ffffff",
    border: "1px solid rgba(19, 34, 61, 0.08)",
    borderRadius: "20px",
    padding: "22px 28px",
    boxShadow: "0 14px 32px rgba(15, 23, 42, 0.05)",
  },
  sectionTitle: {
    margin: 0,
    color: "#13223d",
    fontSize: "1.1rem",
    fontWeight: 800,
  },
  paragraph: {
    margin: "12px 0 0",
    color: "#526079",
    lineHeight: 1.8,
    fontSize: "0.98rem",
  },
  bullet: {
    margin: "8px 0 0",
    color: "#526079",
    lineHeight: 1.75,
    fontSize: "0.98rem",
  },
  emailLink: {
    color: "#0f6c78",
    fontWeight: 700,
    textDecoration: "none",
  },
};

export default function QfareDeleteAccount() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.card}>
          <h1 style={styles.title}>QFare Account Deletion</h1>
          <p style={styles.intro}>
            This page explains how QFare Passenger App users can request deletion of their account and associated
            personal data.
          </p>
          <p style={styles.intro}>
            To request account deletion, contact{" "}
            <a href="mailto:qfare.india@gmail.com?subject=QFare%20Account%20Deletion%20Request" style={styles.emailLink}>
              qfare.india@gmail.com
            </a>
            .
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>How to Request Deletion</h2>
          {deletionSteps.map((step) => (
            <p key={step} style={styles.bullet}>
              {"\u2022"} {step}
            </p>
          ))}
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>What Will Be Deleted</h2>
          {deletedData.map((item) => (
            <p key={item} style={styles.bullet}>
              {"\u2022"} {item}
            </p>
          ))}
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>What May Be Retained</h2>
          {retainedData.map((item) => (
            <p key={item} style={styles.bullet}>
              {"\u2022"} {item}
            </p>
          ))}
          <p style={styles.paragraph}>
            Where retention is required for legal, regulatory, security, or dispute-resolution purposes, such records
            may be retained for up to 180 days or longer if required by applicable law.
          </p>
        </section>
      </div>
    </div>
  );
}
