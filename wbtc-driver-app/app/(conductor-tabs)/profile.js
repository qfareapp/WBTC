import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  PermissionsAndroid,
  NativeModules,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import ConductorLanguageToggle from "../../components/ConductorLanguageToggle";
import { useConductorLanguage } from "../../contexts/conductor-language";

const TOKEN_KEY = "wbtc_driver_token";
const CONDUCTOR_KEY = "wbtc_conductor_profile";
const USER_ROLE_KEY = "wbtc_user_role";
const API_BASE_KEY = "wbtc_api_base";
const PRINTER_KEY = "wbtc_conductor_printer";
const MUST_CHANGE_PASSWORD_KEY = "wbtc_must_change_password";
const PRIVACY_POLICY_URL = "https://wbtc-rose.vercel.app/privacy-policy";

let bluetoothClassicCache = null;
let bluetoothManagerChecked = false;

const getBluetoothManager = () => {
  if (bluetoothManagerChecked) return bluetoothClassicCache;
  bluetoothManagerChecked = true;
  if (!NativeModules?.RNBluetoothClassic) {
    bluetoothClassicCache = null;
    return bluetoothClassicCache;
  }
  try {
    const module = require("react-native-bluetooth-classic");
    bluetoothClassicCache = module?.default || null;
  } catch (error) {
    bluetoothClassicCache = null;
  }
  return bluetoothClassicCache;
};

const normalizeDevice = (device) => {
  const address = device?.address || device?.macAddress || device?.id || "";
  if (!address) return null;
  return {
    name: device?.name || device?.deviceName || "Unknown printer",
    address,
  };
};

const mergeUniqueDevices = (...lists) => {
  const map = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const normalized = normalizeDevice(raw);
      if (!normalized) continue;
      map.set(normalized.address, normalized);
    }
  }
  return Array.from(map.values());
};

const signalStrength = (name = "", address = "") => {
  const raw = [...`${name}${address}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 35 + (raw % 60);
};

const signalColor = (strength) => {
  if (strength > 70) return "#00C87A";
  if (strength > 40) return "#FB923C";
  return "#EF4444";
};

const SignalBars = ({ strength }) => {
  const color = signalColor(strength);
  return (
    <View style={styles.signalBars}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.signalBar,
            { height: 5 + index * 4 },
            strength >= (index + 1) * 33 ? { backgroundColor: color } : styles.signalBarOff,
          ]}
        />
      ))}
    </View>
  );
};

const InfoRow = ({ icon, label, value, mono = false, muted = false, accent }) => (
  <View style={styles.infoRow}>
    <View style={styles.infoLead}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={15} color="#E2E8F0" />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
    <Text
      numberOfLines={1}
      style={[
        styles.infoValue,
        mono ? styles.infoValueMono : null,
        muted ? styles.infoValueMuted : null,
        accent ? { color: accent } : null,
      ]}
    >
      {value || "--"}
    </Text>
  </View>
);

export default function ConductorProfile() {
  const router = useRouter();
  const { t } = useConductorLanguage();
  const [conductor, setConductor] = useState(null);
  const [notice, setNotice] = useState("");
  const [scanning, setScanning] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState("");
  const [devices, setDevices] = useState([]);
  const [connectedPrinter, setConnectedPrinter] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      const [conductorJson, printerJson] = await Promise.all([
        AsyncStorage.getItem(CONDUCTOR_KEY),
        AsyncStorage.getItem(PRINTER_KEY),
      ]);
      if (conductorJson) setConductor(JSON.parse(conductorJson));
      if (printerJson) setConnectedPrinter(JSON.parse(printerJson));
    };
    loadProfile();
  }, []);

  const requestBluetoothPermissions = async () => {
    if (Platform.OS !== "android") return true;
    const required = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];
    const granted = await PermissionsAndroid.requestMultiple(required);
    return required.every((permission) => granted[permission] === PermissionsAndroid.RESULTS.GRANTED);
  };

  const scanPrinters = async () => {
    const manager = getBluetoothManager();
    if (!manager) {
      setNotice("Bluetooth module is unavailable. Use a native Android dev build (not Expo Go).");
      return;
    }
    try {
      setNotice("");
      setScanning(true);
      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        setNotice("Bluetooth permissions are required to scan and connect printers.");
        return;
      }
      await manager.requestBluetoothEnabled();
      const bonded = await manager.getBondedDevices();
      const discovered = await manager.startDiscovery();
      const merged = mergeUniqueDevices(bonded || [], discovered || []);
      setDevices(merged);
      if (!merged.length) setNotice("No Bluetooth thermal printers found. Ensure printer is ON and discoverable.");
    } catch (error) {
      setNotice(error?.message || "Failed to scan Bluetooth printers.");
    } finally {
      setScanning(false);
    }
  };

  const connectPrinter = async (device) => {
    const manager = getBluetoothManager();
    if (!manager) {
      setNotice("Bluetooth printer module is unavailable.");
      return;
    }
    if (!device?.address) return;
    try {
      setConnectingAddress(device.address);
      setNotice("");
      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        setNotice("Bluetooth permissions are required to connect printer.");
        return;
      }
      const connectedDevice = await manager.connectToDevice(device.address);
      const normalizedConnected = normalizeDevice(connectedDevice) || device;
      setConnectedPrinter(normalizedConnected);
      await AsyncStorage.setItem(PRINTER_KEY, JSON.stringify(normalizedConnected));
      setNotice(`Connected to ${normalizedConnected.name}.`);
    } catch (error) {
      setNotice(error?.message || "Unable to connect printer.");
    } finally {
      setConnectingAddress("");
    }
  };

  const disconnectPrinter = async () => {
    const manager = getBluetoothManager();
    try {
      if (manager && connectedPrinter?.address && typeof manager.disconnectFromDevice === "function") {
        await manager.disconnectFromDevice(connectedPrinter.address);
      }
      setConnectedPrinter(null);
      await AsyncStorage.removeItem(PRINTER_KEY);
      setNotice("Printer disconnected.");
    } catch (error) {
      setNotice(error?.message || "Unable to disconnect printer.");
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_ROLE_KEY, CONDUCTOR_KEY, API_BASE_KEY, PRINTER_KEY, MUST_CHANGE_PASSWORD_KEY]);
    router.replace("/login");
  };

  const initials = (conductor?.name || "C").trim().charAt(0).toUpperCase();
  const status = conductor?.status || "--";
  const currentLocation = conductor?.currentLocation || "--";
  const currentSignal = connectedPrinter ? signalStrength(connectedPrinter.name, connectedPrinter.address) : 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroGlow} />

        <View style={styles.header}>
          <View style={styles.headerMain}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>{t("profile", "conductor")}</Text>
              <Text style={styles.title}>{conductor?.name || t("profile", "conductor")}</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>
                  {status} {conductor?.empId ? `· ${conductor.empId}` : ""}
                </Text>
              </View>
            </View>
          </View>
          <ConductorLanguageToggle />
        </View>

        {!!notice && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color="#FDE68A" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardAccent} />
          <View style={styles.cardHeader}>
            <View style={styles.cardMarker} />
            <Text style={styles.cardKicker}>{t("profile", "profileDetails")}</Text>
          </View>
          <InfoRow icon="person-outline" label={t("profile", "name")} value={conductor?.name || "--"} />
          <InfoRow icon="id-card-outline" label={t("profile", "employeeId")} value={conductor?.empId || "--"} mono />
          <InfoRow icon="business-outline" label={t("profile", "depot")} value={conductor?.depotId || "--"} mono muted />
          <InfoRow icon="checkmark-circle-outline" label={t("profile", "status")} value={status} accent="#00C87A" />
          <InfoRow icon="location-outline" label={t("profile", "startLocation")} value={currentLocation} />
        </View>

        <View style={styles.card}>
          <View style={[styles.cardAccent, connectedPrinter ? styles.cardAccentConnected : styles.cardAccentIdle]} />
          <View style={styles.printerHeaderRow}>
            <View style={styles.printerTitleWrap}>
              <View style={[styles.printerIconBadge, connectedPrinter ? styles.printerIconBadgeConnected : null]}>
                <Ionicons name="print-outline" size={18} color={connectedPrinter ? "#00C87A" : "#E2E8F0"} />
              </View>
              <View>
                <Text style={styles.printerTitle}>{t("profile", "printerTitle")}</Text>
                <Text style={styles.printerSubtitle}>{t("profile", "printerSubtitle")}</Text>
              </View>
            </View>
            <View style={[styles.connectionPill, connectedPrinter ? styles.connectionPillOn : styles.connectionPillOff]}>
              <View style={[styles.connectionDot, connectedPrinter ? styles.connectionDotOn : styles.connectionDotOff]} />
              <Text style={[styles.connectionText, connectedPrinter ? styles.connectionTextOn : styles.connectionTextOff]}>
                {connectedPrinter ? t("common", "connected") : t("common", "disconnected")}
              </Text>
            </View>
          </View>

          {connectedPrinter ? (
            <View style={styles.connectedCard}>
              <View style={styles.connectedMeta}>
                <View style={styles.connectedIcon}>
                  <Ionicons name="bluetooth-outline" size={16} color="#00C87A" />
                </View>
                <View style={styles.connectedCopy}>
                  <Text style={styles.connectedName}>{connectedPrinter.name}</Text>
                  <Text style={styles.connectedAddress}>{connectedPrinter.address}</Text>
                </View>
              </View>
              <SignalBars strength={currentSignal} />
            </View>
          ) : (
            <Text style={styles.printerHint}>{t("profile", "printerHint")}</Text>
          )}

          {devices.length ? (
            <View style={styles.devicesBlock}>
              <Text style={styles.devicesHeading}>{t("profile", "nearbyPrinters", { count: devices.length })}</Text>
              {devices.map((device, index) => {
                const isCurrent = connectedPrinter?.address === device.address;
                const busy = connectingAddress === device.address;
                const strength = signalStrength(device.name, device.address);
                return (
                  <View
                    key={`printer-${device.address || device.name || "na"}-${index}`}
                    style={[styles.deviceRow, isCurrent ? styles.deviceRowActive : null]}
                  >
                    <View style={styles.deviceInfo}>
                      <View style={styles.deviceIconWrap}>
                        <Ionicons name="print-outline" size={16} color="#E2E8F0" />
                      </View>
                      <View style={styles.deviceMeta}>
                        <Text style={styles.deviceName}>{device.name}</Text>
                        <Text style={styles.deviceAddress}>{device.address}</Text>
                      </View>
                    </View>
                    <View style={styles.deviceActionWrap}>
                      <SignalBars strength={strength} />
                      <TouchableOpacity
                        style={[styles.connectBtn, isCurrent ? styles.connectBtnConnected : null]}
                        disabled={busy || isCurrent}
                        onPress={() => connectPrinter(device)}
                      >
                        <Text style={[styles.connectBtnText, isCurrent ? styles.connectBtnTextConnected : null]}>
                          {isCurrent ? "Connected" : busy ? "Connecting..." : "Connect"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.printerActions}>
            <TouchableOpacity style={styles.primaryAction} onPress={scanPrinters} disabled={scanning}>
              <Ionicons name={scanning ? "sync-outline" : "radio-outline"} size={16} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>{scanning ? t("common", "scanning") : t("common", "scanPrinters")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryAction, !connectedPrinter ? styles.secondaryActionDisabled : null]}
              onPress={disconnectPrinter}
              disabled={!connectedPrinter}
            >
              <Ionicons name="close-outline" size={16} color={connectedPrinter ? "#F87171" : "rgba(255,255,255,0.25)"} />
              <Text style={[styles.secondaryActionText, !connectedPrinter ? styles.secondaryActionTextDisabled : null]}>
                {t("common", "disconnect")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.privacyButton} onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => setNotice("Unable to open privacy policy."))}>
          <Ionicons name="document-text-outline" size={16} color="#9CCBFF" />
          <Text style={styles.privacyButtonText}>Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logout} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
          <Text style={styles.logoutText}>{t("common", "logout")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 28,
  },
  heroGlow: {
    position: "absolute",
    top: -36,
    right: -18,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(251,146,60,0.12)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flex: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FB923C",
    shadowColor: "#FB923C",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 28,
  },
  statusRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#00C87A",
  },
  statusText: {
    color: "#00C87A",
    fontSize: 12,
    fontWeight: "700",
  },
  notice: {
    marginBottom: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(251,191,36,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.26)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  noticeText: {
    flex: 1,
    color: "#FDE68A",
    fontSize: 12.5,
    lineHeight: 18,
  },
  card: {
    marginTop: 14,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  cardAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#A78BFA",
  },
  cardAccentConnected: {
    backgroundColor: "#00C87A",
  },
  cardAccentIdle: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardMarker: {
    width: 3,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#FB923C",
  },
  cardKicker: {
    color: "rgba(255,255,255,0.44)",
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  infoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  infoLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12.5,
  },
  infoValue: {
    maxWidth: "52%",
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  infoValueMono: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  infoValueMuted: {
    color: "rgba(255,255,255,0.34)",
  },
  printerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  printerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  printerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  printerIconBadgeConnected: {
    backgroundColor: "rgba(0,200,122,0.12)",
    borderColor: "rgba(0,200,122,0.24)",
  },
  printerTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  printerSubtitle: {
    marginTop: 1,
    color: "rgba(255,255,255,0.36)",
    fontSize: 11.5,
  },
  connectionPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  connectionPillOn: {
    backgroundColor: "rgba(0,200,122,0.12)",
    borderColor: "rgba(0,200,122,0.3)",
  },
  connectionPillOff: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  connectionDotOn: {
    backgroundColor: "#00C87A",
  },
  connectionDotOff: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  connectionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  connectionTextOn: {
    color: "#00C87A",
  },
  connectionTextOff: {
    color: "rgba(255,255,255,0.45)",
  },
  connectedCard: {
    marginBottom: 14,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(0,200,122,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  connectedMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  connectedIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(0,200,122,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  connectedCopy: {
    flex: 1,
  },
  connectedName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  connectedAddress: {
    marginTop: 2,
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  printerHint: {
    marginBottom: 14,
    color: "rgba(255,255,255,0.38)",
    fontSize: 12.5,
    lineHeight: 19,
  },
  devicesBlock: {
    marginBottom: 14,
  },
  devicesHeading: {
    marginBottom: 8,
    color: "rgba(255,255,255,0.38)",
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  deviceRow: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  deviceRowActive: {
    backgroundColor: "rgba(0,200,122,0.08)",
    borderColor: "rgba(0,200,122,0.18)",
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  deviceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  deviceMeta: {
    flex: 1,
  },
  deviceName: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  deviceAddress: {
    marginTop: 2,
    color: "rgba(255,255,255,0.34)",
    fontSize: 10.5,
  },
  deviceActionWrap: {
    alignItems: "flex-end",
    gap: 8,
  },
  signalBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  signalBar: {
    width: 4,
    borderRadius: 2,
  },
  signalBarOff: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  connectBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(0,144,224,0.16)",
    borderWidth: 1,
    borderColor: "rgba(0,144,224,0.24)",
  },
  connectBtnConnected: {
    backgroundColor: "rgba(0,200,122,0.12)",
    borderColor: "rgba(0,200,122,0.22)",
  },
  connectBtnText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "700",
  },
  connectBtnTextConnected: {
    color: "#00C87A",
  },
  printerActions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#007CCF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    backgroundColor: "rgba(239,68,68,0.1)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryActionDisabled: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  secondaryActionText: {
    color: "#F87171",
    fontSize: 13.5,
    fontWeight: "800",
  },
  secondaryActionTextDisabled: {
    color: "rgba(255,255,255,0.25)",
  },
  privacyButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  privacyButtonText: {
    color: "#9CCBFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  logout: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
