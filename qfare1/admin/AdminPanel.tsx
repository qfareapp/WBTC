import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const AdminPanel: React.FC = () => {
  const [routeName, setRouteName] = useState('');
  const [busId, setBusId] = useState('');
  const [regNo, setRegNo] = useState('');
  const [owner, setOwner] = useState('');
  const [fareChart, setFareChart] = useState('');
  const [stopInput, setStopInput] = useState('');
  const [stopKm, setStopKm] = useState('');
  const [segmentKm, setSegmentKm] = useState('');
  const [stops, setStops] = useState<{ name: string; km: number; segment: number }[]>([]);
  const [fareFrom, setFareFrom] = useState('');
  const [fareTo, setFareTo] = useState('');
  const [fareAmount, setFareAmount] = useState('');
  const [fareRules, setFareRules] = useState<{ from: string; to: string; amount: number }[]>([]);
  const [qrData, setQrData] = useState('');

  const isReady = useMemo(
    () => routeName && busId && regNo && owner,
    [routeName, busId, regNo, owner]
  );

  const addStop = () => {
    const trimmed = stopInput.trim();
    const kmNum = parseFloat(stopKm);
    const segNum = parseFloat(segmentKm);
    if (!trimmed) return;
    const baseKm = stops.length === 0 ? 0 : stops[stops.length - 1].km;
    const validSeg = stops.length === 0 ? 0 : Number.isNaN(segNum) ? 0 : segNum;
    const nextKm = stops.length === 0 ? (Number.isNaN(kmNum) ? 0 : kmNum) : baseKm + validSeg;
    setStops(prev => [...prev, { name: trimmed, km: nextKm, segment: validSeg }]);
    setStopInput('');
    setStopKm('');
    setSegmentKm('');
  };

  const generateQr = () => {
    const payload = {
      busId,
      regNo,
      route: routeName,
      owner,
      stops,
      fareRules,
      fareChart: fareChart || 'See backend for structured table',
      issuedAt: Date.now()
    };
    setQrData(JSON.stringify(payload, null, 2));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.heading}>Admin panel</Text>
      <Text style={styles.subhead}>Enter bus metadata and generate QR payloads.</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Route name/number</Text>
        <TextInput
          value={routeName}
          onChangeText={setRouteName}
          placeholder="12A - Central Station to Tech Park"
          placeholderTextColor="#567"
          style={styles.input}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Bus ID</Text>
        <TextInput
          value={busId}
          onChangeText={setBusId}
          placeholder="BUS-4821"
          placeholderTextColor="#567"
          style={styles.input}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Registration number</Text>
        <TextInput
          value={regNo}
          onChangeText={setRegNo}
          placeholder="KA 01 AB 4821"
          placeholderTextColor="#567"
          style={styles.input}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Owner / Operator</Text>
        <TextInput
          value={owner}
          onChangeText={setOwner}
          placeholder="Metro City Transport"
          placeholderTextColor="#567"
          style={styles.input}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Fare chart (notes)</Text>
        <TextInput
          value={fareChart}
          onChangeText={setFareChart}
          placeholder="Zone 1: 110, Zone 2: 115 ..."
          placeholderTextColor="#567"
          multiline
          numberOfLines={4}
          style={[styles.input, styles.multiline]}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Stops (sequence)</Text>
        <View style={styles.row}>
          <TextInput
            value={stopInput}
            onChangeText={setStopInput}
            placeholder="Central Station"
            placeholderTextColor="#567"
            style={[styles.input, styles.flex1]}
          />
          <TextInput
            value={stopKm}
            onChangeText={setStopKm}
            placeholder="Start km (first stop)"
            placeholderTextColor="#567"
            keyboardType="numeric"
            style={[styles.input, styles.amountInput]}
          />
          <TextInput
            value={segmentKm}
            onChangeText={setSegmentKm}
            placeholder="Segment km"
            placeholderTextColor="#567"
            keyboardType="numeric"
            style={[styles.input, styles.amountInput]}
          />
          <TouchableOpacity style={styles.secondaryButton} onPress={addStop}>
            <Text style={styles.secondaryButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {stops.length > 0 ? (
          <View style={styles.stopList}>
            {stops.map((stop, idx) => (
              <Text key={`${stop.name}-${idx}`} style={styles.stopChip}>
                {idx + 1}. {stop.name} - {stop.km} km (+{idx === 0 ? 0 : stop.segment} km)
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>Add stops in the order the bus visits them.</Text>
        )}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Fare rules (from/to)</Text>
        <View style={styles.row}>
          <TextInput
            value={fareFrom}
            onChangeText={setFareFrom}
            placeholder="Esplanade"
            placeholderTextColor="#567"
            style={[styles.input, styles.flex1]}
          />
          <TextInput
            value={fareTo}
            onChangeText={setFareTo}
            placeholder="Wellington"
            placeholderTextColor="#567"
            style={[styles.input, styles.flex1]}
          />
          <TextInput
            value={fareAmount}
            onChangeText={setFareAmount}
            placeholder="7.00"
            placeholderTextColor="#567"
            keyboardType="numeric"
            style={[styles.input, styles.amountInput]}
          />
        </View>
        <TouchableOpacity
          style={[styles.secondaryButton, styles.fullWidthButton]}
          onPress={() => {
            if (!fareFrom.trim() || !fareTo.trim() || !fareAmount.trim()) return;
            const amountNum = parseFloat(fareAmount);
            if (Number.isNaN(amountNum)) return;
            setFareRules(prev => [...prev, { from: fareFrom.trim(), to: fareTo.trim(), amount: amountNum }]);
            setFareFrom('');
            setFareTo('');
            setFareAmount('');
          }}
        >
          <Text style={styles.secondaryButtonText}>Add fare</Text>
        </TouchableOpacity>
        {fareRules.length > 0 ? (
          <View style={styles.fareList}>
            {fareRules.map((rule, idx) => (
              <Text key={`${rule.from}-${rule.to}-${idx}`} style={styles.stopChip}>
                {rule.from} -> {rule.to}: ${rule.amount.toFixed(2)}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>Add fares per origin/destination (e.g., from the matrix).</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, !isReady && styles.primaryButtonDisabled]}
        onPress={generateQr}
        disabled={!isReady}
      >
        <Text style={styles.primaryButtonText}>Generate QR data</Text>
      </TouchableOpacity>

      {qrData ? (
        <View style={styles.qrCard}>
          <Text style={styles.label}>QR payload (copy to generator/print)</Text>
          <Text style={styles.code}>{qrData}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>Fill required fields to generate a QR payload.</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1828',
    padding: 20
  },
  heading: {
    color: '#EAF2FF',
    fontSize: 22,
    fontWeight: '800'
  },
  subhead: {
    color: '#A6BDD8',
    marginTop: 6,
    marginBottom: 16
  },
  formGroup: {
    marginBottom: 14
  },
  label: {
    color: '#EAF2FF',
    marginBottom: 6,
    fontWeight: '700'
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center'
  },
  flex1: {
    flex: 1
  },
  input: {
    backgroundColor: '#102238',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#EAF2FF',
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  amountInput: {
    width: 90
  },
  fullWidthButton: {
    marginTop: 8,
    width: '100%',
    justifyContent: 'center'
  },
  multiline: {
    height: 110,
    textAlignVertical: 'top'
  },
  primaryButton: {
    backgroundColor: '#4DD4AC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4
  },
  secondaryButton: {
    backgroundColor: '#16395B',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  secondaryButtonText: {
    color: '#EAF2FF',
    fontWeight: '700'
  },
  primaryButtonDisabled: {
    backgroundColor: '#2B5347'
  },
  primaryButtonText: {
    color: '#0B1828',
    fontWeight: '800',
    fontSize: 16
  },
  qrCard: {
    marginTop: 18,
    backgroundColor: '#102238',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  stopList: {
    marginTop: 10,
    gap: 6
  },
  fareList: {
    marginTop: 10,
    gap: 6
  },
  stopChip: {
    color: '#EAF2FF',
    backgroundColor: '#0F1E30',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  code: {
    color: '#EAF2FF',
    fontFamily: 'monospace',
    marginTop: 8
  },
  hint: {
    color: '#A6BDD8',
    marginTop: 12
  }
});

export default AdminPanel;
