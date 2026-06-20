import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, Platform, PermissionsAndroid, NativeModules, Animated, PanResponder } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import QRCode from "react-native-qrcode-svg";
import { useConductorLanguage } from "../../contexts/conductor-language";
import useOfferAlert from "../../hooks/use-offer-alert";
import { getOpsDate } from "../../utils/opsTime";

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

const today = () => getOpsDate();
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
    `Route no: ${sanitizePrint(trip?.route?.routeCode)}`,
    `Bus no: ${sanitizePrint(trip?.bus?.busNumber)}`,
    "------------------------------",
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
    "Thank you for traveling with us",
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
  const [stopsExpanded, setStopsExpanded] = useState(false);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [fare, setFare] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [lastTicket, setLastTicket] = useState(null);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [busQrOpen, setBusQrOpen] = useState(false);
  const [endTripModalOpen, setEndTripModalOpen] = useState(false);
  const [endingTrip, setEndingTrip] = useState(false);
  const [snoozedTripId, setSnoozedTripId] = useState("");
  const [printing, setPrinting] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [locationCoords, setLocationCoords] = useState(null); // { lat, lng } — set instantly
  const [locationName, setLocationName] = useState("");
  const [todaySummary, setTodaySummary] = useState({
    ticketsBooked: 0,
    amountCollected: "0.00",
    avgTicketPrice: "0.00",
  });

  const [waitingExpanded, setWaitingExpanded] = useState(true);
  const floatOffset = useRef({ x: 16, y: 200 });
  const floatPan = useRef(new Animated.ValueXY({ x: 16, y: 200 })).current;
  const floatPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        floatPan.setOffset(floatOffset.current);
        floatPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: floatPan.x, dy: floatPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        const didMove = Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6;
        floatOffset.current = {
          x: floatOffset.current.x + gesture.dx,
          y: floatOffset.current.y + gesture.dy,
        };
        floatPan.flattenOffset();
        if (!didMove) setWaitingExpanded((prev) => !prev);
      },
    })
  ).current;

  const isOnDuty = (conductor?.status || "Available") === "Available";
  const sourceIndex = stops.findIndex((stop) => stop === source);
  const destinationIndex = stops.findIndex((stop) => stop === destination);
  const totalWaiting = (activeTrip?.waitingSummary?.stops || []).reduce(
    (sum, item) => sum + (item.passengersWaiting || 0), 0
  );
  const hasValidDirection =
    sourceIndex >= 0 &&
    destinationIndex >= 0 &&
    destinationIndex > sourceIndex;
  const liveBusQrValue = activeTrip?.bus?.busNumber
    ? JSON.stringify({
        busNumber: String(activeTrip.bus.busNumber).trim(),
        depotId: activeTrip.bus?.depotId?._id || activeTrip.bus?.depotId || activeTrip?.depotId || null,
        busType: activeTrip.bus?.busType || null,
        fuelType: activeTrip.bus?.fuelType || null,
      })
    : "";

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
    const auth = await getAuth();
    const conductorJson = await AsyncStorage.getItem(CONDUCTOR_KEY);
    const storedConductor = conductorJson ? JSON.parse(conductorJson) : null;
    if (storedConductor) setConductor(storedConductor);
    if (!auth) return;

    try {
      const response = await fetch(`${auth.apiBase}/api/conductor-auth/me`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load conductor profile");

      const merged = {
        ...(storedConductor || {}),
        ...(data.conductor || {}),
      };
      setConductor(merged);
      await AsyncStorage.setItem(CONDUCTOR_KEY, JSON.stringify(merged));
    } catch (err) {
      if (!storedConductor) {
        setNotice(err.message);
      }
    }
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
        setStopsExpanded(false);
        setBusQrOpen(false);
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

  // ── GPS permission ──────────────────────────────────────────────────────────
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationGranted(status === "granted");
    });
  }, []);

  // ── Live GPS tracking while conductor has an active trip ────────────────────
  // Strategy:
  //   1. getLastKnownPositionAsync  — returns instantly (cached fix, no GPS warmup)
  //   2. watchPositionAsync         — event-driven; OS delivers updates automatically
  //
  // We post to the backend at most once every 30 s regardless of how often the
  // watch fires. The backend reverse-geocodes lat/lng → place name via Nominatim.
  useEffect(() => {
    const tripId = activeTrip?.tripInstanceId;
    const isRunning =
      activeTrip?.driverTripStatus === "Active" ||
      activeTrip?.status === "Active";

    if (!tripId || !isRunning || !locationGranted) return;

    // Clear stale location from a previous trip
    setLocationName("");
    setLocationCoords(null);

    let watchSub = null;
    let lastSentMs = 0;
    const THROTTLE_MS = 15000; // 15 s — faster updates while app is in foreground

    // Reverse-geocode lat/lng → place name directly on the device via Nominatim.
    // Running on-device is more reliable than waiting for the backend to proxy it.
    const reverseGeocodeOnDevice = async (lat, lng) => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
        const res = await fetch(url, {
          headers: { "User-Agent": "WBTCConductorApp/1.0 (contact@wbtc.in)" },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const a = data.address || {};
        const place = a.road || a.suburb || a.neighbourhood || a.quarter || a.village || a.town || a.city || "";
        const city = a.city || a.town || a.city_district || a.state_district || "";
        if (!place && !city) return null;
        return place && city ? `${place}, ${city}` : place || city;
      } catch {
        return null;
      }
    };

    const postCoords = async (coords) => {
      const now = Date.now();
      if (now - lastSentMs < THROTTLE_MS) return;
      lastSentMs = now;
      setLocationCoords({ lat: coords.latitude, lng: coords.longitude });

      // Reverse-geocode on-device (fast, no backend hop needed for the name)
      const name = await reverseGeocodeOnDevice(coords.latitude, coords.longitude);
      if (name) setLocationName(name);

      // Post coords to backend so passengers can see ETA
      try {
        const auth = await getAuth();
        if (!auth) { console.warn("[GPS] getAuth() returned null — skipping location post"); return; }
        const response = await fetch(`${auth.apiBase}/api/conductor-trips/location`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            tripInstanceId: tripId,
            latitude: coords.latitude,
            longitude: coords.longitude,
          }),
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (data?.locationName && !name) {
          setLocationName(data.locationName);
        }
      } catch {
        // Non-fatal — location failure must not affect ticket issuing
      }
    };

    const start = async () => {
      // Step 1: send last known position immediately (no GPS warm-up delay)
      try {
        const last = await Location.getLastKnownPositionAsync({
          maxAge: 10 * 60 * 1000,  // accept a fix up to 10 min old
          requiredAccuracy: 1000,  // any rough fix is fine for display
        });
        if (last) {
          lastSentMs = 0; // force send on first reading
          await postCoords(last.coords);
        }
      } catch {
        // device may have no cached fix yet — the watch below will cover it
      }

      // Step 2: watch for position changes
      try {
        watchSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: THROTTLE_MS,
            distanceInterval: 30, // also update if bus moved 30 m
          },
          (location) => {
            void postCoords(location.coords);
          }
        );
      } catch {
        // watchPositionAsync can throw on simulators without location support
      }

      // Step 3: Backup interval — Android can silently stop watchPositionAsync.
      // Every 30 s we force-read the last known position and post it.
      backupInterval = setInterval(async () => {
        try {
          const pos = await Location.getLastKnownPositionAsync({ maxAge: 60 * 1000 });
          if (pos) await postCoords(pos.coords);
        } catch {
          // non-fatal
        }
      }, 30000);
    };

    let backupInterval = null;
    void start();
    return () => {
      if (watchSub) watchSub.remove();
      if (backupInterval) clearInterval(backupInterval);
    };
  }, [
    activeTrip?.tripInstanceId,
    activeTrip?.driverTripStatus,
    activeTrip?.status,
    locationGranted,
  ]);

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
    if (!hasValidDirection) {
      setFare(null);
      return;
    }
    fetchFare();
  }, [activeTrip?.tripInstanceId, source, destination, hasValidDirection]);

  useEffect(() => {
    if (!destination) return;
    if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex > sourceIndex) return;
    setDestination("");
    setFare(null);
  }, [sourceIndex, destinationIndex, destination]);

  const issueTicket = async () => {
    if (!activeTrip || !source || !destination) {
      setNotice("Select source and destination first.");
      return;
    }
    if (!hasValidDirection) {
      setNotice("Destination must be after the selected source stop.");
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
          <View
            style={styles.offerCard}
            key={`offer-${offer.tripInstanceId || offer.route?.routeCode || "na"}-${offerIndex}`}
          >
            {/* Header: route code badge + offer pill */}
            <View style={styles.offerCardHeader}>
              <View style={styles.offerRouteTag}>
                <Text style={styles.offerRouteCode}>{offer.route?.routeCode || "Route"}</Text>
              </View>
              <View style={styles.offerLiveBadge}>
                <View style={styles.offerLiveDot} />
                <Text style={styles.offerLiveText}>{t("active", "offer")}</Text>
              </View>
            </View>

            {/* Route name */}
            <Text style={styles.offerRouteName}>{offer.route?.routeName || ""}</Text>

            {/* Info strip: bus + time */}
            <View style={styles.offerInfoStrip}>
              <View style={styles.offerInfoCell}>
                <Text style={styles.offerInfoCellIcon}>🚌</Text>
                <View>
                  <Text style={styles.offerInfoCellLabel}>{t("active", "bus")}</Text>
                  <Text style={styles.offerInfoCellValue}>{offer.bus?.busNumber || "--"}</Text>
                </View>
              </View>
              <View style={styles.offerInfoSep} />
              <View style={styles.offerInfoCell}>
                <Text style={styles.offerInfoCellIcon}>⏱</Text>
                <View>
                  <Text style={styles.offerInfoCellLabel}>{t("active", "time")}</Text>
                  <Text style={styles.offerInfoCellValue}>{offer.startTime || "--"} – {offer.endTime || "--"}</Text>
                </View>
              </View>
            </View>

            {/* Journey: pickup → drop */}
            <View style={styles.offerJourney}>
              <View style={styles.offerJourneyRow}>
                <View style={styles.offerJourneyDotGreen} />
                <View style={styles.offerJourneyTextBlock}>
                  <Text style={styles.offerJourneyLabel}>{t("active", "pickup")}</Text>
                  <Text style={styles.offerJourneyPlace}>{offer.pickupLocation || "--"}</Text>
                </View>
              </View>
              <View style={styles.offerJourneyConnector} />
              <View style={styles.offerJourneyRow}>
                <View style={styles.offerJourneyDotRed} />
                <View style={styles.offerJourneyTextBlock}>
                  <Text style={styles.offerJourneyLabel}>{t("active", "drop")}</Text>
                  <Text style={styles.offerJourneyPlace}>{offer.dropLocation || "--"}</Text>
                </View>
              </View>
            </View>

            {/* Action buttons */}
            <View style={styles.offerActionsRow}>
              <TouchableOpacity
                style={styles.offerAcceptBtn}
                onPress={() => handleOfferAction(offer.tripInstanceId, "accept")}
                activeOpacity={0.82}
              >
                <Text style={styles.offerAcceptText}>{t("active", "accept")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.offerRejectBtn}
                onPress={() => handleOfferAction(offer.tripInstanceId, "reject")}
                activeOpacity={0.82}
              >
                <Text style={styles.offerRejectText}>{t("active", "reject")}</Text>
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
                {locationName ? (
                  <Text style={styles.tripBannerLocation}>📍 {locationName}</Text>
                ) : locationGranted && (activeTrip?.driverTripStatus === "Active" || activeTrip?.status === "Active") ? (
                  <Text style={styles.tripBannerLocationPending}>📡 Acquiring GPS…</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.qrLaunchBtn}
                onPress={() => setBusQrOpen(true)}
                disabled={!liveBusQrValue}
              >
                <Text style={styles.qrLaunchBtnText}>Show bus QR for passengers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopsToggle}
                onPress={() => setStopsExpanded((current) => !current)}
                activeOpacity={0.85}
              >
                <Text style={styles.cardRowStrong}>{t("active", "stops")}</Text>
                <Text style={styles.stopsToggleText}>
                  {stopsExpanded ? "Hide route stops" : `Show route stops (${stops.length})`}
                </Text>
              </TouchableOpacity>
              {stopsExpanded ? (
                <View style={styles.stopListWrap}>
                  {stops.map((stop, stopIndex) => (
                    <View key={`stop-${stop || "na"}-${stopIndex}`} style={styles.stopChip}>
                      <Text style={styles.stopChipText}>{stop}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* ── Step 1: FROM ── */}
              <View style={styles.tkStep}>
                <View style={styles.tkStepHeader}>
                  <View style={styles.tkStepNumBadge}>
                    <Text style={styles.tkStepNumText}>1</Text>
                  </View>
                  <Text style={styles.tkStepLabel}>{t("active", "source")}</Text>
                  {source ? (
                    <View style={styles.tkStepSelectedFrom}>
                      <Text style={styles.tkStepSelectedText} numberOfLines={1}>{source}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.tkStopGrid}>
                  {stops.map((stop, stopIndex) => (
                    <TouchableOpacity
                      key={`src-${stop || "na"}-${stopIndex}`}
                      style={[styles.tkStopChip, source === stop && styles.tkStopChipFrom]}
                      onPress={() => { setSource(stop); setNotice(""); }}
                    >
                      <Text style={[styles.tkStopChipText, source === stop && styles.tkStopChipTextFrom]}>
                        {stop}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Journey summary bar */}
              {(source || destination) ? (
                <View style={styles.tkJourneySummary}>
                  <View style={styles.tkJourneyDotGreen} />
                  <Text style={styles.tkJourneyFrom} numberOfLines={1}>{source || "—"}</Text>
                  <Text style={styles.tkJourneyArrow}>⟶</Text>
                  <Text style={styles.tkJourneyTo} numberOfLines={1}>{destination || "—"}</Text>
                  <View style={styles.tkJourneyDotRed} />
                </View>
              ) : null}

              {/* ── Step 2: TO ── */}
              <View style={styles.tkStep}>
                <View style={styles.tkStepHeader}>
                  <View style={[styles.tkStepNumBadge, styles.tkStepNumBadgeTo]}>
                    <Text style={styles.tkStepNumText}>2</Text>
                  </View>
                  <Text style={styles.tkStepLabel}>{t("active", "destination")}</Text>
                  {destination ? (
                    <View style={styles.tkStepSelectedTo}>
                      <Text style={styles.tkStepSelectedText} numberOfLines={1}>{destination}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.tkStopGrid}>
                  {stops.map((stop, stopIndex) => {
                    const disabled = sourceIndex >= 0 && stopIndex <= sourceIndex;
                    return (
                      <TouchableOpacity
                        key={`dst-${stop || "na"}-${stopIndex}`}
                        style={[
                          styles.tkStopChip,
                          destination === stop && styles.tkStopChipTo,
                          disabled && styles.tkStopChipDisabled,
                        ]}
                        onPress={() => {
                          if (disabled) return;
                          setDestination(stop);
                          setNotice("");
                        }}
                        disabled={disabled}
                      >
                        <Text style={[
                          styles.tkStopChipText,
                          destination === stop && styles.tkStopChipTextTo,
                          disabled && styles.tkStopChipTextDisabled,
                        ]}>
                          {stop}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Step 3: PASSENGERS ── */}
              <View style={styles.tkStep}>
                <View style={styles.tkStepHeader}>
                  <View style={[styles.tkStepNumBadge, styles.tkStepNumBadgePax]}>
                    <Text style={styles.tkStepNumText}>3</Text>
                  </View>
                  <Text style={styles.tkStepLabel}>{t("active", "passengersMax")}</Text>
                </View>
                <View style={styles.tkPaxRow}>
                  {[1, 2, 3, 4, 5].map((count) => (
                    <TouchableOpacity
                      key={`pax-${count}`}
                      style={[styles.tkPaxBtn, passengerCount === count && styles.tkPaxBtnActive]}
                      onPress={() => setPassengerCount(count)}
                    >
                      <Text style={[styles.tkPaxBtnText, passengerCount === count && styles.tkPaxBtnTextActive]}>
                        {count}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Fare summary card */}
              <View style={styles.tkFareCard}>
                <Text style={styles.tkFareCardLabel}>{t("active", "autoFare")}</Text>
                <View style={styles.tkFareRow}>
                  <View style={styles.tkFareItem}>
                    <Text style={styles.tkFareSubLabel}>প্রতি যাত্রী</Text>
                    <Text style={styles.tkFareValue}>{fare == null ? "--" : `Rs ${fare}`}</Text>
                  </View>
                  <Text style={styles.tkFareMult}>× {passengerCount}</Text>
                  <View style={[styles.tkFareItem, { alignItems: "flex-end" }]}>
                    <Text style={styles.tkFareSubLabel}>{t("active", "total", { count: passengerCount })}</Text>
                    <Text style={styles.tkFareTotalValue}>
                      {fare == null ? "--" : `Rs ${formatMoney(Number(fare) * passengerCount)}`}
                    </Text>
                  </View>
                </View>
              </View>

              {!activeTrip?.ticketingEnabled ? (
                <View style={styles.tkNoticeBox}>
                  <Text style={styles.tkNoticeText}>⏳ {t("active", "waitingDriver")}</Text>
                </View>
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

              {/* Generate ticket button */}
              <TouchableOpacity
                style={[
                  styles.tkIssueBtn,
                  (issuing || !activeTrip?.ticketingEnabled) && styles.tkIssueBtnDisabled,
                ]}
                onPress={issueTicket}
                disabled={issuing || !activeTrip?.ticketingEnabled}
                activeOpacity={0.84}
              >
                <Text style={styles.tkIssueBtnText}>
                  {issuing ? t("active", "generating") : t("active", "generateTicket")}
                </Text>
              </TouchableOpacity>

              {lastTicket ? (
                <View style={styles.tkLastTicket}>
                  <Text style={styles.tkLastTicketTitle}>{t("active", "ticketGenerated")} ✓</Text>
                  <Text style={styles.tkLastTicketId}>ID: {lastTicket.bookingId || "--"}</Text>
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
              <Text style={styles.ticketBrand}>Route no: {activeTrip?.route?.routeCode || "--"}</Text>
              <Text style={styles.ticketSubBrand}>Bus no: {activeTrip?.bus?.busNumber || "--"}</Text>
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
              <TouchableOpacity style={styles.ticketCloseBtn} onPress={() => setTicketModalOpen(false)}>
                <Text style={styles.ticketCloseBtnText}>{t("common", "close")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.printBtn} onPress={handlePrint} disabled={printing}>
                <Text style={styles.printBtnText}>{printing ? t("common", "printing") : t("common", "print")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={busQrOpen} animationType="fade" onRequestClose={() => setBusQrOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.busQrModalCard}>
            <View style={styles.ticketHead}>
              <Text style={styles.ticketBrand}>Scan to book in qfare</Text>
              <Text style={styles.ticketSubBrand}>Bus no: {activeTrip?.bus?.busNumber || "--"}</Text>
            </View>

            <View style={styles.ticketSeparator} />

            <View style={styles.busQrShell}>
              {liveBusQrValue ? (
                <QRCode value={liveBusQrValue} size={220} backgroundColor="#FFFFFF" color="#111827" />
              ) : (
                <Text style={styles.busQrFallback}>QR payload unavailable for this bus.</Text>
              )}
            </View>

            <Text style={styles.busQrHelp}>
              Ask passengers to scan this QR in the qfare app to load the live bus and continue ticket booking online.
            </Text>

            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "routeNo")}</Text>
              <Text style={styles.ticketLineValue}>{activeTrip?.route?.routeCode || "--"}</Text>
            </View>
            <View style={styles.ticketLine}>
              <Text style={styles.ticketLineKey}>{t("active", "bus")}</Text>
              <Text style={styles.ticketLineValue}>{activeTrip?.bus?.busNumber || "--"}</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.ticketCloseBtn} onPress={() => setBusQrOpen(false)}>
                <Text style={styles.ticketCloseBtnText}>{t("common", "close")}</Text>
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

      {/* ── Floating passengers-waiting bubble ── */}
      {activeTrip ? (
        <Animated.View
          style={[styles.floatBubble, { left: floatPan.x, top: floatPan.y }]}
          {...floatPanResponder.panHandlers}
        >
          {/* Header / drag handle */}
          <View style={styles.floatBubbleHeader}>
            <Text style={styles.floatBubbleIcon}>👥</Text>
            <Text style={styles.floatBubbleTitle}>
              {totalWaiting > 0 ? `${totalWaiting} waiting` : "No waiting"}
            </Text>
            {totalWaiting > 0 ? (
              <View style={styles.floatBubbleBadge}>
                <Text style={styles.floatBubbleBadgeText}>{totalWaiting}</Text>
              </View>
            ) : null}
            <Text style={styles.floatBubbleChevron}>{waitingExpanded ? "▲" : "▼"}</Text>
          </View>

          {/* Stop list */}
          {waitingExpanded ? (
            (activeTrip.waitingSummary?.stops || []).length > 0 ? (
              <View style={styles.floatBubbleList}>
                {activeTrip.waitingSummary.stops.map((item) => (
                  <View key={`fw-${item.stopName}-${item.stopIndex}`} style={styles.floatBubbleRow}>
                    <View style={styles.floatBubbleStopDot} />
                    <Text style={styles.floatBubbleStop} numberOfLines={1}>
                      {item.stopName}
                    </Text>
                    <View style={styles.floatBubbleCountBadge}>
                      <Text style={styles.floatBubbleCount}>{item.passengersWaiting}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.floatBubbleEmpty}>None yet</Text>
            )
          ) : null}
        </Animated.View>
      ) : null}
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
  tripBannerLocation: {
    marginTop: 4,
    fontSize: 12,
    color: "#34d399",
    fontWeight: "600",
  },
  tripBannerLocationPending: {
    marginTop: 4,
    fontSize: 12,
    color: "rgba(148,163,184,0.72)",
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
  stopsToggle: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stopsToggleText: {
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: "700",
  },
  waitingListWrap: {
    marginTop: 6,
    gap: 8,
  },
  waitingChip: {
    backgroundColor: "rgba(14,116,144,0.16)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.32)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  waitingChipStop: {
    color: "#E0F2FE",
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
  },
  waitingChipCount: {
    color: "#7DD3FC",
    fontWeight: "800",
    fontSize: 12,
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
  sourceChoiceActive: {
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.18)",
  },
  destinationChoiceActive: {
    borderColor: "rgba(249,115,22,0.45)",
    backgroundColor: "rgba(249,115,22,0.18)",
  },
  choiceDisabled: {
    borderColor: "rgba(148,163,184,0.12)",
    backgroundColor: "rgba(148,163,184,0.06)",
    opacity: 0.45,
  },
  choiceText: {
    color: "rgba(226,232,240,0.85)",
    fontSize: 12,
  },
  sourceChoiceTextActive: {
    color: "#BBF7D0",
    fontWeight: "700",
  },
  destinationChoiceTextActive: {
    color: "#FED7AA",
    fontWeight: "700",
  },
  passengerChoiceActive: {
    borderColor: "rgba(168,85,247,0.48)",
    backgroundColor: "rgba(168,85,247,0.22)",
    transform: [{ scale: 1.04 }],
  },
  passengerChoiceTextActive: {
    color: "#E9D5FF",
    fontWeight: "800",
  },
  choiceTextDisabled: {
    color: "rgba(148,163,184,0.9)",
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
  qrLaunchBtn: {
    marginTop: 12,
    backgroundColor: "#F97316",
    borderWidth: 1,
    borderColor: "#FDBA74",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F97316",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  qrLaunchBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.35,
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
  busQrModalCard: {
    width: "92%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 18,
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
  busQrShell: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  busQrHelp: {
    marginTop: 10,
    marginBottom: 14,
    color: "#334155",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  busQrFallback: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
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
  ticketCloseBtn: {
    backgroundColor: "#E5E7EB",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
    flex: 1,
  },
  ticketCloseBtnText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.4,
  },
  printBtn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
    flex: 1,
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

  // ── Offer card ──────────────────────────────────────────────────────────────
  offerCard: {
    marginTop: 16,
    backgroundColor: "#0D2242",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: "rgba(0,180,240,0.28)",
    borderLeftWidth: 4,
    borderLeftColor: "#00B4F0",
    shadowColor: "#00B4F0",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  offerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  offerRouteTag: {
    backgroundColor: "rgba(0,180,240,0.16)",
    borderWidth: 1,
    borderColor: "rgba(0,180,240,0.36)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  offerRouteCode: {
    color: "#7DD3FC",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  offerLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,200,122,0.13)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.34)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  offerLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#00C87A",
  },
  offerLiveText: {
    color: "#00C87A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  offerRouteName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#CBD5E1",
    marginBottom: 14,
  },
  offerInfoStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  offerInfoCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offerInfoSep: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 10,
  },
  offerInfoCellIcon: {
    fontSize: 18,
  },
  offerInfoCellLabel: {
    fontSize: 9,
    color: "rgba(148,163,184,0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    fontWeight: "700",
  },
  offerInfoCellValue: {
    color: "#F1F5F9",
    fontWeight: "800",
    fontSize: 13,
    marginTop: 2,
  },
  offerJourney: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  offerJourneyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  offerJourneyDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00C87A",
    borderWidth: 2,
    borderColor: "rgba(0,200,122,0.38)",
  },
  offerJourneyDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F87171",
    borderWidth: 2,
    borderColor: "rgba(248,113,113,0.38)",
  },
  offerJourneyConnector: {
    width: 2,
    height: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginLeft: 4,
    marginVertical: 3,
  },
  offerJourneyTextBlock: {
    flex: 1,
  },
  offerJourneyLabel: {
    fontSize: 9,
    color: "rgba(148,163,184,0.72)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    fontWeight: "700",
  },
  offerJourneyPlace: {
    color: "#E2E8F0",
    fontWeight: "700",
    fontSize: 13,
    marginTop: 1,
  },
  offerActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  offerAcceptBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.4)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#059669",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  offerAcceptText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  offerRejectBtn: {
    flex: 1,
    backgroundColor: "rgba(148,163,184,0.1)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  offerRejectText: {
    color: "#94A3B8",
    fontWeight: "700",
    fontSize: 14,
  },

  // ── Ticket booking redesign ──────────────────────────────────────────────────
  tkStep: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tkStepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  tkStepNumBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(34,197,94,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(34,197,94,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  tkStepNumBadgeTo: {
    backgroundColor: "rgba(249,115,22,0.2)",
    borderColor: "rgba(249,115,22,0.5)",
  },
  tkStepNumBadgePax: {
    backgroundColor: "rgba(168,85,247,0.2)",
    borderColor: "rgba(168,85,247,0.5)",
  },
  tkStepNumText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
  },
  tkStepLabel: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flex: 1,
  },
  tkStepSelectedFrom: {
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: 120,
  },
  tkStepSelectedTo: {
    backgroundColor: "rgba(249,115,22,0.18)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.4)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: 120,
  },
  tkStepSelectedText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "700",
  },
  tkStopGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tkStopChip: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tkStopChipFrom: {
    borderColor: "rgba(34,197,94,0.55)",
    backgroundColor: "rgba(34,197,94,0.2)",
  },
  tkStopChipTo: {
    borderColor: "rgba(249,115,22,0.55)",
    backgroundColor: "rgba(249,115,22,0.2)",
  },
  tkStopChipDisabled: {
    borderColor: "rgba(148,163,184,0.1)",
    backgroundColor: "rgba(148,163,184,0.04)",
    opacity: 0.38,
  },
  tkStopChipText: {
    color: "rgba(226,232,240,0.88)",
    fontSize: 13,
    fontWeight: "600",
  },
  tkStopChipTextFrom: {
    color: "#BBF7D0",
    fontWeight: "800",
  },
  tkStopChipTextTo: {
    color: "#FED7AA",
    fontWeight: "800",
  },
  tkStopChipTextDisabled: {
    color: "rgba(148,163,184,0.6)",
  },
  tkJourneySummary: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tkJourneyDotGreen: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#00C87A",
    flexShrink: 0,
  },
  tkJourneyDotRed: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#F87171",
    flexShrink: 0,
  },
  tkJourneyFrom: {
    color: "#BBF7D0",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  tkJourneyArrow: {
    color: "rgba(148,163,184,0.5)",
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 0,
    paddingHorizontal: 2,
  },
  tkJourneyTo: {
    color: "#FED7AA",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  tkPaxRow: {
    flexDirection: "row",
    gap: 8,
  },
  tkPaxBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  tkPaxBtnActive: {
    borderColor: "rgba(168,85,247,0.6)",
    backgroundColor: "rgba(168,85,247,0.24)",
  },
  tkPaxBtnText: {
    color: "rgba(226,232,240,0.85)",
    fontSize: 18,
    fontWeight: "700",
  },
  tkPaxBtnTextActive: {
    color: "#E9D5FF",
    fontWeight: "800",
  },
  tkFareCard: {
    marginTop: 14,
    backgroundColor: "rgba(0,200,122,0.07)",
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.24)",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  tkFareCardLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#6EE7B7",
    fontWeight: "700",
    marginBottom: 10,
  },
  tkFareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tkFareItem: {
    flex: 1,
  },
  tkFareSubLabel: {
    fontSize: 10,
    color: "rgba(148,163,184,0.7)",
    marginBottom: 3,
    fontWeight: "600",
  },
  tkFareValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F1F5F9",
  },
  tkFareMult: {
    fontSize: 20,
    fontWeight: "700",
    color: "rgba(148,163,184,0.45)",
    paddingHorizontal: 10,
  },
  tkFareTotalValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#00C87A",
    textAlign: "right",
  },
  tkNoticeBox: {
    marginTop: 12,
    backgroundColor: "rgba(251,191,36,0.1)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.28)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tkNoticeText: {
    color: "#FCD34D",
    fontSize: 13,
    fontWeight: "600",
  },
  tkIssueBtn: {
    marginTop: 16,
    backgroundColor: "#0D8FD6",
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: "center",
    shadowColor: "#0D8FD6",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  tkIssueBtnDisabled: {
    backgroundColor: "rgba(148,163,184,0.14)",
    shadowOpacity: 0,
    elevation: 0,
  },
  tkIssueBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 17,
    letterSpacing: 0.4,
  },
  tkLastTicket: {
    marginTop: 12,
    backgroundColor: "rgba(0,200,122,0.1)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,200,122,0.28)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tkLastTicketTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#6EE7B7",
  },
  tkLastTicketId: {
    fontSize: 12,
    color: "rgba(148,163,184,0.8)",
    fontWeight: "600",
  },

  // ── Floating passengers-waiting bubble ──────────────────────────────────────
  floatBubble: {
    position: "absolute",
    zIndex: 60,
    minWidth: 155,
    maxWidth: 220,
    backgroundColor: "#0B1F3A",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(56,189,248,0.4)",
    shadowColor: "#38BDF8",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    overflow: "hidden",
  },
  floatBubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  floatBubbleIcon: {
    fontSize: 15,
  },
  floatBubbleTitle: {
    flex: 1,
    color: "#E0F2FE",
    fontWeight: "700",
    fontSize: 12,
  },
  floatBubbleBadge: {
    backgroundColor: "#0369A1",
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  floatBubbleBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  floatBubbleChevron: {
    color: "rgba(148,163,184,0.55)",
    fontSize: 9,
    fontWeight: "700",
    marginLeft: 2,
  },
  floatBubbleList: {
    borderTopWidth: 1,
    borderTopColor: "rgba(56,189,248,0.14)",
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 10,
    gap: 6,
  },
  floatBubbleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  floatBubbleStopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F59E0B",
    flexShrink: 0,
  },
  floatBubbleStop: {
    flex: 1,
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },
  floatBubbleCountBadge: {
    backgroundColor: "rgba(56,189,248,0.18)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.38)",
    borderRadius: 999,
    minWidth: 26,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  floatBubbleCount: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "800",
  },
  floatBubbleEmpty: {
    borderTopWidth: 1,
    borderTopColor: "rgba(56,189,248,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: "rgba(148,163,184,0.6)",
    fontSize: 11,
    fontStyle: "italic",
  },
});




