import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { apiGet, apiPost } from '../lib/api';
import { saveTicket } from '../lib/ticketStorage';
import { palette } from '../lib/theme';

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

const QRScannerScreen: React.FC<Props> = ({ navigation }) => {
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [bus, setBus] = useState<BusProfile | null>(null);
  const [fromStop, setFromStop] = useState<string | null>(null);
  const [toStop, setToStop] = useState<string | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [manualBusNumber, setManualBusNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load bus route';
      setLoadError(message);
      Alert.alert('Could not load route', message);
    } finally {
      setIsLoading(false);
    }
  };

  const onScanned = ({ data }: { data: string }) => {
    setIsScanning(false);
    const parsed = parseBusPayload(data);
    if (!parsed) {
      Alert.alert('Invalid QR', 'Could not read bus data from QR code.');
      return;
    }
    void loadBusRoute(parsed);
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
    if (!fromStop || !toStop || totalFare === null) {
      Alert.alert('Select stops', 'Pick both source and destination to continue.');
      return;
    }
    try {
      const data = await apiPost<BookingResponse>('/api/public/bookings/demo', {
        busNumber: bus.busNumber,
        routeId: bus.routeId,
        source: fromStop,
        destination: toStop,
        fare: totalFare,
        passengerCount,
      });
      const tripInstanceId = data.booking.tripInstanceId ?? null;
      await saveTicket({
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
      const message = error instanceof Error ? error.message : 'Payment failed';
      Alert.alert('Payment failed', message);
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
            return (
              <TouchableOpacity
                key={`${label}-${stop}`}
                style={[
                  styles.stopPill,
                  isSelected && (isFromGroup ? styles.stopPillSelectedFrom : styles.stopPillSelectedTo)
                ]}
                onPress={() => onSelect(stop)}
              >
                <Text
                  style={[
                    styles.stopText,
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Brand */}
      <View style={styles.topBar}>
        <View style={styles.brandPill}>
          <Text style={styles.brandQ}>q</Text>
          <Text style={styles.brandFare}>fare</Text>
        </View>
      </View>

      {/* Hero */}
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
      {permissionStatus === 'granted' && (
        <View style={styles.scannerShell}>
          <CameraView
            onBarcodeScanned={isScanning ? onScanned : undefined}
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
                name={isScanning ? 'scan-outline' : 'qr-code-outline'}
                size={16}
                color={isScanning ? palette.accent : palette.textMuted}
              />
              <Text style={[styles.overlayText, isScanning && styles.overlayTextActive]}>
                {isScanning ? 'Align QR within the frame' : 'Tap to start scanning'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.scanButton, isScanning && styles.scanButtonActive]}
              onPress={() => setIsScanning(current => !current)}
            >
              <Text style={styles.scanButtonText}>
                {isScanning ? 'Stop scanning' : 'Start scanning'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Manual lookup */}
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
          <Text style={styles.sectionSubheading}>Route stops</Text>
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

          {/* From / To selectors */}
          <View style={styles.stopsDivider} />
          {renderStopButtons('From', fromStop, setFromStop)}
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
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 20, paddingBottom: 32 },

  // Top bar
  topBar: { marginBottom: 16 },
  brandPill: {
    alignSelf: 'flex-start', backgroundColor: palette.surfaceMuted, borderWidth: 1,
    borderColor: palette.border, borderRadius: 14, paddingHorizontal: 16,
    paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 1
  },
  brandQ: { color: palette.accent, fontSize: 20, fontWeight: '900' },
  brandFare: { color: palette.text, fontSize: 20, fontWeight: '900' },

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
    backgroundColor: 'rgba(6, 17, 30, 0.55)', gap: 10
  },
  overlayTextWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  overlayText: { color: palette.textMuted, textAlign: 'center', fontSize: 13 },
  overlayTextActive: { color: palette.accent, fontWeight: '600' },
  scanButton: {
    backgroundColor: palette.cta, paddingVertical: 14, borderRadius: 16, alignItems: 'center',
    borderWidth: 1, borderColor: palette.ctaSoft
  },
  scanButtonActive: { backgroundColor: '#3a1a1a', borderColor: 'rgba(255, 143, 163, 0.40)' },
  scanButtonText: { color: palette.ctaText, fontSize: 15, fontWeight: '800' },

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
  stopPillSelectedFrom: { backgroundColor: palette.accentDeep, borderColor: palette.accent },
  stopPillSelectedTo: { backgroundColor: palette.blue, borderColor: palette.blue },
  stopText: { color: palette.textMuted, fontSize: 13, fontWeight: '600' },
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
