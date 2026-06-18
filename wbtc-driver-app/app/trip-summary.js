import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";

const formatDateTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const formatKm = (value) => {
  if (!Number.isFinite(value)) return "--";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

export default function TripSummary() {
  const router = useRouter();
  const { tripInstanceId } = useLocalSearchParams();
  const tripId = Array.isArray(tripInstanceId) ? tripInstanceId[0] : tripInstanceId;
  const [trip, setTrip] = useState(null);
  const [notice, setNotice] = useState("");
  const openingKm = Number(trip?.timing?.openingKm);
  const closingKm = Number(trip?.timing?.closingKm);
  const totalTripKm =
    Number.isFinite(openingKm) && Number.isFinite(closingKm) ? closingKm - openingKm : NaN;

  const loadTrip = async () => {
    setNotice("");
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`${apiBase}/api/driver-trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load summary");
      setTrip(data.trip);
    } catch (err) {
      setNotice(err.message);
    }
  };

  useEffect(() => {
    if (tripId) loadTrip();
  }, [tripId]);

  return (
    <View style={styles.container}>
      <View style={styles.bgBubbleA} />
      <View style={styles.bgBubbleB} />

      <View style={styles.header}>
        <Text style={styles.kicker}>Completed</Text>
        <Text style={styles.title}>Trip summary</Text>
        <Text style={styles.subtitle}>A quick look at your finished trip.</Text>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!trip ? (
          <Text style={styles.helper}>Loading summary...</Text>
        ) : (
          <View style={styles.card}>
            <View style={styles.banner}>
              <View>
                <Text style={styles.cardTitle}>{trip.route?.routeCode || "--"}</Text>
                <Text style={styles.cardSubtle}>{trip.route?.routeName || ""}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>COMPLETED</Text>
              </View>
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaChip}>
                <Text style={styles.metaLabel}>Duration</Text>
                <Text style={styles.metaValue}>{trip.timing?.actualDurationMin ?? "--"} min</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaLabel}>Bus</Text>
                <Text style={styles.metaValue}>{trip.bus?.busNumber || "--"}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionTitle}>Stops</Text>
              </View>
              <View style={styles.stopRow}>
                <View style={styles.stopDot} />
                <View>
                  <Text style={styles.stopLabel}>Pickup</Text>
                  <Text style={styles.stopValue}>{trip.pickupLocation || "--"}</Text>
                </View>
              </View>
              <View style={styles.stopDivider} />
              <View style={styles.stopRow}>
                <View style={[styles.stopDot, styles.stopDotEnd]} />
                <View>
                  <Text style={styles.stopLabel}>Drop</Text>
                  <Text style={styles.stopValue}>{trip.dropLocation || "--"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionTitle}>Timing</Text>
              </View>
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Started</Text>
                <Text style={styles.timingValue}>{formatDateTime(trip.timing?.actualStartTime)}</Text>
              </View>
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Ended</Text>
                <Text style={styles.timingValue}>{formatDateTime(trip.timing?.actualEndTime)}</Text>
              </View>
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Opening KM</Text>
                <Text style={styles.timingValue}>{formatKm(openingKm)}</Text>
              </View>
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Closing KM</Text>
                <Text style={styles.timingValue}>{formatKm(closingKm)}</Text>
              </View>
              <View style={[styles.timingRow, styles.timingRowLast]}>
                <Text style={styles.timingLabel}>Total Trip KM</Text>
                <Text style={[styles.timingValue, styles.timingValueHighlight]}>{formatKm(totalTripKm)}</Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.primary} onPress={() => router.replace("/(tabs)/completed")}>
          <Text style={styles.primaryText}>Back to completed</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
    padding: 20,
  },
  bgBubbleA: {
    position: "absolute",
    top: -70,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(56,189,248,0.09)",
  },
  bgBubbleB: {
    position: "absolute",
    left: -90,
    top: 260,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(167,139,250,0.08)",
  },
  header: {
    marginTop: 18,
    marginBottom: 4,
  },
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#9CCBFF",
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.6)",
  },
  scrollContent: {
    paddingBottom: 30,
  },
  card: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  banner: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  cardSubtle: {
    marginTop: 5,
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
  },
  pill: {
    backgroundColor: "rgba(0,200,122,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 10,
    color: "#34D399",
    fontWeight: "700",
    letterSpacing: 1,
  },
  metaGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  metaChip: {
    flex: 1,
    backgroundColor: "rgba(9,19,37,0.55)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  metaLabel: {
    color: "rgba(156,203,255,0.72)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  metaValue: {
    marginTop: 6,
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  section: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 99,
    backgroundColor: "#0090E0",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.88)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  stopRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 6,
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0090E0",
  },
  stopDotEnd: {
    backgroundColor: "#00C87A",
  },
  stopDivider: {
    marginLeft: 4,
    height: 14,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.12)",
  },
  stopLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "rgba(156,203,255,0.72)",
  },
  stopValue: {
    marginTop: 3,
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  timingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  timingRowLast: {
    borderBottomWidth: 0,
  },
  timingLabel: {
    color: "rgba(156,203,255,0.72)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timingValue: {
    color: "rgba(255,255,255,0.88)",
    fontWeight: "600",
    fontSize: 13,
  },
  timingValueHighlight: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  primary: {
    marginTop: 16,
    backgroundColor: "#0090E0",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  notice: {
    marginTop: 12,
    color: "#FECACA",
    backgroundColor: "rgba(185,28,28,0.22)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helper: {
    marginTop: 20,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
});
