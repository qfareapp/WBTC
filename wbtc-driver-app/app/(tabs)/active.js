import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAppLanguage } from "../../contexts/shared-language";
import useOfferAlert from "../../hooks/use-offer-alert";
import { getOpsDate } from "../../utils/opsTime";
import QfareLogo from "../../components/QfareLogo";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const DRIVER_KEY = "wbtc_driver_profile";

const today = () => getOpsDate();
const formatKm = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

export default function ActiveTrips() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [trips, setTrips] = useState([]);
  const [scheduledTrips, setScheduledTrips] = useState([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [driver, setDriver] = useState(null);
  const [dutyUpdating, setDutyUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [todayTripsCovered, setTodayTripsCovered] = useState(0);
  const [todayKmsCovered, setTodayKmsCovered] = useState("0.00");

  const isOnDuty = (driver?.status || "Available") === "Available";

  useOfferAlert(offers, isOnDuty);

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
      if (!response.ok) throw new Error(data.message || t("driverActive", "failedLoadTrips"));

      const allTrips = data.trips || [];
      const active = allTrips.filter((trip) => trip.status === "Active");
      const scheduled = allTrips.filter((trip) => trip.status === "Scheduled");
      setTrips(active);
      setScheduledTrips(scheduled);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTodaySummary = async () => {
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) return;

      const date = today();
      const response = await fetch(
        `${apiBase}/api/driver-trips/summary?startDate=${date}&endDate=${date}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("driverActive", "failedLoadSummary"));

      setTodayTripsCovered(data?.today?.tripsCovered ?? 0);
      setTodayKmsCovered(formatKm(data?.today?.kmsCovered));
    } catch (err) {
      setNotice(err.message);
    }
  };

  const loadOffers = async () => {
    setOffersLoading(true);
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) return;
      const response = await fetch(`${apiBase}/api/driver-trips/offers?date=${today()}&debug=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("driverActive", "failedLoadOffers"));
      setOffers(data.offers || []);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setOffersLoading(false);
    }
  };

  useEffect(() => {
    loadOffers();
  }, []);

  useEffect(() => {
    loadTodaySummary();
  }, []);

  useEffect(() => {
    if (!isOnDuty) return undefined;
    const interval = setInterval(loadOffers, 20000);
    return () => clearInterval(interval);
  }, [isOnDuty]);

  const handleOfferAction = async (tripInstanceId, action) => {
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) return;
      const response = await fetch(`${apiBase}/api/driver-trips/offers/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tripInstanceId }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("driverActive", "failedUpdateOffer"));
      await loadOffers();
      await loadTrips();
    } catch (err) {
      setNotice(err.message);
    }
  };

  const cancelAcceptedTrip = async (tripInstanceId) => {
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) return;
      const response = await fetch(`${apiBase}/api/driver-trips/offers/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tripInstanceId }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("driverActive", "failedCancelTrip"));
      setNotice(t("driverActive", "scheduledCancelled"));
      await Promise.all([loadTrips(), loadOffers()]);
    } catch (err) {
      setNotice(err.message);
    }
  };

  const toggleDuty = async () => {
    if (dutyUpdating) return;
    setNotice("");
    setDutyUpdating(true);
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) {
        router.replace("/login");
        return;
      }
      const nextStatus = isOnDuty ? "OnLeave" : "Available";
      const response = await fetch(`${apiBase}/api/driver-trips/duty`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("driverActive", "failedUpdateDuty"));

      const updated = {
        ...(driver || {}),
        status: data.driver?.status || nextStatus,
        currentLocation: data.driver?.currentLocation || driver?.currentLocation || null,
      };
      setDriver(updated);
      await AsyncStorage.setItem(DRIVER_KEY, JSON.stringify(updated));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setDutyUpdating(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTrips(), loadOffers(), loadTodaySummary()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
        <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{t("common", "today")}</Text>
          <QfareLogo size="small" align="left" />
          <Text style={styles.subtitle}>
            {isOnDuty ? t("driverActive", "subtitleOnDuty") : t("driverActive", "subtitleOffDuty")}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.dutyToggle, isOnDuty ? styles.dutyOn : styles.dutyOff]}
            onPress={toggleDuty}
            disabled={dutyUpdating}
          >
            <Text style={styles.dutyText}>{isOnDuty ? t("driverActive", "onDuty") : t("driverActive", "offDuty")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.todayBanner}>
          <View style={styles.bannerItem}>
            <Text style={styles.bannerLabel}>{t("driverActive", "tripsCoveredToday")}</Text>
            <Text style={styles.bannerValue}>{todayTripsCovered}</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerItem}>
            <Text style={styles.bannerLabel}>{t("driverActive", "kmsCoveredToday")}</Text>
            <Text style={styles.bannerValue}>{todayKmsCovered} km</Text>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.sectionTitleWrap}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>{t("driverActive", "tripOffers")}</Text>
          </View>
          {offers.length > 0 ? (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{t("driverActive", "pending", { count: offers.length })}</Text>
            </View>
          ) : null}
        </View>

        {offersLoading ? (
          <Text style={styles.helper}>{t("driverActive", "loadingOffers")}</Text>
        ) : offers.length > 0 ? (
          offers.map((offer, offerIndex) => (
            <View style={styles.card} key={`offer-${offer.tripInstanceId || offer.route?.routeCode || "na"}-${offerIndex}`}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{offer.route?.routeCode || t("driverActive", "route")}</Text>
                  <Text style={styles.cardRow}>{offer.route?.routeName || ""}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{t("driverActive", "offer")}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t("driverActive", "time")}</Text>
                  <Text style={styles.metaValue}>
                    {offer.startTime || "--"} - {offer.endTime || "--"}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>{t("driverActive", "bus")}</Text>
                  <Text style={styles.metaValue}>
                    {offer.busAssigned?.busNumber || t("driverActive", "availableList")}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardRow}>{t("driverActive", "pickup")}: {offer.pickupLocation || "--"}</Text>
              <Text style={styles.cardRow}>{t("driverActive", "drop")}: {offer.dropLocation || "--"}</Text>
              <View style={styles.offerActions}>
                <TouchableOpacity
                  style={[styles.primary, { flex: 1 }]}
                  onPress={() => handleOfferAction(offer.tripInstanceId, "accept")}
                >
                  <Text style={styles.primaryText}>{t("driverActive", "accept")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondary, { flex: 1 }]}
                  onPress={() => handleOfferAction(offer.tripInstanceId, "reject")}
                >
                  <Text style={styles.secondaryText}>{t("driverActive", "reject")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : null}
        {loading ? (
          <Text style={styles.helper}>{t("driverActive", "loadingTrips")}</Text>
        ) : (
          <>
            {scheduledTrips.length === 0 ? null : (
              <>
                <Text style={styles.sectionTitle}>{t("driverActive", "scheduledTrips")}</Text>
                {scheduledTrips.map((trip, scheduledIndex) => (
                  <View style={styles.card} key={`scheduled-${trip.tripInstanceId || trip.route?.routeCode || "na"}-${scheduledIndex}`}>
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.cardTitle}>{trip.route?.routeCode || t("driverActive", "route")}</Text>
                        <Text style={styles.cardRow}>{trip.route?.routeName || ""}</Text>
                      </View>
                      <View style={[styles.pill, styles.pillScheduled]}>
                        <Text style={[styles.pillText, styles.pillTextScheduled]}>{t("driverActive", "scheduled")}</Text>
                      </View>
                    </View>
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>{t("driverActive", "time")}</Text>
                        <Text style={styles.metaValue}>
                          {trip.timing?.startTime || "--"} - {trip.timing?.endTime || "--"}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>{t("driverActive", "bus")}</Text>
                        <Text style={styles.metaValue}>{trip.bus?.busNumber || "--"}</Text>
                      </View>
                    </View>
                    <View style={styles.stopRow}>
                      <View style={styles.stopDot} />
                      <Text style={styles.cardRow}>{t("driverActive", "pickup")}: {trip.pickupLocation || "--"}</Text>
                    </View>
                    <View style={styles.offerActions}>
                      <TouchableOpacity
                        style={[styles.primary, { flex: 1 }]}
                        onPress={() => router.push({ pathname: "/trip", params: { tripInstanceId: trip.tripInstanceId } })}
                      >
                        <Text style={styles.primaryText}>{t("driverActive", "openTrip")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.secondary, { flex: 1 }]}
                        onPress={() => cancelAcceptedTrip(trip.tripInstanceId)}
                      >
                        <Text style={styles.secondaryText}>{t("driverActive", "cancelTrip")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
            {trips.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{t("driverActive", "noActiveTrips")}</Text>
                <Text style={styles.emptyText}>{t("driverActive", "stayOnDuty")}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>{t("driverActive", "activeTrips")}</Text>
                {trips.map((trip, tripIndex) => (
                  <View style={styles.card} key={`trip-${trip.tripInstanceId || trip.route?.routeCode || "na"}-${tripIndex}`}>
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.cardTitle}>{trip.route?.routeCode || t("driverActive", "route")}</Text>
                        <Text style={styles.cardRow}>{trip.route?.routeName || ""}</Text>
                      </View>
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{t("driverActive", "active")}</Text>
                      </View>
                    </View>
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>{t("driverActive", "time")}</Text>
                        <Text style={styles.metaValue}>
                          {trip.timing?.startTime || "--"} - {trip.timing?.endTime || "--"}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>{t("driverActive", "bus")}</Text>
                        <Text style={styles.metaValue}>{trip.bus?.busNumber || "--"}</Text>
                      </View>
                    </View>
                    <View style={styles.stopRow}>
                      <View style={styles.stopDot} />
                      <Text style={styles.cardRow}>{t("driverActive", "pickup")}: {trip.pickupLocation || "--"}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.primary}
                      onPress={() => router.push({ pathname: "/trip", params: { tripInstanceId: trip.tripInstanceId } })}
                    >
                      <Text style={styles.primaryText}>{t("driverActive", "openTrip")}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </>
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
  header: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.6)",
    maxWidth: 260,
  },
  dutyToggle: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  dutyOn: {
    backgroundColor: "rgba(0,200,122,0.15)",
    borderColor: "rgba(0,200,122,0.55)",
  },
  dutyOff: {
    backgroundColor: "rgba(251,146,60,0.12)",
    borderColor: "rgba(251,146,60,0.45)",
  },
  dutyText: {
    fontWeight: "800",
    color: "#E2E8F0",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  list: {
    paddingBottom: 30,
  },
  todayBanner: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  bannerItem: {
    flex: 1,
    alignItems: "center",
  },
  bannerLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    textAlign: "center",
  },
  bannerValue: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  bannerDivider: {
    width: 1,
    height: 42,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 14,
  },
  sectionRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 99,
    backgroundColor: "#0090E0",
  },
  card: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  emptyCard: {
    marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyText: {
    marginTop: 6,
    color: "rgba(255,255,255,0.45)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "rgba(255,255,255,0.88)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  pendingBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.42)",
    backgroundColor: "rgba(251,146,60,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingBadgeText: {
    color: "#FB923C",
    fontWeight: "700",
    fontSize: 11,
  },
  pill: {
    backgroundColor: "rgba(251,146,60,0.17)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.36)",
  },
  pillScheduled: {
    backgroundColor: "rgba(0,144,224,0.14)",
    borderColor: "rgba(0,144,224,0.38)",
  },
  pillText: {
    fontSize: 10,
    color: "#FB923C",
    fontWeight: "700",
    letterSpacing: 1,
  },
  pillTextScheduled: {
    color: "#0090E0",
  },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 12,
  },
  metaItem: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  metaLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.38)",
  },
  metaValue: {
    marginTop: 4,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  cardRow: {
    marginTop: 6,
    color: "rgba(255,255,255,0.58)",
  },
  mutedInfo: {
    marginTop: 8,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
  },
  stopRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00C87A",
  },
  primary: {
    marginTop: 12,
    backgroundColor: "#0090E0",
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
  },
  secondary: {
    marginTop: 12,
    backgroundColor: "rgba(239,68,68,0.16)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  secondaryText: {
    color: "#F87171",
    fontWeight: "800",
  },
  notice: {
    marginTop: 12,
    color: "#FCA5A5",
  },
  helper: {
    marginTop: 20,
    color: "rgba(255,255,255,0.5)",
  },
  offerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.35)",
  },
});
