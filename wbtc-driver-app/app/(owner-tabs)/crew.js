import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Modal,
  RefreshControl,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { useAppLanguage } from "../../contexts/shared-language";
import { getOpsDate } from "../../utils/opsTime";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const USER_ROLE_KEY = "wbtc_user_role";

const today = () => getOpsDate();

const avatarPalette = ["#0090E0", "#00C87A", "#A78BFA", "#FB923C", "#F472B6", "#22C55E"];

const statusConfig = {
  "On Leave": {
    bg: "rgba(251,146,60,0.12)",
    text: "#FB923C",
    accent: "#FB923C",
    icon: "time-outline",
  },
  Available: {
    bg: "rgba(0,200,122,0.12)",
    text: "#00C87A",
    accent: "#00C87A",
    icon: "checkmark-outline",
  },
  "On Trip": {
    bg: "rgba(0,144,224,0.12)",
    text: "#0090E0",
    accent: "#0090E0",
    icon: "play",
  },
  Suspended: {
    bg: "rgba(239,68,68,0.12)",
    text: "#EF4444",
    accent: "#EF4444",
    icon: "close-outline",
  },
};

const normalizeStatus = (rawStatus, isOnTrip) => {
  if (String(rawStatus || "").toLowerCase() === "suspended") return "Suspended";
  if (isOnTrip) return "On Trip";
  if (String(rawStatus || "").toLowerCase() === "onleave" || String(rawStatus || "").toLowerCase() === "on leave") {
    return "On Leave";
  }
  return "Available";
};

const getInitial = (name) => String(name || "?").trim().slice(0, 1).toUpperCase();

export default function OwnerCrewScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [conductors, setConductors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [fleetBuses, setFleetBuses] = useState([]);
  const [activeSection, setActiveSection] = useState("drivers");
  const [resettingCrewId, setResettingCrewId] = useState("");
  const [credentialSheet, setCredentialSheet] = useState(null);

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

  const loadCrewData = useCallback(async () => {
    try {
      setNotice("");
      const auth = await getAuth();
      if (!auth) return;

      const date = today();
      const nonce = Date.now();
      const [personnelRes, contextRes, dashboardRes] = await Promise.all([
        fetch(`${auth.apiBase}/api/owner/personnel?all=true&t=${nonce}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        fetch(`${auth.apiBase}/api/owner/assign-crew?date=${date}&t=${nonce}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        fetch(`${auth.apiBase}/api/owner/dashboard?mode=daily&date=${date}&t=${nonce}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
      ]);

      const [personnelText, contextText, dashboardText] = await Promise.all([
        personnelRes.text(),
        contextRes.text(),
        dashboardRes.text(),
      ]);
      const personnelData = personnelText ? JSON.parse(personnelText) : {};
      const contextData = contextText ? JSON.parse(contextText) : {};
      const dashboardData = dashboardText ? JSON.parse(dashboardText) : {};

      if (!personnelRes.ok) throw new Error(personnelData.message || t("ownerCrew", "failedLoadPersonnel"));
      if (!contextRes.ok) throw new Error(contextData.message || t("ownerCrew", "failedLoadAssignments"));
      if (!dashboardRes.ok) throw new Error(dashboardData.message || t("ownerCrew", "failedLoadFleetStatus"));

      setDrivers(personnelData.drivers || []);
      setConductors(personnelData.conductors || []);
      setAssignments(contextData.assignments || []);
      setFleetBuses(dashboardData.buses || []);
    } catch (err) {
      setNotice(err.message);
    }
  }, [getAuth, t]);

  useEffect(() => {
    loadCrewData();
  }, [loadCrewData]);

  useFocusEffect(
    useCallback(() => {
      loadCrewData();
    }, [loadCrewData])
  );

  const assignedDriverIds = useMemo(() => {
    const ids = new Set();
    for (const assignment of assignments) {
      if (assignment.driver?.id) ids.add(String(assignment.driver.id));
    }
    return ids;
  }, [assignments]);

  const assignedConductorIds = useMemo(() => {
    const ids = new Set();
    for (const assignment of assignments) {
      if (assignment.conductor?.id) ids.add(String(assignment.conductor.id));
    }
    return ids;
  }, [assignments]);

  const onTripDriverIds = useMemo(() => {
    const ids = new Set();
    for (const bus of fleetBuses) {
      if (bus.liveRoute && bus.assignedDriver?.id) ids.add(String(bus.assignedDriver.id));
    }
    return ids;
  }, [fleetBuses]);

  const onTripConductorIds = useMemo(() => {
    const ids = new Set();
    for (const bus of fleetBuses) {
      if (bus.liveRoute && bus.assignedConductor?.id) ids.add(String(bus.assignedConductor.id));
    }
    return ids;
  }, [fleetBuses]);

  const crewStats = useMemo(() => {
    const allCrew = drivers.length + conductors.length;
    const suspendedDrivers = drivers.filter((d) => d.status === "Suspended").length;
    const suspendedConductors = conductors.filter((c) => c.status === "Suspended").length;
    const availableDrivers = drivers.filter((d) => {
      const id = String(d._id);
      const status = normalizeStatus(d.status, onTripDriverIds.has(id));
      return status === "Available" && !assignedDriverIds.has(id);
    }).length;
    const availableConductors = conductors.filter((c) => {
      const id = String(c._id);
      const status = normalizeStatus(c.status, onTripConductorIds.has(id));
      return status === "Available" && !assignedConductorIds.has(id);
    }).length;
    return {
      allCrew,
      assignedToday: assignments.length * 2,
      onTripNow: onTripDriverIds.size + onTripConductorIds.size,
      suspended: suspendedDrivers + suspendedConductors,
      available: availableDrivers + availableConductors,
    };
  }, [
    drivers,
    conductors,
    assignments,
    onTripDriverIds,
    onTripConductorIds,
    assignedDriverIds,
    assignedConductorIds,
  ]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCrewData();
    setRefreshing(false);
  };

  const handleResetPassword = async (type, person) => {
    try {
      setResettingCrewId(person.id);
      setNotice("");
      const auth = await getAuth();
      if (!auth) return;

      const endpoint =
        type === "drivers"
          ? `/api/drivers/${person.id}/reset-password`
          : `/api/conductors/${person.id}/reset-password`;

      const response = await fetch(`${auth.apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({}),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerCrew", "failedResetPassword"));

      setNotice(
        t("ownerCrew", "passwordResetSuccess", {
          empId: data.credentials?.empId || person.empId,
          password: data.credentials?.temporaryPassword || "",
        })
      );
      setCredentialSheet({
        name: person.name,
        empId: data.credentials?.empId || person.empId,
        password: data.credentials?.temporaryPassword || "",
      });
    } catch (err) {
      setNotice(err.message);
    } finally {
      setResettingCrewId("");
    }
  };

  const handleCopyCredentials = async () => {
    if (!credentialSheet) return;
    const message = `${credentialSheet.empId}\n${credentialSheet.password}`;
    await Clipboard.setStringAsync(message);
    setNotice(t("ownerCrew", "credentialsCopied"));
  };

  const handleShareCredentials = async () => {
    if (!credentialSheet) return;
    await Share.share({
      message: t("ownerCrew", "shareCredentialsMessage", {
        empId: credentialSheet.empId,
        password: credentialSheet.password,
      }),
    });
  };

  const driverRows = useMemo(
    () =>
      drivers.map((driver) => {
        const id = String(driver._id);
        const isAssigned = assignedDriverIds.has(id);
        const isOnTrip = onTripDriverIds.has(id);
        const status = normalizeStatus(driver.status, isOnTrip);
        return {
          id,
          name: driver.name,
          empId: driver.empId || "--",
          attendance: isAssigned ? t("ownerCrew", "presentAssigned") : t("ownerCrew", "notAssigned"),
          tripStatus: isOnTrip ? t("ownerCrew", "onTripStatus") : t("ownerCrew", "notOnTrip"),
          status,
          raw: driver,
        };
      }),
    [drivers, assignedDriverIds, onTripDriverIds, t]
  );

  const conductorRows = useMemo(
    () =>
      conductors.map((conductor) => {
        const id = String(conductor._id);
        const isAssigned = assignedConductorIds.has(id);
        const isOnTrip = onTripConductorIds.has(id);
        const status = normalizeStatus(conductor.status, isOnTrip);
        return {
          id,
          name: conductor.name,
          empId: conductor.empId || "--",
          attendance: isAssigned ? t("ownerCrew", "presentAssigned") : t("ownerCrew", "notAssigned"),
          tripStatus: isOnTrip ? t("ownerCrew", "onTripStatus") : t("ownerCrew", "notOnTrip"),
          status,
          raw: conductor,
        };
      }),
    [conductors, assignedConductorIds, onTripConductorIds, t]
  );

  const activeList = activeSection === "drivers" ? driverRows : conductorRows;

  return (
    <View style={styles.container}>
      <View style={styles.bgBubbleA} />
      <View style={styles.bgBubbleB} />

      <View style={styles.heroWrap}>
        <View style={styles.heroBadge}>
          <Ionicons name="people" size={16} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.heroKicker}>{t("ownerCrew", "management")}</Text>
          <Text style={styles.title}>{t("ownerCrew", "title")}</Text>
          <Text style={styles.subtitle}>{t("ownerCrew", "subtitle")}</Text>
        </View>
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="people" size={16} color="#A78BFA" />
            </View>
            <Text style={styles.kpiLabel}>{t("ownerCrew", "allCrew")}</Text>
            <Text style={styles.kpiValue}>{crewStats.allCrew}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="clipboard-outline" size={16} color="#0090E0" />
            </View>
            <Text style={styles.kpiLabel}>{t("ownerCrew", "assignedToday")}</Text>
            <Text style={styles.kpiValue}>{crewStats.assignedToday}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="ban-outline" size={16} color="#EF4444" />
            </View>
            <Text style={styles.kpiLabel}>{t("ownerCrew", "suspended")}</Text>
            <Text style={styles.kpiValue}>{crewStats.suspended}</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="play" size={16} color="#00C87A" />
            </View>
            <Text style={styles.kpiLabel}>{t("ownerCrew", "onTripNow")}</Text>
            <Text style={styles.kpiValue}>{crewStats.onTripNow}</Text>
          </View>

          <View style={styles.fullKpiCard}>
            <View>
              <Text style={styles.kpiLabel}>{t("ownerCrew", "available")}</Text>
              <Text style={styles.kpiValue}>{crewStats.available < 0 ? 0 : crewStats.available}</Text>
            </View>
            <View style={styles.availableIconWrap}>
              <Ionicons name="checkmark-done-outline" size={20} color="#00C87A" />
            </View>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionAccent, styles.blueAccent]} />
            <Text style={styles.sectionTitle}>{t("ownerCrew", "todayAssignments")}</Text>
          </View>
          <Text style={styles.sectionCount}>{t("ownerCrew", "buses", { count: assignments.length })}</Text>
        </View>
        {!assignments.length ? <Text style={styles.emptyText}>{t("ownerCrew", "noAssignments")}</Text> : null}
        {assignments.map((item, index) => (
          <View
            key={`asg-${item?.id || "x"}-${item?.busId || item?.busNumber || "na"}-${index}`}
            style={styles.assignmentCard}
          >
            <View style={styles.assignmentAccent} />
            <View style={styles.assignmentBody}>
              <Text style={styles.assignmentBus}>{item.busNumber}</Text>
              <View style={styles.assignmentLineWrap}>
                <View style={styles.assignmentPerson}>
                  <View style={[styles.miniAvatar, { backgroundColor: avatarPalette[index % avatarPalette.length] }]}>
                    <Text style={styles.avatarText}>{getInitial(item.driver?.name)}</Text>
                  </View>
                  <View>
                    <Text style={styles.metaCaption}>{t("ownerActive", "driver")}</Text>
                    <Text style={styles.assignmentLine}>{item.driver?.name || "--"}</Text>
                  </View>
                </View>
                <View style={styles.assignmentPerson}>
                  <View
                    style={[
                      styles.miniAvatar,
                      { backgroundColor: avatarPalette[(index + 2) % avatarPalette.length] },
                    ]}
                  >
                    <Text style={styles.avatarText}>{getInitial(item.conductor?.name)}</Text>
                  </View>
                  <View>
                    <Text style={styles.metaCaption}>{t("ownerActive", "conductor")}</Text>
                    <Text style={styles.assignmentLine}>{item.conductor?.name || "--"}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ))}

        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionAccent, styles.greenAccent]} />
            <Text style={styles.sectionTitle}>{activeSection === "drivers" ? t("ownerCrew", "drivers") : t("ownerCrew", "conductors")}</Text>
          </View>
          <Text style={styles.sectionCount}>
            {activeSection === "drivers" ? t("ownerCrew", "driversCount", { count: activeList.length }) : t("ownerCrew", "conductorsCount", { count: activeList.length })}
          </Text>
        </View>

        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeSection === "drivers" ? styles.segmentBtnActive : null]}
            onPress={() => setActiveSection("drivers")}
          >
            <MaterialCommunityIcons
              name="steering"
              size={14}
              color={activeSection === "drivers" ? "#FFFFFF" : "rgba(255,255,255,0.45)"}
            />
            <Text style={[styles.segmentText, activeSection === "drivers" ? styles.segmentTextActive : null]}>
              {t("ownerCrew", "drivers")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeSection === "conductors" ? styles.segmentBtnActive : null]}
            onPress={() => setActiveSection("conductors")}
          >
            <MaterialCommunityIcons
              name="ticket-confirmation-outline"
              size={14}
              color={activeSection === "conductors" ? "#FFFFFF" : "rgba(255,255,255,0.45)"}
            />
            <Text style={[styles.segmentText, activeSection === "conductors" ? styles.segmentTextActive : null]}>
              {t("ownerCrew", "conductors")}
            </Text>
          </TouchableOpacity>
        </View>

        {!activeList.length ? (
          <Text style={styles.emptyText}>
            {activeSection === "drivers" ? t("ownerCrew", "noDrivers") : t("ownerCrew", "noConductors")}
          </Text>
        ) : null}
        {activeList.map((person, index) => {
          const cfg = statusConfig[person.status] || statusConfig.Available;
          return (
            <View
              key={`${activeSection}-${person?.id || person?.empId || person?.name || "na"}-${index}`}
              style={styles.crewCard}
            >
              <View style={[styles.crewAccent, { backgroundColor: cfg.accent }]} />
              <View style={styles.crewBody}>
                <View style={[styles.avatar, { backgroundColor: avatarPalette[index % avatarPalette.length] }]}>
                  <Text style={styles.avatarText}>{getInitial(person.name)}</Text>
                </View>
                <View style={styles.crewMain}>
                  <View style={styles.rowTop}>
                    <Text style={styles.crewName}>{person.name}</Text>
                    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon} size={11} color={cfg.text} />
                      <Text style={[styles.badgeText, { color: cfg.text }]}>{person.status === "On Leave" ? t("ownerCrew", "onLeave") : person.status === "Available" ? t("ownerCrew", "availableStatus") : person.status === "On Trip" ? t("ownerCrew", "onTripStatus") : person.status === "Suspended" ? t("ownerCrew", "suspendedStatus") : person.status}</Text>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>{t("ownerCrew", "id")}</Text>
                    <Text style={styles.metaValue}>{person.empId}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>{t("ownerCrew", "attendance")}</Text>
                    <Text style={styles.metaValue}>{person.attendance}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>{t("ownerCrew", "trip")}</Text>
                    <Text style={styles.metaValue}>{person.tripStatus}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.resetButton,
                      resettingCrewId === person.id ? styles.resetButtonDisabled : null,
                    ]}
                    onPress={() => handleResetPassword(activeSection, person)}
                    disabled={resettingCrewId === person.id}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="refresh-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.resetButtonText}>
                      {resettingCrewId === person.id ? t("common", "saving") : t("ownerCrew", "resetPassword")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={Boolean(credentialSheet)} transparent animationType="fade" onRequestClose={() => setCredentialSheet(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("ownerCrew", "temporaryCredentials")}</Text>
            <Text style={styles.modalSubtitle}>
              {credentialSheet?.name || "--"}
            </Text>

            <Text style={styles.modalLabel}>{t("ownerCrew", "id")}</Text>
            <TextInput
              style={styles.credentialInput}
              value={credentialSheet?.empId || ""}
              editable={false}
              selectTextOnFocus
            />

            <Text style={styles.modalLabel}>{t("ownerCrew", "temporaryPassword")}</Text>
            <TextInput
              style={styles.credentialInput}
              value={credentialSheet?.password || ""}
              editable={false}
              selectTextOnFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyCredentials} activeOpacity={0.9}>
                <Ionicons name="copy-outline" size={14} color="#FFFFFF" />
                <Text style={styles.secondaryButtonText}>{t("ownerCrew", "copyCredentials")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleShareCredentials} activeOpacity={0.9}>
                <Ionicons name="share-social-outline" size={14} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>{t("ownerCrew", "shareCredentials")}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={() => setCredentialSheet(null)} activeOpacity={0.9}>
              <Text style={styles.closeButtonText}>{t("common", "done")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A1628", padding: 16 },
  bgBubbleA: {
    position: "absolute",
    top: -30,
    right: -24,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: "rgba(167,139,250,0.10)",
  },
  bgBubbleB: {
    position: "absolute",
    top: 210,
    left: -44,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(0,144,224,0.08)",
  },
  heroWrap: { marginTop: 20, flexDirection: "row", alignItems: "center", gap: 10 },
  heroBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#3650A8",
    alignItems: "center",
    justifyContent: "center",
  },
  heroKicker: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600", letterSpacing: 1.1 },
  title: { marginTop: 2, fontSize: 28, fontWeight: "800", color: "#FFFFFF" },
  subtitle: { marginTop: 2, color: "rgba(255,255,255,0.45)", fontSize: 13 },
  notice: { marginTop: 8, color: "#7F1D1D", backgroundColor: "#FEE2E2", padding: 8, borderRadius: 10 },
  content: { paddingBottom: 20 },
  kpiGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  fullKpiCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  availableIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,200,122,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: {
    marginTop: 8,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  kpiValue: { marginTop: 4, color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  sectionHead: { marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionAccent: { width: 3, height: 18, borderRadius: 2 },
  blueAccent: { backgroundColor: "#0090E0" },
  greenAccent: { backgroundColor: "#00C87A" },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.6 },
  sectionCount: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
  assignmentCard: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  assignmentAccent: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: "#A78BFA",
  },
  assignmentBody: { paddingVertical: 14, paddingHorizontal: 16, marginLeft: 8 },
  assignmentBus: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.8 },
  assignmentLineWrap: { marginTop: 10, gap: 8 },
  assignmentPerson: { flexDirection: "row", alignItems: "center", gap: 8 },
  miniAvatar: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  metaCaption: { color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  assignmentLine: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  segmentWrap: {
    marginTop: 10,
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  segmentBtnActive: { backgroundColor: "#008FCC" },
  segmentText: { color: "rgba(255,255,255,0.45)", fontWeight: "700", fontSize: 13 },
  segmentTextActive: { color: "#FFFFFF" },
  crewCard: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    position: "relative",
  },
  crewAccent: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  crewBody: { marginLeft: 8, padding: 14, flexDirection: "row", gap: 12 },
  crewMain: { flex: 1 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  crewName: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  metaLabel: {
    width: 58,
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaValue: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  resetButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3650A8",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resetButtonDisabled: {
    opacity: 0.7,
  },
  resetButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#10203A",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
  },
  modalLabel: {
    marginTop: 14,
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  credentialInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalActions: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: "#3650A8",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: "#00C87A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  closeButton: {
    marginTop: 12,
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  closeButtonText: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
  },
  emptyText: { marginTop: 8, color: "rgba(255,255,255,0.55)" },
});
