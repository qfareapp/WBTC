const sections = [
  {
    title: "1. Information We Collect",
    items: [
      "Personal information such as your name, phone number, email address, and address when you create or complete your profile.",
      "Account and authentication information, including OTP verification details needed to log you in securely.",
      "Journey and ticket information such as selected boarding stop, destination stop, route, booking details, and digital ticket records.",
      "Device and app usage information required to improve app performance, reliability, and user experience.",
      "Location information only when required for app features such as showing live bus information, verifying whether you are near a selected bus stop, or helping you navigate to that stop.",
      "Notification-related information such as push notification tokens used to send relevant service alerts.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    items: [
      "Create and manage your passenger account.",
      "Authenticate users securely.",
      "Issue digital tickets and support travel-related features.",
      "Show bus routes, live bus status, and stop-related information.",
      "Verify location-based actions, such as notifying the crew that you are waiting at a stop.",
      "Improve app performance, safety, and service quality.",
      "Send operational alerts, trip-related notifications, and important app updates.",
      "Comply with legal and operational requirements.",
    ],
  },
  {
    title: "3. Location Data",
    paragraphs: [
      "Location access is used only for passenger-facing transport features. For example, the app may use your location to confirm that you are near your selected boarding stop before allowing certain actions, help you navigate to the correct bus stop, and improve the relevance of live transport information.",
      "We do not use your location for unrelated advertising purposes.",
    ],
  },
  {
    title: "4. Sharing of Information",
    paragraphs: [
      "We do not sell your personal information.",
      "We may share data only with transport operators, drivers, conductors, or authorized backend systems where necessary to provide app functionality; with service providers that support authentication, hosting, notifications, analytics, or app operations; or with government, law enforcement, or regulatory authorities if required by law.",
    ],
  },
  {
    title: "5. Data Storage and Security",
    paragraphs: [
      "We use reasonable technical and organizational measures to protect your data from unauthorized access, loss, misuse, or disclosure. However, no system can be guaranteed to be completely secure.",
    ],
  },
  {
    title: "6. Data Retention",
    paragraphs: [
      "We retain your information only for as long as necessary to provide the services of the app, maintain ticketing and operational records, and comply with legal, regulatory, or dispute-resolution obligations.",
    ],
  },
  {
    title: "7. User Choices and Controls",
    items: [
      "Update profile details within the app, where available.",
      "Choose whether to grant location permissions.",
      "Disable notifications through your device settings.",
      "Contact us to request account-related support or data-related queries, subject to applicable law.",
    ],
    footer:
      "Some app features may not function properly if permissions such as location are denied.",
  },
  {
    title: "8. Children's Privacy",
    paragraphs: [
      "QFare Passenger App is not intended for children under the age required by applicable law to independently use such services. We do not knowingly collect personal information from children without appropriate authorization where required.",
    ],
  },
  {
    title: "9. Third-Party Services",
    paragraphs: [
      "The app may use third-party services such as mapping, notifications, authentication, or hosting providers. These services may process information as needed to support app functionality and may be governed by their own privacy policies.",
    ],
  },
  {
    title: "10. Changes to This Privacy Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. Updated versions will be made available through the app or related official channels. Continued use of the app after updates means you accept the revised policy.",
    ],
  },
  {
    title: "11. Contact Us",
    paragraphs: [
      "If you have any questions, concerns, or requests regarding this Privacy Policy, you may contact the app operator or support team through the official support channel provided for QFare Passenger App.",
    ],
  },
];

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f8fb",
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
  footerLinkWrap: {
    marginTop: "18px",
    textAlign: "center",
  },
  footerLink: {
    color: "#0f6c78",
    fontSize: "0.88rem",
    textDecoration: "none",
    fontWeight: 700,
  },
};

export default function QfarePassengerPrivacyPolicy() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.card}>
          <h1 style={styles.title}>QFare Privacy Policy</h1>
          <p style={styles.intro}>
            QFare Passenger App respects your privacy. This Privacy Policy explains what information we collect, how we use it, and how we protect it when you use the app.
          </p>
        </section>

        {sections.map((section) => (
          <section key={section.title} style={styles.section}>
            <h2 style={styles.sectionTitle}>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} style={styles.paragraph}>{paragraph}</p>
            ))}
            {section.items?.map((item) => (
              <p key={item} style={styles.bullet}>{"\u2022"} {item}</p>
            ))}
            {section.footer ? <p style={styles.paragraph}>{section.footer}</p> : null}
          </section>
        ))}

        <div style={styles.footerLinkWrap}>
          <a href="/qfare-delete-account" style={styles.footerLink}>
            Request account deletion
          </a>
        </div>
      </div>
    </div>
  );
}
