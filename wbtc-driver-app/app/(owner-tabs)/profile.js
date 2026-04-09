import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AppLanguageToggle from "../../components/AppLanguageToggle";
import { useAppLanguage } from "../../contexts/shared-language";
import { getOpsDate } from "../../utils/opsTime";

const TOKEN_KEY = "wbtc_driver_token";
const USER_ROLE_KEY = "wbtc_user_role";
const API_BASE_KEY = "wbtc_api_base";
const OWNER_KEY = "wbtc_owner_profile";
const MUST_CHANGE_PASSWORD_KEY = "wbtc_must_change_password";
const PRIVACY_POLICY_URL = "https://wbtc-rose.vercel.app/privacy-policy";

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

export default function OwnerProfile() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [owner, setOwner] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadPaymentSummary = useCallback(async () => {
    const [apiBase, token] = await Promise.all([
      AsyncStorage.getItem(API_BASE_KEY),
      AsyncStorage.getItem(TOKEN_KEY),
    ]);
    if (!apiBase || !token) return;
    try {
      setRefreshing(true);
      const month = getOpsDate().slice(0, 7);
      const response = await fetch(`${apiBase}/api/owner/payment-summary?mode=monthly&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerProfile", "failedLoadPaymentSummary"));
      setPaymentSummary(data.summary || null);
      setNotice("");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    const loadProfile = async () => {
      const ownerJson = await AsyncStorage.getItem(OWNER_KEY);
      if (ownerJson) setOwner(JSON.parse(ownerJson));
    };
    loadProfile();
    loadPaymentSummary();
  }, [loadPaymentSummary]);

  const handleLogout = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_ROLE_KEY, OWNER_KEY, API_BASE_KEY, MUST_CHANGE_PASSWORD_KEY]);
    router.replace("/login");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.bgBubbleA} />
      <View style={styles.bgBubbleB} />

      <View style={styles.header}>
        <Text style={styles.kicker}>{t("ownerProfile", "owner")}</Text>
        <Text style={styles.title}>{t("ownerProfile", "title")}</Text>
        <Text style={styles.subtitle}>{t("ownerProfile", "subtitle")}</Text>
      </View>
      <View style={styles.languageToggleWrap}>
        <AppLanguageToggle />
      </View>

      <View style={styles.card}>
        <View style={styles.cardStripProfile} />
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{String(owner?.name || "O").slice(0, 1).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.profileName}>{owner?.name || t("ownerProfile", "owner")}</Text>
            <View style={styles.rolePill}>
              <View style={styles.roleDot} />
              <Text style={styles.roleText}>{owner?.role || "OWNER"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>{t("ownerProfile", "name")}</Text>
          <Text style={styles.value}>{owner?.name || "--"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t("ownerProfile", "username")}</Text>
          <Text style={styles.value}>{owner?.username || "--"}</Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.label}>{t("ownerProfile", "role")}</Text>
          <Text style={styles.valueAccent}>{owner?.role || "OWNER"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardStripBilling} />
        <View style={styles.billingHead}>
          <View style={styles.billingAccent} />
          <Text style={styles.billingTitle}>{t("ownerProfile", "billingThisMonth")}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.payLabelWrap}>
            <View style={styles.payIconWrap}>
              <MaterialCommunityIcons name="receipt-text-outline" size={16} color="rgba(255,255,255,0.7)" />
            </View>
            <Text style={styles.payLabel}>{t("ownerProfile", "currentDue")}</Text>
          </View>
          <Text style={styles.value}>{t("common", "rs")} {formatMoney(paymentSummary?.dueAmount || 0)}</Text>
        </View>
        <View style={styles.row}>
          <View style={styles.payLabelWrap}>
            <View style={styles.payIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#00C87A" />
            </View>
            <Text style={styles.payLabel}>{t("ownerProfile", "paid")}</Text>
          </View>
          <Text style={styles.valueGreen}>{t("common", "rs")} {formatMoney(paymentSummary?.paidAmount || 0)}</Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <View style={styles.payLabelWrap}>
            <View style={styles.payIconWrap}>
              <Ionicons name="stats-chart-outline" size={16} color="#0090E0" />
            </View>
            <Text style={styles.payLabel}>{t("ownerProfile", "commission")}</Text>
          </View>
          <Text style={styles.valueBlue}>{t("common", "rs")} {formatMoney(paymentSummary?.commissionAmount || 0)}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.refresh} onPress={loadPaymentSummary} disabled={refreshing}>
        {refreshing ? <ActivityIndicator color="rgba(255,255,255,0.85)" size="small" /> : <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.85)" />}
        <Text style={styles.refreshText}>{refreshing ? t("common", "refreshing") : t("ownerProfile", "refreshPayment")}</Text>
      </TouchableOpacity>

      {notice ? <Text style={styles.error}>{notice}</Text> : null}

      <TouchableOpacity style={styles.secondaryAction} onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => setNotice("Unable to open privacy policy."))}>
        <Ionicons name="document-text-outline" size={16} color="#9CCBFF" />
        <Text style={styles.secondaryActionText}>Privacy Policy</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.changePassword} onPress={() => router.push("/change-password")}>
        <Ionicons name="lock-closed-outline" size={16} color="#FFFFFF" />
        <Text style={styles.changePasswordText}>Change Password</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <MaterialCommunityIcons name="logout" size={16} color="#FFFFFF" />
        <Text style={styles.logoutText}>{t("common", "logout")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    flexGrow: 1,
  },
  bgBubbleA: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(251,146,60,0.10)",
  },
  bgBubbleB: {
    position: "absolute",
    top: 220,
    left: -45,
    width: 130,
    height: 130,
    borderRadius: 999,
    backgroundColor: "rgba(167,139,250,0.08)",
  },
  header: {
    marginTop: 28,
  },
  languageToggleWrap: {
    marginTop: 12,
    alignItems: "flex-start",
  },
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.4)",
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 3,
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  card: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  cardStripProfile: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#A78BFA",
  },
  cardStripBilling: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#0090E0",
  },
  identityRow: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  rolePill: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(251,146,60,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.2)",
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#FB923C",
  },
  roleText: {
    color: "#FB923C",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
  },
  row: {
    marginTop: 6,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.35)",
  },
  value: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  valueAccent: {
    color: "#FB923C",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  billingHead: { marginTop: 4, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  billingAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: "#00C87A" },
  billingTitle: {
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 0.9,
    fontWeight: "700",
  },
  payLabelWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  payIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  payLabel: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600" },
  valueGreen: { color: "#00C87A", fontWeight: "800" },
  valueBlue: { color: "#0090E0", fontWeight: "800" },
  logout: {
    marginTop: 14,
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  error: {
    marginTop: 8,
    color: "#FCA5A5",
  },
  refresh: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  refreshText: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
  },
  secondaryAction: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryActionText: {
    color: "#9CCBFF",
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  changePassword: {
    marginTop: 12,
    backgroundColor: "#3650A8",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  changePasswordText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
