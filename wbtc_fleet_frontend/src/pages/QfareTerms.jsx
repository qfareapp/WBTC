const sections = [
  {
    title: "1. Scope of Service",
    body: "QFare Passenger App is a digital passenger ticketing service for supported public transport routes. App availability does not guarantee that every bus, route, or stop is ticket-enabled at all times.",
  },
  {
    title: "2. Account Responsibility",
    body: "Users are responsible for maintaining accurate account details and for actions taken through their registered account or device.",
  },
  {
    title: "3. Ticket Purchase",
    body: "A digital ticket is generated only after successful payment confirmation and route validation. Tickets are valid only for the selected journey details and subject to operational conditions of the active trip.",
  },
  {
    title: "4. Accuracy of Passenger Input",
    body: "Passengers must select the correct source stop, destination stop, and route-related information. QFare is not responsible for incorrect passenger selections made during booking.",
  },
  {
    title: "5. Operational Dependency",
    body: "Ticketing, live trip status, and route availability depend on real-time transport operations. Services may change, be delayed, or become unavailable due to operational, technical, or regulatory reasons.",
  },
  {
    title: "6. Payments",
    body: "Payments are processed through authorized payment partners. QFare may refuse, delay, or reverse a booking if payment verification fails or if transaction activity appears invalid, duplicated, or suspicious.",
  },
  {
    title: "7. Misuse",
    body: "Users must not misuse the app, attempt unauthorized access, manipulate booking flows, interfere with operations, or use false information for ticket issuance.",
  },
  {
    title: "8. Liability",
    body: "QFare provides a technology platform for passenger ticketing and related information services. To the extent permitted by law, liability is limited for interruptions, delays, operational changes, or indirect losses arising from transport operations or third-party systems.",
  },
  {
    title: "9. Changes",
    body: "These terms may be updated from time to time. Continued use of QFare after updates constitutes acceptance of the revised terms.",
  },
];

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
  body: {
    margin: "12px 0 0",
    color: "#526079",
    lineHeight: 1.8,
  },
};

export default function QfareTerms() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.card}>
          <h1 style={styles.title}>QFare Terms and Conditions</h1>
          <p style={styles.intro}>
            These terms govern use of the QFare Passenger App and passenger ticketing features.
          </p>
        </section>
        {sections.map((section) => (
          <section key={section.title} style={styles.section}>
            <h2 style={styles.sectionTitle}>{section.title}</h2>
            <p style={styles.body}>{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
