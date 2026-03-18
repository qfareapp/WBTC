import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
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
      <View style={styles.header}>
        <Text style={styles.kicker}>Completed</Text>
        <Text style={styles.title}>Trip summary</Text>
        <Text style={styles.subtitle}>A quick look at your finished trip.</Text>
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {!trip ? (
        <Text style={styles.helper}>Loading summary...</Text>
      ) : (
        <View style={styles.card}>
          <View style={styles.banner}>
            <View>
              <Text style={styles.route}>{trip.route?.routeCode || "--"}</Text>
              <Text style={styles.subtle}>{trip.route?.routeName || ""}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>COMPLETED</Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Duration</Text>
              <Text style={styles.kpiValue}>{trip.timing?.actualDurationMin ?? "--"} min</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Bus</Text>
              <Text style={styles.kpiValue}>{trip.bus?.busNumber || "--"}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stops</Text>
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
            <Text style={styles.sectionTitle}>Timing</Text>
            <Text style={styles.row}>Started: {formatDateTime(trip.timing?.actualStartTime)}</Text>
            <Text style={styles.row}>Ended: {formatDateTime(trip.timing?.actualEndTime)}</Text>
            <Text style={styles.row}>Opening KM: {formatKm(openingKm)}</Text>
            <Text style={styles.row}>Closing KM: {formatKm(closingKm)}</Text>
            <Text style={styles.row}>Total Trip KM: {formatKm(totalTripKm)}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.primary} onPress={() => router.replace("/(tabs)/completed")}>
        <Text style={styles.primaryText}>Back to completed</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    padding: 20,
  },
  header: {
    marginTop: 16,
  },
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#94A3B8",
  },
  title: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 6,
    color: "#64748B",
  },
  card: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  banner: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  route: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtle: {
    marginTop: 4,
    color: "#64748B",
  },
  pill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 10,
    color: "#166534",
    fontWeight: "700",
    letterSpacing: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  kpi: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94A3B8",
  },
  kpiValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  section: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94A3B8",
  },
  row: {
    marginTop: 6,
    color: "#475569",
  },
  stopRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563EB",
  },
  stopDotEnd: {
    backgroundColor: "#16A34A",
  },
  stopDivider: {
    marginLeft: 4,
    height: 14,
    borderLeftWidth: 2,
    borderLeftColor: "#E2E8F0",
  },
  stopLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94A3B8",
  },
  stopValue: {
    marginTop: 4,
    color: "#0F172A",
    fontWeight: "600",
  },
  primary: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  notice: {
    marginTop: 12,
    color: "#B91C1C",
  },
  helper: {
    marginTop: 16,
    color: "#64748B",
  },
});
