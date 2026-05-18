import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  NativeModules,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import RazorpayCheckout from 'react-native-razorpay';
import { BottomTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';
import { saveTicket } from '../lib/ticketStorage';
import { palette } from '../lib/theme';
import QfareLogo from '../components/QfareLogo';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<BottomTabParamList, 'Scan'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type FareSlab = { fromKm: number; toKm: number; fare: number };
type BusProfile = {
  busNumber: string;
  busType: string | null;
  depotId: string | null;
  routeId: string;
  routeCode: string;
  routeName: string;
  stops: string[];
  fareSlabs: FareSlab[];
};
type ScanPayload = { busNumber: string; depotId?: string | null };
type ScanResponse = {
  bus: { id: string; busNumber: string; busType?: string | null; depotId?: string | null };
  route: { id: string; routeCode: string; routeName: string; source: string; destination: string };
  stops: { name: string }[];
  fareSlabs: FareSlab[];
};
type BookingResponse = {
  booking: {
    bookingId: string;
    busNumber: string;
    routeId: string;
    source: string;
    destination: string;
    fare: number;
    status: string;
    bookedAt: string;
    tripInstanceId: string | null;
  };
};
type PaymentOrderResponse = {
  order: {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    keyId: string;
    description: string;
    bookingPreview: {
      busNumber: string;
      routeId: string;
      source: string;
      destination: string;
      passengerCount: number;
      fare: number;
    };
  };
};
type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayFailure = {
  code?: number | string;
  description?: string;
  reason?: string;
  step?: string;
  source?: string;
  error?: {
    code?: number | string;
    description?: string;
    reason?: string;
    step?: string;
    source?: string;
  };
};

const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 14 : 20;

const isRazorpayAvailable = () =>
  typeof RazorpayCheckout?.open === 'function' ||
  Boolean(NativeModules?.RNRazorpayCheckout) ||
  Boolean(NativeModules?.RazorpayCheckout);

const getRazorpayFailureMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return { title: 'Payment failed', message: 'Unable to complete payment right now.' };
  }

  const failure = error as RazorpayFailure & { message?: string };
  const details = failure.error ?? failure;
  const rawText = [
    failure.message,
    details.description,
    details.reason,
    details.step,
    details.source,
    String(details.code ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    rawText.includes('cancel') ||
    rawText.includes('dismiss') ||
    rawText.includes('backpressed') ||
    rawText.includes('payment_cancelled')
  ) {
    return {
      title: 'Payment cancelled',
      message: 'You closed the Razorpay checkout before completing payment.',
    };
  }

  if (rawText.includes('open of null')) {
    return {
      title: 'Payment failed',
      message: 'Razorpay is missing from this app build. Rebuild and reinstall the app, then try again.',
    };
  }

  return {
    title: 'Payment failed',
    message: details.description || details.reason || failure.message || 'Unable to complete payment right now.',
  };
};

const QRScannerScreen: React.FC<Props> = ({ navigation }) => {
  const { token, user } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [bus, setBus] = useState<BusProfile | null>(null);
  const [fromStop, setFromStop] = useState<string | null>(null);
  const [toStop, setToStop] = useState<string | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [manualBusNumber, setManualBusNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRouteStops, setShowRouteStops] = useState(false);

  useEffect(() => {
    const requestPermission = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermissionStatus(status);
    };
    void requestPermission();
  }, []);

  const farePerPerson = useMemo(() => {
    if (!bus || !fromStop || !toStop || fromStop === toStop) return null;
    const fromIndex = bus.stops.indexOf(fromStop);
    const toIndex = bus.stops.indexOf(toStop);
    if (fromIndex === -1 || toIndex === -1) return null;
    const distanceKm = Math.abs(toIndex - fromIndex);
    const slab = bus.fareSlabs.find(item => distanceKm >= item.fromKm && distanceKm <= item.toKm);
    return slab ? slab.fare : null;
  }, [bus, fromStop, toStop]);

  const totalFare = farePerPerson !== null ? farePerPerson * passengerCount : null;

  const parseBusPayload = (raw: string): ScanPayload | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed?.busNumber) return null;
      return { busNumber: String(parsed.busNumber).trim(), depotId: parsed.depotId ? String(parsed.depotId) : null };
    } catch {
      return { busNumber: trimmed };
    }
  };

  const loadBusRoute = async (payload: ScanPayload) => {
    if (!payload.busNumber) {
      Alert.alert('Invalid QR', 'Bus number is missing from the QR payload.');
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const query = `busNumber=${encodeURIComponent(payload.busNumber)}${payload.depotId ? `&depotId=${encodeURIComponent(payload.depotId)}` : ''}`;
      const data = await apiGet<ScanResponse>(`/api/public/scan?${query}`);
      setBus({
        busNumber: data.bus.busNumber,
        busType: data.bus.busType ?? null,
        depotId: data.bus.depotId ?? null,
        routeId: data.route.id,
        routeCode: data.route.routeCode,
        routeName: data.route.routeName,
        stops: (data.stops || []).map(stop => stop.name),
        fareSlabs: data.fareSlabs || []
      });
      setFromStop(null);
      setToStop(null);
      setPassengerCount(1);
      setShowRouteStops(false);
      setScanLocked(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load bus route';
      setLoadError(message);
      Alert.alert('Could not load route', message);
      setScanLocked(false);
    } finally {
      setIsLoading(false);
    }
  };

  const onScanned = ({ data }: { data: string }) => {
    if (scanLocked || isLoading) return;
    setScanLocked(true);
    const parsed = parseBusPayload(data);
    if (!parsed) {
      setScanLocked(false);
      Alert.alert('Invalid QR', 'Could not read bus data from QR code.');
      return;
    }
    void loadBusRoute(parsed);
  };

  const handleSelectFromStop = (stop: string) => {
    if (!bus) return;
    const nextFromIndex = bus.stops.indexOf(stop);
    setFromStop(stop);
    setToStop(currentTo => {
      if (!currentTo) return currentTo;
      const currentToIndex = bus.stops.indexOf(currentTo);
      return currentToIndex > nextFromIndex ? currentTo : null;
    });
  };

  const resetScanSession = () => {
    setBus(null);
    setFromStop(null);
    setToStop(null);
    setPassengerCount(1);
    setManualBusNumber('');
    setLoadError(null);
    setShowRouteStops(false);
    setScanLocked(false);
  };

  const handleManualLookup = () => {
    if (!manualBusNumber.trim()) {
      Alert.alert('Bus number required', 'Enter a bus number to load route details.');
      return;
    }
    void loadBusRoute({ busNumber: manualBusNumber.trim() });
  };

  const proceedToTicket = async () => {
    if (!bus) {
      Alert.alert('Scan required', 'Scan the bus QR to load route details.');
      return;
    }
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in again to continue with payment.');
      return;
    }
    if (!fromStop || !toStop || totalFare === null) {
      Alert.alert('Select stops', 'Pick both source and destination to continue.');
      return;
    }
    if (!isRazorpayAvailable()) {
      Alert.alert(
        'Payment unavailable',
        'This build does not include the Razorpay payment module yet. Rebuild and reinstall the Android app using a development build or release APK, then try payment again.'
      );
      return;
    }
    try {
      const orderData = await apiPost<PaymentOrderResponse>('/api/public/payments/razorpay/order', {
        busNumber: bus.busNumber,
        routeId: bus.routeId,
        source: fromStop,
        destination: toStop,
        passengerCount,
      }, token);
      const razorpayResult = await RazorpayCheckout.open({
        key: orderData.order.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: 'qfare',
        description: orderData.order.description,
        order_id: orderData.order.id,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: {
          color: palette.accentDeep,
        },
      }) as RazorpaySuccess;
      const data = await apiPost<BookingResponse>('/api/public/payments/razorpay/verify', {
        ...razorpayResult,
        busNumber: bus.busNumber,
        routeId: bus.routeId,
        source: fromStop,
        destination: toStop,
        passengerCount,
      }, token);
      const tripInstanceId = data.booking.tripInstanceId ?? null;
      if (!user?.id) {
        throw new Error('User session missing. Please sign in again.');
      }
      await saveTicket(user.id, {
        ownerUserId: user.id,
        bookingId: data.booking.bookingId,
        tripInstanceId,
        busNumber: bus.busNumber,
        routeCode: bus.routeCode,
        routeName: bus.routeName,
        source: fromStop,
        destination: toStop,
        fare: totalFare,
        passengerCount,
        bookedAt: data.booking.bookedAt,
        ticketStatus: 'active',
        expiredAt: null,
      });
      navigation.navigate('Ticket', {
        source: fromStop,
        destination: toStop,
        fare: totalFare,
        passengerCount,
        busNumber: bus.busNumber,
        routeCode: bus.routeCode,
        routeName: bus.routeName,
        bookingId: data.booking.bookingId,
        bookedAt: data.booking.bookedAt,
        tripInstanceId,
      });
    } catch (error) {
      const { title, message } = getRazorpayFailureMessage(error);
      Alert.alert(title, message);
    }
  };

  const renderStopButtons = (label: string, selected: string | null, onSelect: (stop: string) => void) => {
    const isFromGroup = label === 'From';
    return (
      <View style={styles.stopGroup}>
        <View style={styles.stopGroupHeader}>
          <Ionicons
            name={isFromGroup ? 'navigate' : 'location'}
            size={13}
            color={isFromGroup ? palette.accent : palette.blue}
          />
          <Text style={[styles.label, isFromGroup ? styles.labelFrom : styles.labelTo]}>{label} stop</Text>
        </View>
        <View style={styles.stopList}>
          {bus?.stops.map(stop => {
            const isSelected = selected === stop;
            const fromIndex = fromStop ? bus.stops.indexOf(fromStop) : -1;
            const stopIndex = bus.stops.indexOf(stop);
            const isDisabled = !isFromGroup && fromIndex >= 0 && stopIndex <= fromIndex;
            return (
              <TouchableOpacity
                key={`${label}-${stop}`}
                style={[
                  styles.stopPill,
                  isDisabled && styles.stopPillDisabled,
                  isSelected && (isFromGroup ? styles.stopPillSelectedFrom : styles.stopPillSelectedTo)
                ]}
                onPress={() => onSelect(stop)}
                disabled={isDisabled}
              >
                <Text
                  style={[
                    styles.stopText,
                    isDisabled && styles.stopTextDisabled,
                    isSelected && (isFromGroup ? styles.stopTextSelectedFrom : styles.stopTextSelectedTo)
                  ]}
                >
                  {stop}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 28 }]}
    >
      {/* Brand */}
      <View style={styles.topBar}>
        <QfareLogo
          width={120}
          height={28}
          imageStyle={{ marginLeft: -18 }}
          containerStyle={{ marginLeft: 0 }}
        />
      </View>

      {/* Hero */}
      {!bus && (
        <View style={styles.heroCard}>
          <View style={styles.heroAccent} />
          <View style={styles.heroBody}>
            <Text style={styles.heroBadge}>QR Boarding</Text>
            <Text style={styles.heading}>Scan to board</Text>
            <Text style={styles.heroText}>
              Point your camera at the QR code on the bus, or enter the bus number manually.
            </Text>
          </View>
        </View>
      )}

      {/* Camera permission denied */}
      {permissionStatus === 'denied' && (
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={22} color={palette.danger} />
          <Text style={styles.permissionText}>
            Camera access denied. Enable it in Settings to scan QR codes.
          </Text>
        </View>
      )}

      {/* Scanner */}
      {permissionStatus === 'granted' && !bus && (
        <View style={styles.scannerShell}>
          <CameraView
            onBarcodeScanned={scanLocked ? undefined : onScanned}
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'pdf417', 'aztec'] }}
          />
          {/* Corner guides */}
          <View style={[styles.cornerGuide, styles.cornerTL]} />
          <View style={[styles.cornerGuide, styles.cornerTR]} />
          <View style={[styles.cornerGuide, styles.cornerBL]} />
          <View style={[styles.cornerGuide, styles.cornerBR]} />

          <View style={styles.scannerOverlay}>
            <View style={styles.overlayTextWrap}>
              <Ionicons
                name="scan-outline"
                size={16}
                color={palette.accent}
              />
              <Text style={[styles.overlayText, styles.overlayTextActive]}>
                {scanLocked ? 'QR captured. Loading route details...' : 'Point the camera at the bus QR code'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Manual lookup */}
      {!bus && (
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionBarBlue} />
            <Text style={styles.sectionTitle}>Manual lookup</Text>
          </View>
          <Text style={styles.manualLabel}>No camera? Enter the bus number directly</Text>
          <View style={styles.manualRow}>
            <View style={styles.manualInputWrap}>
              <Ionicons name="bus-outline" size={15} color={palette.textFaint} style={styles.manualIcon} />
              <TextInput
                value={manualBusNumber}
                onChangeText={setManualBusNumber}
                placeholder="e.g. WBTC-2026-014"
                placeholderTextColor={palette.textFaint}
                style={styles.manualInput}
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity onPress={handleManualLookup} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Load</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading / Error */}
      {isLoading && (
        <View style={styles.statusRow}>
          <Ionicons name="time-outline" size={14} color={palette.textFaint} />
          <Text style={styles.hint}>Loading route details...</Text>
        </View>
      )}
      {loadError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color={palette.danger} />
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      )}

      {/* Bus details card */}
      {bus && (
        <View style={styles.card}>
          {/* Bus header */}
          <View style={styles.routeBadgeRow}>
            <View style={styles.routeBadge}>
              <Ionicons name="checkmark-circle" size={13} color={palette.accent} />
              <Text style={styles.routeBadgeText}>Bus loaded</Text>
            </View>
            <Text style={styles.routeBadgeMeta}>{bus.busNumber}</Text>
          </View>

          <Text style={styles.busTitle}>{bus.routeCode} · {bus.routeName}</Text>

          <View style={styles.busMetaRow}>
            <View style={styles.busMetaChip}>
              <Ionicons name="bus-outline" size={12} color={palette.textFaint} />
              <Text style={styles.busMetaText}>{bus.busNumber}</Text>
            </View>
            <View style={styles.busMetaChip}>
              <Ionicons name="layers-outline" size={12} color={palette.textFaint} />
              <Text style={styles.busMetaText}>{bus.busType || 'Standard'}</Text>
            </View>
          </View>

          {/* All stops */}
          <View style={styles.stopsDivider} />
          <TouchableOpacity
            style={styles.routeStopsToggle}
            activeOpacity={0.85}
            onPress={() => setShowRouteStops(current => !current)}
          >
            <View style={styles.routeStopsToggleLeft}>
              <Text style={styles.sectionSubheading}>Route stops</Text>
              <Text style={styles.routeStopsToggleHint}>
                {showRouteStops ? 'Hide all stops' : 'Tap to view all stops'}
              </Text>
            </View>
            <Ionicons
              name={showRouteStops ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={18}
              color={palette.textMuted}
            />
          </TouchableOpacity>
          {showRouteStops && (
            <View style={styles.stopsRow}>
              {bus.stops.map((stop, idx) => (
                <View key={stop} style={styles.stopChip}>
                  {idx === 0 && <Ionicons name="radio-button-on" size={10} color={palette.accent} />}
                  {idx === bus.stops.length - 1 && <Ionicons name="location" size={10} color={palette.blue} />}
                  {idx !== 0 && idx !== bus.stops.length - 1 && (
                    <View style={styles.stopChipDot} />
                  )}
                  <Text style={styles.stopChipText}>{stop}</Text>
                </View>
              ))}
            </View>
          )}

          {/* From / To selectors */}
          <View style={styles.stopsDivider} />
          {renderStopButtons('From', fromStop, handleSelectFromStop)}
          {renderStopButtons('To', toStop, setToStop)}

          {/* Passenger count */}
          <View style={styles.stopsDivider} />
          <View style={styles.passengerRow}>
            <View style={styles.passengerLabelCol}>
              <View style={styles.passengerLabelRow}>
                <Ionicons name="people-outline" size={15} color={palette.textMuted} />
                <Text style={styles.passengerLabel}>Passengers</Text>
              </View>
              <Text style={styles.passengerHint}>Max 5 per transaction</Text>
            </View>
            <View style={styles.passengerControls}>
              <TouchableOpacity
                style={[styles.passengerBtn, passengerCount <= 1 && styles.passengerBtnDisabled]}
                onPress={() => setPassengerCount(c => Math.max(1, c - 1))}
                disabled={passengerCount <= 1}
              >
                <Ionicons name="remove" size={18} color={passengerCount <= 1 ? palette.textFaint : palette.text} />
              </TouchableOpacity>
              <View style={styles.passengerCountBox}>
                <Text style={styles.passengerCount}>{passengerCount}</Text>
              </View>
              <TouchableOpacity
                style={[styles.passengerBtn, passengerCount >= 5 && styles.passengerBtnDisabled]}
                onPress={() => setPassengerCount(c => Math.min(5, c + 1))}
                disabled={passengerCount >= 5}
              >
                <Ionicons name="add" size={18} color={passengerCount >= 5 ? palette.textFaint : palette.accent} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Fare display */}
          <View style={styles.fareCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fareLabel}>
                {passengerCount > 1 ? 'Total fare' : 'Calculated fare'}
              </Text>
              <Text style={styles.fareHint}>
                {fromStop && toStop
                  ? `${fromStop}  →  ${toStop}`
                  : 'Select both stops to calculate'}
              </Text>
              {passengerCount > 1 && farePerPerson !== null && (
                <Text style={styles.farePerPerson}>
                  ₹{farePerPerson.toFixed(2)} × {passengerCount} passengers
                </Text>
              )}
            </View>
            <Text style={[styles.fareValue, totalFare !== null && styles.fareValueActive]}>
              {totalFare !== null ? `₹${totalFare.toFixed(2)}` : '—'}
            </Text>
          </View>

          {/* Pay CTA */}
          <TouchableOpacity
            style={[styles.primaryButton, (!fromStop || !toStop || totalFare === null) && styles.primaryButtonDisabled]}
            onPress={proceedToTicket}
          >
            <Ionicons name="card-outline" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Pay & Generate Ticket</Text>
            <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={resetScanSession}
          >
            <Ionicons name="scan-outline" size={16} color={palette.blue} />
            <Text style={styles.scanAgainButtonText}>Scan another bus</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 20, paddingBottom: 32 },

  // Top bar
  topBar: { marginBottom: 16, paddingTop: topInset },

  // Hero
  heroCard: {
    backgroundColor: palette.surface, borderRadius: 24, borderWidth: 1, borderColor: palette.border,
    marginBottom: 14, overflow: 'hidden'
  },
  heroAccent: { height: 3, backgroundColor: palette.accent },
  heroBody: { padding: 20 },
  heroBadge: {
    color: palette.accent, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1.2, marginBottom: 8
  },
  heading: { color: palette.text, fontSize: 26, fontWeight: '900', marginBottom: 8, letterSpacing: -0.3 },
  heroText: { color: palette.textMuted, lineHeight: 21, fontSize: 13.5 },

  // Scanner
  scannerShell: {
    height: 280, borderRadius: 24, overflow: 'hidden', marginBottom: 14, borderWidth: 1.5,
    borderColor: palette.borderStrong, backgroundColor: palette.surface
  },
  cornerGuide: { position: 'absolute', width: 30, height: 30, borderColor: palette.accent, borderWidth: 3 },
  cornerTL: { top: 18, left: 18, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 8 },
  cornerTR: { top: 18, right: 18, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 8 },
  cornerBL: { bottom: 70, left: 18, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 70, right: 18, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 8 },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.18)', gap: 10
  },
  overlayTextWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  overlayText: { color: palette.textMuted, textAlign: 'center', fontSize: 13 },
  overlayTextActive: { color: palette.accent, fontWeight: '600' },

  // Permission
  permissionCard: {
    backgroundColor: palette.dangerBg, borderColor: 'rgba(255, 143, 163, 0.22)', borderWidth: 1,
    padding: 16, borderRadius: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12
  },
  permissionText: { color: palette.danger, flex: 1, lineHeight: 20 },

  // Cards
  card: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 24, padding: 18, marginBottom: 14
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionBarBlue: { width: 3, height: 18, borderRadius: 2, backgroundColor: palette.blue },
  sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },

  // Manual lookup
  manualLabel: { color: palette.textMuted, marginBottom: 10, fontSize: 13 },
  manualRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  manualInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: palette.surfaceStrong, borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.26)', paddingHorizontal: 12
  },
  manualIcon: { marginRight: 6 },
  manualInput: {
    flex: 1, paddingVertical: 13, color: palette.text, fontSize: 14, fontWeight: '600'
  },
  secondaryButton: {
    backgroundColor: palette.blueSoft, borderWidth: 1, borderColor: 'rgba(68, 153, 255, 0.30)',
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13
  },
  secondaryButtonText: { color: palette.blue, fontWeight: '800', fontSize: 14 },
  scanAgainButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.26)',
    backgroundColor: palette.blueSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scanAgainButtonText: { color: palette.blue, fontWeight: '800', fontSize: 13.5 },

  // Bus card
  routeBadgeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12
  },
  routeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.28)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden'
  },
  routeBadgeText: { color: palette.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  routeBadgeMeta: { color: palette.textFaint, fontSize: 11, fontWeight: '600' },
  busTitle: { color: palette.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  busMetaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  busMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: palette.surfaceStrong, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: palette.border
  },
  busMetaText: { color: palette.textMuted, fontSize: 12.5, fontWeight: '600' },
  stopsDivider: { height: 1, backgroundColor: palette.border, marginVertical: 14 },
  sectionSubheading: { color: palette.textMuted, marginBottom: 10, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  routeStopsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  routeStopsToggleLeft: { flex: 1 },
  routeStopsToggleHint: { color: palette.textFaint, fontSize: 12, marginTop: -2 },
  stopsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stopChip: {
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5
  },
  stopChipDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.textFaint },
  stopChipText: { color: palette.textMuted, fontSize: 12.5, fontWeight: '600' },

  // Stop selection
  stopGroup: { marginTop: 4 },
  stopGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '800' },
  labelFrom: { color: palette.accent },
  labelTo: { color: palette.blue },
  stopList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stopPill: {
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8
  },
  stopPillDisabled: {
    backgroundColor: palette.surfaceMuted,
    borderColor: 'rgba(16, 36, 60, 0.08)',
    opacity: 0.55,
  },
  stopPillSelectedFrom: { backgroundColor: palette.accentDeep, borderColor: palette.accent },
  stopPillSelectedTo: { backgroundColor: palette.blue, borderColor: palette.blue },
  stopText: { color: palette.textMuted, fontSize: 13, fontWeight: '600' },
  stopTextDisabled: { color: palette.textFaint },
  stopTextSelectedFrom: { color: '#fff', fontWeight: '800' },
  stopTextSelectedTo: { color: '#fff', fontWeight: '800' },

  // Passenger selector
  passengerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4, gap: 12,
  },
  passengerLabelCol: { flex: 1, gap: 3 },
  passengerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  passengerLabel: { color: palette.text, fontSize: 14, fontWeight: '700' },
  passengerHint: { color: palette.textFaint, fontSize: 11.5 },
  passengerControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passengerBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center',
  },
  passengerBtnDisabled: { opacity: 0.4 },
  passengerCountBox: {
    width: 40, height: 36, borderRadius: 12,
    backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  passengerCount: { color: palette.accent, fontSize: 16, fontWeight: '900' },

  // Fare
  fareCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, backgroundColor: palette.surfaceStrong, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: palette.border
  },
  fareLabel: { color: palette.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  fareHint: { color: palette.textFaint, fontSize: 12, marginTop: 4 },
  farePerPerson: { color: palette.textMuted, fontSize: 12, marginTop: 4 },
  fareValue: { color: palette.textFaint, fontSize: 22, fontWeight: '900' },
  fareValueActive: { color: palette.gold, fontSize: 26 },

  // CTA
  primaryButton: {
    marginTop: 14, backgroundColor: palette.accentDeep, paddingVertical: 16, borderRadius: 18,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: palette.accent
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: '#fff', fontSize: 15.5, fontWeight: '900' },

  // Status
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  hint: { color: palette.textMuted, fontSize: 13 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
    backgroundColor: palette.dangerBg, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255, 143, 163, 0.20)'
  },
  errorText: { color: palette.danger, fontSize: 13, flex: 1 }
});

export default QRScannerScreen;
