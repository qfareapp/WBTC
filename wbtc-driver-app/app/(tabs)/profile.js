import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import AppLanguageToggle from "../../components/AppLanguageToggle";
import { useAppLanguage } from "../../contexts/shared-language";
import { getOpsDate } from "../../utils/opsTime";
import { unregisterStoredDriverPushToken } from "../../utils/pushNotifications";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const DRIVER_KEY = "wbtc_driver_profile";
const CONDUCTOR_KEY = "wbtc_conductor_profile";
const USER_ROLE_KEY = "wbtc_user_role";
const MUST_CHANGE_PASSWORD_KEY = "wbtc_must_change_password";
const today = () => getOpsDate();
const monthStart = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (value) => DATE_RE.test(String(value || ""));
const formatHours = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00 h";
  return `${num.toFixed(2)} h`;
};
const formatKm = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00 km";
  return `${num.toFixed(2)} km`;
};
const toDateValue = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDepot = (depot) => {
  if (!depot) return "--";
  if (typeof depot === "string") return depot;
  if (typeof depot === "object") {
    return depot.depotName || depot.depotCode || depot._id || depot.id || "--";
  }
  return "--";
};

export default function DriverProfile() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [driver, setDriver] = useState(null);
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState(monthStart());
  const [rangeEndDate, setRangeEndDate] = useState(today());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [profileOpen, setProfileOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("today");

  const loadSummary = async (startDate, endDate) => {
    setSummaryLoading(true);
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) {
        router.replace("/login");
        return;
      }
      const response = await fetch(
        `${apiBase}/api/driver-trips/summary?startDate=${startDate}&endDate=${endDate}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("driverProfile", "failedLoadSummary"));
      setSummary(data);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    const loadDriver = async () => {
      const driverJson = await AsyncStorage.getItem(DRIVER_KEY);
      if (driverJson) {
        const parsedDriver = JSON.parse(driverJson);
        setDriver(parsedDriver);
      }
      await loadSummary(rangeStartDate, rangeEndDate);
    };
    loadDriver();
  }, []);

  const applyRange = async () => {
    if (!isValidDate(rangeStartDate) || !isValidDate(rangeEndDate)) {
      setNotice(t("driverProfile", "useDateFormat"));
      return;
    }
    if (rangeStartDate > rangeEndDate) {
      setNotice(t("driverProfile", "invalidRange"));
      return;
    }
    setNotice("");
    await loadSummary(rangeStartDate, rangeEndDate);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const driverJson = await AsyncStorage.getItem(DRIVER_KEY);
    if (driverJson) {
      const parsedDriver = JSON.parse(driverJson);
      setDriver(parsedDriver);
    }
    await loadSummary(rangeStartDate, rangeEndDate);
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await unregisterStoredDriverPushToken({ role: "DRIVER" });
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_ROLE_KEY, DRIVER_KEY, CONDUCTOR_KEY, API_BASE_KEY, MUST_CHANGE_PASSWORD_KEY]);
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#9CCBFF" />}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroGlowA} />
          <View style={styles.heroGlowB} />
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(driver?.name || "D").slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.profileHead}>
              <Text style={styles.roleTag}>{t("driverProfile", "role")}</Text>
              <Text style={styles.title}>{driver?.name || t("driverProfile", "role")}</Text>
              <Text style={styles.subtitle}>
                {driver?.empId || "--"} | {driver?.status || t("common", "statusUnknown")}
              </Text>
            </View>
          </View>
          <View style={styles.languageToggleWrap}>
            <AppLanguageToggle />
          </View>
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.cardHeader} onPress={() => setProfileOpen((prev) => !prev)}>
            <Text style={styles.sectionHeading}>{t("driverProfile", "profileDetails")}</Text>
            <Text style={styles.cardHeaderIcon}>{profileOpen ? "^" : "v"}</Text>
          </TouchableOpacity>
          {profileOpen ? (
            <>
              <View style={styles.infoRowBox}>
                <Text style={styles.label}>{t("driverProfile", "name")}</Text>
                <Text style={styles.value}>{driver?.name || "--"}</Text>
              </View>
              <View style={styles.infoRowBox}>
                <Text style={styles.label}>{t("driverProfile", "employeeId")}</Text>
                <Text style={styles.value}>{driver?.empId || "--"}</Text>
              </View>
              <View style={styles.infoRowBox}>
                <Text style={styles.label}>{t("driverProfile", "depot")}</Text>
                <Text style={styles.value}>{formatDepot(driver?.depotId)}</Text>
              </View>
              <View style={styles.infoRowBox}>
                <Text style={styles.label}>{t("driverProfile", "status")}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{driver?.status || "--"}</Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.helper}>{t("driverProfile", "tapToViewProfile")}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeading}>{t("driverProfile", "performance")}</Text>
          <View style={styles.segmentWrap}>
            <TouchableOpacity
              style={[styles.segmentBtn, activeTab === "today" ? styles.segmentBtnActive : null]}
              onPress={() => setActiveTab("today")}
            >
              <Text style={[styles.segmentText, activeTab === "today" ? styles.segmentTextActive : null]}>{t("common", "today")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, activeTab === "month" ? styles.segmentBtnActive : null]}
              onPress={() => setActiveTab("month")}
            >
              <Text style={[styles.segmentText, activeTab === "month" ? styles.segmentTextActive : null]}>{t("driverProfile", "thisMonth")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, activeTab === "custom" ? styles.segmentBtnActive : null]}
              onPress={() => setActiveTab("custom")}
            >
              <Text style={[styles.segmentText, activeTab === "custom" ? styles.segmentTextActive : null]}>{t("common", "custom")}</Text>
            </TouchableOpacity>
          </View>

          {summaryLoading && !summary ? <Text style={styles.helper}>{t("driverProfile", "loadingSummary")}</Text> : null}

          {activeTab === "today" ? (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t("driverProfile", "kpiKm")}</Text>
                <Text style={styles.kpiValue}>{formatKm(summary?.today?.kmsCovered)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t("driverProfile", "kpiHours")}</Text>
                <Text style={styles.kpiValue}>{formatHours(summary?.today?.driveHours)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t("driverProfile", "kpiTrips")}</Text>
                <Text style={styles.kpiValue}>{summary?.today?.tripsCovered ?? 0}</Text>
              </View>
            </View>
          ) : null}

          {activeTab === "month" ? (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t("driverProfile", "kpiKm")}</Text>
                <Text style={styles.kpiValue}>{formatKm(summary?.thisMonth?.kmsCovered)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t("driverProfile", "kpiHours")}</Text>
                <Text style={styles.kpiValue}>{formatHours(summary?.thisMonth?.driveHours)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{t("driverProfile", "kpiTrips")}</Text>
                <Text style={styles.kpiValue}>{summary?.thisMonth?.tripsCovered ?? 0}</Text>
              </View>
            </View>
          ) : null}

          {activeTab === "custom" ? (
            <View style={styles.customWrap}>
              <View style={styles.rangeInputs}>
                <TouchableOpacity style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
                  <Text style={styles.dateInputText}>{rangeStartDate}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
                  <Text style={styles.dateInputText}>{rangeEndDate}</Text>
                </TouchableOpacity>
              </View>

              {showStartPicker ? (
                <DateTimePicker
                  value={toDateValue(rangeStartDate)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, selectedDate) => {
                    if (Platform.OS !== "ios") setShowStartPicker(false);
                    if (event.type === "dismissed" || !selectedDate) return;
                    setRangeStartDate(toDateString(selectedDate));
                  }}
                />
              ) : null}

              {showEndPicker ? (
                <DateTimePicker
                  value={toDateValue(rangeEndDate)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, selectedDate) => {
                    if (Platform.OS !== "ios") setShowEndPicker(false);
                    if (event.type === "dismissed" || !selectedDate) return;
                    setRangeEndDate(toDateString(selectedDate));
                  }}
                />
              ) : null}

              {Platform.OS === "ios" && (showStartPicker || showEndPicker) ? (
                <TouchableOpacity
                  style={styles.pickerDone}
                  onPress={() => {
                    setShowStartPicker(false);
                    setShowEndPicker(false);
                  }}
                >
                  <Text style={styles.pickerDoneText}>{t("common", "done")}</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={styles.apply} onPress={applyRange}>
                <Text style={styles.applyText}>{t("common", "applyRange")}</Text>
              </TouchableOpacity>

              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{t("driverProfile", "kpiKm")}</Text>
                  <Text style={styles.kpiValue}>{formatKm(summary?.range?.kmsCovered)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{t("driverProfile", "kpiHours")}</Text>
                  <Text style={styles.kpiValue}>{formatHours(summary?.range?.driveHours)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{t("driverProfile", "kpiTrips")}</Text>
                  <Text style={styles.kpiValue}>{summary?.range?.tripsCovered ?? 0}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.quickStats}>
          <View style={styles.quickCol}>
            <Text style={styles.quickValue}>{summary?.thisMonth?.tripsCovered ?? 0}</Text>
            <Text style={styles.quickLabel}>{t("driverProfile", "totalTrips")}</Text>
          </View>
          <View style={styles.quickDivider} />
          <View style={styles.quickCol}>
            <Text style={styles.quickValue}>{formatKm(summary?.thisMonth?.kmsCovered)}</Text>
            <Text style={styles.quickLabel}>{t("driverProfile", "totalKm")}</Text>
          </View>
          <View style={styles.quickDivider} />
          <View style={styles.quickCol}>
            <Text style={styles.quickValue}>{formatHours(summary?.thisMonth?.driveHours)}</Text>
            <Text style={styles.quickLabel}>{t("driverProfile", "driveHrs")}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.secondaryAction} onPress={() => router.push("/privacy-policy")}>
          <Text style={styles.secondaryActionText}>Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logout} onPress={handleLogout}>
          <Text style={styles.logoutText}>{t("common", "logout")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#07152F",
    paddingHorizontal: 18,
  },
  list: {
    paddingTop: 16,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 22,
    padding: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#10274A",
  },
  languageToggleWrap: {
    marginTop: 14,
    alignItems: "flex-start",
  },
  heroGlowA: {
    position: "absolute",
    right: -44,
    top: -36,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(56,189,248,0.16)",
  },
  heroGlowB: {
    position: "absolute",
    left: -40,
    bottom: -62,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(20,184,166,0.16)",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#0EA5E9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  profileHead: {
    marginLeft: 14,
    flex: 1,
  },
  roleTag: {
    color: "rgba(226,232,240,0.75)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 5,
    color: "rgba(191,219,254,0.9)",
    fontWeight: "600",
    fontSize: 12,
  },
  card: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderIcon: {
    color: "rgba(226,232,240,0.65)",
    fontWeight: "800",
    fontSize: 13,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "rgba(226,232,240,0.9)",
  },
  infoRowBox: {
    marginTop: 12,
    backgroundColor: "rgba(15,23,42,0.45)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "rgba(148,163,184,0.95)",
  },
  value: {
    marginTop: 4,
    color: "#E2E8F0",
    fontWeight: "700",
    fontSize: 15,
  },
  statusPill: {
    marginTop: 7,
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,200,122,0.15)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.4)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    color: "#00C87A",
    fontWeight: "800",
    fontSize: 12,
  },
  segmentWrap: {
    marginTop: 12,
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: {
    backgroundColor: "rgba(56,189,248,0.25)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.35)",
  },
  segmentText: {
    color: "rgba(226,232,240,0.55)",
    fontSize: 11,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#E2E8F0",
  },
  customWrap: {
    marginTop: 14,
    backgroundColor: "rgba(167,139,250,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.2)",
    padding: 12,
  },
  kpiGrid: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 4,
  },
  kpiLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "rgba(148,163,184,0.95)",
    fontWeight: "700",
  },
  kpiValue: {
    marginTop: 4,
    color: "#E2E8F0",
    fontWeight: "700",
    fontSize: 14,
  },
  rangeInputs: {
    flexDirection: "row",
    marginTop: 2,
    justifyContent: "space-between",
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.45)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(15,23,42,0.5)",
    marginHorizontal: 4,
  },
  dateInputText: {
    color: "#E2E8F0",
    fontWeight: "600",
  },
  pickerDone: {
    marginTop: 10,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(148,163,184,0.2)",
  },
  pickerDoneText: {
    color: "#E2E8F0",
    fontWeight: "700",
  },
  apply: {
    marginTop: 12,
    backgroundColor: "#0EA5E9",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  applyText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  notice: {
    marginTop: 10,
    color: "#FECACA",
    backgroundColor: "rgba(185,28,28,0.25)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  helper: {
    marginTop: 12,
    color: "rgba(148,163,184,0.95)",
  },
  quickStats: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  quickCol: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  quickValue: {
    color: "#E2E8F0",
    fontWeight: "800",
    fontSize: 14,
  },
  quickLabel: {
    marginTop: 4,
    color: "rgba(148,163,184,0.95)",
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  quickDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  secondaryAction: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  secondaryActionText: {
    color: "#9CCBFF",
    fontWeight: "700",
  },
  logout: {
    marginTop: 20,
    backgroundColor: "#DC2626",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  logoutText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
