import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConductorLanguage } from "../../contexts/conductor-language";
import { getOpsDate } from "../../utils/opsTime";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const USER_ROLE_KEY = "wbtc_user_role";

const today = () => getOpsDate();

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const formatTicketTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function ConductorTickets() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useConductorLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [tripGroups, setTripGroups] = useState([]);
  const [expandedTripIds, setExpandedTripIds] = useState({});

  const getAuth = useCallback(async () => {
    const [apiBase, token, role] = await Promise.all([
      AsyncStorage.getItem(API_BASE_KEY),
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(USER_ROLE_KEY),
    ]);
    if (!apiBase || !token || role !== "CONDUCTOR") {
      router.replace("/login");
      return null;
    }
    return { apiBase, token };
  }, [router]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/tickets?date=${today()}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load tickets");
      const rows = Array.isArray(data.trips) ? data.trips : [];
      setTripGroups(rows);
      setNotice("");
    } catch (err) {
      setNotice(err.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [getAuth]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const totalFare = useMemo(
    () => tripGroups.reduce((sum, trip) => sum + (Number(trip.fareCollected) || 0), 0),
    [tripGroups]
  );

  const totalTickets = useMemo(
    () =>
      tripGroups.reduce(
        (sum, trip) =>
          sum + (trip.tickets || []).reduce((ticketSum, ticket) => ticketSum + (Number(ticket.passengerCount) || 0), 0),
        0
      ),
    [tripGroups]
  );

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString([], {
        weekday: "short",
        day: "2-digit",
        month: "short",
      }),
    []
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTickets();
    setRefreshing(false);
  };

  const toggleTrip = (tripKey) => {
    setExpandedTripIds((prev) => ({ ...prev, [tripKey]: !prev[tripKey] }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.glowTop} />
      <View style={styles.glowLeft} />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>{t("tickets", "console")}</Text>
            <Text style={styles.title}>{t("tickets", "title")}</Text>
            <Text style={styles.subtitle}>{t("tickets", "subtitle")}</Text>
          </View>
          <View style={styles.headerBadge}>
            <Ionicons name="calendar-outline" size={14} color="#9CCBFF" />
            <Text style={styles.headerBadgeText}>{todayLabel}</Text>
          </View>
        </View>
      </View>

      {notice ? (
        <View style={styles.noticeCard}>
          <Ionicons name="alert-circle-outline" size={16} color="#FCA5A5" />
          <Text style={styles.notice}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.statsCard}>
        <View style={styles.statsGlow} />
        <View style={styles.statsBar} />
        <View style={styles.statsRow}>
          <View style={styles.statsItem}>
            <View style={styles.statsIconWrap}>
              <Ionicons name="swap-horizontal-outline" size={15} color="#0090E0" />
            </View>
            <Text style={styles.statsLabel}>{t("tickets", "trips")}</Text>
            <Text style={[styles.statsValue, styles.statsValueBlue]}>{tripGroups.length}</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsItem}>
            <View style={styles.statsIconWrap}>
              <Ionicons name="ticket-outline" size={15} color="#A78BFA" />
            </View>
            <Text style={styles.statsLabel}>{t("tickets", "tickets")}</Text>
            <Text style={[styles.statsValue, styles.statsValuePurple]}>{totalTickets}</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsItem}>
            <View style={styles.statsIconWrap}>
              <Ionicons name="cash-outline" size={15} color="#00C87A" />
            </View>
            <Text style={styles.statsLabel}>{t("tickets", "fare")}</Text>
            <Text style={[styles.statsValue, styles.statsValueGreen]}>Rs {formatMoney(totalFare)}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9CCBFF" />}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWrap}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>{t("tickets", "trips")}</Text>
          </View>
          <Text style={styles.sectionCount}>{tripGroups.length} {t("tickets", "trips").toLowerCase()}</Text>
        </View>

        {loading ? <Text style={styles.helper}>{t("tickets", "loading")}</Text> : null}

        {!loading && tripGroups.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="ticket-outline" size={34} color="rgba(255,255,255,0.42)" />
            </View>
            <Text style={styles.emptyTitle}>{t("tickets", "noTrips")}</Text>
            <Text style={styles.emptySubtitle}>{t("tickets", "noTripsDesc")}</Text>
          </View>
        ) : null}

        {tripGroups.map((trip, index) => {
          const tripKey = String(trip.tripInstanceId || `trip-${index}`);
          const expanded = Boolean(expandedTripIds[tripKey]);
          const routeCode = trip.route?.routeCode || "--";
          const routeName = trip.route?.routeName || "--";
          const [routeFrom, routeTo] = String(routeName)
            .split("-")
            .map((part) => part.trim());
          const ticketRows = Array.isArray(trip.tickets) ? trip.tickets : [];
          const tripPassengerCount = ticketRows.reduce((sum, ticket) => sum + (Number(ticket.passengerCount) || 0), 0);

          return (
            <View key={`trip-${tripKey}`} style={styles.card}>
              <View style={styles.cardGlow} />
              <View style={styles.cardAccent} />

              <View style={styles.cardInner}>
                <View style={styles.cardTop}>
                  <View style={styles.routeWrap}>
                    <View style={styles.routeBadgeRow}>
                      <Text style={styles.routeCode}>{routeCode}</Text>
                      <View style={styles.completedPill}>
                        <Text style={styles.completedText}>{t("tickets", "completed")}</Text>
                      </View>
                    </View>
                    <View style={styles.routeNameRow}>
                      <Text style={styles.routeName}>{routeFrom || routeName}</Text>
                      <Ionicons name="arrow-forward" size={11} color="rgba(255,255,255,0.22)" />
                      <Text style={styles.routeName}>{routeTo || "--"}</Text>
                    </View>
                  </View>

                  <View style={styles.fareWrap}>
                    <Text style={styles.fareHeader}>{t("tickets", "collectedFare")}</Text>
                    <Text style={styles.fareValue}>Rs {formatMoney(trip.fareCollected)}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Ionicons name="bus-outline" size={14} color="#9CCBFF" />
                    <View>
                      <Text style={styles.metaLabel}>{t("tickets", "bus")}</Text>
                      <Text style={styles.metaValue}>{trip.busNumber || "--"}</Text>
                    </View>
                  </View>
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={14} color="#9CCBFF" />
                    <View>
                      <Text style={styles.metaLabel}>{t("tickets", "time")}</Text>
                      <Text style={styles.metaValue}>{trip.timing?.startTime || "--"} - {trip.timing?.endTime || "--"}</Text>
                    </View>
                  </View>
                  <View style={styles.metaChip}>
                    <Ionicons name="ticket-outline" size={14} color="#9CCBFF" />
                    <View>
                      <Text style={styles.metaLabel}>{t("tickets", "tickets")}</Text>
                      <Text style={styles.metaValue}>{tripPassengerCount}</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.detailsBtn, expanded ? styles.detailsBtnActive : null]}
                  onPress={() => toggleTrip(tripKey)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.detailsText, expanded ? styles.detailsTextActive : null]}>
                    {expanded ? t("tickets", "hideDetails") : t("tickets", "showDetails")}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={expanded ? "#0090E0" : "rgba(255,255,255,0.5)"}
                    style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
                  />
                </TouchableOpacity>

                {expanded ? (
                  <View style={styles.breakdownWrap}>
                    <Text style={styles.breakdownTitle}>{t("tickets", "ticketBreakdown")}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.tableScrollContent}
                    >
                      <View style={styles.tableWrap}>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.tableHeadText, styles.tableHeadWide]}>{t("tickets", "ticketId")}</Text>
                          <Text style={[styles.tableHeadText, styles.tableHeadTime]}>{t("tickets", "bookingTime")}</Text>
                          <Text style={[styles.tableHeadText, styles.tableHeadWide]}>{t("tickets", "from")}</Text>
                          <Text style={[styles.tableHeadText, styles.tableHeadWide]}>{t("tickets", "to")}</Text>
                          <Text style={styles.tableHeadText}>{t("tickets", "pax")}</Text>
                          <Text style={styles.tableHeadText}>{t("tickets", "amount")}</Text>
                        </View>

                        <View style={styles.tableBody}>
                          {ticketRows.map((ticket, ticketIndex) => (
                            <View
                              key={`ticket-${tripKey}-${ticket.bookingId || ticketIndex}`}
                              style={[styles.tableRow, ticketIndex % 2 === 0 ? styles.tableRowAlt : null]}
                            >
                              <Text style={[styles.tableCell, styles.tableCellWide]}>{ticket.bookingId || "--"}</Text>
                              <Text style={[styles.tableCell, styles.tableCellTime]}>{formatTicketTime(ticket.bookedAt)}</Text>
                              <Text style={[styles.tableCell, styles.tableCellWide]}>{ticket.source || "--"}</Text>
                              <Text style={[styles.tableCell, styles.tableCellWide]}>{ticket.destination || "--"}</Text>
                              <Text style={[styles.tableCell, styles.tableCellPax]}>{ticket.passengerCount || 1}</Text>
                              <Text style={[styles.tableCell, styles.tableCellAmount]}>Rs {formatMoney(ticket.fare)}</Text>
                            </View>
                          ))}

                          <View style={styles.tableTotalRow}>
                            <Text style={[styles.tableTotalLabel, { flex: 3.8 }]}>{t("tickets", "total")}</Text>
                            <Text style={[styles.tableTotalPax, styles.tableCellPax]}>{tripPassengerCount}</Text>
                            <Text style={[styles.tableTotalAmount, styles.tableCellAmount]}>
                              Rs {formatMoney(trip.fareCollected)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
    paddingHorizontal: 24,
  },
  glowTop: {
    position: "absolute",
    top: -40,
    right: -24,
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: "rgba(0,144,224,0.12)",
  },
  glowLeft: {
    position: "absolute",
    top: 220,
    left: -36,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(167,139,250,0.08)",
  },
  header: {
    marginTop: 52,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(156,203,255,0.18)",
  },
  headerBadgeText: {
    color: "#D8EAFE",
    fontSize: 12,
    fontWeight: "700",
  },
  kicker: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 5,
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 5,
    color: "rgba(255,255,255,0.42)",
    fontSize: 13,
    lineHeight: 20,
  },
  noticeCard: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.24)",
    backgroundColor: "rgba(127,29,29,0.24)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notice: {
    color: "#FCA5A5",
    flex: 1,
    lineHeight: 18,
  },
  statsCard: {
    marginTop: 20,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  statsGlow: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(255,255,255,0.015)",
  },
  statsBar: {
    height: 3,
    backgroundColor: "#0090E0",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statsItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statsIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  statsDivider: {
    width: 1,
    height: 52,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  statsLabel: {
    marginTop: 8,
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
  },
  statsValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "800",
  },
  statsValueBlue: {
    color: "#0090E0",
  },
  statsValuePurple: {
    color: "#A78BFA",
  },
  statsValueGreen: {
    color: "#00C87A",
  },
  list: {
    paddingTop: 20,
    paddingBottom: 26,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: "#0090E0",
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionCount: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
  },
  helper: {
    marginTop: 10,
    color: "rgba(255,255,255,0.55)",
  },
  emptyCard: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  emptyTitle: {
    marginTop: 14,
    color: "rgba(255,255,255,0.58)",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    color: "rgba(255,255,255,0.26)",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  card: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  cardGlow: {
    position: "absolute",
    top: -80,
    right: -32,
    width: 150,
    height: 150,
    borderRadius: 999,
    backgroundColor: "rgba(0,144,224,0.08)",
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: "#0090E0",
  },
  cardInner: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginLeft: 4,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  routeWrap: {
    flex: 1,
  },
  routeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeCode: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  completedPill: {
    backgroundColor: "rgba(0,144,224,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,144,224,0.25)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  completedText: {
    color: "#0090E0",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  routeNameRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  routeName: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 13,
    fontWeight: "500",
  },
  fareWrap: {
    alignItems: "flex-end",
  },
  fareHeader: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  fareValue: {
    marginTop: 4,
    color: "#00C87A",
    fontSize: 18,
    fontWeight: "800",
  },
  metaRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaChip: {
    minWidth: "30%",
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaLabel: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  metaValue: {
    marginTop: 2,
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  detailsBtn: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  detailsBtnActive: {
    backgroundColor: "rgba(0,144,224,0.1)",
    borderColor: "rgba(0,144,224,0.2)",
  },
  detailsText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "600",
  },
  detailsTextActive: {
    color: "#0090E0",
  },
  breakdownWrap: {
    marginTop: 14,
  },
  breakdownTitle: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  tableScrollContent: {
    paddingBottom: 2,
  },
  tableWrap: {
    minWidth: 640,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tableHeadText: {
    flex: 1,
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  tableHeadWide: {
    flex: 1.4,
  },
  tableHeadTime: {
    flex: 1.1,
  },
  tableBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "rgba(255,255,255,0.07)",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  tableRowAlt: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  tableCell: {
    flex: 1,
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "500",
  },
  tableCellWide: {
    flex: 1.4,
  },
  tableCellTime: {
    flex: 1.1,
  },
  tableCellPax: {
    color: "#A78BFA",
    fontWeight: "700",
    textAlign: "center",
  },
  tableCellAmount: {
    color: "#00C87A",
    fontWeight: "700",
    textAlign: "right",
  },
  tableTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(0,200,122,0.06)",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,200,122,0.15)",
  },
  tableTotalLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "700",
  },
  tableTotalPax: {
    flex: 1,
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  tableTotalAmount: {
    flex: 1,
    color: "#00C87A",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
});
