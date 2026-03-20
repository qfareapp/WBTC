import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppLanguage } from "../../contexts/shared-language";
import { getOpsDate } from "../../utils/opsTime";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const USER_ROLE_KEY = "wbtc_user_role";

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const today = () => getOpsDate();

const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toIsoDate(date);
};

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const formatKm = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const isValidIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export default function OwnerRoutesScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quickFilter, setQuickFilter] = useState("today");
  const [summary, setSummary] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [periodLabel, setPeriodLabel] = useState("");
  const [customStartDate, setCustomStartDate] = useState(today());
  const [customEndDate, setCustomEndDate] = useState(today());

  const getAuth = useCallback(async () => {
    const [apiBase, token, role] = await Promise.all([
      AsyncStorage.getItem(API_BASE_KEY),
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(USER_ROLE_KEY),
    ]);
    if (!apiBase || !token || role !== "OWNER") {
      router.replace("/login");
      return null;
    }
    return { apiBase, token };
  }, [router]);

  const loadRoutes = useCallback(
    async (filterType) => {
      setLoading(true);
      setNotice("");
      try {
        const auth = await getAuth();
        if (!auth) return;

        let url = `${auth.apiBase}/api/owner/dashboard?mode=daily&date=${today()}`;
        if (filterType === "yesterday") {
          const date = yesterday();
          url = `${auth.apiBase}/api/owner/dashboard?mode=daily&date=${date}`;
        } else if (filterType === "custom") {
          if (!isValidIsoDate(customStartDate) || !isValidIsoDate(customEndDate)) {
            throw new Error(t("ownerRoutes", "useCustomDateFormat"));
          }
          if (customStartDate > customEndDate) {
            throw new Error(t("ownerRoutes", "customRangeInvalid"));
          }
          url =
            `${auth.apiBase}/api/owner/dashboard?mode=custom` +
            `&startDate=${customStartDate}&endDate=${customEndDate}`;
        }

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(data.message || t("ownerRoutes", "failedLoadAnalytics"));

        setSummary(data.summary || null);
        setRoutes((data.routeDistribution || []).slice().sort((a, b) => b.fareCollected - a.fareCollected));

        const startDate = data.period?.startDate || "--";
        const endDate = data.period?.endDate || "--";
        setPeriodLabel(`${startDate} ${t("ownerRoutes", "to")} ${endDate}`);
      } catch (err) {
        setNotice(err.message);
      } finally {
        setLoading(false);
      }
    },
    [customEndDate, customStartDate, getAuth, t]
  );

  useEffect(() => {
    loadRoutes("today");
  }, [loadRoutes]);

  const onPressQuickFilter = async (nextFilter) => {
    setQuickFilter(nextFilter);
    await loadRoutes(nextFilter);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRoutes(quickFilter);
    setRefreshing(false);
  };

  const totalRouteTrips = routes.reduce((sum, item) => sum + (item.trips || 0), 0);
  const totalRouteKm = routes.reduce((sum, item) => sum + (item.totalKmCovered || 0), 0);
  const periodSeparator = ` ${t("ownerRoutes", "to")} `;
  const [periodStart = "--", periodEnd = "--"] = periodLabel.split(periodSeparator);

  return (
    <View style={styles.container}>
      <View style={styles.bgBubbleA} />
      <View style={styles.bgBubbleB} />

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <View style={styles.kickerRow}>
              <View style={styles.kickerIconWrap}>
                <Ionicons name="map-outline" size={17} color="#FFFFFF" />
              </View>
              <Text style={styles.kicker}>{t("ownerRoutes", "analytics")}</Text>
            </View>
            <Text style={styles.title}>{t("ownerRoutes", "title")}</Text>
            <Text style={styles.subtitle}>{t("ownerRoutes", "subtitle")}</Text>
          </View>
          <View style={styles.periodPill}>
            <Text style={styles.periodMain}>{periodStart || "--"}</Text>
            <Text style={styles.periodSub}>{t("ownerRoutes", "to")} {periodEnd || "--"}</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, quickFilter === "today" ? styles.filterBtnActive : null]}
            onPress={() => onPressQuickFilter("today")}
          >
            <Text style={[styles.filterText, quickFilter === "today" ? styles.filterTextActive : null]}>{t("common", "today")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, quickFilter === "yesterday" ? styles.filterBtnActive : null]}
            onPress={() => onPressQuickFilter("yesterday")}
          >
            <Text style={[styles.filterText, quickFilter === "yesterday" ? styles.filterTextActive : null]}>
              {t("common", "yesterday")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, quickFilter === "custom" ? styles.filterBtnActive : null]}
            onPress={() => onPressQuickFilter("custom")}
          >
            <Text style={[styles.filterText, quickFilter === "custom" ? styles.filterTextActive : null]}>{t("common", "custom")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {quickFilter === "custom" ? (
          <View style={styles.customWrap}>
            <View style={styles.dateField}>
              <Text style={styles.inputLabel}>{t("ownerRoutes", "startDate")}</Text>
              <TextInput
                value={customStartDate}
                onChangeText={setCustomStartDate}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.inputLabel}>{t("ownerRoutes", "endDate")}</Text>
              <TextInput
                value={customEndDate}
                onChangeText={setCustomEndDate}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity style={styles.applyBtn} onPress={() => loadRoutes("custom")}>
              <Text style={styles.applyText}>{t("common", "applyDateRange")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}><Text style={styles.kpiIcon}>🗺</Text></View>
            <Text style={styles.kpiLabel}>{t("ownerRoutes", "totalRoutes")}</Text>
            <Text style={styles.kpiValue}>{summary?.totalRoutes ?? routes.length}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}><Text style={styles.kpiIcon}>🔁</Text></View>
            <Text style={styles.kpiLabel}>{t("ownerRoutes", "routeTrips")}</Text>
            <Text style={styles.kpiValue}>{totalRouteTrips}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}><Text style={styles.kpiIcon}>🎫</Text></View>
            <Text style={styles.kpiLabel}>{t("ownerRoutes", "tickets")}</Text>
            <Text style={styles.kpiValue}>{summary?.ticketsGenerated ?? 0}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}><Text style={styles.kpiIcon}>💰</Text></View>
            <Text style={styles.kpiLabel}>{t("ownerRoutes", "routeCollection")}</Text>
            <Text style={styles.kpiValue}>{t("common", "rs")} {formatMoney(summary?.fareCollected)}</Text>
          </View>
        </View>

        <View style={styles.kmCard}>
          <View>
            <Text style={styles.kpiLabel}>{t("ownerRoutes", "fleetKmCovered")}</Text>
            <Text style={styles.kpiValue}>{formatKm(summary?.totalKmCovered ?? totalRouteKm)} km</Text>
          </View>
          <View style={styles.kmIconWrap}><Text style={styles.kpiIcon}>📏</Text></View>
        </View>

        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>{t("ownerRoutes", "routePerformance")}</Text>
          </View>
          <Text style={styles.sectionCount}>{routes.length === 1 ? t("ownerRoutes", "routeCount", { count: routes.length }) : t("ownerRoutes", "routeCountPlural", { count: routes.length })}</Text>
        </View>
        {loading ? <Text style={styles.helper}>{t("ownerRoutes", "loadingAnalytics")}</Text> : null}
        {!loading && !routes.length ? <Text style={styles.helper}>{t("ownerRoutes", "noPerformance")}</Text> : null}
        {routes.map((route, index) => (
          <View key={`route-${route.routeId || route.routeCode || "na"}-${index}`} style={styles.routeCard}>
            <View style={styles.routeAccent} />
            <View style={styles.routeHead}>
              <Text style={styles.routeCode}>{route.routeCode}</Text>
              <Text style={styles.routeFare}>Rs {formatMoney(route.fareCollected)}</Text>
            </View>
            <Text style={styles.routeName}>📍 {route.routeName}</Text>
            <View style={styles.routeStatsGrid}>
              <Text style={styles.routeMeta}>🔁 Trips: {route.trips}</Text>
              <Text style={styles.routeMeta}>🚌 Fleet: {route.buses}</Text>
              <Text style={styles.routeMeta}>🎫 Tickets: {route.ticketsGenerated}</Text>
              <Text style={styles.routeMeta}>📏 KM: {formatKm(route.totalKmCovered)} km</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A1628", padding: 16 },
  bgBubbleA: {
    position: "absolute",
    top: -30,
    right: -26,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: "rgba(0,144,224,0.12)",
  },
  bgBubbleB: {
    position: "absolute",
    top: 220,
    left: -40,
    width: 130,
    height: 130,
    borderRadius: 999,
    backgroundColor: "rgba(0,200,122,0.08)",
  },
  heroCard: {
    marginTop: 16,
    backgroundColor: "#0D2240",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  kickerRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 4 },
  kickerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#0B7FC8",
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600", letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: "800", color: "#FFFFFF" },
  subtitle: { marginTop: 3, color: "rgba(255,255,255,0.42)", fontSize: 13 },
  periodPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  periodMain: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  periodSub: { color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 1 },
  notice: { marginTop: 8, color: "#7F1D1D", backgroundColor: "#FEE2E2", padding: 8, borderRadius: 10 },
  content: { paddingBottom: 24 },
  filterRow: { marginTop: 16, flexDirection: "row", gap: 8 },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterBtnActive: { backgroundColor: "#008FCC", borderColor: "rgba(0,144,224,0.4)" },
  filterText: { color: "rgba(255,255,255,0.5)", fontWeight: "700" },
  filterTextActive: { color: "#FFFFFF" },
  customWrap: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  dateField: { marginTop: 4 },
  inputLabel: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#FFFFFF",
  },
  applyBtn: { marginTop: 10, backgroundColor: "#0090E0", paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  applyText: { color: "#FFFFFF", fontWeight: "800" },
  kpiGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  kpiIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiIcon: { fontSize: 15 },
  kpiLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  kpiValue: { marginTop: 4, color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  kmCard: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(0,200,122,0.1)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHead: { marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionAccent: { width: 3, height: 18, borderRadius: 2, backgroundColor: "#00C87A" },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.6 },
  sectionCount: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
  routeCard: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    position: "relative",
    overflow: "hidden",
  },
  routeAccent: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: "#0090E0",
  },
  routeHead: { marginLeft: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  routeCode: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  routeFare: { fontWeight: "800", color: "#00C87A" },
  routeName: { marginTop: 8, marginLeft: 8, color: "rgba(255,255,255,0.75)", fontSize: 13 },
  routeStatsGrid: { marginTop: 12, marginLeft: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  routeMeta: { color: "rgba(255,255,255,0.72)", fontSize: 12, minWidth: "46%" },
  helper: { marginTop: 10, color: "rgba(255,255,255,0.6)" },
});
