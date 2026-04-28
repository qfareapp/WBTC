import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

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
      "Address: 9/J Raipur Road East, Jadavpur, Kolkata - 700032 (WB)",
      "Phone: 9147369654",
    ],
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={18} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy for Qfare</Text>
        <Text style={styles.subtitle}>Effective Date: 18.04.2026</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.body}>
          Qfare ("we", "our", "us") provides digital tools for transport operations, including owner, driver, and
          conductor workflows, live trip management, crew assignment, trip tracking, and notifications. This Privacy
          Policy explains how we collect, use, store, and share information when you use the Qfare mobile app, related
          web panels, and backend services.
        </Text>
        <Text style={[styles.body, styles.spaced]}>
          By using Qfare, you agree to the collection and use of information in accordance with this Privacy Policy.
        </Text>
      </View>

      {policySections.map((section) => (
        <View key={section.title} style={styles.card}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.body ? <Text style={styles.body}>{section.body}</Text> : null}
          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} style={styles.body}>
              {paragraph}
            </Text>
          ))}
          {section.groups?.map((group) => (
            <View key={group.heading} style={styles.group}>
              <Text style={styles.groupTitle}>{group.heading}</Text>
              {group.items.map((item) => (
                <Text key={item} style={styles.bullet}>
                  {"\u2022"} {item}
                </Text>
              ))}
            </View>
          ))}
          {section.items?.map((item) => (
            <Text key={item} style={styles.bullet}>
              {"\u2022"} {item}
            </Text>
          ))}
          {section.footer ? <Text style={[styles.body, styles.spaced]}>{section.footer}</Text> : null}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Short Play Store Disclosure Text</Text>
        <Text style={styles.body}>
          “Qfare collects location data, including background location during active trips, to support live trip
          tracking, route operations, and transport monitoring for assigned duty services.”
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 28,
    marginBottom: 18,
  },
  back: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  backText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.56)",
    fontSize: 13,
  },
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
  },
  group: {
    marginTop: 10,
  },
  groupTitle: {
    color: "#DDE8F6",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  body: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    lineHeight: 22,
  },
  bullet: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 2,
  },
  spaced: {
    marginTop: 10,
  },
});
