const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f9fc",
    padding: "40px 18px 56px",
  },
  shell: {
    width: "100%",
    maxWidth: "920px",
    margin: "0 auto",
  },
  card: {
    background: "#ffffff",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "20px",
    padding: "28px",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
  },
  title: {
    margin: 0,
    color: "#10243c",
    fontSize: "2rem",
    fontWeight: 800,
  },
  intro: {
    margin: "14px 0 0",
    color: "#526079",
    lineHeight: 1.8,
  },
  section: {
    marginTop: "18px",
    background: "#ffffff",
    border: "1px solid rgba(16,36,60,0.08)",
    borderRadius: "20px",
    padding: "22px 28px",
    boxShadow: "0 14px 32px rgba(15, 23, 42, 0.05)",
  },
  sectionTitle: {
    margin: 0,
    color: "#10243c",
    fontSize: "1.1rem",
    fontWeight: 800,
  },
  text: {
    margin: "12px 0 0",
    color: "#526079",
    lineHeight: 1.8,
  },
};

export default function QfareRefundPolicy() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.card}>
          <h1 style={styles.title}>QFare Refund and Cancellation Policy</h1>
          <p style={styles.intro}>
            This policy explains how QFare handles payment reversals, ticket-related exceptions, and refund requests.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>1. Successful Ticket Issuance</h2>
          <p style={styles.text}>
            Once a payment is successfully completed and a valid digital ticket is issued, the booking is generally treated as consumed for the selected journey and is not automatically refundable.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>2. Failed or Incomplete Transactions</h2>
          <p style={styles.text}>
            If payment is debited but a ticket is not issued due to technical failure, duplicate charge, or backend verification failure, the case may be reviewed and the amount may be refunded or reversed as applicable.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Service or Operational Exceptions</h2>
          <p style={styles.text}>
            Refunds may be considered in exceptional cases such as proven duplicate payment, service disruption before ticket use, or other verified system-side issues, subject to review.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>4. Request Process</h2>
          <p style={styles.text}>
            To request help for a payment issue, passengers should contact qfare.india@gmail.com with booking details, payment reference, and the registered email address used in the app.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Processing Time</h2>
          <p style={styles.text}>
            Valid refund requests, where approved, are typically processed through the original payment channel. Final settlement timelines depend on the payment partner and banking network.
          </p>
        </section>
      </div>
    </div>
  );
}
