import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  requestDriverBackgroundPermissions,
  stopDriverBackgroundTracking,
  updateDriverBackgroundNotification,
  writeDriverTrackingDebug,
} from "../lib/driverBackgroundLocation";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const SWIPE_HANDLE_WIDTH = 56;

const parseApiText = (text) => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const parseKm = (value) => {
  const normalizedRaw = String(value ?? "").trim().replace(/,/g, ".");
  const cleaned = normalizedRaw.replace(/[^0-9.]/g, "");
  if (!cleaned) return NaN;
  const [intPart, ...decimalParts] = cleaned.split(".");
  const normalized = decimalParts.length > 0 ? `${intPart}.${decimalParts.join("")}` : intPart;
  if (!normalized) return NaN;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
};

const sanitizeKmInput = (value) => String(value ?? "").replace(/[^0-9.,]/g, "");
const normalizeStopName = (value) => String(value || "").trim().toLowerCase();

function SwipeConfirm({ label, onConfirm, disabled = false }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const maxRef = useRef(0);
  const currentXRef = useRef(0);
  const startXRef = useRef(0);
  const onConfirmRef = useRef(onConfirm);
  const disabledRef = useRef(disabled);
  const mountedRef = useRef(true);
  const [trackWidth, setTrackWidth] = useState(0);

  onConfirmRef.current = onConfirm;
  disabledRef.current = disabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentXRef.current = value;
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  useEffect(() => {
    translateX.setValue(0);
    maxRef.current = Math.max(0, trackWidth - SWIPE_HANDLE_WIDTH);
  }, [trackWidth, translateX, disabled]);

  const animateTo = (toValue, callback) => {
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      bounciness: 6,
      speed: 22,
    }).start(callback);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onStartShouldSetPanResponderCapture: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponderCapture: () => !disabledRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (disabledRef.current) return;
        startXRef.current = currentXRef.current || 0;
      },
      onPanResponderMove: (_, gestureState) => {
        if (disabledRef.current) return;
        const max = maxRef.current;
        const next = startXRef.current + gestureState.dx;
        const clamped = Math.max(0, Math.min(max, next));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: () => {
        if (disabledRef.current) return;
        const max = maxRef.current;
        const threshold = max * 0.82;

        if (currentXRef.current >= threshold && max > 0) {
          animateTo(max);
          Promise.resolve(onConfirmRef.current())
            .catch(() => {})
            .finally(() => {
              if (mountedRef.current) animateTo(0);
            });
          return;
        }

        animateTo(0);
      },
      onPanResponderTerminate: () => {
        animateTo(0);
      },
    })
  ).current;

  return (
    <View
      style={[styles.swipeTrack, disabled && styles.swipeTrackDisabled]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      collapsable={false}
      {...panResponder.panHandlers}
    >
      <Text style={[styles.swipeText, disabled && styles.swipeTextDisabled]}>{label}</Text>
      <Animated.View
        pointerEvents="none"
        style={[styles.swipeHandle, { transform: [{ translateX }] }, disabled && styles.swipeHandleDisabled]}
      >
        <Text style={styles.swipeArrow}>{"->"}</Text>
      </Animated.View>
    </View>
  );
}

export default function Trip() {
  const router = useRouter();
  const { tripInstanceId } = useLocalSearchParams();
  const tripId = Array.isArray(tripInstanceId) ? tripInstanceId[0] : tripInstanceId;
  const [trip, setTrip] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [endModalVisible, setEndModalVisible] = useState(false);
  const [locationDisclosureVisible, setLocationDisclosureVisible] = useState(false);
  const [openingKmInput, setOpeningKmInput] = useState("");
  const [closingKmInput, setClosingKmInput] = useState("");
  const locationDisclosureResolverRef = useRef(null);

  const isTripCompleted = trip?.status === "Completed";
  const hasStarted = Boolean(trip?.timing?.actualStartTime);
  const isTracking = hasStarted && !isTripCompleted;
  const routeStops = useMemo(() => trip?.routeStops || [], [trip?.routeStops]);
  const progressStops = useMemo(() => {
    if (!routeStops.length) {
      return { lastStop: null, currentStop: null, upcomingStops: [] };
    }

    const passedSet = new Set((trip?.progress?.passedStops || []).map(normalizeStopName));
    const approachingStop = String(trip?.progress?.approachingStop || "").trim();
    const approachingIndex = routeStops.findIndex(
      (stop) => normalizeStopName(stop.name) === normalizeStopName(approachingStop)
    );
    const lastPassedIndex = routeStops.reduce(
      (latestIndex, stop, index) => (passedSet.has(normalizeStopName(stop.name)) ? index : latestIndex),
      -1
    );
    const currentStopIndex =
      approachingIndex >= 0
        ? approachingIndex
        : hasStarted
        ? Math.min(lastPassedIndex + 1, routeStops.length - 1)
        : -1;
    const nextStop = currentStopIndex >= 0 ? routeStops[currentStopIndex + 1] || null : null;
    const secondUpcomingStop = currentStopIndex >= 0 ? routeStops[currentStopIndex + 2] || null : null;

    return {
      lastStop: lastPassedIndex >= 0 ? routeStops[lastPassedIndex] : null,
      currentStop: currentStopIndex >= 0 ? routeStops[currentStopIndex] : null,
      upcomingStops: [nextStop, secondUpcomingStop].filter(Boolean),
    };
  }, [hasStarted, routeStops, trip?.progress?.approachingStop, trip?.progress?.passedStops]);
  const upcomingStopsWithWaiting = useMemo(() => {
    return progressStops.upcomingStops.map((stop) => {
      const match = (trip?.waitingSummary?.stops || []).find(
        (item) => normalizeStopName(item.stopName) === normalizeStopName(stop.name)
      );
      return {
        ...stop,
        passengersWaiting: match?.passengersWaiting || 0,
      };
    });
  }, [progressStops.upcomingStops, trip?.waitingSummary?.stops]);
  const nextUpcomingStop = trip?.upcomingStopWaiting?.stopName
    ? {
        name: trip.upcomingStopWaiting.stopName,
        passengersWaiting: trip.upcomingStopWaiting.passengersWaiting || 0,
      }
    : upcomingStopsWithWaiting[0] || null;
  const secondUpcomingStop = upcomingStopsWithWaiting[1] || null;

  const openingKmValue = parseKm(openingKmInput);
  const closingKmValue = parseKm(closingKmInput);
  const isOpeningKmValid = Number.isFinite(openingKmValue) && openingKmValue >= 0;
  const openingKmFromTrip = Number(trip?.timing?.openingKm);
  const minClosingKm = Number.isFinite(openingKmFromTrip) ? openingKmFromTrip : 0;
  const isClosingKmValid = Number.isFinite(closingKmValue) && closingKmValue >= minClosingKm;

  const loadTrip = async () => {
    if (!tripId) {
      setNotice("Trip id missing. Please reopen the trip from Active Trips.");
      return;
    }
    setNotice("");
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`${apiBase}/api/driver-trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to load trip");
      let nextTrip = data.trip;

      if ((!nextTrip?.routeStops || !nextTrip.routeStops.length) && nextTrip?.route?.id) {
        try {
          const stopsResponse = await fetch(`${apiBase}/api/public/routes/${nextTrip.route.id}/live`);
          const stopsText = await stopsResponse.text();
          const stopsData = parseApiText(stopsText);
          if (stopsResponse.ok && Array.isArray(stopsData.stops) && stopsData.stops.length) {
            nextTrip = {
              ...nextTrip,
              routeStops: stopsData.stops.map((stop) => ({
                index: stop.index,
                name: stop.name,
              })),
            };
          }
        } catch {
          // Non-fatal: fallback stops are best-effort only.
        }
      }

      setTrip(nextTrip);

      if (
        nextTrip?.timing?.actualStartTime &&
        nextTrip?.status !== "Completed" &&
        nextTrip?.status !== "Cancelled"
      ) {
        const [apiBase, token] = await Promise.all([
          AsyncStorage.getItem(API_BASE_KEY),
          AsyncStorage.getItem(TOKEN_KEY),
        ]);
        if (apiBase && token) {
          await updateDriverBackgroundNotification({
            tripInstanceId: tripId,
            apiBase,
            token,
            stopName: nextTrip?.upcomingStopWaiting?.stopName || null,
            passengersWaiting: nextTrip?.upcomingStopWaiting?.passengersWaiting || 0,
          });
        }
      }
    } catch (err) {
      setNotice(err.message);
    }
  };

  const sendLocationUpdate = async (coordsOverride = null) => {
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!apiBase || !token) return;

      let coords = coordsOverride;
      if (!coords) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setLocationNotice("Location permission denied.");
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      }

      const response = await fetch(`${apiBase}/api/driver-trips/location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tripInstanceId: tripId,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });

      await writeDriverTrackingDebug({
        lastPostAt: new Date().toISOString(),
        source: "foreground",
        ok: response.ok,
        status: response.status,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } catch (err) {
      setLocationNotice(err.message);
    }
  };

  const requestLocationDisclosureAcknowledgement = () =>
    new Promise((resolve) => {
      locationDisclosureResolverRef.current = resolve;
      setLocationDisclosureVisible(true);
    });

  const resolveLocationDisclosure = (accepted) => {
    setLocationDisclosureVisible(false);
    const resolver = locationDisclosureResolverRef.current;
    locationDisclosureResolverRef.current = null;
    if (resolver) resolver(accepted);
  };

  const ensureBackgroundLocationDisclosure = async () => {
    const [foregroundStatus, backgroundStatus] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    if (foregroundStatus.status === "granted" && backgroundStatus.status === "granted") {
      return true;
    }
    const accepted = await requestLocationDisclosureAcknowledgement();
    if (!accepted) {
      setLocationNotice("Background location permission was not requested.");
      return false;
    }
    return true;
  };

  const handleStart = async (openingKm) => {
    setBusy(true);
    setNotice("");
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      const disclosureAccepted = await ensureBackgroundLocationDisclosure();
      if (!disclosureAccepted) return false;
      const permission = await requestDriverBackgroundPermissions();
      if (!permission.ok) {
        throw new Error(
          permission.reason === "background_denied"
            ? "Background location permission denied."
            : "Location permission denied."
        );
      }
      const response = await fetch(`${apiBase}/api/driver-trips/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tripInstanceId: tripId, openingKm }),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to start trip");
      await updateDriverBackgroundNotification({
        tripInstanceId: tripId,
        apiBase,
        token,
        stopName: trip?.upcomingStopWaiting?.stopName || null,
        passengersWaiting: trip?.upcomingStopWaiting?.passengersWaiting || 0,
      });
      await sendLocationUpdate();
      await loadTrip();
      return true;
    } catch (err) {
      setNotice(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async (closingKm) => {
    setBusy(true);
    setNotice("");
    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      const response = await fetch(`${apiBase}/api/driver-trips/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tripInstanceId: tripId, closingKm }),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to complete trip");
      await stopDriverBackgroundTracking();
      router.replace({ pathname: "/trip-summary", params: { tripInstanceId: tripId } });
      return true;
    } catch (err) {
      setNotice(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmStartTrip = async () => {
    if (!isOpeningKmValid) {
      setNotice("Please enter a valid opening KM.");
      return;
    }
    const ok = await handleStart(openingKmValue);
    if (ok) {
      setStartModalVisible(false);
      setOpeningKmInput("");
    }
  };

  const confirmEndTrip = async () => {
    if (!isClosingKmValid) {
      setNotice(`Closing KM must be >= ${minClosingKm}.`);
      return;
    }
    const ok = await handleEnd(closingKmValue);
    if (ok) {
      setEndModalVisible(false);
      setClosingKmInput("");
    }
  };

  useEffect(() => {
    if (tripId) loadTrip();
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return undefined;
    const interval = setInterval(loadTrip, 20000);
    return () => clearInterval(interval);
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return undefined;

    let cancelled = false;

    const syncBackgroundTracking = async () => {
      if (!trip) return;

      if (!isTracking) {
        if (trip.status === "Completed") {
          await stopDriverBackgroundTracking();
        }
        return;
      }

      try {
        const [apiBase, token] = await Promise.all([
          AsyncStorage.getItem(API_BASE_KEY),
          AsyncStorage.getItem(TOKEN_KEY),
        ]);
        if (!apiBase || !token) return;

        const disclosureAccepted = await ensureBackgroundLocationDisclosure();
        if (!disclosureAccepted) return;
        const permission = await requestDriverBackgroundPermissions();
        if (!permission.ok) {
          if (!cancelled) {
            setLocationNotice(
              permission.reason === "background_denied"
                ? "Background location permission denied."
                : "Location permission denied."
            );
          }
          return;
        }

        if (!cancelled) setLocationNotice("");

        await updateDriverBackgroundNotification({
          tripInstanceId: tripId,
          apiBase,
          token,
          stopName: trip?.upcomingStopWaiting?.stopName || null,
          passengersWaiting: trip?.upcomingStopWaiting?.passengersWaiting || 0,
        });

        await sendLocationUpdate();
      } catch (err) {
        if (!cancelled) {
          setLocationNotice(err.message || "Unable to start background trip tracking.");
        }
      }
    };

    void syncBackgroundTracking();

    return () => {
      cancelled = true;
    };
  }, [
    isTracking,
    tripId,
    trip?.status,
    trip?.upcomingStopWaiting?.stopName,
    trip?.upcomingStopWaiting?.passengersWaiting,
  ]);

  useEffect(() => {
    if (!tripId || !isTracking) return undefined;

    let watchSub = null;
    let backupInterval = null;
    let cancelled = false;
    let lastSentMs = 0;
    const THROTTLE_MS = 15000;

    const postCoords = async (coords) => {
      const now = Date.now();
      if (now - lastSentMs < THROTTLE_MS) return;
      lastSentMs = now;
      await sendLocationUpdate({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    };

    const startForegroundTracking = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          if (!cancelled) setLocationNotice("Location permission denied.");
          return;
        }

        try {
          const last = await Location.getLastKnownPositionAsync({
            maxAge: 10 * 60 * 1000,
            requiredAccuracy: 1000,
          });
          if (last) {
            lastSentMs = 0;
            await postCoords(last.coords);
          }
        } catch {
          // Best effort only. The watcher/backup polling below will continue.
        }

        try {
          watchSub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: THROTTLE_MS,
              distanceInterval: 30,
            },
            (location) => {
              void postCoords(location.coords);
            }
          );
        } catch {
          // Non-fatal: polling fallback below still runs.
        }

        backupInterval = setInterval(async () => {
          try {
            const position = await Location.getLastKnownPositionAsync({ maxAge: 60 * 1000 });
            if (position) await postCoords(position.coords);
          } catch {
            // Non-fatal.
          }
        }, 30000);
      } catch (err) {
        if (!cancelled) {
          setLocationNotice(err.message || "Unable to start foreground trip tracking.");
        }
      }
    };

    void startForegroundTracking();

    return () => {
      cancelled = true;
      if (watchSub) watchSub.remove();
      if (backupInterval) clearInterval(backupInterval);
    };
  }, [isTracking, tripId]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Trip control</Text>
        <Text style={styles.title}>Trip details</Text>
        <Text style={styles.subtitle}>Live status, timing, and route info.</Text>
      </View>
      {notice ? (
        <View style={styles.noticeCard}>
          <Text style={styles.notice}>{notice}</Text>
        </View>
      ) : null}
      {locationNotice ? (
        <View style={styles.noticeCard}>
          <Text style={styles.notice}>{locationNotice}</Text>
        </View>
      ) : null}
      {!trip ? (
        <Text style={styles.helper}>Loading trip...</Text>
      ) : (
        <View style={styles.card}>
          <View style={styles.banner}>
            <View>
              <Text style={styles.route}>{trip.route?.routeCode || "Route"}</Text>
              <Text style={styles.subtle}>{trip.route?.routeName || ""}</Text>
            </View>
            <View
              style={[
                styles.pill,
                isTripCompleted ? styles.pillDone : hasStarted ? styles.pillLive : styles.pillScheduled,
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  isTripCompleted ? styles.pillTextDone : hasStarted ? styles.pillTextLive : styles.pillTextScheduled,
                ]}
              >
                {(trip.status || "status").toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Bus</Text>
              <Text style={styles.kpiValue}>{trip.bus?.busNumber || "--"}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Direction</Text>
              <Text style={styles.kpiValue}>{trip.direction || "--"}</Text>
            </View>
          </View>

          <View style={[styles.section, styles.sectionCard]}>
            <Text style={styles.sectionTitle}>Stops</Text>
            <View style={styles.stopRow}>
              <View style={styles.stopDot} />
              <View>
                <Text style={styles.stopLabel}>Pickup</Text>
                <Text style={styles.stopValue}>{trip.pickupLocation || "--"}</Text>
              </View>
            </View>
            <View style={styles.stopDivider} />
            <View style={styles.stopRow}>
              <View style={[styles.stopDot, styles.stopDotEnd]} />
              <View>
                <Text style={styles.stopLabel}>Drop</Text>
                <Text style={styles.stopValue}>{trip.dropLocation || "--"}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.section, styles.sectionCard]}>
            <View style={styles.sectionHeadRow}>
              <View style={styles.sectionHeadAccent} />
              <Text style={styles.sectionTitle}>Timing</Text>
            </View>
            <View style={styles.timingTopGrid}>
              <View style={styles.timingTileLarge}>
                <Text style={styles.tileLabel}>SCHEDULED</Text>
                <Text style={styles.tilePrimary}>{trip.timing?.startTime || "--"}</Text>
                <Text style={styles.tileSecondary}>- {trip.timing?.endTime || "--"}</Text>
              </View>
              <View style={styles.timingTileLarge}>
                <Text style={styles.tileLabel}>STARTED</Text>
                <Text style={styles.tilePrimary}>
                  {trip.timing?.actualStartTime ? new Date(trip.timing.actualStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--"}
                </Text>
              </View>
            </View>
            <View style={styles.timingBottomGrid}>
              <View style={styles.timingTileSmall}>
                <Text style={styles.tileIcon}>■</Text>
                <Text style={styles.tileLabel}>ENDED</Text>
                <Text style={styles.tileValueSmall}>{trip.timing?.actualEndTime ? new Date(trip.timing.actualEndTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--"}</Text>
              </View>
              <View style={styles.timingTileSmall}>
                <Text style={styles.tileIcon}>📍</Text>
                <Text style={styles.tileLabel}>OPEN KM</Text>
                <Text style={styles.tileValueSmall}>{trip.timing?.openingKm ?? "--"}</Text>
              </View>
              <View style={styles.timingTileSmall}>
                <Text style={styles.tileIcon}>🏁</Text>
                <Text style={styles.tileLabel}>CLOSE KM</Text>
                <Text style={styles.tileValueSmall}>{trip.timing?.closingKm ?? "--"}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.section, styles.sectionCard, styles.liveCard]}>
            <View style={styles.sectionHeadRow}>
              <View style={[styles.sectionHeadAccent, styles.sectionHeadAccentMuted]} />
              <Text style={styles.sectionTitle}>Live route progress</Text>
            </View>
            {!hasStarted ? (
              <View style={styles.liveRow}>
                <View style={styles.liveIconBox}>
                  <Text style={styles.liveIcon}>📡</Text>
                </View>
                <Text style={styles.liveText}>GPS and route progress will appear once the trip starts.</Text>
              </View>
            ) : (
              <View style={styles.progressWrap}>
                <View style={styles.progressGrid}>
                  <View style={styles.progressTile}>
                    <Text style={styles.progressLabel}>Last stop</Text>
                    <Text style={styles.progressValue}>{progressStops.lastStop?.name || "--"}</Text>
                  </View>
                  <View style={styles.progressTile}>
                    <Text style={styles.progressLabel}>Current stop</Text>
                    <Text style={styles.progressValue}>{progressStops.currentStop?.name || "--"}</Text>
                  </View>
                  <View style={styles.progressTile}>
                    <Text style={styles.progressLabel}>Upcoming stop</Text>
                    <Text style={styles.progressValue}>{nextUpcomingStop?.name || "--"}</Text>
                    <Text style={styles.progressMeta}>
                      {nextUpcomingStop
                        ? `${nextUpcomingStop.passengersWaiting} passengers tapped waiting`
                        : "No upcoming stop available"}
                    </Text>
                  </View>
                  <View style={styles.progressTile}>
                    <Text style={styles.progressLabel}>After next</Text>
                    <Text style={styles.progressValue}>{secondUpcomingStop?.name || "--"}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {trip ? (
        <View style={styles.footerActionBar}>
          <TouchableOpacity style={styles.footerBack} onPress={() => router.back()}>
            <Text style={styles.footerBackText}>{"<-"} Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.footerPrimary,
              trip.status === "Completed"
                ? styles.statusCompleted
                : hasStarted
                ? styles.statusActive
                : styles.statusReady,
            ]}
            onPress={() => {
              if (isTripCompleted || busy) return;
              if (hasStarted) {
                setClosingKmInput("");
                setEndModalVisible(true);
              } else {
                setOpeningKmInput("");
                setStartModalVisible(true);
              }
            }}
            disabled={busy || isTripCompleted}
          >
            <Text style={styles.statusText}>
              {trip.status === "Completed"
                ? "Trip completed"
                : hasStarted
                ? "End trip"
                : busy
                ? "Please wait"
                : "▶ Start Trip"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={startModalVisible} transparent animationType="fade" onRequestClose={() => setStartModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter opening KM</Text>
            <TextInput
              value={openingKmInput}
              onChangeText={(value) => setOpeningKmInput(sanitizeKmInput(value))}
              keyboardType="decimal-pad"
              placeholder="Opening KM"
              style={styles.modalInput}
            />
            <Text style={styles.modalHint}>After entering KM, slide to start the trip.</Text>
            <SwipeConfirm
              label={isOpeningKmValid ? "Slide to start trip" : "Enter valid opening KM"}
              onConfirm={confirmStartTrip}
              disabled={busy}
            />
            <TouchableOpacity style={styles.modalCancel} onPress={() => setStartModalVisible(false)} disabled={busy}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={endModalVisible} transparent animationType="fade" onRequestClose={() => setEndModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter closing KM</Text>
            <TextInput
              value={closingKmInput}
              onChangeText={(value) => setClosingKmInput(sanitizeKmInput(value))}
              keyboardType="decimal-pad"
              placeholder={`Closing KM (>= ${minClosingKm})`}
              style={styles.modalInput}
            />
            <Text style={styles.modalHint}>After entering KM, slide to end the trip.</Text>
            <SwipeConfirm
              label={isClosingKmValid ? "Slide to end trip" : `Closing KM >= ${minClosingKm}`}
              onConfirm={confirmEndTrip}
              disabled={busy}
            />
            <TouchableOpacity style={styles.modalCancel} onPress={() => setEndModalVisible(false)} disabled={busy}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={locationDisclosureVisible}
        transparent
        animationType="fade"
        onRequestClose={() => resolveLocationDisclosure(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Allow background location for live trips</Text>
            <Text style={styles.modalHint}>
              Qfare collects location data even when the app is not in use during an active live trip.
            </Text>
            <Text style={styles.modalHint}>
              This is required to track trip movement, update route progress, support transport monitoring, and keep
              trip operations active in the background.
            </Text>
            <Text style={styles.modalDisclosureNote}>
              Background location is used only for active trip operations and not for advertising or marketing.
            </Text>
            <View style={styles.disclosureActions}>
              <TouchableOpacity style={styles.disclosureSecondary} onPress={() => resolveLocationDisclosure(false)}>
                <Text style={styles.disclosureSecondaryText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.disclosurePrimary} onPress={() => resolveLocationDisclosure(true)}>
                <Text style={styles.disclosurePrimaryText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    backgroundColor: "#0A1628",
    flexGrow: 1,
  },
  headerCard: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 16,
  },
  kicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.38)",
  },
  title: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.55)",
  },
  card: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  banner: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  route: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.45)",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillScheduled: {
    backgroundColor: "rgba(0,144,224,0.12)",
    borderColor: "rgba(0,144,224,0.35)",
  },
  pillLive: {
    backgroundColor: "rgba(0,200,122,0.14)",
    borderColor: "rgba(0,200,122,0.35)",
  },
  pillDone: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  pillTextScheduled: {
    color: "#0090E0",
  },
  pillTextLive: {
    color: "#00C87A",
  },
  pillTextDone: {
    color: "rgba(255,255,255,0.7)",
  },
  pillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  kpi: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  kpiLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.35)",
  },
  kpiValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  section: {
    marginTop: 12,
  },
  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "700",
  },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionHeadAccent: {
    width: 3,
    height: 16,
    borderRadius: 3,
    backgroundColor: "#FB923C",
  },
  sectionHeadAccentMuted: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  timingTopGrid: {
    flexDirection: "row",
    gap: 10,
  },
  timingTileLarge: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timingBottomGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  timingTileSmall: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tileIcon: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginBottom: 10,
  },
  tileLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tilePrimary: {
    marginTop: 8,
    color: "#E2E8F0",
    fontSize: 38,
    fontWeight: "800",
    lineHeight: 40,
  },
  tileSecondary: {
    marginTop: 4,
    color: "rgba(255,255,255,0.35)",
    fontSize: 22,
    fontWeight: "600",
  },
  tileValueSmall: {
    marginTop: 8,
    color: "rgba(255,255,255,0.55)",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 32,
  },
  liveCard: {
    marginBottom: 14,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  liveIconBox: {
    width: 74,
    height: 74,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveIcon: {
    fontSize: 30,
  },
  liveText: {
    flex: 1,
    color: "rgba(255,255,255,0.45)",
    fontSize: 22,
    fontWeight: "600",
  },
  progressWrap: {
    gap: 12,
  },
  progressGrid: {
    gap: 10,
  },
  progressTile: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
  },
  progressLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  progressValue: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  progressMeta: {
    marginTop: 6,
    color: "#7DD3FC",
    fontSize: 13,
    fontWeight: "700",
  },
  row: {
    marginTop: 6,
    color: "rgba(255,255,255,0.62)",
    fontSize: 16,
    lineHeight: 24,
  },
  stopRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0090E0",
  },
  stopDotEnd: {
    backgroundColor: "#00C87A",
  },
  stopDivider: {
    marginLeft: 4,
    height: 14,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.2)",
  },
  stopLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.35)",
  },
  stopValue: {
    marginTop: 4,
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 4,
  },
  footerActionBar: {
    marginTop: 8,
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "rgba(4,14,36,0.85)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    gap: 12,
  },
  footerBack: {
    flex: 1,
    minHeight: 64,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerBackText: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "700",
    fontSize: 20,
  },
  footerPrimary: {
    flex: 2,
    minHeight: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    minWidth: 110,
    alignItems: "center",
  },
  secondaryText: {
    color: "#E2E8F0",
    fontWeight: "800",
    fontSize: 18,
  },
  statusButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
    minWidth: 170,
  },
  statusText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 18,
  },
  statusReady: {
    backgroundColor: "#00A86B",
  },
  statusActive: {
    backgroundColor: "#DC2626",
  },
  statusCompleted: {
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  notice: {
    color: "#FCA5A5",
    fontWeight: "600",
  },
  noticeCard: {
    marginTop: 12,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helper: {
    marginTop: 16,
    color: "rgba(255,255,255,0.45)",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,15,30,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#0F1E34",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  modalInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  modalHint: {
    marginTop: 10,
    color: "rgba(255,255,255,0.5)",
    lineHeight: 20,
  },
  modalDisclosureNote: {
    marginTop: 12,
    color: "#BFDBFE",
    lineHeight: 20,
    fontWeight: "600",
  },
  modalCancel: {
    marginTop: 12,
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  modalCancelText: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
  },
  swipeTrack: {
    marginTop: 14,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  swipeTrackDisabled: {
    backgroundColor: "rgba(148,163,184,0.25)",
    borderColor: "rgba(148,163,184,0.4)",
  },
  swipeText: {
    color: "#E2E8F0",
    fontWeight: "700",
    textAlign: "center",
  },
  swipeTextDisabled: {
    color: "rgba(226,232,240,0.6)",
  },
  swipeHandle: {
    position: "absolute",
    left: 0,
    top: 0,
    width: SWIPE_HANDLE_WIDTH,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#0090E0",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeHandleDisabled: {
    backgroundColor: "rgba(148,163,184,0.6)",
  },
  swipeArrow: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  disclosureActions: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  disclosureSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  disclosureSecondaryText: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
  },
  disclosurePrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#0090E0",
    alignItems: "center",
    justifyContent: "center",
  },
  disclosurePrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
