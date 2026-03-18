import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  TextInput,
  ScrollView
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BottomTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { apiGet } from '../lib/api';
import MapView, { Marker } from 'react-native-maps';

const today = new Date().toISOString().slice(0, 10);

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

type LiveTrip = {
  id: string;
  direction: 'UP' | 'DOWN';
  startTime: string;
  endTime: string;
  actualStartTime: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAt: string | null;
  bus: {
    id: string | null;
    busNumber: string | null;
  };
};

type LiveRoute = {
  id: string;
  routeCode: string;
  routeName: string;
  source: string;
  destination: string;
  standardTripTimeMin: number;
};

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [routes, setRoutes] = useState<PublicRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [liveRoute, setLiveRoute] = useState<LiveRoute | null>(null);
  const [liveTrips, setLiveTrips] = useState<LiveTrip[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRoutes = async () => {
      setLoadingRoutes(true);
      setRoutesError(null);
      try {
        const data = await apiGet<{ routes: PublicRoute[] }>('/api/public/routes');
        if (isMounted) {
          setRoutes(data.routes || []);
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : 'Failed to load routes';
          setRoutesError(message);
        }
      } finally {
        if (isMounted) setLoadingRoutes(false);
      }
    };

    loadRoutes();
    return () => {
      isMounted = false;
    };
  }, []);

  const matchingRoutes = useMemo(() => {
    const fromNorm = from.trim().toLowerCase();
    const toNorm = to.trim().toLowerCase();
    if (!fromNorm && !toNorm) return [];
    return routes.filter(route => {
      const hasFrom = fromNorm ? route.stops.some(s => s.toLowerCase().includes(fromNorm)) : true;
      const hasTo = toNorm ? route.stops.some(s => s.toLowerCase().includes(toNorm)) : true;
      return hasFrom && hasTo;
    });
  }, [from, routes, to]);

  const formatUpdated = (value: string | null) => {
    if (!value) return 'Last update: unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Last update: unavailable';
    const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    return `Updated ${diffMin} min ago`;
  };

  const formatLocation = (trip: LiveTrip) => {
    if (typeof trip.lastLatitude === 'number' && typeof trip.lastLongitude === 'number') {
      return `Location ${trip.lastLatitude.toFixed(4)}, ${trip.lastLongitude.toFixed(4)}`;
    }
    return 'Location unavailable';
  };

  const formatEta = (trip: LiveTrip) => {
    if (!liveRoute?.standardTripTimeMin || !trip.actualStartTime) return 'ETA unavailable';
    const start = new Date(trip.actualStartTime).getTime();
    if (Number.isNaN(start)) return 'ETA unavailable';
    const eta = new Date(start + liveRoute.standardTripTimeMin * 60000);
    return `ETA ${eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const liveTripsWithCoords = useMemo(
    () =>
      liveTrips.filter(
        trip => typeof trip.lastLatitude === 'number' && typeof trip.lastLongitude === 'number'
      ),
    [liveTrips]
  );

  const liveRegion = useMemo(() => {
    if (!liveTripsWithCoords.length) return null;
    const anchor = liveTripsWithCoords[0];
    return {
      latitude: anchor.lastLatitude as number,
      longitude: anchor.lastLongitude as number,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01
    };
  }, [liveTripsWithCoords]);

  const loadLiveStatus = async (routeId: string, showLoading = true) => {
    if (!routeId) return;
    if (showLoading) setLiveLoading(true);
    setLiveError(null);
    try {
      const data = await apiGet<{ route: LiveRoute; trips: LiveTrip[] }>(
        `/api/public/routes/${routeId}/live?date=${today}`
      );
      setLiveRoute(data.route || null);
      setLiveTrips(data.trips || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load live status';
      setLiveError(message);
    } finally {
      if (showLoading) setLiveLoading(false);
    }
  };

  useEffect(() => {
    if (!activeRouteId) return;
    void loadLiveStatus(activeRouteId);
    const interval = setInterval(() => {
      void loadLiveStatus(activeRouteId, false);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeRouteId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 28 }}>
      <ImageBackground
        source={require('../assets/splash-icon.png')}
        imageStyle={styles.bannerImage}
        style={styles.banner}
      >
        <View style={styles.bannerOverlay} />
        <View style={styles.bannerTextWrap}>
          <Text style={styles.bannerTitle}>Unreserved made easy</Text>
          <Text style={styles.bannerSubtitle}>Scan any bus QR, pay, and ride without queueing.</Text>
        </View>
      </ImageBackground>
      <View style={styles.hero}>
        <Text style={styles.badge}>Unreserved Bus Ticketing</Text>
        <Text style={styles.heading}>Scan. Pay. Ride.</Text>
        <Text style={styles.subheading}>
          Board any supported bus, scan the QR on the bus, pick your stops and get a digital ticket instantly.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Scan')}>
          <Text style={styles.primaryButtonText}>Open QR Scanner</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.planner}>
        <Text style={styles.featureTitle}>Plan your trip</Text>
        {routesError && <Text style={styles.hint}>{routesError}</Text>}
        {loadingRoutes && !routesError && <Text style={styles.hint}>Loading routes...</Text>}
        <View style={styles.row}>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="From (stop)"
            placeholderTextColor="#567"
            style={[styles.input, styles.flex1]}
          />
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="To (stop)"
            placeholderTextColor="#567"
            style={[styles.input, styles.flex1]}
          />
        </View>
        {matchingRoutes.length > 0 ? (
          <View style={styles.routeList}>
            {matchingRoutes.map(route => (
              <View key={route.id} style={styles.routeCard}>
                <View style={styles.routeRow}>
                  <View style={styles.routeMeta}>
                    <Text style={styles.routeTitle}>{route.routeCode} - {route.routeName}</Text>
                    <Text style={styles.routeTag}>{route.source} - {route.destination}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.outlineButton}
                    onPress={() => {
                      setActiveRouteId(route.id);
                      void loadLiveStatus(route.id);
                    }}
                  >
                    <Text style={styles.outlineButtonText}>Live buses</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.routeStops} numberOfLines={1}>
                  Stops: {route.stops.join(' -> ')}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>{loadingRoutes ? 'Loading routes...' : 'Type your origin and destination to see matching routes.'}</Text>
        )}

        {activeRouteId && (
          <View style={styles.liveCard}>
            <Text style={styles.liveTitle}>Live buses</Text>
            {liveRoute && (
              <Text style={styles.liveSubtitle}>
                {liveRoute.routeCode} - {liveRoute.routeName}
              </Text>
            )}
            {liveLoading && <Text style={styles.hint}>Loading live status...</Text>}
            {liveError && <Text style={styles.errorText}>{liveError}</Text>}
            {!liveLoading && !liveError && liveTrips.length === 0 && (
              <Text style={styles.hint}>No active buses right now.</Text>
            )}
            {liveRegion && (
              <MapView style={styles.liveMap} region={liveRegion}>
                {liveTripsWithCoords.map(trip => (
                  <Marker
                    key={trip.id}
                    coordinate={{
                      latitude: trip.lastLatitude as number,
                      longitude: trip.lastLongitude as number
                    }}
                    title={trip.bus.busNumber || 'Bus'}
                    description={`${trip.direction} ${trip.startTime}-${trip.endTime}`}
                  />
                ))}
              </MapView>
            )}
            {liveTrips.map(trip => (
              <View key={trip.id} style={styles.liveRow}>
                <Text style={styles.liveBus}>{trip.bus.busNumber || 'Bus'}</Text>
                <Text style={styles.liveMeta}>Direction: {trip.direction}</Text>
                <Text style={styles.liveMeta}>{formatEta(trip)}</Text>
                <Text style={styles.liveMeta}>{formatLocation(trip)}</Text>
                <Text style={styles.liveMeta}>{formatUpdated(trip.lastLocationAt)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.features}>
        <Text style={styles.featureTitle}>How it works</Text>
        <Text style={styles.featureItem}>- Each bus has a unique QR with its route and registration</Text>
        <Text style={styles.featureItem}>- Select source/destination to fetch the right fare</Text>
        <Text style={styles.featureItem}>- Pay securely and show the digital ticket to the conductor</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0B1828'
  },
  banner: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 140,
    marginBottom: 4
  },
  bannerImage: {
    resizeMode: 'cover',
    opacity: 0.5
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 24, 40, 0.55)'
  },
  bannerTextWrap: {
    flex: 1,
    padding: 16,
    justifyContent: 'center'
  },
  bannerTitle: {
    color: '#EAF2FF',
    fontSize: 18,
    fontWeight: '800'
  },
  bannerSubtitle: {
    color: '#A6BDD8',
    marginTop: 6,
    lineHeight: 18
  },
  hero: {
    backgroundColor: '#102238',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F4C78',
    marginTop: 8
  },
  badge: {
    color: '#4DD4AC',
    fontWeight: '700',
    marginBottom: 6
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#EAF2FF'
  },
  subheading: {
    color: '#A6BDD8',
    marginTop: 10,
    lineHeight: 20
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: '#4DD4AC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#0B1828',
    fontWeight: '700',
    fontSize: 16
  },
  planner: {
    backgroundColor: '#102238',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F4C78',
    marginTop: 12
  },
  features: {
    backgroundColor: '#102238',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F4C78',
    marginTop: 12
  },
  featureTitle: {
    color: '#EAF2FF',
    fontWeight: '700',
    marginBottom: 8
  },
  featureItem: {
    color: '#A6BDD8',
    marginBottom: 4
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  input: {
    backgroundColor: '#0F1E30',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#EAF2FF',
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  flex1: {
    flex: 1
  },
  routeList: {
    marginTop: 12,
    gap: 10
  },
  routeCard: {
    backgroundColor: '#0F1E30',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  routeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  routeMeta: {
    flex: 1
  },
  routeTitle: {
    color: '#EAF2FF',
    fontWeight: '800'
  },
  routeTag: {
    color: '#4DD4AC',
    marginTop: 4,
    fontWeight: '700'
  },
  routeStops: {
    color: '#A6BDD8',
    marginTop: 6
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#4DD4AC',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10
  },
  outlineButtonText: {
    color: '#4DD4AC',
    fontWeight: '700',
    fontSize: 12
  },
  liveCard: {
    marginTop: 12,
    backgroundColor: '#0F1E30',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  liveMap: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  liveTitle: {
    color: '#EAF2FF',
    fontWeight: '700',
    marginBottom: 4
  },
  liveSubtitle: {
    color: '#A6BDD8',
    marginBottom: 8
  },
  liveRow: {
    backgroundColor: '#102238',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  liveBus: {
    color: '#EAF2FF',
    fontWeight: '700',
    marginBottom: 4
  },
  liveMeta: {
    color: '#A6BDD8',
    marginBottom: 2
  },
  hint: {
    color: '#A6BDD8',
    marginTop: 10
  },
  errorText: {
    color: '#F5B7B7',
    marginTop: 10
  }
});

export default HomeScreen;
