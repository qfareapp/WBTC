import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const sections = [
  {
    title: "Information We Collect",
    body:
      "Qfare may collect account details such as employee ID, username, role, password reset status, and profile information entered by admins or owners. The app also collects trip assignments, route and stop details, trip timing, kilometer entries, crew assignment data, passenger waiting counts, push token data, and operational status information needed to run transport services.",
  },
  {
    title: "Location Data",
    body:
      "Qfare collects precise location while the app is in use and may collect background location during an active live trip. This is used for live trip tracking, route progress, dispatch visibility, operational monitoring, and trip management. Background location is used only for active operational trip features.",
  },
  {
    title: "How We Use Data",
    body:
      "We use data to authenticate users, manage secure access, assign and run trips, support owner and crew operations, send operational notifications, track live trips, manage password reset flows, improve reliability, and investigate misuse or technical issues.",
  },
  {
    title: "Sharing",
    body:
      "Qfare does not sell personal information. Data may be available to authorized admins, owners, depot managers, and service providers only as required to operate the platform, maintain infrastructure, or comply with legal obligations.",
  },
  {
    title: "Retention and Security",
    body:
      "We retain data as long as needed for operations, records, dispute handling, compliance, and security. We use reasonable technical and organizational measures to protect data, but no system can guarantee absolute security.",
  },
  {
    title: "Notifications and Account Recovery",
    body:
      "The app may send operational notifications related to trip offers, live trip status, and service actions. Passwords are not shown after being set. Temporary passwords may be issued by an authorized admin or owner for reset purposes, and users may be required to change them after login.",
  },
  {
    title: "Your Choices",
    body:
      "You may review some account information in the app, change your password, and log out. Disabling location or notification permissions may limit core trip features. For privacy requests or account-related queries, contact Qfare support or your authorized operator administrator.",
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
        <Text style={styles.kicker}>Qfare</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.subtitle}>Effective date: April 9, 2026</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.intro}>
          Qfare provides transport operations tools for drivers, conductors, owners, and operations staff. This
          Privacy Policy explains what information we collect, how we use it, and how it supports live trip and fleet
          operations.
        </Text>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={styles.card}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <Text style={styles.body}>
          For privacy or account questions, contact Qfare support or your authorized depot/admin contact. Replace this
          section with your final public support email, phone number, and business address before Play Store
          submission.
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
  kicker: {
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 12,
  },
  title: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
  },
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  intro: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 15,
    lineHeight: 23,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 22,
  },
});
