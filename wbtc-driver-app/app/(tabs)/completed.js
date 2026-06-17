import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAppLanguage } from "../../contexts/shared-language";
import { getOpsDate } from "../../utils/opsTime";
import QfareLogo from "../../components/QfareLogo";

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
      <View style={styles.bgBubbleA} />
      <View style={styles.bgBubbleB} />

      <View style={styles.header}>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>{t("common", "today")}</Text>
          <QfareLogo size="small" align="left" />
          <Text style={styles.subtitle}>{t("driverCompleted", "title")}</Text>
        </View>
        <TouchableOpacity style={styles.refresh} onPress={loadTrips}>
          <Text style={styles.refreshText}>{t("common", "refresh")}</Text>
        </TouchableOpacity>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#9CCBFF" />}
      >
        {loading ? (
          <Text style={styles.helper}>{t("common", "loading")}</Text>
        ) : trips.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t("driverCompleted", "title")}</Text>
            <Text style={styles.helper}>{t("driverCompleted", "noCompletedTrips")}</Text>
          </View>
        ) : (
          trips.map((trip, index) => (
            <View style={styles.card} key={`trip-${trip.tripInstanceId || trip.route?.routeCode || "na"}-${index}`}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{trip.route?.routeCode || "Route"}</Text>
                  <Text style={styles.cardSubtle}>{trip.route?.routeName || ""}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{t("driverCompleted", "done")}</Text>
                </View>
              </View>
              <View style={styles.cardBanner}>
                <Text style={styles.cardRow}>
                  {trip.direction || ""} - {trip.timing?.startTime || "--"} - {trip.timing?.endTime || "--"}
                </Text>
              </View>
              <View style={styles.metaGrid}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaLabel}>{t("driverCompleted", "bus")}</Text>
                  <Text style={styles.metaValue}>{trip.bus?.busNumber || "--"}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaLabel}>{t("driverCompleted", "totalTime")}</Text>
                  <Text style={styles.metaValue}>
                    {trip.timing?.actualDurationMin ?? "--"} {t("driverCompleted", "minutes")}
                  </Text>
                </View>
              </View>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroCopy: {
    flex: 1,
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.6)",
    maxWidth: 260,
    fontWeight: "600",
  },
  refresh: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(156,203,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  refreshText: {
    fontWeight: "600",
    color: "#D7E6FF",
  },
  list: {
    paddingBottom: 30,
  },
  card: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
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
  cardBanner: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardRow: {
    color: "rgba(255,255,255,0.76)",
    fontWeight: "600",
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
  secondary: {
    marginTop: 12,
    backgroundColor: "#0090E0",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  secondaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
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
    marginTop: 6,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#9CCBFF",
    marginBottom: 6,
  },
  emptyCard: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
});
