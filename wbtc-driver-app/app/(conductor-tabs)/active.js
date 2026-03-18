import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, Platform, PermissionsAndroid, NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useConductorLanguage } from "../../contexts/conductor-language";
import useOfferAlert from "../../hooks/use-offer-alert";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const CONDUCTOR_KEY = "wbtc_conductor_profile";
const USER_ROLE_KEY = "wbtc_user_role";
const PRINTER_KEY = "wbtc_conductor_printer";

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

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const formatDateTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};
const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};
const sanitizePrint = (value) => String(value ?? "--").replace(/\s+/g, " ").trim();
const toAscii = (value) => String(value || "").replace(/[^\x20-\x7E]/g, "");
const buildTicketPrintPayload = ({ trip, ticket, src, dst, fareValue }) => {
  const lines = [
    "WBTC BUS TICKET",
    "Passenger Copy",
    "------------------------------",
    `Route: ${sanitizePrint(trip?.route?.routeCode)}`,
    `Ticket: ${sanitizePrint(ticket?.bookingId)}`,
    `Time: ${sanitizePrint(formatDateTime(ticket?.bookedAt))}`,
    `Source: ${sanitizePrint(ticket?.source || src)}`,
    `Dest: ${sanitizePrint(ticket?.destination || dst)}`,
    `Pax: ${sanitizePrint(ticket?.passengerCount || 1)}`,
    "------------------------------",
    `FARE: Rs ${sanitizePrint(ticket?.fare ?? fareValue ?? "--")}`,
    "------------------------------",
    "1. Valid only for this journey.",
    "2. Keep till end of trip.",
    "3. Subject to transport rules.",
    "Thank you for traveling with WBTC",
    "",
    "",
    "",
  ];
  // Use plain ASCII + CRLF for broad Bluetooth thermal compatibility.
  return lines.map(toAscii).join("\r\n");
};

export default function ConductorActive() {
  const router = useRouter();
  const { t } = useConductorLanguage();
  const [conductor, setConductor] = useState(null);
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [dutyUpdating, setDutyUpdating] = useState(false);
  const [activeTrip, setActiveTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [fare, setFare] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [lastTicket, setLastTicket] = useState(null);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [endTripModalOpen, setEndTripModalOpen] = useState(false);
  const [endingTrip, setEndingTrip] = useState(false);
  const [snoozedTripId, setSnoozedTripId] = useState("");
  const [printing, setPrinting] = useState(false);
  const [todaySummary, setTodaySummary] = useState({
    ticketsBooked: 0,
    amountCollected: "0.00",
    avgTicketPrice: "0.00",
  });

  const isOnDuty = (conductor?.status || "Available") === "Available";

  useOfferAlert(offers, isOnDuty);

  const getAuth = async () => {
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
  };

  const loadConductor = async () => {
    const conductorJson = await AsyncStorage.getItem(CONDUCTOR_KEY);
    if (conductorJson) setConductor(JSON.parse(conductorJson));
  };

  const loadOffers = async () => {
    setOffersLoading(true);
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/offers?date=${today()}&debug=true`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load offers");
      setOffers(data.offers || []);
      if ((data.offers || []).length === 0 && data.debug?.summary) {
        const topReasons = Object.entries(data.debug.summary)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([reason, count]) => `${reason} (${count})`)
          .join(", ");
        const nextTripHint = data.debug?.nextEligibleTrip
          ? ` Next eligible trip: ${data.debug.nextEligibleTrip.date} ${data.debug.nextEligibleTrip.startTime || ""} (${data.debug.nextEligibleTrip.routeCode || "Route"}).`
          : "";
        if (topReasons) {
          setNotice(`No offers. Reasons: ${topReasons}.${nextTripHint}`);
        }
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setOffersLoading(false);
    }
  };

  const loadCurrentTrip = async () => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/current?date=${today()}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load active trip");
      const trip = data.trip || null;
      setActiveTrip(trip);
      if (trip?.driverEnded && trip?.canEndTrip && snoozedTripId !== trip.tripInstanceId) {
        setEndTripModalOpen(true);
      }
      setStops((data.stops || []).map((stop) => stop.name));
      if (!trip) {
        setSource("");
        setDestination("");
        setPassengerCount(1);
        setFare(null);
        setEndTripModalOpen(false);
        setSnoozedTripId("");
      }
    } catch (err) {
      setNotice(err.message);
    }
  };

  const loadTodaySummary = async () => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/summary?date=${today()}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load summary");
      setTodaySummary({
        ticketsBooked: data?.summary?.ticketsBooked ?? 0,
        amountCollected: formatMoney(data?.summary?.amountCollected),
        avgTicketPrice: formatMoney(data?.summary?.avgTicketPrice),
      });
    } catch (err) {
      setNotice(err.message);
    }
  };

  useEffect(() => {
    loadConductor();
    loadOffers();
    loadCurrentTrip();
    loadTodaySummary();
  }, []);

  useEffect(() => {
    if (!isOnDuty) return undefined;
    const interval = setInterval(() => {
      loadOffers();
      loadCurrentTrip();
      loadTodaySummary();
    }, 20000);
    return () => clearInterval(interval);
  }, [isOnDuty, snoozedTripId]);

  const toggleDuty = async () => {
    if (dutyUpdating) return;
    setNotice("");
    setDutyUpdating(true);
    try {
      const auth = await getAuth();
      if (!auth) return;
      const nextStatus = isOnDuty ? "OnLeave" : "Available";
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/duty`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to update duty");

      const updated = {
        ...(conductor || {}),
        status: data.conductor?.status || nextStatus,
        currentLocation: data.conductor?.currentLocation || conductor?.currentLocation || null,
      };
      setConductor(updated);
      await AsyncStorage.setItem(CONDUCTOR_KEY, JSON.stringify(updated));
      setOffers([]);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setDutyUpdating(false);
    }
  };

  const handleOfferAction = async (tripInstanceId, action) => {
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/offers/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ tripInstanceId }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to update offer");
      await Promise.all([loadOffers(), loadCurrentTrip()]);
    } catch (err) {
      setNotice(err.message);
    }
  };

  const fetchFare = async () => {
    if (!activeTrip || !source || !destination) {
      setFare(null);
      return;
    }
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(
        `${auth.apiBase}/api/conductor-trips/fare?tripInstanceId=${activeTrip.tripInstanceId}&source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to get fare");
      setFare(data.fare);
    } catch (err) {
      setNotice(err.message);
      setFare(null);
    }
  };

  useEffect(() => {
    if (!activeTrip || !source || !destination) {
      setFare(null);
      return;
    }
    fetchFare();
  }, [activeTrip?.tripInstanceId, source, destination]);

  const issueTicket = async () => {
    if (!activeTrip || !source || !destination) {
      setNotice("Select source and destination first.");
      return;
    }
    if (!activeTrip?.ticketingEnabled) {
      setNotice("Ticketing will start after driver starts the trip.");
      return;
    }
    const safePassengerCount = Math.max(1, Math.min(5, Number(passengerCount) || 1));
    setIssuing(true);
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({
          tripInstanceId: activeTrip.tripInstanceId,
          source,
          destination,
          paymentMode: "CASH",
          passengerCount: safePassengerCount,
        }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Ticket generation failed");
      setLastTicket(data.ticket || data.printable || null);
      setFare(null);
      setTicketModalOpen(true);
      setNotice("Ticket generated.");
      await loadTodaySummary();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setIssuing(false);
    }
  };

  const handlePrint = () => {
    const run = async () => {
      if (!lastTicket) {
        setNotice("Generate a ticket first.");
        return;
      }
      const manager = getBluetoothManager();
      if (!manager) {
        setNotice("Bluetooth printer module unavailable. Use native Android dev build.");
        return;
      }
      setPrinting(true);
      try {
        const printerJson = await AsyncStorage.getItem(PRINTER_KEY);
        const printer = printerJson ? JSON.parse(printerJson) : null;
        if (!printer?.address) {
          setNotice("No printer selected. Go to Profile and connect a Bluetooth printer.");
          return;
        }
        if (Platform.OS === "android") {
          const required = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ];
          const granted = await PermissionsAndroid.requestMultiple(required);
          const ok = required.every((permission) => granted[permission] === PermissionsAndroid.RESULTS.GRANTED);
          if (!ok) {
            setNotice("Bluetooth connect permission is required to print.");
            return;
          }
        }

        let connected = false;
        if (typeof manager.isDeviceConnected === "function") {
          connected = await manager.isDeviceConnected(printer.address);
        }
        if (!connected) {
          await manager.connectToDevice(printer.address);
        }

        const payload = buildTicketPrintPayload({
          trip: activeTrip,
          ticket: lastTicket,
          src: source,
          dst: destination,
          fareValue: fare,
        });
        await manager.writeToDevice(printer.address, payload, "ascii");
        setNotice(`Printed on ${printer.name || printer.address}.`);
      } catch (error) {
        setNotice(error?.message || "Failed to print ticket.");
      } finally {
        setPrinting(false);
      }
    };
    run();
  };

  const handleConductorEndTrip = async () => {
    if (!activeTrip?.tripInstanceId) return;
    setEndingTrip(true);
    try {
      const auth = await getAuth();
      if (!auth) return;
      const response = await fetch(`${auth.apiBase}/api/conductor-trips/complete-trip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ tripInstanceId: activeTrip.tripInstanceId }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to end conductor trip");
      setEndTripModalOpen(false);
      setSnoozedTripId("");
      setNotice("Trip closed successfully.");
      await Promise.all([loadCurrentTrip(), loadOffers(), loadTodaySummary()]);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setEndingTrip(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadConductor(), loadOffers(), loadCurrentTrip(), loadTodaySummary()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{t("active", "console")}</Text>
          <Text style={styles.subtitle}>
            {isOnDuty ? t("active", "onDutyEnabled") : t("active", "offDutyDisabled")}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.dutyToggle, isOnDuty ? styles.dutyOn : styles.dutyOff]}
            onPress={toggleDuty}
            disabled={dutyUpdating}
          >
            <Text style={styles.dutyText}>{isOnDuty ? t("active", "onDuty") : t("active", "offDuty")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.todayBanner}>
          <View style={styles.bannerItem}>
            <Text style={styles.bannerIcon}>🎫</Text>
            <Text style={styles.bannerLabel}>{t("active", "tickets")}</Text>
            <Text style={[styles.bannerValue, styles.bannerValueTickets]}>{todaySummary.ticketsBooked}</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerItem}>
            <Text style={styles.bannerIcon}>💰</Text>
            <Text style={styles.bannerLabel}>{t("active", "collected")}</Text>
            <Text style={[styles.bannerValue, styles.bannerValueCollected]}>Rs {todaySummary.amountCollected}</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerItem}>
            <Text style={styles.bannerIcon}>📊</Text>
            <Text style={styles.bannerLabel}>{t("active", "avgPrice")}</Text>
            <Text style={[styles.bannerValue, styles.bannerValueAvg]}>Rs {todaySummary.avgTicketPrice}</Text>
          </View>
        </View>

        {offersLoading ? <Text style={styles.helper}>{t("active", "loadingOffers")}</Text> : null}
        {offers.map((offer, offerIndex) => (
          <View style={styles.card} key={`offer-${offer.tripInstanceId || offer.route?.routeCode || "na"}-${offerIndex}`}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{offer.route?.routeCode || "Route"}</Text>
                <Text style={styles.cardRow}>{offer.route?.routeName || ""}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{t("active", "offer")}</Text>
              </View>
            </View>
            <Text style={styles.cardRow}>{t("active", "bus")}: {offer.bus?.busNumber || "--"}</Text>
            <Text style={styles.cardRow}>{t("active", "time")}: {offer.startTime || "--"} - {offer.endTime || "--"}</Text>
            <Text style={styles.cardRow}>{t("active", "pickup")}: {offer.pickupLocation || "--"}</Text>
            <Text style={styles.cardRow}>{t("active", "drop")}: {offer.dropLocation || "--"}</Text>
            <View style={styles.offerActions}>
              <TouchableOpacity style={[styles.primary, { flex: 1 }]} onPress={() => handleOfferAction(offer.tripInstanceId, "accept")}>
                <Text style={styles.primaryText}>{t("active", "accept")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => handleOfferAction(offer.tripInstanceId, "reject")}>
                <Text style={styles.secondaryText}>{t("active", "reject")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.card}>
          <View style={styles.bookingHeader}>
            <View>
              <Text style={styles.sectionTitle}>{t("active", "ticketBooking")}</Text>
              <Text style={styles.bookingSubtitle}>{t("active", "issueSynced")}</Text>
            </View>
            <View style={styles.bookingPill}>
              <Text style={styles.bookingPillText}>{t("active", "live")}</Text>
            </View>
          </View>
          {!activeTrip ? (
            <Text style={styles.helper}>{t("active", "acceptTripStart")}</Text>
          ) : (
            <>
              <View style={styles.tripBanner}>
                <Text style={styles.tripBannerRoute}>
                  {activeTrip.route?.routeCode || "--"} | {activeTrip.route?.routeName || ""}
                </Text>
                <Text style={styles.tripBannerMeta}>Bus {activeTrip.bus?.busNumber || "--"}</Text>
              </View>
              <Text style={styles.cardRowStrong}>{t("active", "stops")}</Text>
              <View style={styles.stopListWrap}>
                {stops.map((stop, stopIndex) => (
                  <View key={`stop-${stop || "na"}-${stopIndex}`} style={styles.stopChip}>
                    <Text style={styles.stopChipText}>{stop}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t("active", "source")}</Text>
              <View style={styles.selectionWrap}>
                {stops.map((stop, stopIndex) => (
                  <TouchableOpacity
                    key={`src-${stop || "na"}-${stopIndex}`}
                    style={[styles.choice, source === stop ? styles.choiceActive : null]}
                    onPress={() => setSource(stop)}
                  >
                    <Text style={[styles.choiceText, source === stop ? styles.choiceTextActive : null]}>{stop}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t("active", "destination")}</Text>
              <View style={styles.selectionWrap}>
                {stops.map((stop, stopIndex) => (
                  <TouchableOpacity
                    key={`dst-${stop || "na"}-${stopIndex}`}
                    style={[styles.choice, destination === stop ? styles.choiceActive : null]}
                    onPress={() => setDestination(stop)}
                  >
                    <Text style={[styles.choiceText, destination === stop ? styles.choiceTextActive : null]}>{stop}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t("active", "passengersMax")}</Text>
              <View style={styles.selectionWrap}>
                {[1, 2, 3, 4, 5].map((count) => (
                  <TouchableOpacity
                    key={`pax-${count}`}
                    style={[styles.choice, passengerCount === count ? styles.choiceActive : null]}
                    onPress={() => setPassengerCount(count)}
                  >
                    <Text style={[styles.choiceText, passengerCount === count ? styles.choiceTextActive : null]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.farePanel}>
                <Text style={styles.farePanelLabel}>{t("active", "autoFare")}</Text>
                <Text style={styles.fareText}>{fare == null ? "--" : `Rs ${fare}`}</Text>
                <Text style={styles.fareMeta}>
                  {t("active", "total", { count: passengerCount })}: {fare == null ? "--" : `Rs ${formatMoney(Number(fare) * passengerCount)}`}
                </Text>
              </View>

              {!activeTrip?.ticketingEnabled ? (
                <Text style={styles.helper}>{t("active", "waitingDriver")}</Text>
              ) : null}

              {activeTrip?.driverEnded ? (
                <View style={styles.ticketBox}>
                  <Text style={styles.ticketTitle}>{t("active", "driverEndedTitle")}</Text>
                  <Text style={styles.ticketRow}>{t("active", "driverEndedText")}</Text>
                  <TouchableOpacity style={styles.secondary} onPress={() => setEndTripModalOpen(true)}>
                    <Text style={styles.secondaryText}>{t("active", "endConductorTrip")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.issueButton}
                onPress={issueTicket}
                disabled={issuing || !activeTrip?.ticketingEnabled}
              >
                <Text style={styles.primaryText}>{issuing ? t("active", "generating") : t("active", "generateTicket")}</Text>
              </TouchableOpacity>

              {lastTicket ? (
                <View style={styles.ticketBox}>
                  <Text style={styles.ticketTitle}>{t("active", "ticketGenerated")}</Text>
                  <Text style={styles.ticketRow}>ID: {lastTicket.bookingId || "--"}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <Modal transparent visible={ticketModalOpen} animationType="fade" onRequestClose={() => setTicketModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.ticketModalCard}>
            <View style={styles.ticketHead}>
              <Text style={styles.ticketBrand}>WBTC BUS TICKET</Text>
              <Text style={styles.ticketSubBrand}>{t("active", "passengerCopy")}</Text>
            </View>

            <View style={styles.ticketSeparator} />

            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "routeNo")}</Text>
              <Text style={styles.ticketLineValue}>{activeTrip?.route?.routeCode || "--"}</Text>
            </View>
            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "ticketId")}</Text>
              <Text style={styles.ticketLineValue}>{lastTicket?.bookingId || "--"}</Text>
            </View>
            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "bookingTime")}</Text>
              <Text style={styles.ticketLineValue}>{formatDateTime(lastTicket?.bookedAt)}</Text>
            </View>
            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "source")}</Text>
              <Text style={styles.ticketLineValue}>{lastTicket?.source || source || "--"}</Text>
            </View>
            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "destination")}</Text>
              <Text style={styles.ticketLineValue}>{lastTicket?.destination || destination || "--"}</Text>
            </View>
            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "passengers")}</Text>
              <Text style={styles.ticketLineValue}>{lastTicket?.passengerCount || passengerCount || 1}</Text>
            </View>

            <View style={styles.ticketSeparator} />

            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKeyBold}>{t("active", "fare")}</Text>
              <Text style={styles.ticketLineValueBold}>Rs {lastTicket?.fare ?? fare ?? "--"}</Text>
            </View>

            <View style={styles.ticketSeparator} />

            <Text style={styles.ticketTermsTitle}>{t("active", "terms")}</Text>
            <Text style={styles.ticketTermsText}>{t("active", "term1")}</Text>
            <Text style={styles.ticketTermsText}>{t("active", "term2")}</Text>
            <Text style={styles.ticketTermsText}>{t("active", "term3")}</Text>
            <Text style={styles.ticketFooter}>{t("active", "thanks")}</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondary} onPress={() => setTicketModalOpen(false)}>
                <Text style={styles.secondaryText}>{t("common", "close")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.printBtn} onPress={handlePrint} disabled={printing}>
                <Text style={styles.printBtnText}>{printing ? t("common", "printing") : t("common", "print")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={endTripModalOpen} animationType="fade" onRequestClose={() => setEndTripModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("active", "endTripPrompt")}</Text>
            <Text style={styles.modalSubtitle}>
              {t("active", "endTripSubtitle")}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondary}
                onPress={() => {
                  setSnoozedTripId(activeTrip?.tripInstanceId || "");
                  setEndTripModalOpen(false);
                }}
              >
                <Text style={styles.secondaryText}>{t("active", "snooze")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primary} onPress={handleConductorEndTrip} disabled={endingTrip}>
                <Text style={styles.primaryText}>{endingTrip ? t("active", "ending") : t("active", "endTrip")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#081634",
    padding: 20,
  },
  header: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 10,
  },
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(226,232,240,0.55)",
  },
  title: {
    marginTop: 4,
    fontSize: 30,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(226,232,240,0.72)",
    maxWidth: 240,
  },
  dutyToggle: {
    minWidth: 108,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
  },
  dutyOn: {
    backgroundColor: "rgba(0,200,122,0.14)",
    borderColor: "rgba(0,200,122,0.45)",
  },
  dutyOff: {
    backgroundColor: "rgba(148,163,184,0.14)",
    borderColor: "rgba(148,163,184,0.35)",
  },
  dutyText: {
    fontWeight: "700",
    color: "#E2E8F0",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  notice: {
    marginTop: 12,
    color: "#FCA5A5",
  },
  list: {
    paddingBottom: 24,
  },
  todayBanner: {
    marginTop: 12,
    backgroundColor: "#132848",
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  bannerItem: {
    flex: 1,
    alignItems: "center",
  },
  bannerIcon: {
    fontSize: 18,
  },
  bannerLabel: {
    marginTop: 8,
    color: "rgba(148,163,184,0.92)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    textAlign: "center",
  },
  bannerValue: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  bannerValueTickets: {
    color: "#00A4FF",
  },
  bannerValueCollected: {
    color: "#00D38F",
  },
  bannerValueAvg: {
    color: "#B48BFF",
  },
  bannerDivider: {
    width: 1,
    height: 104,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 10,
  },
  helper: {
    marginTop: 12,
    color: "rgba(148,163,184,0.95)",
  },
  card: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  cardRow: {
    marginTop: 6,
    color: "rgba(226,232,240,0.75)",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookingSubtitle: {
    marginTop: 4,
    color: "rgba(226,232,240,0.5)",
    fontSize: 12,
  },
  bookingPill: {
    backgroundColor: "rgba(0,200,122,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bookingPillText: {
    color: "#00C87A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  tripBanner: {
    marginTop: 12,
    backgroundColor: "rgba(0,144,224,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,144,224,0.35)",
    borderRadius: 14,
    padding: 12,
  },
  tripBannerRoute: {
    color: "#F8FAFC",
    fontWeight: "800",
    fontSize: 14,
  },
  tripBannerMeta: {
    marginTop: 4,
    color: "#7DD3FC",
    fontWeight: "600",
  },
  cardRowStrong: {
    marginTop: 10,
    color: "rgba(148,163,184,0.95)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  pill: {
    backgroundColor: "rgba(0,200,122,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.3)",
  },
  pillText: {
    color: "#00C87A",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  offerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  primary: {
    marginTop: 12,
    backgroundColor: "#0D8FD6",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  secondary: {
    marginTop: 12,
    backgroundColor: "rgba(148,163,184,0.2)",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  secondaryText: {
    color: "#E2E8F0",
    fontWeight: "700",
  },
  stopListWrap: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stopChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stopChipText: {
    color: "#BFDBFE",
    fontWeight: "600",
    fontSize: 12,
  },
  fieldLabel: {
    marginTop: 12,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "rgba(148,163,184,0.95)",
  },
  selectionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  choice: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  choiceActive: {
    borderColor: "rgba(0,144,224,0.4)",
    backgroundColor: "rgba(0,144,224,0.2)",
  },
  choiceText: {
    color: "rgba(226,232,240,0.85)",
    fontSize: 12,
  },
  choiceTextActive: {
    color: "#BAE6FD",
    fontWeight: "700",
  },
  fareText: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  farePanel: {
    marginTop: 14,
    backgroundColor: "rgba(0,200,122,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.26)",
    borderRadius: 14,
    padding: 12,
  },
  farePanelLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#6EE7B7",
    fontWeight: "700",
  },
  fareMeta: {
    marginTop: 4,
    color: "#E2E8F0",
    fontWeight: "600",
    fontSize: 12,
  },
  issueButton: {
    marginTop: 12,
    backgroundColor: "#0D8FD6",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  ticketBox: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 12,
  },
  ticketTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  ticketRow: {
    marginTop: 5,
    color: "rgba(226,232,240,0.75)",
  },
  ticketPopup: {
    marginTop: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 12,
  },
  ticketPopupRow: {
    marginTop: 4,
    color: "#0F172A",
    fontWeight: "600",
  },
  ticketTermsTitle: {
    marginTop: 12,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748B",
    fontWeight: "700",
  },
  ticketTermsText: {
    marginTop: 4,
    color: "#334155",
    fontSize: 12,
  },
  ticketModalCard: {
    width: "92%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: "#0F172A",
  },
  ticketHead: {
    alignItems: "center",
  },
  ticketBrand: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  ticketSubBrand: {
    marginTop: 2,
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
  },
  ticketSeparator: {
    marginTop: 10,
    marginBottom: 6,
    borderTopWidth: 1,
    borderTopColor: "#111827",
    borderStyle: "dashed",
  },
  ticketLine: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  ticketLineKey: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  ticketLineValue: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "700",
    flex: 1.2,
    textAlign: "right",
  },
  ticketLineKeyBold: {
    color: "#000000",
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
  },
  ticketLineValueBold: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "800",
    flex: 1.2,
    textAlign: "right",
  },
  ticketFooter: {
    marginTop: 10,
    color: "#111827",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "600",
  },
  printBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 140,
  },
  printBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#10274A",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  modalSubtitle: {
    marginTop: 6,
    color: "rgba(226,232,240,0.7)",
  },
  locationOption: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  locationSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  locationText: {
    color: "#E2E8F0",
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
});




