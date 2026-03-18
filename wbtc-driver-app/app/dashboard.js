import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const DRIVER_KEY = "wbtc_driver_profile";

const today = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const router = useRouter();
  const [driver, setDriver] = useState(null);
  const [trips, setTrips] = useState([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const loadTrips = async () => {
    setLoading(true);
    setNotice("");
    try {
      const [apiBase, token, driverJson] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(DRIVER_KEY),
      ]);
      if (!apiBase || !token) {
        router.replace("/login");
        return;
      }
      if (driverJson) setDriver(JSON.parse(driverJson));

      const response = await fetch(`${apiBase}/api/driver-trips?date=${today()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load trips");
      setTrips(data.trips || []);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Hello {driver?.name || "Driver"}</Text>
        </View>
        <TouchableOpacity style={styles.refresh} onPress={loadTrips}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {loading ? (
          <Text style={styles.helper}>Loading assigned trips...</Text>
        ) : trips.length === 0 ? (
          <Text style={styles.helper}>No assigned trips for today.</Text>
        ) : (
          trips.map((trip, index) => (
            <View style={styles.card} key={`trip-${trip.tripInstanceId || trip.route?.routeCode || "na"}-${index}`}>
              <Text style={styles.cardTitle}>{trip.route?.routeCode || "Route"}</Text>
              <Text style={styles.cardRow}>{trip.route?.routeName || ""}</Text>
              <Text style={styles.cardRow}>
                {trip.direction || ""} ? {trip.timing?.startTime || "--"} - {trip.timing?.endTime || "--"}
              </Text>
              <Text style={styles.cardRow}>Bus: {trip.bus?.busNumber || "--"}</Text>
              <Text style={styles.cardRow}>Pickup: {trip.pickupLocation || "--"}</Text>
              <Text style={styles.cardRow}>Drop: {trip.dropLocation || "--"}</Text>
              <TouchableOpacity
                style={styles.primary}
                onPress={() => router.push({ pathname: "/trip", params: { tripInstanceId: trip.tripInstanceId } })}
              >
                <Text style={styles.primaryText}>View trip</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 20,
  },
  header: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 4,
    color: "#64748B",
  },
  refresh: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshText: {
    fontWeight: "600",
    color: "#0F172A",
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardRow: {
    marginTop: 6,
    color: "#475569",
  },
  primary: {
    marginTop: 12,
    backgroundColor: "#2563EB",
    paddingVertical: 10,
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
    marginTop: 20,
    color: "#64748B",
  },
});
