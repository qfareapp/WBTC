const policySections = [
  {
    title: "1. Information We Collect",
    body: "We may collect the following categories of information:",
    groups: [
      {
        heading: "Account and Profile Information",
        items: [
          "Employee ID",
          "Username",
          "Password and password reset status",
          "Role information such as driver, conductor, or owner",
          "Profile details entered by administrators or owners",
          "Assigned bus, route, depot, or crew details",
        ],
      },
      {
        heading: "Operational and Trip Information",
        items: [
          "Trip assignments",
          "Duty status",
          "Route and stop information",
          "Trip start and end times",
          "Opening and closing kilometer entries",
          "Trip progress, including upcoming and passed stops",
          "Passenger waiting counts at stops when passengers tap the waiting feature",
        ],
      },
      {
        heading: "Location Information",
        items: [
          "Precise device location while the app is in use",
          "Precise background location during active live trips, where enabled for operational tracking",
        ],
      },
      {
        heading: "Device and App Information",
        items: [
          "Push notification token",
          "Device and app diagnostic information needed for app functionality and troubleshooting",
          "App session and authentication state",
        ],
      },
      {
        heading: "Notification and Communication Data",
        items: [
          "Data required to send operational notifications such as trip offers, trip status updates, and related alerts",
        ],
      },
    ],
  },
  {
    title: "2. How We Use Information",
    body: "We use collected information to:",
    items: [
      "authenticate users and manage secure access",
      "assign and manage drivers, conductors, buses, and trips",
      "support live trip operations",
      "track active trips and location updates during service",
      "display route progress and upcoming stop information",
      "notify drivers, conductors, or owners about operational events",
      "support password reset and account recovery workflows",
      "improve system reliability, performance, and security",
      "investigate misuse, fraud, technical issues, or policy violations",
    ],
  },
  {
    title: "3. Background Location Use",
    paragraphs: [
      "Qfare may collect location data in the background during an active trip. This is used to:",
    ],
    items: [
      "track live trip movement",
      "update operational trip status",
      "support transport monitoring and dispatch visibility",
      "assist with route and stop progress handling",
    ],
    footer:
      "Background location is collected only for operational purposes related to an active trip workflow. It is not intended for unrelated advertising or marketing use.",
  },
  {
    title: "4. How Information Is Shared",
    body: "We may share information only as necessary for service operation, including:",
    items: [
      "with authorized depot admins, owners, or operational managers within the Qfare system",
      "with service providers or infrastructure vendors who help us run the platform",
      "when required by law, regulation, legal process, or government request",
      "to protect the security, integrity, rights, safety, and operation of Qfare, its users, or the public",
    ],
    footer: "We do not sell personal information.",
  },
  {
    title: "5. Data Storage and Retention",
    body: "We retain information for as long as necessary to:",
    items: [
      "provide the service",
      "maintain operational records",
      "comply with legal, regulatory, tax, or audit obligations",
      "resolve disputes and enforce agreements",
    ],
    footer:
      "Certain information may remain in backups, logs, or archived systems for a limited period as part of normal operational retention.",
  },
  {
    title: "6. Security",
    paragraphs: [
      "We use reasonable technical and organizational measures to protect information, including access control, authentication, and secure handling of account credentials. However, no method of storage or transmission is completely secure, and we cannot guarantee absolute security.",
      "Users are responsible for maintaining the confidentiality of their login credentials and should report any suspected unauthorized access promptly.",
    ],
  },
  {
    title: "7. Passwords and Account Recovery",
    paragraphs: [
      "Passwords are not displayed back to users after being set. For crew and owner accounts, password reset may be handled by an authorized administrator or owner using a temporary password flow. After reset, users may be required to set a new password before continuing.",
    ],
  },
  {
    title: "8. Notifications",
    paragraphs: [
      "Qfare may send operational notifications required for service functionality, including trip offers, trip-related alerts, and live service notifications. These notifications are used for app operations and are not intended as marketing communications unless separately stated.",
    ],
  },
  {
    title: "9. Children's Privacy",
    paragraphs: [
      "Qfare is not intended for children. We do not knowingly collect personal information from children.",
    ],
  },
  {
    title: "10. Your Choices",
    body: "Depending on your role and applicable law, you may be able to:",
    items: [
      "review or update certain account information",
      "change your password",
      "log out of the app",
      "disable some device permissions, though this may affect app functionality",
    ],
    footer:
      "If background location or notifications are disabled, some core operational features may not work properly.",
  },
  {
    title: "11. Third-Party Services",
    paragraphs: [
      "Qfare may rely on third-party infrastructure or platform providers for hosting, notifications, maps, geolocation, or related technical services. Those providers may process limited information as needed to deliver their services to Qfare.",
    ],
  },
  {
    title: "12. International Processing",
    paragraphs: [
      "Your information may be processed and stored on systems operated by Qfare or its service providers in locations different from your local region, subject to applicable safeguards and operational requirements.",
    ],
  },
  {
    title: "13. Changes to This Privacy Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. The updated version will take effect when posted with a revised effective date. Continued use of Qfare after such changes means you accept the updated Privacy Policy.",
    ],
  },
  {
    title: "14. Contact Us",
    paragraphs: [
      "If you have questions, requests, or concerns about this Privacy Policy or data handling practices, contact:",
      "Qfare",
      "Email: qfare.india@gmail.com",
      "Address: 9/J Raipur Road East, Kolkata, 700032 (WB)",
      "Phone: +919800162412",
    ],
  },
];

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f4f7f8 0%, #eef4f1 100%)",
    padding: "32px 18px 48px",
  },
  shell: {
    width: "100%",
    maxWidth: "920px",
    margin: "0 auto",
  },
  hero: {
    background: "#ffffff",
    border: "1px solid rgba(27, 31, 42, 0.08)",
    borderRadius: "20px",
    padding: "24px 26px",
    boxShadow: "0 18px 40px rgba(17, 24, 39, 0.08)",
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    color: "#1b1f2a",
    fontSize: "2rem",
    fontWeight: 800,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(27, 31, 42, 0.12)",
    color: "#5d687a",
    background: "#ffffff",
    fontSize: "0.95rem",
  },
  text: {
    margin: "12px 0 0",
    color: "#5d687a",
    lineHeight: 1.75,
    fontSize: "1rem",
  },
  panel: {
    marginTop: "18px",
    background: "#ffffff",
    border: "1px solid rgba(27, 31, 42, 0.08)",
    borderRadius: "20px",
    padding: "22px 26px",
    boxShadow: "0 14px 32px rgba(17, 24, 39, 0.06)",
  },
  sectionTitle: {
    margin: 0,
    color: "#1b1f2a",
    fontSize: "1.15rem",
    fontWeight: 800,
  },
  groupTitle: {
    margin: "14px 0 6px",
    color: "#1b1f2a",
    fontSize: "0.98rem",
    fontWeight: 700,
  },
  bullet: {
    margin: "4px 0 0",
    color: "#5d687a",
    lineHeight: 1.7,
    fontSize: "0.98rem",
  },
};

export default function PrivacyPolicy() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.heroTop}>
            <h1 style={styles.title}>Privacy Policy for Qfare</h1>
            <span style={styles.pill}>Effective Date: 18.04.2026</span>
          </div>
          <p style={styles.text}>
            Qfare ("we", "our", "us") provides digital tools for transport operations, including owner, driver, and
            conductor workflows, live trip management, crew assignment, trip tracking, and notifications. This Privacy
            Policy explains how we collect, use, store, and share information when you use the Qfare mobile app,
            related web panels, and backend services.
          </p>
          <p style={styles.text}>
            By using Qfare, you agree to the collection and use of information in accordance with this Privacy Policy.
          </p>
        </section>

        {policySections.map((section) => (
          <section key={section.title} style={styles.panel}>
            <h2 style={styles.sectionTitle}>{section.title}</h2>
            {section.body ? <p style={styles.text}>{section.body}</p> : null}
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} style={styles.text}>
                {paragraph}
              </p>
            ))}
            {section.groups?.map((group) => (
              <div key={group.heading}>
                <p style={styles.groupTitle}>{group.heading}</p>
                {group.items.map((item) => (
                  <p key={item} style={styles.bullet}>
                    {"\u2022"} {item}
                  </p>
                ))}
              </div>
            ))}
            {section.items?.map((item) => (
              <p key={item} style={styles.bullet}>
                {"\u2022"} {item}
              </p>
            ))}
            {section.footer ? <p style={styles.text}>{section.footer}</p> : null}
          </section>
        ))}

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Short Play Store Disclosure Text</h2>
          <p style={styles.text}>
            “Qfare collects location data, including background location during active trips, to support live trip
            tracking, route operations, and transport monitoring for assigned duty services.”
          </p>
        </section>
      </div>
    </div>
  );
}
