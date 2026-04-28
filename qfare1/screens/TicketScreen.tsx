import React, { useEffect, useRef, useState } from 'react';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { apiGet } from '../lib/api';
import { markTicketExpired } from '../lib/ticketStorage';
import { palette } from '../lib/theme';

type Props = {
  route: RouteProp<RootStackParamList, 'Ticket'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Ticket'>;
};

const Perf = () => (
  <View style={styles.perfRow}>
    <View style={styles.perfNib} />
    <View style={styles.perfDashes}>
      {Array.from({ length: 28 }, (_, i) => <View key={i} style={styles.perfDash} />)}
    </View>
    <View style={styles.perfNib} />
  </View>
);

type TripStatus = 'Active' | 'Completed' | 'Cancelled' | 'Scheduled' | null;

const TicketScreen: React.FC<Props> = ({ route, navigation }) => {
  const {
    source, destination, fare, passengerCount,
    busNumber, routeCode, routeName, bookingId, bookedAt, tripInstanceId,
  } = route.params;

  const [tripStatus, setTripStatus] = useState<TripStatus>('Active');
  const [ticketValid, setTicketValid] = useState(true);
  const hasExpired = useRef(false);

  // Poll validity every 12 seconds while ticket is active
  useEffect(() => {
    if (!bookingId) return;

    const check = async () => {
      try {
        const data = await apiGet<{ valid: boolean; tripStatus: TripStatus; tripEndedAt: string | null }>(
          `/api/public/bookings/${encodeURIComponent(bookingId)}/status`
        );
        setTripStatus(data.tripStatus);
        setTicketValid(data.valid);
        if (!data.valid && !hasExpired.current) {
          hasExpired.current = true;
          const expiredAt = data.tripEndedAt ?? new Date().toISOString();
          void markTicketExpired(bookingId, expiredAt);
        }
      } catch { /* non-fatal — keep showing last known state */ }
    };

    void check();
    const interval = setInterval(() => { void check(); }, 12000);
    return () => clearInterval(interval);
  }, [bookingId]);

  const ticketId = bookingId || `TKT-${busNumber}-${Date.now()}`;
  const farePerPerson = passengerCount > 1 ? fare / passengerCount : null;
  const bookedDate = bookedAt
    ? new Date(bookedAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  const bookedTime = bookedAt
    ? new Date(bookedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header outside ticket ── */}
      <View style={styles.header}>
        <View style={styles.successRing}>
          <Ionicons name="checkmark" size={24} color={palette.accent} />
        </View>
        <View>
          <Text style={styles.headerTitle}>Ticket Confirmed</Text>
          <Text style={styles.headerSub}>Your journey is ready</Text>
        </View>
      </View>

      {/* ── Ticket card ── */}
      <View style={[styles.ticket, !ticketValid && styles.ticketExpired]}>

        {/* ── STUB: brand + status ── */}
        <View style={[styles.stub, !ticketValid && styles.stubExpired]}>
          <View style={styles.brandRow}>
            <Text style={styles.brandQ}>q</Text>
            <Text style={[styles.brandFare, !ticketValid && styles.brandFareExpired]}>fare</Text>
            <Text style={styles.brandType}>  Unreserved</Text>
          </View>
          {ticketValid ? (
            <View style={styles.activePill}>
              <View style={styles.activeDot} />
              <Text style={styles.activePillText}>VALID</Text>
            </View>
          ) : (
            <View style={styles.expiredPill}>
              <Ionicons name="time-outline" size={12} color={palette.textMuted} />
              <Text style={styles.expiredPillText}>EXPIRED</Text>
            </View>
          )}
        </View>

        {/* ── Route + bus info ── */}
        <View style={styles.routeSection}>
          <View style={styles.routeTopRow}>
            <View style={styles.routeCodeBadge}>
              <Text style={styles.routeCodeText}>{routeCode}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="bus-outline" size={12} color={palette.textFaint} />
              <Text style={styles.metaText}>{busNumber}</Text>
            </View>
          </View>
          <Text style={styles.routeName} numberOfLines={2}>{routeName}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={12} color={palette.textFaint} />
            <Text style={styles.metaText}>{bookedDate}</Text>
            <View style={styles.metaDot} />
            <Ionicons name="time-outline" size={12} color={palette.textFaint} />
            <Text style={styles.metaText}>{bookedTime}</Text>
          </View>
        </View>

        {/* ── Expired notice ── */}
        {!ticketValid && (
          <View style={styles.expiredBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={palette.textMuted} />
            <Text style={styles.expiredBannerText}>
              This trip has ended. Ticket moved to your history.
            </Text>
          </View>
        )}

        {/* ── Perforation ── */}
        <Perf />

        {/* ── Journey hero ── */}
        <View style={styles.journeySection}>
          {/* From */}
          <View style={styles.journeyHalf}>
            <Text style={styles.journeyDirectionLabel}>FROM</Text>
            <View style={styles.journeyDot}>
              <View style={styles.journeyDotInner} />
            </View>
            <Text style={styles.journeyStopName} numberOfLines={2}>{source}</Text>
          </View>

          {/* Arrow spine */}
          <View style={styles.journeySpine}>
            <View style={styles.spineLine} />
            <View style={styles.spineArrow}>
              <Ionicons name="arrow-forward" size={14} color={palette.text} />
            </View>
            <View style={styles.spineLine} />
          </View>

          {/* To */}
          <View style={[styles.journeyHalf, styles.journeyHalfRight]}>
            <Text style={[styles.journeyDirectionLabel, styles.journeyDirectionLabelTo]}>TO</Text>
            <View style={[styles.journeyDot, styles.journeyDotTo]}>
              <View style={[styles.journeyDotInner, styles.journeyDotInnerTo]} />
            </View>
            <Text style={[styles.journeyStopName, styles.journeyStopNameTo]} numberOfLines={2}>
              {destination}
            </Text>
          </View>
        </View>

        {/* ── Perforation ── */}
        <Perf />

        {/* ── Fare + passengers ── */}
        <View style={styles.fareSection}>
          <View style={styles.fareLeft}>
            <Text style={styles.fareLabel}>TOTAL FARE</Text>
            {farePerPerson !== null ? (
              <Text style={styles.fareBreakdown}>
                ₹{farePerPerson.toFixed(2)} × {passengerCount} pax
              </Text>
            ) : (
              <Text style={styles.fareBreakdown}>1 passenger · One way</Text>
            )}
          </View>
          <View style={styles.fareRight}>
            <Text style={styles.fareCurrency}>₹</Text>
            <Text style={styles.fareAmount}>{fare.toFixed(2)}</Text>
          </View>
        </View>

        {/* Passengers row */}
        <View style={styles.passengerRow}>
          <Ionicons name="people-outline" size={13} color={palette.textMuted} />
          <Text style={styles.passengerText}>
            {passengerCount} {passengerCount === 1 ? 'Passenger' : 'Passengers'}
          </Text>
          <View style={styles.metaDot} />
          <Ionicons name="bus-outline" size={13} color={palette.textMuted} />
          <Text style={styles.passengerText}>Unreserved · One way</Text>
        </View>

        {/* ── Perforation ── */}
        <Perf />

        {/* ── Ticket ID footer ── */}
        <View style={styles.ticketFooter}>
          <View style={styles.ticketIdRow}>
            <Ionicons name="receipt-outline" size={13} color={palette.textFaint} />
            <Text style={styles.ticketIdText} numberOfLines={1}>{ticketId}</Text>
          </View>
          <Text style={styles.helperText}>Present to conductor or inspector on request</Text>
        </View>

      </View>

      {/* ── Back to Home ── */}
      <TouchableOpacity style={styles.homeButton} onPress={() => navigation.popToTop()}>
        <Ionicons name="home-outline" size={17} color="#fff" />
        <Text style={styles.homeButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  scrollContent: { padding: 20, paddingBottom: 36 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 24, paddingHorizontal: 4,
  },
  successRing: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: palette.accentSoft,
    borderWidth: 1.5, borderColor: palette.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: palette.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  headerSub: { color: palette.textMuted, fontSize: 13, marginTop: 2 },

  // Ticket shell
  ticket: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    overflow: 'hidden',
    marginBottom: 16,
  },
  ticketExpired: { opacity: 0.75 },

  // Stub (brand + status)
  stub: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: palette.accentDeep,
    paddingHorizontal: 18, paddingVertical: 14,
  },
  stubExpired: { backgroundColor: palette.surfaceStrong },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandQ: { color: palette.accent, fontSize: 22, fontWeight: '900' },
  brandFare: { color: '#f8fffc', fontSize: 22, fontWeight: '900' },
  brandFareExpired: { color: palette.textMuted },
  brandType: { color: 'rgba(248,255,252,0.62)', fontSize: 12, fontWeight: '600', marginTop: 4 },
  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0, 200, 150, 0.18)',
    borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.40)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  activePillText: { color: palette.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  expiredPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(237, 245, 255, 0.06)',
    borderWidth: 1, borderColor: palette.border,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  expiredPillText: { color: palette.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  expiredBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(237, 245, 255, 0.04)',
    borderBottomWidth: 1, borderBottomColor: palette.border,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  expiredBannerText: { flex: 1, color: palette.textMuted, fontSize: 12.5, lineHeight: 18 },

  // Route section
  routeSection: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4, gap: 6 },
  routeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routeCodeBadge: {
    backgroundColor: palette.blueSoft, borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.30)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  routeCodeText: { color: palette.blue, fontSize: 12, fontWeight: '800' },
  routeName: { color: palette.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: palette.textMuted, fontSize: 12 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: palette.textFaint },

  // Perforation
  perfRow: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 2,
  },
  perfNib: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: palette.bg,
    marginHorizontal: -8,
    zIndex: 1,
    borderWidth: 1, borderColor: palette.borderStrong,
  },
  perfDashes: {
    flex: 1, flexDirection: 'row', gap: 3, paddingHorizontal: 4,
    height: 16, alignItems: 'center',
  },
  perfDash: {
    flex: 1, height: 1.5,
    backgroundColor: 'rgba(16, 36, 60, 0.12)', borderRadius: 1,
  },

  // Journey section
  journeySection: {
    flexDirection: 'row', alignItems: 'stretch',
    paddingHorizontal: 18, paddingVertical: 20, gap: 0,
  },
  journeyHalf: { flex: 1, gap: 8 },
  journeyHalfRight: { alignItems: 'flex-end' },
  journeyDirectionLabel: {
    color: palette.accent, fontSize: 10, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 1.4,
  },
  journeyDirectionLabelTo: { color: palette.blue },
  journeyDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: palette.accentSoft,
    borderWidth: 1.5, borderColor: palette.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  journeyDotTo: { backgroundColor: palette.blueSoft, borderColor: palette.blue },
  journeyDotInner: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent,
  },
  journeyDotInnerTo: { backgroundColor: palette.blue },
  journeyStopName: {
    color: palette.text, fontSize: 17, fontWeight: '900',
    letterSpacing: -0.3, lineHeight: 22,
  },
  journeyStopNameTo: { textAlign: 'right' },

  // Arrow spine between stops
  journeySpine: {
    width: 48, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'column', gap: 4, paddingTop: 36,
  },
  spineLine: { width: 1, flex: 1, backgroundColor: palette.border, maxHeight: 24 },
  spineArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Fare section
  fareSection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8,
  },
  fareLeft: { gap: 4 },
  fareLabel: {
    color: palette.textMuted, fontSize: 10.5, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  fareBreakdown: { color: palette.textFaint, fontSize: 12 },
  fareRight: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  fareCurrency: {
    color: palette.gold, fontSize: 18, fontWeight: '800', marginTop: 5,
  },
  fareAmount: {
    color: palette.gold, fontSize: 38, fontWeight: '900', letterSpacing: -1,
  },

  // Passengers info row
  passengerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingBottom: 14,
  },
  passengerText: { color: palette.textMuted, fontSize: 12 },

  // Footer
  ticketFooter: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18, gap: 6 },
  ticketIdRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ticketIdText: {
    flex: 1, color: palette.textFaint, fontSize: 12,
    fontWeight: '600', letterSpacing: 0.3,
  },
  helperText: { color: palette.textFaint, fontSize: 11.5, lineHeight: 17 },

  // Home button
  homeButton: {
    backgroundColor: palette.accentDeep, paddingVertical: 16, borderRadius: 18,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: palette.accent,
  },
  homeButtonText: { color: '#fff', fontSize: 15.5, fontWeight: '900' },
});

export default TicketScreen;
