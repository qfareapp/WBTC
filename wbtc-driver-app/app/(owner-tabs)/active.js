import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppLanguage } from "../../contexts/shared-language";
import { getOpsDate } from "../../utils/opsTime";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const USER_ROLE_KEY = "wbtc_user_role";
const today = () => getOpsDate();

const thisMonth = (value = new Date()) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const getBusStatusConfig = (bus) => {
  if (bus.liveRoute) return { key: "onTrip", icon: "play", accent: "#00C87A", bg: "rgba(0,200,122,0.14)", text: "#00C87A" };
  if (bus.status === "Active") return { key: "active", icon: "checkmark", accent: "#0090E0", bg: "rgba(0,144,224,0.14)", text: "#0090E0" };
  return { key: "halted", icon: "pause", accent: "#FB923C", bg: "rgba(251,146,60,0.14)", text: "#FB923C" };
};

const getBusLocationLabel = (bus, t) => {
  if (bus?.liveRoute) {
    return (
      bus?.liveCurrentStop?.name ||
      bus?.currentLocation ||
      bus?.lastTripEndLocation?.name ||
      t("ownerActive", "locationUnavailable")
    );
  }

  return bus?.currentLocation || bus?.lastTripEndLocation?.name || t("ownerActive", "locationUnavailable");
};

export default function OwnerActive() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [conductors, setConductors] = useState([]);
  const [filterType, setFilterType] = useState("today");
  const [customStartDate, setCustomStartDate] = useState(today());
  const [customEndDate, setCustomEndDate] = useState(today());
  const [crewDraft, setCrewDraft] = useState({});
  const [locationDraft, setLocationDraft] = useState({});
  const [locationSavingBusId, setLocationSavingBusId] = useState("");
  const [expandedBuses, setExpandedBuses] = useState({});
  const [selectedMonthDate, setSelectedMonthDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const date = today();
  const month = thisMonth(selectedMonthDate);
  const monthNames = t("ownerActive", "monthLong");
  const monthShortNames = t("ownerActive", "monthShort");
  const monthLabel = monthNames[selectedMonthDate.getMonth()] || month;
  const toId = (person) => String(person?.id || person?._id || "");

  const assignedDriverByBus = useMemo(() => {
    const map = new Map();
    for (const bus of buses) {
      const id = toId(bus.assignedDriver);
      if (id) map.set(String(bus.id), id);
    }
    return map;
  }, [buses]);

  const assignedConductorByBus = useMemo(() => {
    const map = new Map();
    for (const bus of buses) {
      const id = toId(bus.assignedConductor);
      if (id) map.set(String(bus.id), id);
    }
    return map;
  }, [buses]);

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

  const loadDashboard = useCallback(async () => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const query = new URLSearchParams();
      if (filterType === "today") {
        query.set("mode", "daily");
        query.set("date", date);
      } else if (filterType === "yesterday") {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        query.set("mode", "daily");
        query.set("date", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      } else if (filterType === "current_month") {
        query.set("mode", "monthly");
        query.set("month", month);
      } else {
        query.set("mode", "custom");
        query.set("startDate", customStartDate);
        query.set("endDate", customEndDate);
      }
      const assignmentDate = today();
      const [dashboardRes, assignRes] = await Promise.all([
        fetch(`${auth.apiBase}/api/owner/dashboard?${query.toString()}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        fetch(`${auth.apiBase}/api/owner/assign-crew?date=${assignmentDate}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
      ]);

      const [dashboardText, assignText] = await Promise.all([dashboardRes.text(), assignRes.text()]);
      const dashboardData = dashboardText ? JSON.parse(dashboardText) : {};
      const assignData = assignText ? JSON.parse(assignText) : {};

      if (!dashboardRes.ok) throw new Error(dashboardData.message || t("ownerActive", "failedOwnerDashboard"));
      if (!assignRes.ok) throw new Error(assignData.message || t("ownerActive", "failedCrewAssignments"));

      const assignmentsByBus = new Map();
      for (const row of assignData.assignments || []) {
        assignmentsByBus.set(String(row.busId), row);
      }

      const mergedBusesRaw = (dashboardData.buses || []).map((bus) => {
        const assignment = assignmentsByBus.get(String(bus.id));
        if (!assignment) {
          return {
            ...bus,
            assignedDriver: null,
            assignedConductor: null,
          };
        }
        return {
          ...bus,
          assignedDriver: assignment.driver
            ? { id: assignment.driver.id, name: assignment.driver.name, empId: assignment.driver.empId }
            : null,
          assignedConductor: assignment.conductor
            ? { id: assignment.conductor.id, name: assignment.conductor.name, empId: assignment.conductor.empId }
            : null,
        };
      });
      const mergedBuses = [];
      const seenBuses = new Set();
      for (const bus of mergedBusesRaw) {
        const key = `${bus?.id || "x"}|${bus?.busNumber || "na"}`;
        if (seenBuses.has(key)) continue;
        seenBuses.add(key);
        mergedBuses.push(bus);
      }

      setSummary(dashboardData.summary || null);
      setBuses(mergedBuses);
    } catch (err) {
      setNotice(err.message);
    }
  }, [filterType, date, month, customStartDate, customEndDate, getAuth, t]);

  const loadPersonnel = useCallback(async () => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/owner/personnel`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerActive", "failedLoadPersonnel"));
      setDrivers(data.drivers || []);
      setConductors(data.conductors || []);
    } catch (err) {
      setNotice(err.message);
    }
  }, [getAuth, t]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadPersonnel();
  }, [loadPersonnel]);

  const toggleBus = async (bus) => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const nextStatus = bus.status === "Active" ? "UnderMaintenance" : "Active";
      await fetch(`${auth.apiBase}/api/owner/buses/${bus.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadDashboard();
    } catch (err) {
      setNotice(err.message);
    }
  };

  const assignCrew = async (bus) => {
    const draft = crewDraft[bus.id] || {};
    if (!draft.driverId || !draft.conductorId) {
      setNotice(t("ownerActive", "selectCrewFirst"));
      return;
    }
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/owner/buses/${bus.id}/assign-crew`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ driverId: draft.driverId, conductorId: draft.conductorId }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerActive", "failedAssignCrew"));
      setNotice(t("ownerActive", "crewAssigned", { bus: bus.busNumber }));
      await loadDashboard();
    } catch (err) {
      setNotice(err.message);
    }
  };

  const resetCrew = async (bus) => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/owner/buses/${bus.id}/assign-crew`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerActive", "failedResetCrew"));

      // Optimistic update: free crew immediately in UI for reassignment lists.
      setBuses((prev) =>
        prev.map((item) =>
          String(item.id) === String(bus.id)
            ? { ...item, assignedDriver: null, assignedConductor: null }
            : item
        )
      );
      setCrewDraft((prev) => ({ ...prev, [bus.id]: {} }));
      setNotice(t("ownerActive", "crewReset", { bus: bus.busNumber }));
      await loadDashboard();
    } catch (err) {
      setNotice(err.message);
    }
  };

  const setBusStartPoint = async (bus) => {
    const busId = String(bus.id);
    const nextLocation = String(locationDraft[busId] || "").trim();
    if (!nextLocation) {
      setNotice(t("ownerActive", "selectStartPointFirst"));
      return;
    }
    try {
      const auth = await getAuth();
      if (!auth) return;
      setLocationSavingBusId(busId);
      const response = await fetch(`${auth.apiBase}/api/owner/buses/${bus.id}/location`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ location: nextLocation }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerActive", "failedSetStartPoint"));
      setNotice(t("ownerActive", "startPointUpdated", { bus: bus.busNumber }));
      await loadDashboard();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setLocationSavingBusId("");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboard(), loadPersonnel()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Text style={styles.title}>{t("ownerActive", "title")}</Text>
          <Text style={styles.heroDate}>{date}</Text>
        </View>
        <View style={styles.modeRow}>
          <TouchableOpacity style={[styles.modeBtn, filterType === "today" ? styles.modeBtnActive : null]} onPress={() => setFilterType("today")}><Text style={styles.modeText}>{t("common", "today")}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, filterType === "yesterday" ? styles.modeBtnActive : null]} onPress={() => setFilterType("yesterday")}><Text style={styles.modeText}>{t("common", "yesterday")}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, filterType === "current_month" ? styles.modeBtnActive : null]} onPress={() => { setFilterType("current_month"); setShowMonthPicker(true); }}><Text style={styles.modeText}>{monthLabel}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, filterType === "custom" ? styles.modeBtnActive : null]} onPress={() => setFilterType("custom")}><Text style={styles.modeText}>{t("common", "custom")}</Text></TouchableOpacity>
        </View>
        {filterType === "custom" ? (
          <View style={styles.customWrap}>
            <TextInput value={customStartDate} onChangeText={setCustomStartDate} style={styles.input} />
            <TextInput value={customEndDate} onChangeText={setCustomEndDate} style={styles.input} />
          </View>
        ) : null}
        {filterType === "current_month" && showMonthPicker ? (
          <View style={styles.monthGrid}>
            {monthNames.map((name, index) => (
              <TouchableOpacity key={`month-${name}-${index}`} style={styles.monthBtn} onPress={() => { setSelectedMonthDate((prev) => new Date(prev.getFullYear(), index, 1)); setShowMonthPicker(false); }}>
                <Text style={styles.monthBtnText}>{monthShortNames[index] || name.slice(0, 3)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>{t("ownerActive", "totalBuses")}</Text><Text style={styles.kpiValue}>{summary?.totalBuses ?? 0}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>{t("ownerActive", "liveBuses")}</Text><Text style={styles.kpiValue}>{summary?.liveBuses ?? 0}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>{t("ownerActive", "tickets")}</Text><Text style={styles.kpiValue}>{summary?.ticketsGenerated ?? 0}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>{t("ownerActive", "fare")}</Text><Text style={styles.kpiValue}>{t("common", "rs")} {formatMoney(summary?.fareCollected)}</Text></View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("ownerActive", "fleetControls")}</Text>
          <Text style={styles.vehicleCount}>{t("ownerActive", "vehicles", { count: buses.length })}</Text>
        </View>

        {buses.map((bus, busIndex) => {
          const status = getBusStatusConfig(bus);
          const expanded = !!expandedBuses[bus.id];
          const busId = String(bus.id);
          const hasAssignedCrew = Boolean(toId(bus.assignedDriver) && toId(bus.assignedConductor));

          const availableDrivers = drivers.filter((driver) => {
            const id = String(driver._id || "");
            if (!id) return false;
            if (crewDraft[bus.id]?.driverId === driver._id) return true;
            for (const [bId, driverId] of assignedDriverByBus.entries()) {
              if (bId !== busId && driverId === id) return false;
            }
            return true;
          });

          const availableConductors = conductors.filter((conductor) => {
            const id = String(conductor._id || "");
            if (!id) return false;
            if (crewDraft[bus.id]?.conductorId === conductor._id) return true;
            for (const [bId, conductorId] of assignedConductorByBus.entries()) {
              if (bId !== busId && conductorId === id) return false;
            }
            return true;
          });
          return (
            <View key={`bus-${bus.id || "x"}-${bus.busNumber || "na"}-${busIndex}`} style={styles.busCard}>
              <View style={[styles.busLeftAccent, { backgroundColor: status.accent }]} />
              <View style={styles.busHead}>
                <View>
                  <View style={styles.busTitleRow}>
                    <Text style={styles.busTitle}>{bus.busNumber}</Text>
                    <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                      <Ionicons name={status.icon} size={11} color={status.text} />
                      <Text style={[styles.statusText, { color: status.text }]}>{t("ownerActive", status.key)}</Text>
                    </View>
                  </View>
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={14} color="#8DB4E2" />
                    <Text style={styles.locationText}>
                      {getBusLocationLabel(bus, t)}
                    </Text>
                  </View>
                  {hasAssignedCrew ? (
                    <View style={styles.assignedCrewWrap}>
                      <Text style={styles.assignedCrewText}>{t("ownerActive", "driver")}: {bus.assignedDriver?.name || "--"}</Text>
                      <Text style={styles.assignedCrewText}>{t("ownerActive", "conductor")}: {bus.assignedConductor?.name || "--"}</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity style={styles.expandBtn} onPress={() => setExpandedBuses((p) => ({ ...p, [bus.id]: !p[bus.id] }))}>
                  <Text style={styles.expandText}>{expanded ? t("ownerActive", "hide") : t("ownerActive", "details")}</Text>
                </TouchableOpacity>
              </View>

              {expanded ? (
                <>
                  <View style={styles.statsGrid}>
                    <View style={styles.statCell}><Text style={styles.statLabel}>{t("ownerActive", "liveRoute")}</Text><Text style={styles.statValue}>{bus.liveRoute?.routeCode || "--"}</Text></View>
                    <View style={styles.statCell}><Text style={styles.statLabel}>{t("ownerActive", "tickets")}</Text><Text style={styles.statValue}>{bus.ticketsGenerated || 0}</Text></View>
                    <View style={styles.statCell}><Text style={styles.statLabel}>{t("ownerActive", "fare")}</Text><Text style={styles.statValue}>{t("common", "rs")} {formatMoney(bus.fareCollected)}</Text></View>
                  </View>
                  <View style={styles.locationControlWrap}>
                    <Text style={styles.chipLabel}>{t("ownerActive", "busStartPoint")}</Text>
                    {bus.attachedRoute?.source && bus.attachedRoute?.destination ? (
                      <>
                        <Text style={styles.endpointText}>
                          {t("ownerActive", "route")}: {bus.attachedRoute.source} {"<->"} {bus.attachedRoute.destination}
                        </Text>
                        <View style={styles.startPointChoices}>
                          <TouchableOpacity
                            style={[
                              styles.choice,
                              locationDraft[bus.id] === bus.attachedRoute.source ? styles.choiceActive : null,
                            ]}
                            onPress={() =>
                              setLocationDraft((prev) => ({ ...prev, [bus.id]: bus.attachedRoute.source }))
                            }
                          >
                            <Text style={styles.choiceText}>{bus.attachedRoute.source}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.choice,
                              locationDraft[bus.id] === bus.attachedRoute.destination ? styles.choiceActive : null,
                            ]}
                            onPress={() =>
                              setLocationDraft((prev) => ({ ...prev, [bus.id]: bus.attachedRoute.destination }))
                            }
                          >
                            <Text style={styles.choiceText}>{bus.attachedRoute.destination}</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => setBusStartPoint(bus)}
                          disabled={locationSavingBusId === String(bus.id)}
                        >
                          <Text style={styles.actionText}>
                            {locationSavingBusId === String(bus.id) ? t("common", "saving") : t("ownerActive", "setStartPoint")}
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={styles.noCrewText}>{t("ownerActive", "attachRouteFirst")}</Text>
                    )}
                  </View>
                  {!hasAssignedCrew ? (
                    <>
                      <Text style={styles.chipLabel}>{t("ownerActive", "driver")}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {availableDrivers.map((driver, driverIndex) => (
                          <TouchableOpacity key={`drv-${bus.id || "x"}-${driver._id || driver.empId || driver.name || "na"}-${driverIndex}`} style={[styles.choice, crewDraft[bus.id]?.driverId === driver._id ? styles.choiceActive : null]} onPress={() => setCrewDraft((p) => ({ ...p, [bus.id]: { ...(p[bus.id] || {}), driverId: driver._id } }))}>
                            <Text style={styles.choiceText}>{driver.name}</Text>
                          </TouchableOpacity>
                        ))}
                        {!availableDrivers.length ? <Text style={styles.noCrewText}>{t("ownerActive", "noAvailableDrivers")}</Text> : null}
                      </ScrollView>
                      <Text style={styles.chipLabel}>{t("ownerActive", "conductor")}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {availableConductors.map((conductor, conductorIndex) => (
                          <TouchableOpacity key={`con-${bus.id || "x"}-${conductor._id || conductor.empId || conductor.name || "na"}-${conductorIndex}`} style={[styles.choice, crewDraft[bus.id]?.conductorId === conductor._id ? styles.choiceActive : null]} onPress={() => setCrewDraft((p) => ({ ...p, [bus.id]: { ...(p[bus.id] || {}), conductorId: conductor._id } }))}>
                            <Text style={styles.choiceText}>{conductor.name}</Text>
                          </TouchableOpacity>
                        ))}
                        {!availableConductors.length ? <Text style={styles.noCrewText}>{t("ownerActive", "noAvailableConductors")}</Text> : null}
                      </ScrollView>
                    </>
                  ) : null}
                  <View style={styles.actions}>
                    {!hasAssignedCrew ? (
                      <>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => assignCrew(bus)}><Text style={styles.actionText}>{t("ownerActive", "assignCrew")}</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.resetBtn]} onPress={() => resetCrew(bus)}><Text style={styles.resetText}>{t("ownerActive", "resetCrew")}</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.toggleBtn]} onPress={() => toggleBus(bus)}><Text style={styles.toggleText}>{bus.status === "Active" ? t("ownerActive", "deactivate") : t("ownerActive", "activate")}</Text></TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity style={[styles.actionBtn, styles.resetBtn, styles.halfActionBtn]} onPress={() => resetCrew(bus)}><Text style={styles.resetText}>{t("ownerActive", "resetCrew")}</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.toggleBtn, styles.halfActionBtn]} onPress={() => toggleBus(bus)}>
                          <Text style={styles.toggleText}>{bus.status === "Active" ? t("ownerActive", "deactivate") : t("ownerActive", "activate")}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A1628", padding: 16 },
  heroCard: { marginTop: 16, backgroundColor: "#0D2240", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 25, fontWeight: "800", color: "#FFFFFF" },
  heroDate: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  modeRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)" },
  modeBtnActive: { backgroundColor: "#00A86B" },
  modeText: { color: "#FFFFFF", fontWeight: "700" },
  customWrap: { marginTop: 10, gap: 6 },
  input: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, color: "#FFFFFF", padding: 8 },
  monthGrid: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthBtn: { width: "22%", paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center" },
  monthBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  notice: { marginTop: 10, color: "#7F1D1D", backgroundColor: "#FEE2E2", padding: 8, borderRadius: 10 },
  list: { paddingBottom: 28 },
  kpiGrid: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { width: "48%", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.05)" },
  kpiLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600" },
  kpiValue: { marginTop: 4, color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  sectionHeader: { marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  vehicleCount: { color: "rgba(255,255,255,0.45)", fontWeight: "600", fontSize: 15 },
  busCard: { marginTop: 12, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 22, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", overflow: "hidden" },
  busLeftAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  busHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginLeft: 8 },
  busTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  busTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  statusText: { fontSize: 12, fontWeight: "800" },
  locationRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600" },
  expandBtn: { backgroundColor: "rgba(255,255,255,0.07)", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  expandText: { color: "rgba(255,255,255,0.58)", fontWeight: "700", fontSize: 12.5 },
  statsGrid: { marginTop: 14, flexDirection: "row", gap: 8 },
  statCell: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 12, padding: 10 },
  statLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, textTransform: "uppercase" },
  statValue: { marginTop: 3, color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  chipLabel: { marginTop: 10, color: "rgba(255,255,255,0.3)", fontSize: 10.5, textTransform: "uppercase", fontWeight: "700" },
  choice: { marginTop: 6, marginRight: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", backgroundColor: "rgba(255,255,255,0.05)" },
  choiceActive: { borderColor: "rgba(0,144,224,0.5)", backgroundColor: "rgba(0,144,224,0.18)" },
  choiceText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  noCrewText: { marginTop: 12, color: "rgba(255,255,255,0.45)", fontSize: 12 },
  locationControlWrap: { marginTop: 12, gap: 8 },
  endpointText: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "600" },
  startPointChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  halfActionBtn: { flex: 1 },
  actionText: { color: "rgba(255,255,255,0.85)", fontWeight: "800", fontSize: 12 },
  resetBtn: { backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.2)" },
  resetText: { color: "#F87171", fontWeight: "800", fontSize: 12 },
  toggleBtn: { backgroundColor: "rgba(251,146,60,0.12)", borderColor: "rgba(251,146,60,0.3)" },
  toggleText: { color: "#FB923C", fontWeight: "800", fontSize: 12 },
  assignedCrewWrap: { marginTop: 8, gap: 2 },
  assignedCrewText: { color: "rgba(255,255,255,0.9)", fontSize: 12.5, fontWeight: "700" },
});
