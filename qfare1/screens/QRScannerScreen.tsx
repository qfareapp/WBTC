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
import { BottomTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { apiGet, apiPost } from '../lib/api';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<BottomTabParamList, 'Scan'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type FareSlab = {
  fromKm: number;
  toKm: number;
  fare: number;
};

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

type ScanPayload = {
  busNumber: string;
  depotId?: string | null;
};

type ScanResponse = {
  bus: {
    id: string;
    busNumber: string;
    busType?: string | null;
    depotId?: string | null;
  };
  route: {
    id: string;
    routeCode: string;
    routeName: string;
    source: string;
    destination: string;
  };
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
  };
};

const QRScannerScreen: React.FC<Props> = ({ navigation }) => {
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [bus, setBus] = useState<BusProfile | null>(null);
  const [fromStop, setFromStop] = useState<string | null>(null);
  const [toStop, setToStop] = useState<string | null>(null);
  const [manualBusNumber, setManualBusNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const requestPermission = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermissionStatus(status);
    };
    requestPermission();
  }, []);

  const fare = useMemo(() => {
    if (!bus || !fromStop || !toStop || fromStop === toStop) return null;
    const fromIndex = bus.stops.indexOf(fromStop);
    const toIndex = bus.stops.indexOf(toStop);
    if (fromIndex === -1 || toIndex === -1) return null;
    const distanceKm = Math.abs(toIndex - fromIndex);
    const slab = bus.fareSlabs.find(s => distanceKm >= s.fromKm && distanceKm <= s.toKm);
    return slab ? slab.fare : null;
  }, [bus, fromStop, toStop]);

  const parseBusPayload = (raw: string): ScanPayload | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed?.busNumber) return null;
      return {
        busNumber: String(parsed.busNumber).trim(),
        depotId: parsed.depotId ? String(parsed.depotId) : null
      };
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
      const stops = (data.stops || []).map(stop => stop.name);
      setBus({
        busNumber: data.bus.busNumber,
        busType: data.bus.busType ?? null,
        depotId: data.bus.depotId ?? null,
        routeId: data.route.id,
        routeCode: data.route.routeCode,
        routeName: data.route.routeName,
        stops,
        fareSlabs: data.fareSlabs || []
      });
      setFromStop(null);
      setToStop(null);
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
    if (!fromStop || !toStop || fare === null) {
      Alert.alert('Select stops', 'Pick both source and destination to continue.');
      return;
    }

    try {
      const data = await apiPost<BookingResponse>('/api/public/bookings/demo', {
        busNumber: bus.busNumber,
        routeId: bus.routeId,
        source: fromStop,
        destination: toStop,
        fare
      });

      navigation.navigate('Ticket', {
        source: fromStop,
        destination: toStop,
        fare,
        busNumber: bus.busNumber,
        routeCode: bus.routeCode,
        routeName: bus.routeName,
        bookingId: data.booking.bookingId,
        bookedAt: data.booking.bookedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed';
      Alert.alert('Payment failed', message);
    }
  };

  const renderStopButtons = (label: string, selected: string | null, onSelect: (stop: string) => void) => (
    <View style={styles.stopGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stopList}>
        {bus?.stops.map(stop => {
          const isSelected = selected === stop;
          return (
            <TouchableOpacity
              key={`${label}-${stop}`}
              style={[styles.stopPill, isSelected && styles.stopPillSelected]}
              onPress={() => onSelect(stop)}
            >
              <Text style={[styles.stopText, isSelected && styles.stopTextSelected]}>{stop}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Scan bus QR to start</Text>

      {permissionStatus === 'denied' && (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionText}>Camera access denied. Enable camera permission to scan.</Text>
        </View>
      )}

      {permissionStatus === 'granted' && (
        <View style={styles.scannerShell}>
          <CameraView
            onBarcodeScanned={isScanning ? onScanned : undefined}
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'pdf417', 'aztec']
            }}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.overlayText}>{isScanning ? 'Align QR within frame' : 'Tap to start scanning'}</Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => setIsScanning(current => !current)}
            >
              <Text style={styles.scanButtonText}>{isScanning ? 'Stop scanning' : 'Start scanning'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.manualCard}>
        <Text style={styles.manualLabel}>No camera? Enter bus number</Text>
        <View style={styles.manualRow}>
          <TextInput
            value={manualBusNumber}
            onChangeText={setManualBusNumber}
            placeholder="WBTC-2026-014"
            placeholderTextColor="#678"
            style={styles.manualInput}
            autoCapitalize="characters"
          />
          <TouchableOpacity onPress={handleManualLookup} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Load bus</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && <Text style={styles.hint}>Loading route details...</Text>}
      {loadError && <Text style={styles.errorText}>{loadError}</Text>}

      {bus && (
        <View style={styles.card}>
          <Text style={styles.busTitle}>{bus.routeCode} - {bus.routeName}</Text>
          <Text style={styles.busMeta}>Bus: {bus.busNumber}</Text>
          <Text style={styles.busMeta}>Type: {bus.busType || 'Unknown'}</Text>
          <Text style={styles.sectionHeading}>Stops</Text>
          <View style={styles.stopsRow}>
            {bus.stops.map(stop => (
              <View key={stop} style={styles.stopChip}>
                <Text style={styles.stopChipText}>{stop}</Text>
              </View>
            ))}
          </View>
          {renderStopButtons('From', fromStop, setFromStop)}
          {renderStopButtons('To', toStop, setToStop)}
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Calculated fare</Text>
            <Text style={styles.fareValue}>{fare !== null ? `Rs ${fare.toFixed(2)}` : 'Select stops'}</Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={proceedToTicket}>
            <Text style={styles.primaryButtonText}>Pay & Generate Ticket</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#0B1828',
    flexGrow: 1
  },
  heading: {
    fontSize: 20,
    color: '#EAF2FF',
    marginBottom: 12,
    fontWeight: '600',
    textAlign: 'center'
  },
  scannerShell: {
    height: 260,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1F4C78',
    backgroundColor: '#0F1E30'
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: 8
  },
  overlayText: {
    color: '#EAF2FF',
    textAlign: 'center'
  },
  scanButton: {
    backgroundColor: '#4DD4AC',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center'
  },
  scanButtonText: {
    color: '#0B1828',
    fontSize: 15,
    fontWeight: '700'
  },
  manualCard: {
    backgroundColor: '#102238',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F4C78',
    marginBottom: 12
  },
  manualLabel: {
    color: '#A6BDD8',
    marginBottom: 8,
    fontWeight: '600'
  },
  manualRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center'
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#0F1E30',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#EAF2FF',
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  secondaryButton: {
    backgroundColor: '#16395B',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  secondaryButtonText: {
    color: '#EAF2FF',
    fontWeight: '700'
  },
  card: {
    backgroundColor: '#102238',
    padding: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4
  },
  busTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EAF2FF'
  },
  busMeta: {
    color: '#A6BDD8',
    marginTop: 4
  },
  sectionHeading: {
    color: '#A6BDD8',
    marginTop: 12,
    marginBottom: 6
  },
  stopsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  stopChip: {
    backgroundColor: '#16395B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  stopChipText: {
    color: '#EAF2FF'
  },
  stopGroup: {
    marginTop: 14
  },
  label: {
    color: '#EAF2FF',
    marginBottom: 6,
    fontWeight: '600'
  },
  stopList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  stopPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#16395B',
    borderWidth: 1,
    borderColor: '#16395B'
  },
  stopPillSelected: {
    borderColor: '#4DD4AC',
    backgroundColor: '#1D4A6F'
  },
  stopText: {
    color: '#EAF2FF'
  },
  stopTextSelected: {
    color: '#4DD4AC',
    fontWeight: '700'
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#1F4C78'
  },
  fareLabel: {
    color: '#A6BDD8'
  },
  fareValue: {
    color: '#EAF2FF',
    fontSize: 18,
    fontWeight: '700'
  },
  permissionCard: {
    backgroundColor: '#291515',
    borderColor: '#7A1F1F',
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12
  },
  permissionText: {
    color: '#F5B7B7'
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: '#4DD4AC',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#0B1828',
    fontWeight: '700',
    fontSize: 16
  },
  hint: {
    color: '#A6BDD8',
    marginBottom: 12
  },
  errorText: {
    color: '#F5B7B7',
    marginBottom: 12
  }
});

export default QRScannerScreen;
