import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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
const FAQS_URL = "https://wbtc-rose.vercel.app/faqs";
const HELP_WHATSAPP_NUMBER = "919831003953";

const EMPTY_PAYOUT = {
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  branchName: "",
  updatedAt: null,
};

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

const buildWhatsAppUrl = (message) =>
  `https://wa.me/${HELP_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

export default function OwnerProfile() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [owner, setOwner] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [billingDetails, setBillingDetails] = useState({
    dateRows: [],
    tripRows: [],
    settlementHistory: [],
    period: null,
  });
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [payoutFormOpen, setPayoutFormOpen] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutDetails, setPayoutDetails] = useState(EMPTY_PAYOUT);

  const loadPaymentSummary = useCallback(async () => {
    const [apiBase, token] = await Promise.all([
      AsyncStorage.getItem(API_BASE_KEY),
      AsyncStorage.getItem(TOKEN_KEY),
    ]);
    if (!apiBase || !token) return;
    try {
      setRefreshing(true);
      const month = getOpsDate().slice(0, 7);
      const response = await fetch(`${apiBase}/api/owner/billing?mode=monthly&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerProfile", "failedLoadPaymentSummary"));
      setPaymentSummary(data.summary || null);
      setBillingDetails({
        dateRows: data.dateRows || [],
        tripRows: data.tripRows || [],
        settlementHistory: data.settlementHistory || [],
        period: data.period || null,
      });
      setNotice("");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  const loadPayoutDetails = useCallback(async () => {
    const [apiBase, token] = await Promise.all([
      AsyncStorage.getItem(API_BASE_KEY),
      AsyncStorage.getItem(TOKEN_KEY),
    ]);
    if (!apiBase || !token) return;
    try {
      const response = await fetch(`${apiBase}/api/owner/payout-details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerProfile", "failedLoadPayoutDetails"));
      setPayoutDetails({
        accountHolderName: data.payoutBankDetails?.accountHolderName || "",
        bankName: data.payoutBankDetails?.bankName || "",
        accountNumber: data.payoutBankDetails?.accountNumber || "",
        ifscCode: data.payoutBankDetails?.ifscCode || "",
        branchName: data.payoutBankDetails?.branchName || "",
        updatedAt: data.payoutBankDetails?.updatedAt || null,
      });
    } catch (err) {
      setNotice(err.message);
    }
  }, [t]);

  useEffect(() => {
    const loadProfile = async () => {
      const ownerJson = await AsyncStorage.getItem(OWNER_KEY);
      if (ownerJson) setOwner(JSON.parse(ownerJson));
    };
    loadProfile();
    loadPaymentSummary();
    loadPayoutDetails();
  }, [loadPaymentSummary, loadPayoutDetails]);

  const handlePayoutFieldChange = (field, value) => {
    setPayoutDetails((prev) => ({
      ...prev,
      [field]: field === "ifscCode" ? value.toUpperCase() : value,
    }));
  };

  const handleSavePayoutDetails = async () => {
    const [apiBase, token] = await Promise.all([
      AsyncStorage.getItem(API_BASE_KEY),
      AsyncStorage.getItem(TOKEN_KEY),
    ]);
    if (!apiBase || !token) {
      router.replace("/login");
      return;
    }

    setPayoutSaving(true);
    try {
      const response = await fetch(`${apiBase}/api/owner/payout-details`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountHolderName: payoutDetails.accountHolderName,
          bankName: payoutDetails.bankName,
          accountNumber: payoutDetails.accountNumber,
          ifscCode: payoutDetails.ifscCode,
          branchName: payoutDetails.branchName,
        }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || t("ownerProfile", "failedSavePayoutDetails"));

      setPayoutDetails({
        accountHolderName: data.payoutBankDetails?.accountHolderName || "",
        bankName: data.payoutBankDetails?.bankName || "",
        accountNumber: data.payoutBankDetails?.accountNumber || "",
        ifscCode: data.payoutBankDetails?.ifscCode || "",
        branchName: data.payoutBankDetails?.branchName || "",
        updatedAt: data.payoutBankDetails?.updatedAt || null,
      });
      setPayoutFormOpen(false);
      setNotice(t("ownerProfile", "payoutUpdated"));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setPayoutSaving(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_ROLE_KEY, OWNER_KEY, API_BASE_KEY, MUST_CHANGE_PASSWORD_KEY]);
    router.replace("/login");
  };

  const handleHelp = () => {
    const companyName = owner?.companyName || owner?.company || owner?.username || "--";
    const message = `Hello Admin, I need help.\nRole: Owner\nOwner Name: ${owner?.name || "--"}\nCompany Name: ${companyName}`;
    Linking.openURL(buildWhatsAppUrl(message)).catch(() => setNotice("Unable to open WhatsApp."));
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
        <View style={styles.cardStripPayout} />
        <TouchableOpacity
          style={styles.collapseToggle}
          onPress={() => setPayoutFormOpen((prev) => !prev)}
          activeOpacity={0.85}
        >
          <View style={styles.collapseMain}>
            <Text style={styles.billingTitle}>{t("ownerProfile", "payoutDetails")}</Text>
            <Text style={styles.cardSubtitle}>{t("ownerProfile", "payoutSubtitle")}</Text>
          </View>
          <Ionicons
            name={payoutFormOpen ? "chevron-up-outline" : "chevron-down-outline"}
            size={18}
            color="rgba(255,255,255,0.75)"
          />
        </TouchableOpacity>

        {payoutDetails.updatedAt ? (
          <Text style={styles.billingRange}>
            {t("ownerProfile", "payoutUpdatedAt")}: {new Date(payoutDetails.updatedAt).toLocaleString()}
          </Text>
        ) : (
          <Text style={styles.billingRange}>{t("ownerProfile", "payoutMissing")}</Text>
        )}

        {!payoutFormOpen ? (
          <TouchableOpacity style={styles.inlineAction} onPress={() => setPayoutFormOpen(true)}>
            <Text style={styles.inlineActionText}>
              {payoutDetails.accountNumber
                ? t("ownerProfile", "updatePayoutDetails")
                : t("ownerProfile", "addPayoutDetails")}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.formBlock}>
            <Text style={styles.inputLabel}>{t("ownerProfile", "accountHolderName")}</Text>
            <TextInput
              style={styles.input}
              value={payoutDetails.accountHolderName}
              onChangeText={(value) => handlePayoutFieldChange("accountHolderName", value)}
              placeholder={t("ownerProfile", "accountHolderName")}
              placeholderTextColor="rgba(255,255,255,0.24)"
            />

            <Text style={styles.inputLabel}>{t("ownerProfile", "bankName")}</Text>
            <TextInput
              style={styles.input}
              value={payoutDetails.bankName}
              onChangeText={(value) => handlePayoutFieldChange("bankName", value)}
              placeholder={t("ownerProfile", "bankName")}
              placeholderTextColor="rgba(255,255,255,0.24)"
            />

            <Text style={styles.inputLabel}>{t("ownerProfile", "accountNumber")}</Text>
            <TextInput
              style={styles.input}
              value={payoutDetails.accountNumber}
              onChangeText={(value) => handlePayoutFieldChange("accountNumber", value.replace(/[^0-9]/g, ""))}
              placeholder={t("ownerProfile", "accountNumber")}
              placeholderTextColor="rgba(255,255,255,0.24)"
              keyboardType="number-pad"
            />

            <Text style={styles.inputLabel}>{t("ownerProfile", "ifscCode")}</Text>
            <TextInput
              style={styles.input}
              value={payoutDetails.ifscCode}
              onChangeText={(value) => handlePayoutFieldChange("ifscCode", value.replace(/[^a-zA-Z0-9]/g, ""))}
              placeholder={t("ownerProfile", "ifscCode")}
              placeholderTextColor="rgba(255,255,255,0.24)"
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>{t("ownerProfile", "branchName")}</Text>
            <TextInput
              style={styles.input}
              value={payoutDetails.branchName}
              onChangeText={(value) => handlePayoutFieldChange("branchName", value)}
              placeholder={t("ownerProfile", "branchName")}
              placeholderTextColor="rgba(255,255,255,0.24)"
            />

            <TouchableOpacity style={styles.primaryAction} onPress={handleSavePayoutDetails} disabled={payoutSaving}>
              {payoutSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryActionText}>{t("ownerProfile", "savePayoutDetails")}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardStripBilling} />
        <View style={styles.billingHead}>
          <View style={styles.billingAccent} />
          <Text style={styles.billingTitle}>{t("ownerProfile", "billingThisMonth")}</Text>
        </View>
        <Text style={styles.billingRange}>
          {billingDetails.period
            ? `${billingDetails.period.startDate} - ${billingDetails.period.endDate}`
            : t("ownerProfile", "currentMonthRange")}
        </Text>

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

      <View style={styles.card}>
        <View style={styles.cardStripBillingDetail} />
        <TouchableOpacity
          style={styles.collapseToggle}
          onPress={() => setBreakdownOpen((prev) => !prev)}
          activeOpacity={0.85}
        >
          <View style={styles.billingHead}>
            <View style={[styles.billingAccent, { backgroundColor: "#FB923C" }]} />
            <Text style={styles.billingTitle}>{t("ownerProfile", "collectionBreakdown")}</Text>
          </View>
          <Ionicons
            name={breakdownOpen ? "chevron-up-outline" : "chevron-down-outline"}
            size={18}
            color="rgba(255,255,255,0.75)"
          />
        </TouchableOpacity>

        {breakdownOpen ? (
          <>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t("ownerProfile", "onlineCollection")}</Text>
                <Text style={styles.metricValue}>{t("common", "rs")} {formatMoney(paymentSummary?.onlineAmount || 0)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t("ownerProfile", "offlineCollection")}</Text>
                <Text style={styles.metricValue}>{t("common", "rs")} {formatMoney(paymentSummary?.cashAmount || 0)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t("ownerProfile", "totalCollection")}</Text>
                <Text style={styles.metricValue}>{t("common", "rs")} {formatMoney(paymentSummary?.totalAmount || 0)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{t("ownerProfile", "tripsCovered")}</Text>
                <Text style={styles.metricValue}>{billingDetails.tripRows.length}</Text>
              </View>
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.billingHead}>
                <View style={[styles.billingAccent, { backgroundColor: "#00C87A" }]} />
                <Text style={styles.billingTitle}>{t("ownerProfile", "dateWiseBilling")}</Text>
              </View>
              {billingDetails.dateRows.length === 0 ? (
                <Text style={styles.emptyText}>{t("ownerProfile", "noBillingRows")}</Text>
              ) : (
                billingDetails.dateRows.map((row) => (
                  <View key={row.date} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{row.date}</Text>
                      <Text style={styles.listMeta}>
                        {row.tripCount ?? 0} {t("ownerProfile", "tripsLabel")} - {t("ownerProfile", "onlineLabel")} {row.onlinePassengersCount ?? 0} - {t("ownerProfile", "offlineLabel")} {row.cashPassengersCount ?? 0}
                      </Text>
                    </View>
                    <Text style={styles.listAmount}>{t("common", "rs")} {formatMoney(row.totalAmount)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.billingHead}>
                <View style={[styles.billingAccent, { backgroundColor: "#A78BFA" }]} />
                <Text style={styles.billingTitle}>{t("ownerProfile", "tripWiseBilling")}</Text>
              </View>
              {billingDetails.tripRows.length === 0 ? (
                <Text style={styles.emptyText}>{t("ownerProfile", "noTripBillingRows")}</Text>
              ) : (
                billingDetails.tripRows.map((row, index) => (
                  <View key={row.tripInstanceId || `${row.tripDate}-${index}`} style={styles.tripCard}>
                    <View style={styles.tripHeader}>
                      <Text style={styles.tripTitle}>{row.busNumber || "--"} - {row.routeCode || "--"}</Text>
                      <Text style={styles.tripAmount}>{t("common", "rs")} {formatMoney(row.totalAmount)}</Text>
                    </View>
                    <Text style={styles.tripMeta}>
                      {(row.tripDate || "--")} - {(row.tripWindow || "--")} - {(row.direction || "--")}
                    </Text>
                    <Text style={styles.tripMeta}>
                      {t("ownerProfile", "onlineLabel")} {row.onlinePassengersCount ?? 0} / {t("common", "rs")} {formatMoney(row.onlineAmount)} - {t("ownerProfile", "offlineLabel")} {row.cashPassengersCount ?? 0} / {t("common", "rs")} {formatMoney(row.cashAmount)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.billingHead}>
                <View style={[styles.billingAccent, { backgroundColor: "#0090E0" }]} />
                <Text style={styles.billingTitle}>{t("ownerProfile", "settlementHistory")}</Text>
              </View>
              {billingDetails.settlementHistory.length === 0 ? (
                <Text style={styles.emptyText}>{t("ownerProfile", "noSettlements")}</Text>
              ) : (
                billingDetails.settlementHistory.map((row) => (
                  <View key={row.id} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{row.periodStart} - {row.periodEnd}</Text>
                      <Text style={styles.listMeta}>
                        {t("ownerProfile", "commission")} {t("common", "rs")} {formatMoney(row.commissionAmount)} - {row.gatewayTxnRef || "--"}
                      </Text>
                    </View>
                    <Text style={styles.listAmount}>{t("common", "rs")} {formatMoney(row.netPaidAmount)}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}
      </View>

      <TouchableOpacity style={styles.refresh} onPress={loadPaymentSummary} disabled={refreshing}>
        {refreshing ? (
          <ActivityIndicator color="rgba(255,255,255,0.85)" size="small" />
        ) : (
          <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.85)" />
        )}
        <Text style={styles.refreshText}>{refreshing ? t("common", "refreshing") : t("ownerProfile", "refreshPayment")}</Text>
      </TouchableOpacity>

      {notice ? <Text style={styles.error}>{notice}</Text> : null}

      <TouchableOpacity
        style={styles.secondaryAction}
        onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => setNotice("Unable to open privacy policy."))}
      >
        <Ionicons name="document-text-outline" size={16} color="#9CCBFF" />
        <Text style={styles.secondaryActionText}>Privacy Policy</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryAction}
        onPress={() => Linking.openURL(FAQS_URL).catch(() => setNotice("Unable to open FAQs."))}
      >
        <Ionicons name="help-circle-outline" size={16} color="#9CCBFF" />
        <Text style={styles.secondaryActionText}>FAQs</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryAction} onPress={handleHelp}>
        <Ionicons name="logo-whatsapp" size={16} color="#9CCBFF" />
        <Text style={styles.secondaryActionText}>Help</Text>
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
  cardStripPayout: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#00C87A",
  },
  cardStripBilling: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#0090E0",
  },
  cardStripBillingDetail: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#FB923C",
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
  collapseMain: {
    flex: 1,
  },
  cardSubtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
  },
  billingHead: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  collapseToggle: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  billingAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#00C87A",
  },
  billingTitle: {
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 0.9,
    fontWeight: "700",
  },
  billingRange: {
    marginBottom: 10,
    color: "rgba(255,255,255,0.38)",
    fontSize: 12,
  },
  inlineAction: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0,200,122,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.24)",
  },
  inlineActionText: {
    color: "#86EFAC",
    fontWeight: "800",
  },
  formBlock: {
    marginTop: 6,
  },
  inputLabel: {
    marginTop: 12,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    fontWeight: "700",
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  primaryAction: {
    marginTop: 16,
    backgroundColor: "#00C87A",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: "#04111F",
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  payLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  payIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  payLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "600",
  },
  valueGreen: {
    color: "#00C87A",
    fontWeight: "800",
  },
  valueBlue: {
    color: "#0090E0",
    fontWeight: "800",
  },
  metricsGrid: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
  },
  metricLabel: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    marginTop: 6,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionBlock: {
    marginTop: 14,
  },
  emptyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
  },
  listRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  listMain: {
    flex: 1,
  },
  listTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  listMeta: {
    marginTop: 4,
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
  },
  listAmount: {
    color: "#00C87A",
    fontWeight: "800",
    fontSize: 14,
  },
  tripCard: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
  },
  tripHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tripTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  tripAmount: {
    color: "#FB923C",
    fontWeight: "800",
    fontSize: 14,
  },
  tripMeta: {
    marginTop: 6,
    color: "rgba(255,255,255,0.48)",
    fontSize: 12,
  },
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
