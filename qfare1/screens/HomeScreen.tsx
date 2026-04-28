import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';
import { palette } from '../lib/theme';
import QfareLogo from '../components/QfareLogo';

const WAITING_DISCLAIMER_ACK_KEY = 'passenger_waiting_disclaimer_ack';
const heroTopInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 18 : 56;
const today = (() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
})();

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<BottomTabParamList, 'Home'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type PublicRoute = {
  id: string;
  routeCode: string;
  routeName: string;
  source: string;
  destination: string;
  standardTripTimeMin: number;
  stops: string[];
};

type RouteStop = {
  index: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  landmarkImageUrl?: string | null;
};

type LiveTrip = {
  id: string;
  direction: 'UP' | 'DOWN';
  startTime: string;
  endTime: string;
  actualStartTime: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAt: string | null;
  lastLocationName: string | null;
  approachingStop: string | null;
  passedStops: string[];
  bus: {
    id: string | null;
    busNumber: string | null;
  };
};

type TripEta = {
  minutes: number;
  distanceKm: number;
  text: string;
  source: string;
  busLocationName: string | null;
  updatedAt: string | null;
};

type TripLoad = {
  onboard: number | null;
  totalBooked: number;
  capacity: number;
  loadPercent: number | null;
  status: 'empty' | 'light' | 'available' | 'filling' | 'packed' | 'unavailable';
  reason?: string;
  currentStopName: string | null;
  gpsAge: number | null;
};

type WaitingStatus = {
  stopName: string;
  stopIndex: number;
  notifiedAt: string;
} | null;

type LiveRoute = {
  id: string;
  routeCode: string;
  routeName: string;
  source: string;
  destination: string;
  standardTripTimeMin: number;
  stops: RouteStop[];
};

type RoutePreview = {
  route: PublicRoute;
  stops: string[];
};

type StopNavigationPrompt = {
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

type WaitingDisclaimerPrompt = {
  tripId: string;
};

type StopLandmarkPreview = {
  name: string;
  imageUrl: string;
  latitude: number | null;
  longitude: number | null;
};

type NearbyLiveTrip = {
  tripId: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  source: string;
  destination: string;
  direction: 'UP' | 'DOWN';
  busNumber: string;
  distanceKm: number;
  minutesAway: number;
  lastLatitude: number;
  lastLongitude: number;
  lastLocationAt: string | null;
  lastLocationName: string | null;
};

type NearbyLiveTripsResponse = {
  ok: boolean;
  radiusKm: number;
  trips: NearbyLiveTrip[];
};

const normalizeStopName = (value: string) => value.trim().toLowerCase();

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Returns the stop the bus is currently nearest to, considering direction order.
 * Stops without lat/lng are skipped. Returns null if none have coordinates.
 */
const resolveCurrentStop = (
  busLat: number,
  busLng: number,
  stops: RouteStop[],
  direction: 'UP' | 'DOWN'
): { name: string; distanceKm: number; status: 'at' | 'near' } | null => {
  const ordered = direction === 'UP' ? [...stops] : [...stops].reverse();
  const geocoded = ordered.filter(s => s.latitude !== null && s.longitude !== null);
  if (!geocoded.length) return null;

  let nearest = geocoded[0];
  let minDist = haversineKm(busLat, busLng, nearest.latitude!, nearest.longitude!);

  for (const stop of geocoded.slice(1)) {
    const d = haversineKm(busLat, busLng, stop.latitude!, stop.longitude!);
    if (d < minDist) { minDist = d; nearest = stop; }
  }

  return {
    name: nearest.name,
    distanceKm: Math.round(minDist * 10) / 10,
    status: minDist <= 0.25 ? 'at' : 'near',
  };
};

const getOrderedRouteStops = (route: PublicRoute, fromValue: string, toValue: string) => {
  const fromNorm = normalizeStopName(fromValue);
  const toNorm = normalizeStopName(toValue);

  if (!fromNorm || !toNorm) {
    return route.stops;
  }

  const fromIndex = route.stops.findIndex(stop => normalizeStopName(stop) === fromNorm);
  const toIndex = route.stops.findIndex(stop => normalizeStopName(stop) === toNorm);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return route.stops;
  }

  if (fromIndex < toIndex) {
    return route.stops.slice(fromIndex, toIndex + 1);
  }

  return route.stops.slice(toIndex, fromIndex + 1).reverse();
};

const getTripNearestRouteStop = (trip: LiveTrip, stops: RouteStop[]) => {
  if (typeof trip.lastLatitude !== 'number' || typeof trip.lastLongitude !== 'number') {
    return null;
  }

  const nearest = resolveCurrentStop(
    trip.lastLatitude,
    trip.lastLongitude,
    stops,
    trip.direction
  );

  if (!nearest) {
    return null;
  }

  const routeStop = stops.find(stop => normalizeStopName(stop.name) === normalizeStopName(nearest.name));
  if (!routeStop) {
    return null;
  }

  return {
    routeStop,
    status: nearest.status,
  };
};

const getTripProgressState = (
  trip: LiveTrip,
  routeStops: RouteStop[],
  selectedStopName: string,
  direction: 'UP' | 'DOWN'
) => {
  const selectedNorm = normalizeStopName(selectedStopName);
  if (!selectedNorm || !routeStops.length) {
    return {
      selectedStop: null,
      crossedSelectedStop: false,
      crossedBeyondAllowance: false,
      currentStop: null as RouteStop | null,
    };
  }

  const selectedStop =
    routeStops.find(stop => normalizeStopName(stop.name) === selectedNorm) ?? null;
  if (!selectedStop) {
    return {
      selectedStop: null,
      crossedSelectedStop: false,
      crossedBeyondAllowance: false,
      currentStop: null as RouteStop | null,
    };
  }

  const orderedStops = direction === 'UP' ? [...routeStops] : [...routeStops].reverse();
  const selectedOrderedIndex = orderedStops.findIndex(
    stop => normalizeStopName(stop.name) === selectedNorm
  );
  const currentNearest = getTripNearestRouteStop(trip, routeStops)?.routeStop ?? null;
  const currentOrderedIndex = currentNearest
    ? orderedStops.findIndex(
        stop => normalizeStopName(stop.name) === normalizeStopName(currentNearest.name)
      )
    : -1;
  const passedSet = new Set(trip.passedStops.map(stop => normalizeStopName(stop)));
  const crossedSelectedStop = passedSet.has(selectedNorm);
  const crossedBeyondAllowance =
    crossedSelectedStop &&
    currentOrderedIndex >= 0 &&
    selectedOrderedIndex >= 0 &&
    currentOrderedIndex > selectedOrderedIndex + 2;

  return {
    selectedStop,
    crossedSelectedStop,
    crossedBeyondAllowance,
    currentStop: currentNearest,
  };
};

const getWaitingDisclaimerStorageKey = (userId: string) =>
  `${WAITING_DISCLAIMER_ACK_KEY}:${userId}`;

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { token, user } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const maxFavoriteStops = 6;
  const favoritePickerPreviewCount = 8;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activeStopField, setActiveStopField] = useState<'from' | 'to'>('from');
  const [favoriteStops, setFavoriteStops] = useState<string[]>([]);
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);
  const [favoriteSearch, setFavoriteSearch] = useState('');
  const [favoriteRemoveMode, setFavoriteRemoveMode] = useState(false);
  const [selectedRoutePreview, setSelectedRoutePreview] = useState<RoutePreview | null>(null);
  const [stopNavigationPrompt, setStopNavigationPrompt] = useState<StopNavigationPrompt | null>(null);
  const [waitingDisclaimerPrompt, setWaitingDisclaimerPrompt] = useState<WaitingDisclaimerPrompt | null>(null);
  const [stopLandmarkPreview, setStopLandmarkPreview] = useState<StopLandmarkPreview | null>(null);
  const [routes, setRoutes] = useState<PublicRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [liveRoute, setLiveRoute] = useState<LiveRoute | null>(null);
  const [liveTrips, setLiveTrips] = useState<LiveTrip[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tripEtas, setTripEtas] = useState<Record<string, TripEta | null>>({});
  const [tripLocationNames, setTripLocationNames] = useState<Record<string, string>>({});
  const [expandedTrips, setExpandedTrips] = useState<Record<string, boolean>>({});
  const [tripLoads, setTripLoads] = useState<Record<string, TripLoad | null>>({});
  const [waitingStatusByTrip, setWaitingStatusByTrip] = useState<Record<string, WaitingStatus | undefined>>({});
  const [waitingBusyByTrip, setWaitingBusyByTrip] = useState<Record<string, boolean>>({});
  const [selectorRowHeight, setSelectorRowHeight] = useState(0);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationBootState, setLocationBootState] = useState<'pending' | 'ready' | 'unavailable'>('pending');
  const [nearbyLiveTrips, setNearbyLiveTrips] = useState<NearbyLiveTrip[]>([]);
  const [nearbyLiveLoading, setNearbyLiveLoading] = useState(false);
  const [nearbyLiveError, setNearbyLiveError] = useState<string | null>(null);
  const liveButtonPulse = useRef(new Animated.Value(0)).current;
  const hasResolvedStartupLocation = useRef(false);

  const loadRoutes = async () => {
    setLoadingRoutes(true);
    setRoutesError(null);
    try {
      const data = await apiGet<{ routes: PublicRoute[] }>('/api/public/routes');
      setRoutes(data.routes || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load routes';
      setRoutesError(message);
    } finally {
      setLoadingRoutes(false);
    }
  };

  useEffect(() => {
    void loadRoutes();
  }, []);

  useEffect(() => {
    if (hasResolvedStartupLocation.current) {
      return;
    }

    hasResolvedStartupLocation.current = true;

    const primeCurrentLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setLocationBootState('unavailable');
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setUserCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationBootState('ready');
      } catch {
        // Startup location is best-effort only.
        setLocationBootState('unavailable');
      }
    };

    void primeCurrentLocation();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveButtonPulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(liveButtonPulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
      liveButtonPulse.stopAnimation();
    };
  }, [liveButtonPulse]);

  const matchingRoutes = useMemo(() => {
    const fromNorm = normalizeStopName(from);
    const toNorm = normalizeStopName(to);
    if (!fromNorm && !toNorm) return [];
    return routes.filter(route => {
      const hasFrom = fromNorm ? route.stops.some(stop => normalizeStopName(stop) === fromNorm) : true;
      const hasTo = toNorm ? route.stops.some(stop => normalizeStopName(stop) === toNorm) : true;
      return hasFrom && hasTo;
    });
  }, [from, routes, to]);

  const matchingRoutePreviews = useMemo(
    () => matchingRoutes.map(route => ({ route, stops: getOrderedRouteStops(route, from, to) })),
    [from, matchingRoutes, to]
  );

  const hasRouteSearch = Boolean(from.trim() || to.trim());

  const allStops = useMemo(() => {
    const seen = new Set<string>();
    const stops: string[] = [];
    routes.forEach(route => {
      route.stops.forEach(stop => {
        const trimmed = stop.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        stops.push(trimmed);
      });
    });
    return stops;
  }, [routes]);

  useEffect(() => {
    if (!allStops.length || favoriteStops.length) return;
    setFavoriteStops(allStops.slice(0, maxFavoriteStops));
  }, [allStops, favoriteStops.length]);

  const availableFavoriteStops = useMemo(
    () => allStops.filter(stop => !favoriteStops.some(favorite => favorite.toLowerCase() === stop.toLowerCase())),
    [allStops, favoriteStops]
  );

  const searchableFavoriteStops = useMemo(
    () => availableFavoriteStops.filter(stop => stop.trim().length >= 3),
    [availableFavoriteStops]
  );

  const favoritePickerStops = useMemo(() => {
    const query = favoriteSearch.trim().toLowerCase();
    const source = searchableFavoriteStops.length ? searchableFavoriteStops : availableFavoriteStops;

    if (!query) {
      return source.slice(0, favoritePickerPreviewCount);
    }

    return [...source]
      .filter(stop => stop.toLowerCase().includes(query))
      .sort((left, right) => {
        const leftLower = left.toLowerCase();
        const rightLower = right.toLowerCase();
        const leftStarts = leftLower.startsWith(query) ? 0 : 1;
        const rightStarts = rightLower.startsWith(query) ? 0 : 1;
        if (leftStarts !== rightStarts) return leftStarts - rightStarts;
        if (left.length !== right.length) return left.length - right.length;
        return left.localeCompare(right);
      })
      .slice(0, 12);
  }, [availableFavoriteStops, favoriteSearch, favoritePickerPreviewCount, searchableFavoriteStops]);

  const suggestions = useMemo(() => {
    const activeText = (activeStopField === 'from' ? from : to).trim().toLowerCase();
    if (!activeText) return [];
    if (allStops.some(s => s.toLowerCase() === activeText)) return [];
    return allStops.filter(s => s.toLowerCase().includes(activeText)).slice(0, 7);
  }, [from, to, activeStopField, allStops]);

  const shouldShowRouteResultsCard =
    loadingRoutes || Boolean(routesError) || matchingRoutePreviews.length > 0 || hasRouteSearch;
  const shouldShowNearbyLiveTrips = !hasRouteSearch;

  const liveTripsWithCoords = useMemo(
    () =>
      liveTrips.filter(
        trip => typeof trip.lastLatitude === 'number' && typeof trip.lastLongitude === 'number'
      ),
    [liveTrips]
  );

  // Filter visible trips to the direction the user is travelling.
  // Compares the index of the user's from/to stops in the route's ordered stop list.
  // If both stops are found and have different indices, only show trips in that direction.
  // Falls back to showing all trips when from/to aren't set or not found in this route.
  const filteredLiveTrips = useMemo(() => {
    const fromNorm = normalizeStopName(from);
    const toNorm = normalizeStopName(to);
    if (!fromNorm || !toNorm || !liveRoute?.stops?.length) return liveTrips;

    const fromStop = liveRoute.stops.find(s => normalizeStopName(s.name) === fromNorm);
    const toStop = liveRoute.stops.find(s => normalizeStopName(s.name) === toNorm);

    if (!fromStop || !toStop || fromStop.index === toStop.index) return liveTrips;

    const wantedDirection: 'UP' | 'DOWN' = fromStop.index < toStop.index ? 'UP' : 'DOWN';
    return liveTrips.filter(trip => {
      if (trip.direction !== wantedDirection) return false;

      const progress = getTripProgressState(trip, liveRoute.stops, from, wantedDirection);
      if (progress.crossedSelectedStop) {
        return progress.crossedBeyondAllowance !== true;
      }

      return true;
    });
  }, [liveTrips, from, to, liveRoute]);

  const formatUpdated = (value: string | null) => {
    if (!value) return 'Location not updated yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Location not updated yet';
    const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (diffMin === 0) return 'Updated just now';
    if (diffMin === 1) return 'Updated 1 min ago';
    return `Updated ${diffMin} min ago`;
  };

  const staleColor = (value: string | null) => {
    if (!value) return palette.danger;
    const diffMin = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (diffMin <= 5) return palette.accent;   // green - fresh
    if (diffMin <= 15) return palette.gold;    // amber - getting stale
    return palette.danger;                      // red â€” stale
  };

  const fetchTripLocationName = async (tripId: string, lat: number, lng: number) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'QFarePassengerApp/1.0' } });
      if (!res.ok) return;
      const data = await res.json();
      const a = data.address || {};
      const place = a.road || a.suburb || a.neighbourhood || a.quarter || a.village || a.town || a.city || '';
      const city = a.city || a.town || a.city_district || a.state_district || '';
      const name = place && city ? `${place}, ${city}` : place || city;
      if (name) setTripLocationNames(prev => ({ ...prev, [tripId]: name }));
    } catch { /* non-fatal */ }
  };

  const loadConfig = (status: TripLoad['status']) => {
    switch (status) {
      case 'empty':    return { label: 'Empty',      color: palette.textFaint,  bg: 'rgba(255,255,255,0.05)', icon: 'people-outline' as const };
      case 'light':    return { label: 'Light',      color: '#34D399',          bg: 'rgba(52,211,153,0.1)',   icon: 'people-outline' as const };
      case 'available':return { label: 'Available',  color: palette.accent,     bg: 'rgba(0,200,122,0.12)',   icon: 'people-outline' as const };
      case 'filling':  return { label: 'Filling Up', color: palette.gold,       bg: 'rgba(251,191,36,0.12)',  icon: 'people-outline' as const };
      case 'packed':   return { label: 'Packed',     color: palette.danger,     bg: 'rgba(239,68,68,0.12)',   icon: 'people-outline' as const };
      default:         return { label: 'Load N/A',   color: palette.textFaint,  bg: 'rgba(255,255,255,0.04)', icon: 'people-outline' as const };
    }
  };

  const formatEta = (trip: LiveTrip) => {
    if (!liveRoute?.standardTripTimeMin || !trip.actualStartTime) return 'ETA unavailable';
    const start = new Date(trip.actualStartTime).getTime();
    if (Number.isNaN(start)) return 'ETA unavailable';
    const eta = new Date(start + liveRoute.standardTripTimeMin * 60000);
    return `ETA ${eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const loadLiveStatus = async (routeId: string, showLoading = true) => {
    if (!routeId) return;
    if (showLoading) setLiveLoading(true);
    setLiveError(null);
    try {
      const data = await apiGet<{ route: LiveRoute; stops: RouteStop[]; trips: LiveTrip[] }>(
        `/api/public/routes/${routeId}/live?date=${today}`
      );
      setLiveRoute(data.route ? { ...data.route, stops: data.stops || [] } : null);
      setLiveTrips(data.trips || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load live status';
      setLiveError(message);
    } finally {
      if (showLoading) setLiveLoading(false);
    }
  };

  const loadNearbyLiveTrips = async (
    coords: { latitude: number; longitude: number },
    showLoading = true
  ) => {
    if (showLoading) setNearbyLiveLoading(true);
    setNearbyLiveError(null);
    try {
      const data = await apiGet<NearbyLiveTripsResponse>(
        `/api/public/trips/nearby?latitude=${coords.latitude}&longitude=${coords.longitude}&radiusKm=5&date=${today}`
      );
      setNearbyLiveTrips(data.trips || []);
    } catch (error) {
      setNearbyLiveTrips([]);
      setNearbyLiveError(error instanceof Error ? error.message : 'Failed to load nearby buses');
    } finally {
      if (showLoading) setNearbyLiveLoading(false);
    }
  };

  const fetchEtaForTrip = async (tripId: string, userStop: string) => {
    try {
      const data = await apiGet<{ ok: boolean; eta: TripEta | null }>(
        `/api/public/trips/${tripId}/eta?userStop=${encodeURIComponent(userStop)}`
      );
      setTripEtas(prev => ({ ...prev, [tripId]: data.eta ?? null }));
    } catch {
      // non-fatal - ETA is a best-effort feature
    }
  };

  const fetchTripLoad = async (tripId: string) => {
    try {
      const data = await apiGet<TripLoad & { ok: boolean }>(
        `/api/public/trips/${tripId}/load`
      );
      setTripLoads(prev => ({ ...prev, [tripId]: data }));
    } catch {
      // non-fatal
    }
  };

  const fetchWaitingStatusForTrip = async (tripId: string) => {
    if (!token) return;
    try {
      const data = await apiGet<{ ok: boolean; waiting: WaitingStatus }>(
        `/api/public/trips/${tripId}/waiting`,
        token
      );
      setWaitingStatusByTrip(prev => ({ ...prev, [tripId]: data.waiting ?? null }));
    } catch {
      // non-fatal
    }
  };

  const sendWaitingNotificationForTrip = async (tripId: string, stopName: string) => {
    const data = await apiPost<{ ok: boolean; waiting: WaitingStatus }>(
      `/api/public/trips/${tripId}/waiting`,
      { stopName },
      token
    );
    setWaitingStatusByTrip(prev => ({ ...prev, [tripId]: data.waiting ?? null }));
  };

  const notifyWaitingForTrip = async (tripId: string, stopName: string) => {
    if (!token) {
      Alert.alert('Login required', 'Please sign in to notify the crew.');
      return;
    }
    setWaitingBusyByTrip(prev => ({ ...prev, [tripId]: true }));
    try {
      await sendWaitingNotificationForTrip(tripId, stopName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to notify crew';
      Alert.alert('Could not notify crew', message);
    } finally {
      setWaitingBusyByTrip(prev => ({ ...prev, [tripId]: false }));
    }
  };

  useEffect(() => {
    if (!activeRouteId) return;
    setWaitingStatusByTrip({});
    void loadLiveStatus(activeRouteId);
    const interval = setInterval(() => {
      void loadLiveStatus(activeRouteId, false);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeRouteId]);

  useEffect(() => {
    if (!userCoords) return;
    void loadNearbyLiveTrips(userCoords);
  }, [userCoords]);

  useEffect(() => {
    if (!userCoords || hasRouteSearch) return;
    const interval = setInterval(() => {
      void loadNearbyLiveTrips(userCoords, false);
    }, 10000);
    return () => clearInterval(interval);
  }, [userCoords, hasRouteSearch]);

  // Fetch ETAs whenever live trips update and user has a "from" stop set
  useEffect(() => {
    const userStop = from.trim();
    if (!userStop || !liveTripsWithCoords.length) return;
    liveTripsWithCoords.forEach(trip => {
      void fetchEtaForTrip(String(trip.id), userStop);
    });
  }, [liveTrips, from]);

  // Reverse-geocode bus positions that have no human-readable name yet
  useEffect(() => {
    liveTripsWithCoords.forEach(trip => {
      const id = String(trip.id);
      if (trip.lastLocationName || tripLocationNames[id]) return; // already resolved
      void fetchTripLocationName(id, trip.lastLatitude as number, trip.lastLongitude as number);
    });
  }, [liveTrips]);

  // Refresh load for all live trips on every polling cycle
  useEffect(() => {
    liveTrips.forEach(trip => {
      void fetchTripLoad(String(trip.id));
    });
  }, [liveTrips]);

  const handleStopSelect = (stop: string) => {
    Keyboard.dismiss();
    if (activeStopField === 'from') {
      setFrom(stop);
      if (to === stop) setTo('');
      setActiveStopField('to');
      return;
    }
    setTo(stop);
    if (from === stop) setFrom('');
  };

  const navigateToStop = (stopName: string) => {
    const stop = liveRoute?.stops?.find(s => s.name.toLowerCase() === stopName.toLowerCase());
    if (!stop?.latitude || !stop?.longitude) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}&travelmode=walking`;
    Linking.openURL(url);
  };

  const navigateToCoordinates = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`;
    Linking.openURL(url);
  };

  const maybeShowWaitingDisclaimer = async (tripId: string) => {
    if (!user?.id) {
      return;
    }

    const acknowledged = await AsyncStorage.getItem(getWaitingDisclaimerStorageKey(user.id));
    if (acknowledged === '1') {
      return;
    }

    setWaitingDisclaimerPrompt({ tripId });
  };

  const acknowledgeWaitingDisclaimer = async () => {
    if (user?.id) {
      await AsyncStorage.setItem(getWaitingDisclaimerStorageKey(user.id), '1');
    }
    setWaitingDisclaimerPrompt(null);
  };

  const handleWaitingAction = async (tripId: string, stopName: string) => {
    if (!token) {
      Alert.alert('Login required', 'Please sign in to notify the crew.');
      return;
    }

    const stop = liveRoute?.stops?.find(
      item =>
        normalizeStopName(item.name) === normalizeStopName(stopName) &&
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number'
    );

    if (!stop?.latitude || !stop?.longitude) {
      Alert.alert('Stop location unavailable', 'This stop does not have location coordinates yet.');
      return;
    }

    setWaitingBusyByTrip(prev => ({ ...prev, [tripId]: true }));
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location required', 'Allow location access to confirm you are at the selected bus stop.');
        return;
      }

      const userPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const distanceMeters = haversineKm(
        userPosition.coords.latitude,
        userPosition.coords.longitude,
        stop.latitude,
        stop.longitude
      ) * 1000;

      if (distanceMeters <= 20) {
        await sendWaitingNotificationForTrip(tripId, stopName);
        await maybeShowWaitingDisclaimer(tripId);
        return;
      }

      setStopNavigationPrompt({
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        distanceMeters: Math.round(distanceMeters),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not verify your location';
      Alert.alert('Location check failed', message);
    } finally {
      setWaitingBusyByTrip(prev => ({ ...prev, [tripId]: false }));
    }
  };

  const handleAddFavorite = (stop: string) => {
    if (favoriteStops.length >= maxFavoriteStops) {
      return;
    }
    setFavoriteStops(current => [...current, stop]);
    setFavoriteSearch('');
    setShowFavoritePicker(false);
    setFavoriteRemoveMode(false);
  };

  const handleRemoveFavorite = (stop: string) => {
    setFavoriteStops(current => current.filter(item => item !== stop));
    if (from === stop) setFrom('');
    if (to === stop) setTo('');
  };

  const handleSwapStops = () => {
    setFrom(to);
    setTo(from);
    setActiveStopField(current => (current === 'from' ? 'to' : 'from'));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadRoutes();
      if (userCoords) {
        await loadNearbyLiveTrips(userCoords, false);
      }
      if (activeRouteId) {
        await loadLiveStatus(activeRouteId, false);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const liveButtonScale = liveButtonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  const liveButtonGlowOpacity = liveButtonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.28],
  });

  const liveDotScale = liveButtonPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 28 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { void handleRefresh(); }}
          tintColor={palette.accent}
          colors={[palette.accent]}
          progressBackgroundColor={palette.surfaceStrong}
        />
      }
    >
      {/* Background decorations */}
      <View style={styles.bgRingLarge} pointerEvents="none" />
      <View style={styles.bgRingMedium} pointerEvents="none" />
      <View style={styles.bgGlow} pointerEvents="none" />
      {/* Hero */}
      <View
        style={[
          styles.heroBleed,
          suggestions.length > 0 && selectorRowHeight > 0 && styles.heroBleedWithSuggestions,
        ]}
      >
        <ImageBackground
          source={require('../assets/qfare-hero.png')}
          imageStyle={styles.heroImage}
          style={styles.heroCard}
        >
          <View style={styles.heroOverlay} />
          <View style={[styles.topBarOnHero, { paddingTop: heroTopInset }]}>
            <QfareLogo
              width={120}
              height={28}
              imageStyle={{ marginLeft: -18 }}
              containerStyle={{ marginLeft: 0 }}
            />
            <View style={styles.topBarRight}>
              <TouchableOpacity style={styles.iconPill}>
                <Ionicons name="notifications-outline" size={18} color="#10243c" />
              </TouchableOpacity>
              <View style={styles.avatarPill}>
                <Text style={styles.avatarText}>
                  {user?.name?.trim()?.[0]?.toUpperCase() || 'P'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Hello, {user?.name?.trim() || 'Passenger'}</Text>
            <Text style={styles.heroSubtitle}>Where would you like to go?</Text>
          </View>

          <View style={[styles.favoriteOverlayWrap, showFavoritePicker && styles.favoriteOverlayWrapOpen]}>
            <View style={styles.favoriteStrip}>
              <TouchableOpacity
                style={styles.compactAddFavoriteButton}
                onPress={() => {
                  setFavoriteSearch('');
                  setShowFavoritePicker(current => {
                    const nextOpen = !current;
                    setFavoriteRemoveMode(nextOpen);
                    return nextOpen;
                  });
                }}
              >
                <Ionicons
                  name={showFavoritePicker ? 'close-outline' : 'add-outline'}
                  size={14}
                  color={palette.ctaText}
                />
                <Text style={styles.compactAddFavoriteButtonText}>
                  {showFavoritePicker ? 'Close' : 'Favourites'}
                </Text>
              </TouchableOpacity>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.favoriteStripContent}
              >
                {favoriteStops.map(stop => {
                  const isFrom = from === stop;
                  const isTo = to === stop;
                  return (
                    <View key={stop} style={styles.favoriteChipWrap}>
                      <TouchableOpacity
                        style={[
                          styles.favoriteChip,
                          isFrom && styles.favoriteChipFrom,
                          isTo && styles.favoriteChipTo
                        ]}
                        onPress={() => {
                          if (favoriteRemoveMode) {
                            handleRemoveFavorite(stop);
                            return;
                          }
                          handleStopSelect(stop);
                        }}
                        onLongPress={() => setFavoriteRemoveMode(true)}
                        delayLongPress={250}
                      >
                        {isFrom && <Ionicons name="navigate" size={9} color={palette.accent} style={{ marginRight: 3 }} />}
                        {isTo && <Ionicons name="location" size={9} color={palette.blue} style={{ marginRight: 3 }} />}
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.favoriteChipText,
                            isFrom && styles.favoriteChipTextFrom,
                            isTo && styles.favoriteChipTextTo
                          ]}
                        >
                          {stop}
                        </Text>
                      </TouchableOpacity>
                      {favoriteRemoveMode && (
                        <Pressable
                          style={styles.removeFavoriteButton}
                          hitSlop={8}
                          onPress={() => handleRemoveFavorite(stop)}
                        >
                          <Text style={styles.removeFavoriteButtonText}>-</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {showFavoritePicker && (
              <View style={styles.favoritePickerCard}>
                <Text style={styles.favoritePickerTitle}>Add favourite stops</Text>
                <Text style={styles.favoritePickerHint}>
                  From all available routes · max {maxFavoriteStops}
                </Text>
                {favoriteStops.length < maxFavoriteStops ? (
                  <>
                    <View style={styles.favoriteSearchRow}>
                      <Ionicons name="search-outline" size={14} color={palette.textFaint} />
                      <TextInput
                        value={favoriteSearch}
                        onChangeText={setFavoriteSearch}
                        placeholder="Search stops"
                        placeholderTextColor={palette.textFaint}
                        style={styles.favoriteSearchInput}
                        autoCorrect={false}
                        autoCapitalize="words"
                      />
                      {favoriteSearch.trim() ? (
                        <TouchableOpacity onPress={() => setFavoriteSearch('')}>
                          <Ionicons name="close-circle" size={16} color={palette.textFaint} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={styles.favoritePickerSubhint}>
                      {favoriteSearch.trim()
                        ? 'Matching stops'
                        : `Showing ${Math.min(favoritePickerStops.length, favoritePickerPreviewCount)} suggested stops`}
                    </Text>
                    <ScrollView
                      style={styles.favoritePickerScroll}
                      contentContainerStyle={styles.favoritePickerScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      <View style={styles.favoriteChipsRow}>
                        {favoritePickerStops.length ? (
                          favoritePickerStops.map(stop => (
                            <TouchableOpacity
                              key={stop}
                              style={styles.favoritePickerChip}
                              onPress={event => {
                                event.stopPropagation();
                                handleAddFavorite(stop);
                              }}
                            >
                              <Ionicons name="add-outline" size={13} color={palette.accent} />
                              <Text style={styles.favoritePickerChipText}>{stop}</Text>
                            </TouchableOpacity>
                          ))
                        ) : (
                          <Text style={styles.hint}>
                            No stop names match "{favoriteSearch.trim()}".
                          </Text>
                        )}
                      </View>
                    </ScrollView>
                  </>
                ) : null}
                {favoriteStops.length >= maxFavoriteStops ? (
                  <Text style={styles.hint}>
                    {`You already have ${maxFavoriteStops} favourite stops. Remove one to add another.`}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.heroSearchWrap}>
            <View style={styles.stopSelectorWrapper}>
              <View
                style={styles.searchCard}
                onLayout={e => setSelectorRowHeight(e.nativeEvent.layout.height)}
              >
                <View style={styles.routesContainer}>
                  <View style={styles.routeLine}>
                    <View style={styles.lineColumn}>
                      <View style={styles.fromDot} />
                      <View style={styles.dashedLine} />
                    </View>
                    <View
                      style={[
                        styles.inputBox,
                        activeStopField === 'from' && styles.inputBoxActiveFrom,
                      ]}
                    >
                      <Text style={styles.inputLabel}>From</Text>
                      <TextInput
                        value={from}
                        onChangeText={value => {
                          setFrom(value);
                          setActiveStopField('from');
                        }}
                        onFocus={() => setActiveStopField('from')}
                        style={styles.input}
                        placeholder="Current Location"
                        placeholderTextColor={palette.textFaint}
                      />
                    </View>
                  </View>

                  <View style={styles.routeLine}>
                    <View style={styles.lineColumn}>
                      <View style={styles.toDotOuter}>
                        <View style={styles.toDotInner} />
                      </View>
                    </View>
                    <View
                      style={[
                        styles.inputBox,
                        styles.inputBoxTo,
                        activeStopField === 'to' && styles.inputBoxActiveTo,
                      ]}
                    >
                      <Text style={styles.inputLabel}>To</Text>
                      <TextInput
                        value={to}
                        onChangeText={value => { setTo(value); setActiveStopField('to'); }}
                        onFocus={() => setActiveStopField('to')}
                        style={styles.input}
                        placeholder="Select Destination"
                        placeholderTextColor={palette.textFaint}
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.swapButtonModern} onPress={handleSwapStops}>
                    <Ionicons name="swap-vertical" size={18} color={palette.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {suggestions.length > 0 && selectorRowHeight > 0 && (
                <View style={[styles.suggestionsCard, { top: selectorRowHeight + 6 }]}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    bounces={false}
                    showsVerticalScrollIndicator={false}
                  >
                    {suggestions.map((stop, idx) => {
                      const query = (activeStopField === 'from' ? from : to).trim().toLowerCase();
                      const matchIdx = stop.toLowerCase().indexOf(query);
                      const before = stop.slice(0, matchIdx);
                      const match = stop.slice(matchIdx, matchIdx + query.length);
                      const after = stop.slice(matchIdx + query.length);
                      const isFrom = activeStopField === 'from';
                      const hasCoords = liveRoute?.stops?.some(s => s.name.toLowerCase() === stop.toLowerCase() && s.latitude && s.longitude);
                      return (
                        <View
                          key={stop}
                          style={[
                            styles.suggestionItem,
                            idx < suggestions.length - 1 && styles.suggestionItemBorder,
                          ]}
                        >
                          <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                            onPress={() => handleStopSelect(stop)}
                            activeOpacity={0.65}
                          >
                            <Ionicons
                              name="location-outline"
                              size={13}
                              color={isFrom ? palette.accent : palette.blue}
                              style={{ marginTop: 1 }}
                            />
                            <Text style={styles.suggestionText} numberOfLines={1}>
                              {before}
                              <Text style={[styles.suggestionMatch, { color: isFrom ? palette.accent : palette.blue }]}>
                                {match}
                              </Text>
                              {after}
                            </Text>
                          </TouchableOpacity>
                          {hasCoords && (
                            <TouchableOpacity
                              onPress={() => navigateToStop(stop)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={styles.navigateBtn}
                            >
                              <Ionicons name="navigate-outline" size={14} color={palette.accent} />
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        </ImageBackground>
      </View>

      {shouldShowRouteResultsCard ? (
        <Pressable
          style={styles.card}
          onPress={() => {
            if (favoriteRemoveMode) setFavoriteRemoveMode(false);
          }}
        >
          {routesError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={14} color={palette.danger} />
              <Text style={styles.errorText}>{routesError}</Text>
            </View>
          )}
          {loadingRoutes && !routesError && (
            <View style={styles.hintRow}>
              <Ionicons name="time-outline" size={13} color={palette.textFaint} />
              <Text style={styles.hint}>Loading routes...</Text>
            </View>
          )}

          {/* Matching routes */}
          {matchingRoutePreviews.length > 0 ? (
            <View style={styles.routeList}>
              {matchingRoutePreviews.map(({ route, stops }) => (
                <Pressable
                  key={route.id}
                  style={styles.routeCard}
                  onPress={() => setSelectedRoutePreview({ route, stops })}
                >
                  <View style={styles.routeCardAccent} />
                  <View style={styles.routeCardBody}>
                    <View style={styles.routeTop}>
                      <View style={styles.routeTopLeft}>
                        <View style={styles.routeCodeBadge}>
                          <Text style={styles.routeCodeBadgeText}>{route.routeCode}</Text>
                        </View>
                        <Text style={styles.routePath}>
                          {route.source}{'  ->  '}{route.destination}
                        </Text>
                      </View>
                      <Animated.View
                        style={[
                          styles.liveButtonWrap,
                          {
                            opacity: liveButtonGlowOpacity,
                            transform: [{ scale: liveButtonScale }],
                          },
                        ]}
                      />
                      <TouchableOpacity
                        style={styles.liveButton}
                        onPress={() => {
                          setActiveRouteId(route.id);
                          void loadLiveStatus(route.id);
                        }}
                      >
                        <Animated.View style={[styles.liveDotSmall, { transform: [{ scale: liveDotScale }] }]} />
                        <Text style={styles.liveButtonText}>Live</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.routeName}>{route.routeName}</Text>
                    <Text style={styles.routeStops} numberOfLines={2}>
                      {stops.join('  ·  ')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : hasRouteSearch && !loadingRoutes && !routesError ? (
            <View style={[styles.emptyState, styles.routeEmptyState]}>
              <Ionicons name="search-outline" size={24} color={palette.textFaint} />
              <Text style={styles.emptyTitle}>No routes found</Text>
              <Text style={styles.emptyText}>
                No routes match the selected source and destination.
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {shouldShowNearbyLiveTrips ? (
        <View style={[styles.card, styles.bottomCard]}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionBar} />
            <Text style={styles.sectionTitle}>Live buses near you</Text>
            <Text style={styles.sectionMeta}>Within 5 km</Text>
          </View>

          {locationBootState === 'pending' || nearbyLiveLoading ? (
            <View style={styles.hintRow}>
              <Ionicons name="radio-outline" size={13} color={palette.textFaint} />
              <Text style={styles.hint}>
                {locationBootState === 'pending' ? 'Getting your current location...' : 'Finding nearby live buses...'}
              </Text>
            </View>
          ) : locationBootState === 'unavailable' ? (
            <View style={styles.emptyState}>
              <Ionicons name="location-outline" size={24} color={palette.textFaint} />
              <Text style={styles.emptyTitle}>Location unavailable</Text>
              <Text style={styles.emptyText}>Turn on location access to see live buses within 5 km of you.</Text>
            </View>
          ) : nearbyLiveError ? (
            <View style={styles.emptyState}>
              <Ionicons name="bus-outline" size={24} color={palette.textFaint} />
              <Text style={styles.emptyTitle}>Nearby live buses unavailable</Text>
              <Text style={styles.emptyText}>Live buses near your location could not be loaded right now.</Text>
            </View>
          ) : nearbyLiveTrips.length ? (
            <View style={styles.nearbyTripsList}>
              {nearbyLiveTrips.map(trip => (
                <TouchableOpacity
                  key={trip.tripId}
                  style={styles.nearbyTripCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    setActiveRouteId(trip.routeId);
                    void loadLiveStatus(trip.routeId);
                  }}
                >
                  <View style={styles.nearbyTripIconWrap}>
                    <Ionicons name="bus" size={28} color="#203d7a" />
                  </View>
                  <View style={styles.nearbyTripContent}>
                    <View style={styles.nearbyTripTopRow}>
                      <Text style={styles.nearbyTripBusNumber}>{trip.busNumber}</Text>
                      <View style={styles.nearbyTripEtaWrap}>
                        <Text style={styles.nearbyTripEtaValue}>{trip.minutesAway} min</Text>
                        <Text style={styles.nearbyTripEtaLabel}>Away</Text>
                      </View>
                    </View>
                    <Text style={styles.nearbyTripRoute} numberOfLines={1}>
                      {trip.source} {'->'} {trip.destination}
                    </Text>
                    <View style={styles.nearbyTripProgressRow}>
                      <View style={[styles.nearbyTripDot, styles.nearbyTripDotActive]} />
                      <View style={[styles.nearbyTripLine, styles.nearbyTripLineActive]} />
                      <View style={[styles.nearbyTripDot, styles.nearbyTripDotActive]} />
                      <View style={styles.nearbyTripLine} />
                      <View style={styles.nearbyTripDot} />
                      <View style={styles.nearbyTripLine} />
                      <View style={styles.nearbyTripDot} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="bus-outline" size={24} color={palette.textFaint} />
              <Text style={styles.emptyTitle}>No live buses nearby</Text>
              <Text style={styles.emptyText}>No active buses are currently within 5 km of your location.</Text>
            </View>
          )}
        </View>
      ) : null}

      <Modal
        visible={Boolean(selectedRoutePreview)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRoutePreview(null)}
      >
        <Pressable style={styles.routeModalBackdrop} onPress={() => setSelectedRoutePreview(null)}>
          <Pressable style={styles.routeModalCard} onPress={() => {}}>
            <View style={styles.routeModalHeader}>
              <View style={styles.routeModalTitleWrap}>
                <Text style={styles.routeModalTitle}>Route stops</Text>
                {selectedRoutePreview ? (
                  <Text style={styles.routeModalSubtitle}>
                    {selectedRoutePreview.route.routeCode} · {selectedRoutePreview.route.routeName}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setSelectedRoutePreview(null)} style={styles.routeModalClose}>
                <Ionicons name="close-outline" size={20} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.routeModalScroll} showsVerticalScrollIndicator={false}>
              {selectedRoutePreview?.stops.map((stop, index) => {
                const isLast = index === selectedRoutePreview.stops.length - 1;
                return (
                  <View key={`${stop}-${index}`} style={styles.routeModalStopRow}>
                    <View style={styles.routeModalRail}>
                      <View style={styles.routeModalStopDot} />
                      {!isLast ? <View style={styles.routeModalStopLine} /> : null}
                    </View>
                    <Text style={styles.routeModalStopText}>{stop}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(stopLandmarkPreview)}
        transparent
        animationType="fade"
        onRequestClose={() => setStopLandmarkPreview(null)}
      >
        <Pressable style={styles.routeModalBackdrop} onPress={() => setStopLandmarkPreview(null)}>
          <Pressable style={styles.routeModalCard} onPress={() => {}}>
            <View style={styles.routeModalHeader}>
              <View style={styles.routeModalTitleWrap}>
                <Text style={styles.routeModalTitle}>{stopLandmarkPreview?.name || 'Bus stop landmark'}</Text>
                <Text style={styles.routeModalSubtitle}>
                  Confirm the exact bus stop before notifying the crew.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStopLandmarkPreview(null)} style={styles.routeModalClose}>
                <Ionicons name="close-outline" size={20} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            {stopLandmarkPreview?.imageUrl ? (
              <Image
                source={{ uri: stopLandmarkPreview.imageUrl }}
                style={styles.stopLandmarkFullImage}
                resizeMode="contain"
              />
            ) : null}

            <TouchableOpacity
              style={[
                styles.navigatePromptButton,
                styles.stopLandmarkNavigateButton,
                (
                  !stopLandmarkPreview ||
                  typeof stopLandmarkPreview.latitude !== 'number' ||
                  typeof stopLandmarkPreview.longitude !== 'number'
                ) && styles.navigatePromptButtonDisabled,
              ]}
              onPress={() => {
                if (
                  stopLandmarkPreview &&
                  typeof stopLandmarkPreview.latitude === 'number' &&
                  typeof stopLandmarkPreview.longitude === 'number'
                ) {
                  navigateToCoordinates(stopLandmarkPreview.latitude, stopLandmarkPreview.longitude);
                }
                setStopLandmarkPreview(null);
              }}
              disabled={
                !stopLandmarkPreview ||
                typeof stopLandmarkPreview.latitude !== 'number' ||
                typeof stopLandmarkPreview.longitude !== 'number'
              }
            >
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={styles.navigatePromptButtonText}>Open Google navigation</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(stopNavigationPrompt)}
        transparent
        animationType="fade"
        onRequestClose={() => setStopNavigationPrompt(null)}
      >
        <Pressable style={styles.routeModalBackdrop} onPress={() => setStopNavigationPrompt(null)}>
          <Pressable style={styles.routeModalCard} onPress={() => {}}>
            <View style={styles.routeModalHeader}>
              <View style={styles.routeModalTitleWrap}>
                <Text style={styles.routeModalTitle}>Navigate to bus stop</Text>
                {stopNavigationPrompt ? (
                  <Text style={styles.routeModalSubtitle}>
                    You are about {stopNavigationPrompt.distanceMeters} meters away from {stopNavigationPrompt.name}.
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setStopNavigationPrompt(null)} style={styles.routeModalClose}>
                <Ionicons name="close-outline" size={20} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.navigatePromptText}>
              Move within 20 meters of the selected source stop to mark that you are waiting.
            </Text>

            <TouchableOpacity
              style={styles.navigatePromptButton}
              onPress={() => {
                if (!stopNavigationPrompt) return;
                navigateToCoordinates(stopNavigationPrompt.latitude, stopNavigationPrompt.longitude);
                setStopNavigationPrompt(null);
              }}
            >
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={styles.navigatePromptButtonText}>Open Google navigation</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(waitingDisclaimerPrompt)}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <Pressable style={styles.routeModalBackdrop}>
          <View style={styles.routeModalCard}>
            <View style={styles.routeModalHeader}>
              <View style={styles.routeModalTitleWrap}>
                <Text style={styles.routeModalTitle}>Important</Text>
              </View>
            </View>

            <Text style={styles.navigatePromptText}>
              Notifying the crew doesn’t guarantee the bus will wait—please reach on time.
            </Text>

            <TouchableOpacity
              style={styles.navigatePromptButton}
              onPress={() => { void acknowledgeWaitingDisclaimer(); }}
            >
              <Text style={styles.navigatePromptButtonText}>I Know</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Live buses */}
      {activeRouteId && (
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.livePulse, liveTrips.length > 0 && styles.livePulseActive]} />
            <Text style={styles.sectionTitle}>Live buses</Text>
            {liveRoute && <Text style={styles.sectionMeta}>{liveRoute.routeCode}</Text>}
          </View>
          {liveRoute && <Text style={styles.liveRouteName}>{liveRoute.routeName}</Text>}
          {liveLoading && (
            <View style={styles.hintRow}>
              <Ionicons name="radio-outline" size={13} color={palette.textFaint} />
              <Text style={styles.hint}>Fetching live status...</Text>
            </View>
          )}
          {liveError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={14} color={palette.danger} />
              <Text style={styles.errorText}>{liveError}</Text>
            </View>
          )}
          {!liveLoading && !liveError && liveTrips.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="bus-outline" size={28} color={palette.textFaint} />
              <Text style={styles.emptyTitle}>No active buses right now</Text>
              <Text style={styles.emptyText}>Check back closer to departure time.</Text>
            </View>
          )}
          {!liveLoading && !liveError && liveTrips.length > 0 && filteredLiveTrips.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="swap-horizontal-outline" size={28} color={palette.textFaint} />
              <Text style={styles.emptyTitle}>No buses in this direction</Text>
              <Text style={styles.emptyText}>
                No active buses heading {from.trim()} {'->'} {to.trim()} right now.
              </Text>
            </View>
          )}
          {filteredLiveTrips.map(trip => {
            const tripId = String(trip.id);
            const eta = tripEtas[tripId];
            const load = tripLoads[tripId] ?? null;
            const hasLocation = typeof trip.lastLatitude === 'number' && typeof trip.lastLongitude === 'number';
            const stops = liveRoute?.stops ?? [];
            const nearestStopInfo = hasLocation ? getTripNearestRouteStop(trip, stops) : null;
            const currentStop = nearestStopInfo
              ? {
                  name: nearestStopInfo.routeStop.name,
                  distanceKm: resolveCurrentStop(trip.lastLatitude as number, trip.lastLongitude as number, stops, trip.direction)?.distanceKm ?? 0,
                  status: nearestStopInfo.status,
                }
              : null;
            const dirLabel = trip.direction === 'UP'
              ? `${liveRoute?.source ?? ''}  ->  ${liveRoute?.destination ?? ''}`
              : `${liveRoute?.destination ?? ''}  ->  ${liveRoute?.source ?? ''}`;
            const isExpanded = expandedTrips[tripId] ?? false;
            const waitingStatus = waitingStatusByTrip[tripId];
            const waitingBusy = waitingBusyByTrip[tripId] ?? false;
            const selectedStop = from.trim();
            const selectedRouteStop = liveRoute?.stops?.find(
              stop => normalizeStopName(stop.name) === normalizeStopName(selectedStop)
            ) ?? null;
            const progress = getTripProgressState(trip, stops, selectedStop, trip.direction);
            const crossedBoardingStop = progress.crossedSelectedStop;
            const stopLandmarkImageUrl = selectedRouteStop?.landmarkImageUrl?.trim() || '';
            const alreadyNotifiedSelectedStop =
              Boolean(waitingStatus?.stopName) &&
              String(waitingStatus?.stopName).trim().toLowerCase() === selectedStop.toLowerCase();
            const waitingActionDisabled = waitingBusy || crossedBoardingStop;
            const toggleExpanded = () => {
              if (!isExpanded && token && waitingStatusByTrip[tripId] === undefined) {
                void fetchWaitingStatusForTrip(tripId);
              }
              setExpandedTrips(prev => ({ ...prev, [tripId]: !prev[tripId] }));
            };

            // Collapsed summary: ETA pill when user has a from-stop, else direction
            const collapsedEtaLabel = from.trim()
              ? eta
                ? eta.text
                : hasLocation
                  ? 'Calculating...'
                  : null
              : null;

            const busRegion = hasLocation ? {
              latitude: trip.lastLatitude as number,
              longitude: trip.lastLongitude as number,
              latitudeDelta: 0.012,
              longitudeDelta: 0.012,
            } : null;

            return (
              <View key={tripId} style={styles.liveTripCard}>
                {/* Tappable header */}
                <TouchableOpacity
                  style={styles.liveTripHeader}
                  onPress={toggleExpanded}
                  activeOpacity={0.7}
                >
                  <View style={styles.liveBusBadge}>
                    <Ionicons name="bus-outline" size={13} color={palette.accent} />
                    <Text style={styles.liveBus}>{trip.bus.busNumber || 'Bus'}</Text>
                  </View>

                  {/* Collapsed: ETA to user's stop, or direction when no from-stop */}
                  {!isExpanded && collapsedEtaLabel ? (
                    <View style={styles.collapsedEtaPill}>
                      <Ionicons name="timer-outline" size={12} color={eta ? palette.accent : palette.textFaint} />
                      <Text style={[styles.collapsedEtaText, !eta && { color: palette.textFaint }]}>
                        {collapsedEtaLabel}
                      </Text>
                      {eta && <Text style={styles.collapsedEtaStop}>· {from.trim()}</Text>}
                    </View>
                  ) : (
                    <Text style={styles.liveDirectionLabel} numberOfLines={1}>{dirLabel}</Text>
                  )}

                  <Ionicons
                    name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={16}
                    color={palette.textMuted}
                  />
                </TouchableOpacity>

                {/* Expanded body */}
                {isExpanded && (
                  <>
                    {/* Direction row */}
                    <View style={styles.expandedDirRow}>
                      <Ionicons name="arrow-forward-outline" size={12} color={palette.textFaint} />
                      <Text style={styles.expandedDirText}>{dirLabel}</Text>
                    </View>

                    {/* Per-bus map - OpenStreetMap tiles (no CDN dependency) */}
                    {busRegion && (() => {
                      const lat = Number(trip.lastLatitude);
                      const lng = Number(trip.lastLongitude);
                      const busLabel = (trip.bus.busNumber || 'Bus').replace(/['"\\]/g, '');
                      const mapHtml = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#aad3df}
#map{width:100%;height:100%;position:relative;overflow:hidden}
img.tile{position:absolute;width:256px;height:256px;display:block}
#marker{position:absolute;z-index:999;width:40px;height:40px;transform:translate(-50%,-50%);background:#1B9AAA;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,0.4)}
#label{position:absolute;z-index:998;background:rgba(0,0,0,0.7);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;white-space:nowrap;transform:translate(-50%,14px)}
</style></head><body><div id="map"></div>
<script>
var lat=${lat},lng=${lng},zoom=15;
function lat2y(la){return Math.floor((1-Math.log(Math.tan(la*Math.PI/180)+1/Math.cos(la*Math.PI/180))/Math.PI)/2*Math.pow(2,zoom));}
function lng2x(lo){return Math.floor((lo+180)/360*Math.pow(2,zoom));}
var W=window.innerWidth,H=window.innerHeight;
var cx=lng2x(lng),cy=lat2y(lat);
var map=document.getElementById('map');
for(var dx=-3;dx<=3;dx++){for(var dy=-3;dy<=3;dy++){
  var img=document.createElement('img');
  img.className='tile';
  var s=['a','b','c'][Math.abs(cx+dx+cy+dy)%3];
  img.src='https://'+s+'.tile.openstreetmap.org/'+zoom+'/'+(cx+dx)+'/'+(cy+dy)+'.png';
  img.style.left=(W/2+(dx-0.5)*256)+'px';
  img.style.top=(H/2+(dy-0.5)*256)+'px';
  map.appendChild(img);
}}
var m=document.createElement('div');m.id='marker';m.innerHTML='BUS';
m.style.left=W/2+'px';m.style.top=H/2+'px';map.appendChild(m);
var lb=document.createElement('div');lb.id='label';lb.innerText='${busLabel}';
lb.style.left=W/2+'px';lb.style.top=H/2+'px';map.appendChild(lb);
</script></body></html>`;
                      return (
                        <WebView
                          style={styles.liveMap}
                          originWhitelist={['*']}
                          javaScriptEnabled
                          domStorageEnabled
                          source={{ html: mapHtml }}
                        />
                      );
                    })()}

                    {/* Current stop / location block */}
                    {hasLocation ? (
                      <View style={[
                        styles.busLocationBlock,
                        currentStop?.status === 'at' && styles.busLocationBlockAt
                      ]}>
                        <View style={styles.busLocationIconCol}>
                          <Ionicons
                            name={currentStop?.status === 'at' ? 'radio-button-on' : 'navigate'}
                            size={16}
                            color={currentStop?.status === 'at' ? palette.accent : palette.gold}
                          />
                        </View>
                        <View style={styles.busLocationTextCol}>
                          {currentStop ? (
                            <>
                              <Text style={[
                                styles.busLocationStopName,
                                currentStop.status === 'at' && { color: palette.accent }
                              ]}>
                                {currentStop.status === 'at' ? `At ${currentStop.name}` : `Near ${currentStop.name}`}
                              </Text>
                              {currentStop.status !== 'at' && (
                                <Text style={styles.busLocationSub}>
                                  {currentStop.distanceKm} km from stop
                                  {(trip.lastLocationName || tripLocationNames[tripId]) &&
                                    ` · ${trip.lastLocationName || tripLocationNames[tripId]}`}
                                </Text>
                              )}
                            </>
                          ) : (
                            <>
                              <Text style={styles.busLocationStopName}>
                                {trip.lastLocationName || tripLocationNames[tripId] || 'Locating...'}
                              </Text>
                              <Text style={styles.busLocationSub}>No stop lat/lng configured yet</Text>
                            </>
                          )}
                        </View>
                      </View>
                    ) : (
                      <View style={styles.busLocationBlockOffline}>
                        <Ionicons name="location-outline" size={14} color={palette.textFaint} />
                        <Text style={styles.busLocationOfflineText}>Location unavailable</Text>
                      </View>
                    )}

                    {/* Approaching stop banner */}
                    {trip.approachingStop && (
                      <View style={styles.approachingBanner}>
                        <Ionicons name="navigate" size={14} color={palette.accent} />
                        <Text style={styles.approachingText}>
                          Approaching {trip.approachingStop}
                        </Text>
                      </View>
                    )}

                    {crossedBoardingStop && (
                      <View style={styles.approachingBanner}>
                        <Ionicons name="alert-circle-outline" size={14} color={palette.gold} />
                        <Text style={styles.approachingText}>
                          Bus has crossed your boarding stop
                        </Text>
                      </View>
                    )}

                    {/* Full ETA banner */}
                    {from.trim() && hasLocation && (
                      <View style={eta ? styles.etaBanner : styles.etaBannerPending}>
                        <Ionicons
                          name={eta ? 'timer-outline' : 'time-outline'}
                          size={14}
                          color={eta ? palette.accent : palette.textFaint}
                        />
                        <View style={styles.etaContent}>
                          <Text style={eta ? styles.etaText : styles.etaTextPending}>
                            {eta ? eta.text : 'Calculating ETA...'}
                          </Text>
                          {eta && (
                            <Text style={styles.etaSubText}>
                              to {from.trim()} · {eta.distanceKm} km
                              {eta.source === 'haversine' ? ' (est.)' : ''}
                            </Text>
                          )}
                        </View>
                        {(() => {
                          const fromStop = liveRoute?.stops?.find(s => s.name.toLowerCase() === from.trim().toLowerCase() && s.latitude && s.longitude);
                          if (!fromStop) return null;
                          return (
                            <TouchableOpacity
                              onPress={() => navigateToStop(from.trim())}
                              style={styles.etaNavigateBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="navigate" size={16} color={palette.accent} />
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                    )}

                    {from.trim() && hasLocation && (
                      <View style={styles.waitingBanner}>
                        <View style={styles.waitingBannerTop}>
                          <View style={styles.waitingCopy}>
                            <Text style={styles.waitingTitle}>Waiting at {selectedStop}</Text>
                            <Text style={styles.waitingText}>
                              {crossedBoardingStop
                                ? `Currently near ${currentStop?.name || 'the next stop'}`
                                : alreadyNotifiedSelectedStop
                                ? 'Driver and conductor have your stop.'
                                : waitingStatus?.stopName
                                  ? `Current alert: ${waitingStatus.stopName}`
                                  : 'Notify the crew that you are waiting at this stop.'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.waitingButton,
                              crossedBoardingStop && styles.waitingButtonDisabled,
                              alreadyNotifiedSelectedStop && styles.waitingButtonActive,
                              waitingActionDisabled && styles.waitingButtonDisabled,
                            ]}
                            onPress={() => { void handleWaitingAction(tripId, selectedStop); }}
                            disabled={waitingActionDisabled}
                          >
                            <Text
                              style={[
                                styles.waitingButtonText,
                                crossedBoardingStop && styles.waitingButtonTextDisabled,
                                alreadyNotifiedSelectedStop && styles.waitingButtonTextActive,
                              ]}
                            >
                              {crossedBoardingStop
                                ? 'Stop crossed'
                                : waitingBusy
                                ? 'Sending...'
                                : alreadyNotifiedSelectedStop
                                  ? 'Notified'
                                  : waitingStatus?.stopName
                                    ? 'Update stop'
                                    : 'Notify crew'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {stopLandmarkImageUrl ? (
                          <TouchableOpacity
                            style={styles.stopLandmarkThumbWrap}
                            activeOpacity={0.85}
                            onPress={() => {
                              setStopLandmarkPreview({
                                name: selectedRouteStop?.name || selectedStop,
                                imageUrl: stopLandmarkImageUrl,
                                latitude: selectedRouteStop?.latitude ?? null,
                                longitude: selectedRouteStop?.longitude ?? null,
                              });
                            }}
                          >
                            <Image
                              source={{ uri: stopLandmarkImageUrl }}
                              style={styles.stopLandmarkThumb}
                              resizeMode="cover"
                            />
                            <View style={styles.stopLandmarkThumbMeta}>
                              <Text style={styles.stopLandmarkThumbTitle}>Bus stop landmark</Text>
                              <Text style={styles.stopLandmarkThumbText}>
                                Tap to view the exact stop image.
                              </Text>
                            </View>
                            <Ionicons name="expand-outline" size={18} color={palette.blue} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}

                    {/* Bus load indicator */}
                    {load ? (() => {
                      const isUnavailable = load.status === 'unavailable';
                      const cfg = loadConfig(load.status);
                      return (
                        <View style={[styles.loadBanner, { backgroundColor: cfg.bg }]}>
                          <View style={styles.loadBannerLeft}>
                            <Ionicons name={cfg.icon} size={15} color={cfg.color} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.loadStatusText, { color: cfg.color }]}>
                                {isUnavailable ? 'Bus Load' : cfg.label}
                              </Text>
                              <Text style={styles.loadSubText}>
                                {isUnavailable
                                  ? load.totalBooked > 0
                                    ? `${load.totalBooked} ticket${load.totalBooked !== 1 ? 's' : ''} booked · live tracking needs stop coordinates`
                                    : 'No tickets booked yet'
                                  : load.onboard !== null
                                    ? load.capacity > 0
                                      ? `${load.onboard} / ${load.capacity} seats occupied`
                                      : `${load.onboard} passengers onboard`
                                    : 'Estimating...'}
                              </Text>
                            </View>
                          </View>
                          {!isUnavailable && load.capacity > 0 && load.loadPercent !== null ? (
                            <View style={styles.loadBarWrap}>
                              <View style={styles.loadBarTrack}>
                                <View style={[
                                  styles.loadBarFill,
                                  {
                                    width: `${Math.min(load.loadPercent, 100)}%` as any,
                                    backgroundColor: cfg.color,
                                  }
                                ]} />
                              </View>
                              <Text style={[styles.loadPercent, { color: cfg.color }]}>
                                {load.loadPercent}%
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })() : null}

                    {/* Updated timestamp */}
                    <View style={[styles.liveMetaItem, { marginTop: 8 }]}>
                      <Ionicons name="refresh-outline" size={12} color={staleColor(trip.lastLocationAt)} />
                      <Text style={[styles.liveMeta, { color: staleColor(trip.lastLocationAt) }]}>
                        {formatUpdated(trip.lastLocationAt)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}

    </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 32 },

  // Background decorations
  bgRingLarge: {
    position: 'absolute', top: -140, left: -100, width: 500, height: 500, borderRadius: 250,
    borderWidth: 1, borderColor: 'rgba(68, 153, 255, 0.07)'
  },
  bgRingMedium: {
    position: 'absolute', top: -70, left: -30, width: 360, height: 360, borderRadius: 180,
    borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.05)'
  },
  bgGlow: {
    position: 'absolute', top: -100, left: -70, width: 340, height: 340, borderRadius: 170,
    backgroundColor: 'rgba(0, 200, 150, 0.05)'
  },
  // Header on hero
  topBarOnHero: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24
  },
  brandPill: {
    backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: 1, borderColor: 'rgba(16,36,60,0.10)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 1
  },
  brandQ: { color: palette.accent, fontSize: 20, fontWeight: '900' },
  brandFare: { color: '#10243c', fontSize: 20, fontWeight: '900' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconPill: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1, borderColor: 'rgba(16,36,60,0.10)', alignItems: 'center', justifyContent: 'center'
  },
  avatarPill: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(0, 200, 150, 0.88)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)'
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Hero
  heroBleed: {
    marginLeft: -20,
    marginRight: -20,
    marginBottom: 18,
    zIndex: 20,
  },
  heroBleedWithSuggestions: {
    marginBottom: 220,
  },
  heroCard: {
    minHeight: 356,
    borderRadius: 0,
    overflow: 'visible',
    justifyContent: 'space-between',
  },
  heroImage: {
    resizeMode: 'cover',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  heroCopy: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 12 },
  heroTitle: {
    color: '#10243c',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    color: 'rgba(16,36,60,0.78)',
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: '82%',
    fontWeight: '600',
  },
  heroSearchWrap: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 25,
  },

  // Card base
  card: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 24, padding: 18, marginBottom: 16,
    shadowColor: '#a9c0d8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  bottomCard: { marginBottom: 0 },

  // Section headers
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: palette.accent },
  sectionBarBlue: { width: 3, height: 18, borderRadius: 2, backgroundColor: palette.blue },
  sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  sectionMeta: { marginLeft: 'auto', color: palette.textFaint, fontSize: 12, fontWeight: '600' },

  // Stop selectors
  stopSelectorWrapper: { position: 'relative', zIndex: 10 },
  searchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(16,36,60,0.12)',
    padding: 14,
    marginBottom: 2,
    shadowColor: '#8eb4d7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 6,
  },
  routesContainer: {
    position: 'relative',
    paddingRight: 48,
    gap: 10,
  },
  routeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lineColumn: {
    width: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  fromDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.accent,
    marginTop: 18,
  },
  dashedLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: -8,
    backgroundColor: 'rgba(167, 182, 200, 0.7)',
  },
  toDotOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  toDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.accent,
  },
  inputBox: {
    flex: 1,
    backgroundColor: '#fbfdff',
    borderWidth: 1,
    borderColor: 'rgba(16,36,60,0.16)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 60,
  },
  inputBoxTo: {
    backgroundColor: '#fbfdff',
    borderColor: 'rgba(16,36,60,0.16)',
  },
  inputBoxActiveFrom: {
    borderColor: 'rgba(0, 200, 150, 0.40)',
    backgroundColor: 'rgba(0, 200, 150, 0.06)',
  },
  inputBoxActiveTo: {
    borderColor: 'rgba(68, 153, 255, 0.40)',
    backgroundColor: 'rgba(68, 153, 255, 0.06)',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textFaint,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 15,
    fontWeight: '800',
    color: palette.text,
    minHeight: 22,
  },
  swapButtonModern: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#9cb8d6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },

  // Autocomplete suggestions — absolute dropdown
  suggestionsCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    maxHeight: 224,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    zIndex: 50,
    elevation: 12,
    shadowColor: '#8faecc',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  suggestionItemBorder: {
    borderBottomWidth: 1, borderBottomColor: palette.border,
  },
  suggestionText: { flex: 1, color: palette.textMuted, fontSize: 13.5, fontWeight: '600' },
  suggestionMatch: { fontWeight: '800' },
  navigateBtn: {
    padding: 6, borderRadius: 8, backgroundColor: palette.card, marginLeft: 4,
  },

  // Favourites
  favoriteOverlayWrap: {
    position: 'relative',
    zIndex: 30,
    marginBottom: 16,
  },
  favoriteOverlayWrapOpen: {
    paddingBottom: 290,
  },
  favoriteStrip: {
    marginTop: -4,
    marginBottom: 0,
    marginLeft: -20,
    marginRight: -20,
    paddingLeft: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  favoriteStripContent: {
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 2,
    gap: 6,
    alignItems: 'center',
  },
  compactAddFavoriteButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: palette.ctaSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#a8bfd7',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  compactAddFavoriteButtonText: { color: palette.ctaText, fontSize: 11.5, fontWeight: '700' },
  favoritesHeader: {
    marginTop: 16, marginBottom: 12, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', gap: 10
  },
  favoriteHint: { flex: 1, color: palette.textMuted, fontSize: 12.5 },
  addFavoriteButton: {
    backgroundColor: palette.cta, borderWidth: 1, borderColor: palette.ctaSoft,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 5
  },
  addFavoriteButtonDisabled: { opacity: 0.5 },
  addFavoriteButtonText: { color: palette.ctaText, fontSize: 12, fontWeight: '700' },
  favoriteChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  favoriteChipWrap: {
    position: 'relative',
    paddingTop: 4,
    paddingRight: 6,
  },
  favoriteChip: {
    backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: 1, borderColor: palette.border,
    borderRadius: 999, paddingLeft: 10, paddingRight: 10, paddingVertical: 6,
    position: 'relative', flexDirection: 'row', alignItems: 'center',
  },
  favoriteChipFrom: { backgroundColor: palette.accent, borderColor: palette.accent },
  favoriteChipTo: { backgroundColor: palette.blue, borderColor: palette.blue },
  favoriteChipText: { color: palette.textMuted, fontSize: 11.5, fontWeight: '700' },
  favoriteChipTextFrom: { color: '#ffffff' },
  favoriteChipTextTo: { color: '#ffffff' },
  removeFavoriteButton: {
    position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#c53b4a', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 2,
  },
  removeFavoriteButtonText: { color: '#ffffff', fontSize: 16, lineHeight: 17, fontWeight: '800' },
  favoritePickerCard: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    marginTop: 10,
    marginBottom: 0,
    backgroundColor: palette.surfaceStrong, borderWidth: 1,
    borderColor: palette.border, borderRadius: 18, padding: 14,
    zIndex: 40, elevation: 12,
    shadowColor: '#8faecc',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
  },
  favoritePickerTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
  favoritePickerHint: { color: palette.textMuted, fontSize: 12, marginTop: 3, marginBottom: 12 },
  favoriteSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10
  },
  favoriteSearchInput: {
    flex: 1, color: palette.text, paddingHorizontal: 0, paddingVertical: 0, fontSize: 13.5, fontWeight: '600'
  },
  favoritePickerSubhint: { color: palette.textFaint, fontSize: 11.5, marginBottom: 10 },
  favoritePickerScroll: { maxHeight: 260 },
  favoritePickerScrollContent: { paddingBottom: 4 },
  favoritePickerChip: {
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 5
  },
  favoritePickerChipText: { color: palette.text, fontSize: 12.5, fontWeight: '600' },

  routeModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.18)', padding: 20, justifyContent: 'center'
  },
  routeModalCard: {
    maxHeight: '72%', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 24, padding: 18
  },
  routeModalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14
  },
  routeModalTitleWrap: { flex: 1 },
  routeModalTitle: { color: palette.text, fontSize: 18, fontWeight: '800' },
  routeModalSubtitle: { color: palette.textMuted, fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  routeModalClose: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border
  },
  routeModalScroll: { maxHeight: 420 },
  routeModalStopRow: { flexDirection: 'row', gap: 12, minHeight: 36 },
  routeModalRail: { width: 16, alignItems: 'center' },
  routeModalStopDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent, marginTop: 4
  },
  routeModalStopLine: {
    width: 2, flex: 1, marginTop: 4, marginBottom: -4, backgroundColor: 'rgba(0, 200, 150, 0.22)'
  },
  routeModalStopText: { flex: 1, color: palette.text, fontSize: 14, fontWeight: '600', paddingBottom: 14 },
  navigatePromptText: { color: palette.textMuted, fontSize: 13.5, lineHeight: 20, marginBottom: 18 },
  navigatePromptButton: {
    backgroundColor: palette.accent, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8
  },
  navigatePromptButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  navigatePromptButtonDisabled: { opacity: 0.5 },

  // Route list
  routeList: { marginTop: 14, gap: 12 },
  routeCard: {
    backgroundColor: palette.surfaceStrong, borderRadius: 18, borderWidth: 1,
    borderColor: palette.border, overflow: 'hidden',
    shadowColor: '#a8bfd7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  routeCardAccent: { height: 2, backgroundColor: palette.blue },
  routeCardBody: { padding: 16 },
  routeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  routeTopLeft: { flex: 1, gap: 6 },
  routeCodeBadge: {
    alignSelf: 'flex-start', backgroundColor: palette.blueSoft, borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.30)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4
  },
  routeCodeBadgeText: { color: palette.blue, fontSize: 13, fontWeight: '800' },
  routePath: { color: palette.textMuted, fontSize: 12.5, fontWeight: '600' },
  routeName: { color: palette.text, marginTop: 8, fontWeight: '700', fontSize: 13.5 },
  liveButtonWrap: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    borderRadius: 20, backgroundColor: palette.accent
  },
  liveButton: {
    backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.28)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    position: 'relative'
  },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  liveButtonText: { color: palette.accent, fontSize: 12, fontWeight: '700' },
  routeStops: { color: palette.textFaint, marginTop: 6, lineHeight: 18, fontSize: 12 },
  nearbyTripsList: { gap: 12 },
  nearbyTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16, 36, 60, 0.10)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#a7bdd5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 4,
  },
  nearbyTripIconWrap: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyTripContent: { flex: 1 },
  nearbyTripTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  nearbyTripBusNumber: {
    color: '#10243c',
    fontSize: 23,
    fontWeight: '800',
  },
  nearbyTripEtaWrap: {
    alignItems: 'flex-end',
    minWidth: 62,
  },
  nearbyTripEtaValue: {
    color: '#1ca36c',
    fontSize: 16,
    fontWeight: '800',
  },
  nearbyTripEtaLabel: {
    color: '#203d7a',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  nearbyTripRoute: {
    color: '#364a67',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  nearbyTripProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  nearbyTripDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#aab5c4',
  },
  nearbyTripDotActive: {
    backgroundColor: '#15955f',
  },
  nearbyTripLine: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#cbd4df',
    marginHorizontal: 4,
  },
  nearbyTripLineActive: {
    backgroundColor: '#15955f',
  },

  // Live section
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.textFaint },
  livePulseActive: { backgroundColor: palette.accent },
  liveRouteName: { color: palette.textMuted, marginBottom: 12, fontSize: 13 },
  emptyState: {
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    borderRadius: 16, padding: 20, alignItems: 'center', gap: 8,
    shadowColor: '#b1c7dc',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 4,
  },
  routeEmptyState: { marginTop: 14 },
  emptyTitle: { color: palette.textMuted, fontSize: 14, fontWeight: '700' },
  emptyText: { color: palette.textFaint, fontSize: 12, textAlign: 'center' },
  liveMap: {
    height: 230, borderRadius: 16, overflow: 'hidden', marginTop: 6,
    borderWidth: 1, borderColor: palette.border, marginBottom: 10
  },
  liveTripCard: {
    backgroundColor: palette.surfaceStrong, borderRadius: 18, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: palette.border,
    shadowColor: '#a8bfd7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  liveTripHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveBusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveBus: { color: palette.text, fontWeight: '800', fontSize: 14 },
  liveDirectionLabel: { flex: 1, color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  liveMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveMeta: { color: palette.textMuted, fontSize: 12.5 },

  // Collapsed ETA pill
  collapsedEtaPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  collapsedEtaText: { color: palette.accent, fontSize: 13, fontWeight: '800' },
  collapsedEtaStop: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },

  // Expanded direction sub-row
  expandedDirRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6, marginBottom: 10,
  },
  expandedDirText: { color: palette.textFaint, fontSize: 12 },

  // Bus current location block
  busLocationBlock: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10, marginBottom: 10,
    backgroundColor: 'rgba(255, 200, 60, 0.07)', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255, 200, 60, 0.20)'
  },
  busLocationBlockAt: {
    backgroundColor: palette.accentSoft, borderColor: 'rgba(0, 200, 150, 0.28)'
  },
  busLocationBlockOffline: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, marginBottom: 10,
    backgroundColor: palette.surfaceMuted, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: palette.border
  },
  busLocationOfflineText: { color: palette.textFaint, fontSize: 12.5 },
  busLocationIconCol: { marginTop: 1 },
  busLocationTextCol: { flex: 1 },
  busLocationStopName: { color: palette.text, fontSize: 13.5, fontWeight: '800' },
  busLocationSub: { color: palette.textMuted, fontSize: 11.5, marginTop: 2 },

  // Approaching stop banner
  approachingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8,
    backgroundColor: 'rgba(0, 200, 150, 0.10)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.30)',
  },
  approachingText: {
    color: palette.accent, fontSize: 12.5, fontWeight: '700', flex: 1,
  },

  // ETA styles
  etaBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10,
    backgroundColor: palette.accentSoft, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.25)'
  },
  etaBannerPending: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
    backgroundColor: 'rgba(237, 245, 255, 0.04)', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: palette.border
  },
  etaContent: { flex: 1 },
  etaNavigateBtn: {
    padding: 7, borderRadius: 20, backgroundColor: 'rgba(0,200,150,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  etaText: { color: palette.accent, fontSize: 13.5, fontWeight: '800' },
  etaTextPending: { color: palette.textFaint, fontSize: 12.5 },
  etaSubText: { color: palette.textMuted, fontSize: 11.5, marginTop: 2 },
  waitingBanner: {
    marginBottom: 10,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.28)',
    backgroundColor: 'rgba(41, 125, 224, 0.10)',
  },
  waitingBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waitingCopy: { flex: 1 },
  waitingTitle: { color: palette.blue, fontSize: 13, fontWeight: '800' },
  waitingText: { color: palette.textMuted, fontSize: 11.5, marginTop: 3 },
  stopLandmarkThumbWrap: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.24)',
    backgroundColor: 'rgba(41, 125, 224, 0.08)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stopLandmarkThumb: {
    width: 62,
    height: 62,
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
  },
  stopLandmarkThumbMeta: { flex: 1 },
  stopLandmarkThumbTitle: { color: palette.text, fontSize: 12.5, fontWeight: '800' },
  stopLandmarkThumbText: { color: palette.textMuted, fontSize: 11.5, marginTop: 3, lineHeight: 16 },
  waitingButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.32)',
    backgroundColor: 'rgba(41, 125, 224, 0.08)',
  },
  waitingButtonActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  waitingButtonDisabled: { opacity: 0.7 },
  waitingButtonText: { color: palette.blue, fontSize: 12, fontWeight: '800' },
  waitingButtonTextDisabled: { color: palette.textFaint },
  waitingButtonTextActive: { color: '#fff' },
  stopLandmarkFullImage: {
    width: '100%',
    height: 320,
    borderRadius: 18,
    backgroundColor: palette.surfaceStrong,
    marginBottom: 16,
  },
  stopLandmarkNavigateButton: {
    opacity: 1,
  },

  // Bus load banner
  loadBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 10, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: palette.border,
  },
  loadBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  loadStatusText: { fontSize: 13, fontWeight: '800' },
  loadSubText: { color: palette.textFaint, fontSize: 11.5, marginTop: 1 },
  loadBarWrap: { alignItems: 'flex-end', gap: 3, minWidth: 64 },
  loadBarTrack: {
    width: 60, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(16, 36, 60, 0.10)', overflow: 'hidden',
  },
  loadBarFill: { height: '100%', borderRadius: 3 },
  loadPercent: { fontSize: 11, fontWeight: '800' },

  // Utility
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  hint: { color: palette.textMuted, fontSize: 13 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10,
    backgroundColor: palette.dangerBg, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255, 143, 163, 0.20)'
  },
  errorText: { color: palette.danger, fontSize: 13, flex: 1 }
});

export default HomeScreen;
