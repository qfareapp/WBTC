import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAppLanguage } from "../../contexts/shared-language";
import { getOpsDate } from "../../utils/opsTime";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";

const today = () => getOpsDate();

export default function CompletedTrips() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [trips, setTrips] = useState([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrips = async () => {
    setLoading(true);
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

      const response = await fetch(`${apiBase}/api/driver-trips?date=${today()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("driverCompleted", "failedLoadTrips"));

      const completed = (data.trips || []).filter((trip) => trip.status === "Completed");
      setTrips(completed);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{t("common", "today")}</Text>
          <Text style={styles.title}>{t("driverCompleted", "title")}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refresh} onPress={loadTrips}>
            <Text style={styles.refreshText}>{t("common", "refresh")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {loading ? (
          <Text style={styles.helper}>{t("common", "loading")}</Text>
        ) : trips.length === 0 ? (
          <Text style={styles.helper}>{t("driverCompleted", "noCompletedTrips")}</Text>
        ) : (
          trips.map((trip, index) => (
            <View style={styles.card} key={`trip-${trip.tripInstanceId || trip.route?.routeCode || "na"}-${index}`}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{trip.route?.routeCode || "Route"}</Text>
                  <Text style={styles.cardRow}>{trip.route?.routeName || ""}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{t("driverCompleted", "done")}</Text>
                </View>
              </View>
              <Text style={styles.cardRow}>
                {trip.direction || ""} - {trip.timing?.startTime || "--"} - {trip.timing?.endTime || "--"}
              </Text>
              <Text style={styles.cardRow}>{t("driverCompleted", "bus")}: {trip.bus?.busNumber || "--"}</Text>
              <Text style={styles.cardRow}>{t("driverCompleted", "totalTime")}: {trip.timing?.actualDurationMin ?? "--"} {t("driverCompleted", "minutes")}</Text>
              <TouchableOpacity
                style={styles.secondary}
                onPress={() => router.push({ pathname: "/trip-summary", params: { tripInstanceId: trip.tripInstanceId } })}
              >
                <Text style={styles.secondaryText}>{t("driverCompleted", "viewSummary")}</Text>
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
    backgroundColor: "#F1F5F9",
    padding: 20,
  },
  header: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
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
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  pill: {
    backgroundColor: "#E0E7FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 10,
    color: "#3730A3",
    fontWeight: "700",
    letterSpacing: 1,
  },
  cardRow: {
    marginTop: 6,
    color: "#475569",
  },
  secondary: {
    marginTop: 12,
    backgroundColor: "#E2E8F0",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryText: {
    color: "#0F172A",
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
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#94A3B8",
  },
});
