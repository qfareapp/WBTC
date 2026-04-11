import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';
import { palette } from '../lib/theme';

const WAITING_DISCLAIMER_ACK_KEY = 'passenger_waiting_disclaimer_ack';
const today = (() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
})();
const SLIDER_WIDTH = Dimensions.get('window').width - 40;

const BANNER_SLIDES = [
  {
    key: 'hero',
    eyebrow: 'Unreserved made easy',
    title: 'Scan. Pay.\nRide.',
    subtitle: 'Board any bus, scan its QR and get a digital ticket instantly - no queue.',
    accentKey: 'accent' as const,
    cta: null,
  },
  {
    key: 'scan',
    eyebrow: 'Unreserved Bus Ticketing',
    title: 'Board any bus\ninstantly.',
    subtitle: 'Open the QR scanner, hop on any supported qfare bus and pay in seconds.',
    accentKey: 'blue' as const,
    cta: { label: 'Open QR Scanner', icon: 'qr-code-outline', screen: 'Scan' },
  },
  {
    key: 'live',
    eyebrow: 'Real-time tracking',
    title: 'Track your\nbus live.',
    subtitle: 'See exactly where your bus is right now - position updated every 5 seconds.',
    accentKey: 'gold' as const,
    cta: null,
  },
];

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

const getWaitingDisclaimerStorageKey = (userId: string) =>
  `${WAITING_DISCLAIMER_ACK_KEY}:${userId}`;

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { token, user } = useAuth();
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
  const [showHowItWorks, setShowHowItWorks] = useState(false);
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
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectorRowHeight, setSelectorRowHeight] = useState(0);
  const sliderRef = useRef<FlatList>(null);
  const liveButtonPulse = useRef(new Animated.Value(0)).current;

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
    const timer = setInterval(() => {
      setActiveSlide(prev => {
        const next = (prev + 1) % BANNER_SLIDES.length;
        sliderRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
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
      if (trip.direction !== wantedDirection) {
        return false;
      }

      const passedSelectedStop = trip.passedStops.some(stop => normalizeStopName(stop) === fromNorm);
      const nearestStop = getTripNearestRouteStop(trip, liveRoute.stops);
      const approachingSelectedStop = normalizeStopName(trip.approachingStop ?? '') === fromNorm;

      if (nearestStop) {
        const currentIndex = nearestStop.routeStop.index;
        const atSelectedStop = currentIndex === fromStop.index && nearestStop.status === 'at';

        if (atSelectedStop) {
          return true;
        }

        if (passedSelectedStop) {
          return false;
        }

        if (wantedDirection === 'UP') {
          return currentIndex < fromStop.index || approachingSelectedStop;
        }

        return currentIndex > fromStop.index || approachingSelectedStop;
      }

      if (passedSelectedStop) {
        return false;
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
      setShowFavoritePicker(false);
      return;
    }
    setFavoriteStops(current => [...current, stop]);
    setFavoriteSearch('');
    setShowFavoritePicker(false);
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
      contentContainerStyle={styles.content}
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

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.brandPill}>
          <Text style={styles.brandQ}>q</Text>
          <Text style={styles.brandFare}>fare</Text>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.iconPill}>
            <Ionicons name="notifications-outline" size={18} color={palette.textMuted} />
          </TouchableOpacity>
          <View style={styles.avatarPill}>
            <Text style={styles.avatarText}>P</Text>
          </View>
        </View>
      </View>

      {/* Banner slider */}
      <View style={styles.sliderWrapper}>
        <FlatList
          ref={sliderRef}
          data={BANNER_SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.key}
          getItemLayout={(_, index) => ({ length: SLIDER_WIDTH, offset: SLIDER_WIDTH * index, index })}
          onMomentumScrollEnd={e => {
            const index = Math.round(e.nativeEvent.contentOffset.x / SLIDER_WIDTH);
            setActiveSlide(index);
          }}
          renderItem={({ item }) => {
            const accent = palette[item.accentKey];
            return (
              <ImageBackground
                source={require('../assets/splash-icon.png')}
                imageStyle={styles.slideImage}
                style={[styles.slideItem, { width: SLIDER_WIDTH }]}
              >
                <View style={styles.heroOverlay} />
                <View style={styles.slideContent}>
                  <View style={styles.eyebrowRow}>
                    <View style={[styles.eyebrowDot, { backgroundColor: accent }]} />
                    <Text style={[styles.eyebrow, { color: accent }]}>{item.eyebrow}</Text>
                  </View>
                  <Text style={styles.slideTitle}>{item.title}</Text>
                  <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
                  {item.cta && (
                    <TouchableOpacity
                      style={[styles.slideCta, { borderColor: accent }]}
                      onPress={() => navigation.navigate(item.cta!.screen as any)}
                    >
                      <Ionicons name={item.cta.icon as any} size={16} color={accent} />
                      <Text style={[styles.slideCtaText, { color: accent }]}>{item.cta.label}</Text>
                      <Ionicons name="arrow-forward" size={14} color={accent} />
                    </TouchableOpacity>
                  )}
                </View>
              </ImageBackground>
            );
          }}
        />
        <View style={styles.sliderDots}>
          {BANNER_SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[styles.sliderDot, i === activeSlide && styles.sliderDotActive]}
            />
          ))}
        </View>
      </View>

      {/* Plan your trip */}
      <Pressable
        style={styles.card}
        onPress={() => {
          if (favoriteRemoveMode) setFavoriteRemoveMode(false);
        }}
      >
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>Plan your trip</Text>
        </View>
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

        {/* Stop selectors + absolute suggestions dropdown */}
        <View style={styles.stopSelectorWrapper}>
          <View
            style={styles.selectorRow}
            onLayout={e => setSelectorRowHeight(e.nativeEvent.layout.height)}
          >
            <View
              style={[
                styles.stopSelectorCard,
                styles.inputFrom,
                activeStopField === 'from' && styles.stopSelectorCardActiveFrom
              ]}
            >
              <Text style={styles.stopSelectorLabelFrom}>From</Text>
              <View style={styles.stopInputRow}>
                <Ionicons name="navigate" size={12} color={palette.accent} style={styles.stopInputIcon} />
                <TextInput
                  value={from}
                  onChangeText={value => { setFrom(value); setActiveStopField('from'); }}
                  onFocus={() => setActiveStopField('from')}
                  style={[styles.stopSelectorInput, styles.stopSelectorValueFrom]}
                  placeholder="Origin"
                  placeholderTextColor={palette.textFaint}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.swapButton} onPress={handleSwapStops}>
              <Ionicons name="swap-horizontal" size={18} color={palette.accent} />
            </TouchableOpacity>

            <View
              style={[
                styles.stopSelectorCard,
                styles.inputTo,
                activeStopField === 'to' && styles.stopSelectorCardActiveTo
              ]}
            >
              <Text style={styles.stopSelectorLabelTo}>To</Text>
              <View style={styles.stopInputRow}>
                <Ionicons name="location" size={12} color={palette.blue} style={styles.stopInputIcon} />
                <TextInput
                  value={to}
                  onChangeText={value => { setTo(value); setActiveStopField('to'); }}
                  onFocus={() => setActiveStopField('to')}
                  style={[styles.stopSelectorInput, styles.stopSelectorValueTo]}
                  placeholder="Destination"
                  placeholderTextColor={palette.textFaint}
                />
              </View>
            </View>
          </View>

          {/* Autocomplete suggestions — absolute dropdown, floats above keyboard */}
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

        {/* Favourites header */}
        <View style={styles.favoritesHeader}>
          <Text style={styles.favoriteHint}>
            Tap a stop to set {activeStopField === 'from' ? 'origin' : 'destination'}
          </Text>
          <TouchableOpacity
            style={[
              styles.addFavoriteButton,
              favoriteStops.length >= maxFavoriteStops && styles.addFavoriteButtonDisabled
            ]}
            onPress={() => {
              setFavoriteSearch('');
              setShowFavoritePicker(current => !current);
            }}
            disabled={favoriteStops.length >= maxFavoriteStops}
          >
            <Ionicons
              name={showFavoritePicker ? 'close-outline' : 'add-outline'}
              size={15}
              color={palette.ctaText}
            />
            <Text style={styles.addFavoriteButtonText}>
              {favoriteStops.length >= maxFavoriteStops
                ? `Max ${maxFavoriteStops}`
                : showFavoritePicker
                  ? 'Close'
                  : 'Add stop'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Favourite chips */}
        <View style={styles.favoriteChipsRow}>
          {favoriteStops.map(stop => {
            const isFrom = from === stop;
            const isTo = to === stop;
            return (
              <TouchableOpacity
                key={stop}
                style={[
                  styles.favoriteChip,
                  isFrom && styles.favoriteChipFrom,
                  isTo && styles.favoriteChipTo
                ]}
                onPress={() => handleStopSelect(stop)}
                onLongPress={() => setFavoriteRemoveMode(true)}
                delayLongPress={250}
              >
                {favoriteRemoveMode && (
                  <TouchableOpacity
                    style={styles.removeFavoriteButton}
                    onPress={event => {
                      event.stopPropagation();
                      handleRemoveFavorite(stop);
                    }}
                  >
                    <Text style={styles.removeFavoriteButtonText}>-</Text>
                  </TouchableOpacity>
                )}
                {isFrom && <Ionicons name="navigate" size={10} color={palette.accent} style={{ marginRight: 4 }} />}
                {isTo && <Ionicons name="location" size={10} color={palette.blue} style={{ marginRight: 4 }} />}
                <Text
                  style={[
                    styles.favoriteChipText,
                    isFrom && styles.favoriteChipTextFrom,
                    isTo && styles.favoriteChipTextTo
                  ]}
                >
                  {stop}
                </Text>
                {liveRoute?.stops?.some(s => s.name.toLowerCase() === stop.toLowerCase() && s.latitude && s.longitude) && (
                  <TouchableOpacity
                    onPress={event => { event.stopPropagation(); navigateToStop(stop); }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={{ marginLeft: 4 }}
                  >
                    <Ionicons name="navigate-outline" size={11} color={isFrom ? palette.accent : isTo ? palette.blue : palette.textMuted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Favourite picker */}
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
                {`You already have ${maxFavoriteStops} favourite stops.`}
              </Text>
            ) : null}
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
                No active buses heading {from.trim()} -> {to.trim()} right now.
              </Text>
            </View>
          )}
          {filteredLiveTrips.map(trip => {
            const tripId = String(trip.id);
            const eta = tripEtas[tripId];
            const load = tripLoads[tripId] ?? null;
            const hasLocation = typeof trip.lastLatitude === 'number' && typeof trip.lastLongitude === 'number';
            const stops = liveRoute?.stops ?? [];
            const currentStop = hasLocation
              ? resolveCurrentStop(trip.lastLatitude as number, trip.lastLongitude as number, stops, trip.direction)
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
            const stopLandmarkImageUrl = selectedRouteStop?.landmarkImageUrl?.trim() || '';
            const alreadyNotifiedSelectedStop =
              Boolean(waitingStatus?.stopName) &&
              String(waitingStatus?.stopName).trim().toLowerCase() === selectedStop.toLowerCase();
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
                              {alreadyNotifiedSelectedStop
                                ? 'Driver and conductor have your stop.'
                                : waitingStatus?.stopName
                                  ? `Current alert: ${waitingStatus.stopName}`
                                  : 'Notify the crew that you are waiting at this stop.'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.waitingButton,
                              alreadyNotifiedSelectedStop && styles.waitingButtonActive,
                              waitingBusy && styles.waitingButtonDisabled,
                            ]}
                            onPress={() => { void handleWaitingAction(tripId, selectedStop); }}
                            disabled={waitingBusy}
                          >
                            <Text
                              style={[
                                styles.waitingButtonText,
                                alreadyNotifiedSelectedStop && styles.waitingButtonTextActive,
                              ]}
                            >
                              {waitingBusy
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

      {/* How it works */}
      <View style={[styles.card, styles.bottomCard]}>
        <TouchableOpacity
          style={styles.collapseHeader}
          onPress={() => setShowHowItWorks(current => !current)}
        >
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionBarBlue} />
            <Text style={styles.sectionTitle}>How it works</Text>
          </View>
          <Ionicons
            name={showHowItWorks ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
            color={palette.textMuted}
          />
        </TouchableOpacity>
        {showHowItWorks &&
          [
            { icon: 'bus-outline' as const, text: 'Get on any supported qfare bus on your route.' },
            { icon: 'qr-code-outline' as const, text: 'Scan the QR displayed on the bus using the app.' },
            { icon: 'map-outline' as const, text: 'Select your boarding and alighting stops.' },
            { icon: 'card-outline' as const, text: 'Pay instantly and receive your digital ticket.' }
          ].map((item, index) => (
            <View key={item.text} style={styles.howRow}>
              <View style={styles.howIcon}>
                <Ionicons name={item.icon} size={16} color={palette.accent} />
              </View>
              <View style={styles.howContent}>
                <Text style={styles.howStep}>Step {index + 1}</Text>
                <Text style={styles.howText}>{item.text}</Text>
              </View>
            </View>
          ))}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 20, paddingBottom: 32 },

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

  // Top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 22, paddingTop: 8
  },
  brandPill: {
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 1
  },
  brandQ: { color: palette.accent, fontSize: 20, fontWeight: '900' },
  brandFare: { color: palette.text, fontSize: 20, fontWeight: '900' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconPill: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: palette.surfaceMuted,
    borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center'
  },
  avatarPill: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: palette.accentDeep,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.accent
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Banner slider
  sliderWrapper: {
    borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface, marginBottom: 14
  },
  slideItem: { minHeight: 220 },
  slideImage: { resizeMode: 'cover', opacity: 0.14 },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.overlay },
  slideContent: { padding: 26, justifyContent: 'center' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  eyebrow: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2
  },
  slideTitle: {
    color: palette.text, fontSize: 34, fontWeight: '900', lineHeight: 38, letterSpacing: -0.5
  },
  slideSubtitle: {
    color: palette.textMuted, marginTop: 10, fontSize: 13, lineHeight: 21, maxWidth: '88%'
  },
  slideCta: {
    marginTop: 16, borderWidth: 1, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.28)'
  },
  slideCtaText: { fontSize: 14, fontWeight: '800' },
  sliderDots: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, paddingVertical: 12
  },
  sliderDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: palette.border
  },
  sliderDotActive: { width: 18, backgroundColor: palette.accent },

  // Card base
  card: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 24, padding: 18, marginBottom: 14
  },
  bottomCard: { marginBottom: 0 },

  // Section headers
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: palette.accent },
  sectionBarBlue: { width: 3, height: 18, borderRadius: 2, backgroundColor: palette.blue },
  sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  sectionMeta: { marginLeft: 'auto', color: palette.textFaint, fontSize: 12, fontWeight: '600' },

  // Stop selectors
  stopSelectorWrapper: { position: 'relative', zIndex: 10 },
  selectorRow: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  stopSelectorCard: {
    flex: 1, backgroundColor: palette.surfaceStrong, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1.5
  },
  stopSelectorCardActiveFrom: { borderColor: 'rgba(0, 200, 150, 0.40)', backgroundColor: 'rgba(0, 200, 150, 0.06)' },
  stopSelectorCardActiveTo: { borderColor: 'rgba(68, 153, 255, 0.40)', backgroundColor: 'rgba(68, 153, 255, 0.06)' },
  stopSelectorLabelFrom: {
    color: palette.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6
  },
  stopSelectorLabelTo: {
    color: palette.blue, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6
  },
  stopInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stopInputIcon: { opacity: 0.8 },
  stopSelectorInput: { flex: 1, paddingVertical: 0, paddingHorizontal: 0, fontSize: 15, fontWeight: '800' },
  stopSelectorValueFrom: { color: palette.accent },
  stopSelectorValueTo: { color: palette.blue },
  inputFrom: { borderColor: 'rgba(0, 200, 150, 0.22)' },
  inputTo: { borderColor: 'rgba(68, 153, 255, 0.22)' },
  swapButton: {
    alignSelf: 'center', width: 42, height: 42, borderRadius: 21,
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center'
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
    backgroundColor: palette.surfaceStrong,
    zIndex: 50,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
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
  favoriteChip: {
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    borderRadius: 999, paddingLeft: 14, paddingRight: 14, paddingVertical: 10,
    position: 'relative', flexDirection: 'row', alignItems: 'center'
  },
  favoriteChipFrom: { backgroundColor: palette.accentSoft, borderColor: 'rgba(0, 200, 150, 0.32)' },
  favoriteChipTo: { backgroundColor: palette.blueSoft, borderColor: 'rgba(68, 153, 255, 0.30)' },
  favoriteChipText: { color: palette.textMuted, fontSize: 13, fontWeight: '700' },
  favoriteChipTextFrom: { color: palette.accent },
  favoriteChipTextTo: { color: palette.blue },
  removeFavoriteButton: {
    position: 'absolute', top: -7, right: -5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#c53b4a', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)'
  },
  removeFavoriteButtonText: { color: '#ffffff', fontSize: 16, lineHeight: 17, fontWeight: '800' },
  favoritePickerCard: {
    marginTop: 14, backgroundColor: palette.surfaceStrong, borderWidth: 1,
    borderColor: palette.border, borderRadius: 18, padding: 14
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
    flex: 1, backgroundColor: 'rgba(6, 17, 30, 0.78)', padding: 20, justifyContent: 'center'
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
  routeList: { marginTop: 14, gap: 10 },
  routeCard: {
    backgroundColor: palette.surfaceStrong, borderRadius: 18, borderWidth: 1,
    borderColor: palette.border, overflow: 'hidden'
  },
  routeCardAccent: { height: 2, backgroundColor: palette.blue },
  routeCardBody: { padding: 14 },
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

  // Live section
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.textFaint },
  livePulseActive: { backgroundColor: palette.accent },
  liveRouteName: { color: palette.textMuted, marginBottom: 12, fontSize: 13 },
  emptyState: {
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    borderRadius: 16, padding: 20, alignItems: 'center', gap: 8
  },
  routeEmptyState: { marginTop: 14 },
  emptyTitle: { color: palette.textMuted, fontSize: 14, fontWeight: '700' },
  emptyText: { color: palette.textFaint, fontSize: 12, textAlign: 'center' },
  liveMap: {
    height: 230, borderRadius: 16, overflow: 'hidden', marginTop: 6,
    borderWidth: 1, borderColor: palette.border, marginBottom: 10
  },
  liveTripCard: {
    backgroundColor: palette.surfaceStrong, borderRadius: 14, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: palette.border
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
    backgroundColor: 'rgba(68, 153, 255, 0.08)',
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
    backgroundColor: 'rgba(10, 18, 34, 0.42)',
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
    backgroundColor: 'rgba(10, 18, 34, 0.5)',
  },
  waitingButtonActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  waitingButtonDisabled: { opacity: 0.7 },
  waitingButtonText: { color: palette.blue, fontSize: 12, fontWeight: '800' },
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

  // How it works
  collapseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  howRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: palette.border
  },
  howIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: palette.accentSoft,
    borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.20)', alignItems: 'center', justifyContent: 'center'
  },
  howContent: { flex: 1, gap: 3 },
  howStep: { color: palette.accent, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  howText: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },

  // Bus load banner
  loadBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 10, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  loadBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  loadStatusText: { fontSize: 13, fontWeight: '800' },
  loadSubText: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, marginTop: 1 },
  loadBarWrap: { alignItems: 'flex-end', gap: 3, minWidth: 64 },
  loadBarTrack: {
    width: 60, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
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
