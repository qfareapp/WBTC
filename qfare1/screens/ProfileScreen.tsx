import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BottomTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { getTickets, markTicketExpired, StoredTicket } from '../lib/ticketStorage';
import { palette } from '../lib/theme';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<BottomTabParamList, 'Profile'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const PRIVACY_POLICY_URL = 'https://wbtc-rose.vercel.app/qfare-privacy-policy';

const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [tickets, setTickets] = useState<StoredTicket[]>([]);
  const [validating, setValidating] = useState(false);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        const stored = await getTickets();
        if (!cancelled) setTickets(stored);

        // Re-validate any locally-active tickets against the backend
        const active = stored.filter(t => t.ticketStatus === 'active' && t.bookingId);
        if (!active.length) return;

        setValidating(true);
        await Promise.all(
          active.map(async t => {
            try {
              const data = await apiGet<{ valid: boolean; tripEndedAt: string | null }>(
                `/api/public/bookings/${encodeURIComponent(t.bookingId)}/status`
              );
              if (!data.valid) {
                await markTicketExpired(t.bookingId, data.tripEndedAt ?? new Date().toISOString());
              }
            } catch { /* non-fatal */ }
          })
        );

        if (!cancelled) {
          const refreshed = await getTickets();
          setTickets(refreshed);
        }
        if (!cancelled) setValidating(false);
      };

      void load();
      return () => { cancelled = true; };
    }, [])
  );

  const liveTickets   = tickets.filter(t => t.ticketStatus === 'active');
  const historyTickets = tickets.filter(t => t.ticketStatus === 'expired');

  const totalTrips  = tickets.length;
  const totalSpend  = tickets.reduce((sum, t) => sum + t.fare, 0);

  const renderTicketCard = (ticket: StoredTicket) => {
    const isActive = ticket.ticketStatus === 'active';
    const dateLabel = new Date(ticket.bookedAt).toLocaleDateString([], {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const timeLabel = new Date(ticket.bookedAt).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });

    const openTicket = () => navigation.navigate('Ticket', {
      source: ticket.source,
      destination: ticket.destination,
      fare: ticket.fare,
      passengerCount: ticket.passengerCount,
      busNumber: ticket.busNumber,
      routeCode: ticket.routeCode,
      routeName: ticket.routeName,
      bookingId: ticket.bookingId,
      bookedAt: ticket.bookedAt,
      tripInstanceId: ticket.tripInstanceId,
    });

    const cardContent = (
      <>
        {/* Status stripe */}
        <View style={[styles.ticketStripe, isActive ? styles.stripeActive : styles.stripeExpired]} />

        <View style={styles.ticketBody}>
          {/* Top row: route badge + status pill */}
          <View style={styles.ticketTopRow}>
            <View style={styles.routeCodeBadge}>
              <Text style={styles.routeCodeText}>{ticket.routeCode}</Text>
            </View>
            <View style={styles.ticketTopRight}>
              {isActive ? (
                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activePillText}>ACTIVE</Text>
                </View>
              ) : (
                <View style={styles.expiredPill}>
                  <Text style={styles.expiredPillText}>EXPIRED</Text>
                </View>
              )}
              {isActive && (
                <Ionicons name="chevron-forward" size={14} color={palette.accent} />
              )}
            </View>
          </View>

          {/* Route name */}
          <Text style={styles.routeName} numberOfLines={1}>{ticket.routeName}</Text>

          {/* Journey stops */}
          <View style={styles.journeyRow}>
            <View style={styles.journeyStop}>
              <Ionicons name="navigate" size={11} color={palette.accent} />
              <Text style={styles.journeyStopText} numberOfLines={1}>{ticket.source}</Text>
            </View>
            <Ionicons name="arrow-forward" size={12} color={palette.textFaint} />
            <View style={styles.journeyStop}>
              <Ionicons name="location" size={11} color={palette.blue} />
              <Text style={[styles.journeyStopText, { color: palette.blue }]} numberOfLines={1}>
                {ticket.destination}
              </Text>
            </View>
          </View>

          {/* Bottom row: meta + fare */}
          <View style={styles.ticketBottomRow}>
            <View style={styles.metaGroup}>
              <View style={styles.metaItem}>
                <Ionicons name="bus-outline" size={11} color={palette.textFaint} />
                <Text style={styles.metaText}>{ticket.busNumber}</Text>
              </View>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={11} color={palette.textFaint} />
                <Text style={styles.metaText}>{ticket.passengerCount} pax</Text>
              </View>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{dateLabel} · {timeLabel}</Text>
            </View>
            <Text style={[styles.fareText, isActive && styles.fareTextActive]}>
              ₹{ticket.fare.toFixed(2)}
            </Text>
          </View>
        </View>
      </>
    );

    if (isActive) {
      return (
        <TouchableOpacity
          key={ticket.bookingId}
          style={[styles.ticketCard, styles.ticketCardActive]}
          onPress={openTicket}
          activeOpacity={0.75}
        >
          {cardContent}
        </TouchableOpacity>
      );
    }

    return (
      <View key={ticket.bookingId} style={styles.ticketCard}>
        {cardContent}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.brandPill}>
          <Text style={styles.brandQ}>q</Text>
          <Text style={styles.brandFare}>fare</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={palette.danger} />
        </TouchableOpacity>
      </View>

      {/* Avatar section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>
            {user?.name ? user.name.trim()[0].toUpperCase() : 'P'}
          </Text>
        </View>
        <Text style={styles.profileName}>{user?.name ?? 'Passenger'}</Text>
        <View style={styles.memberBadge}>
          <Ionicons name="shield-checkmark-outline" size={12} color={palette.accent} />
          <Text style={styles.memberBadgeText}>qfare member</Text>
        </View>
      </View>

      {/* User details card */}
      {user && (
        <View style={styles.userDetailsCard}>
          <View style={styles.userDetailRow}>
            <Ionicons name="mail-outline" size={14} color={palette.textFaint} />
            <Text style={styles.userDetailText}>{user.email}</Text>
          </View>
          {user.phone ? (
            <View style={styles.userDetailRow}>
              <Ionicons name="call-outline" size={14} color={palette.textFaint} />
              <Text style={styles.userDetailText}>{user.phone}</Text>
            </View>
          ) : null}
          {user.address1 ? (
            <View style={styles.userDetailRow}>
              <Ionicons name="location-outline" size={14} color={palette.textFaint} />
              <Text style={styles.userDetailText}>
                {[user.address1, user.address2].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{totalTrips}</Text>
          <Text style={styles.statLabel}>Trips</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{liveTickets.length}</Text>
          <Text style={styles.statLabel}>Live</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>
            {totalSpend > 0 ? `₹${totalSpend.toFixed(0)}` : '—'}
          </Text>
          <Text style={styles.statLabel}>Spent</Text>
        </View>
      </View>

      {/* Live Tickets */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>Live Tickets</Text>
          {validating && (
            <ActivityIndicator size="small" color={palette.accent} style={{ marginLeft: 4 }} />
          )}
          {liveTickets.length > 0 && !validating && (
            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>{liveTickets.length}</Text>
            </View>
          )}
        </View>

        {liveTickets.length === 0 ? (
          <View style={styles.liveEmptyCard}>
            <View style={styles.liveEmptyIcon}>
              <Ionicons name="bus-outline" size={22} color={palette.textFaint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.liveEmptyTitle}>No live tickets</Text>
              <Text style={styles.liveEmptyText}>
                Scan a bus QR code to get a ticket. It will appear here while the trip is active.
              </Text>
            </View>
          </View>
        ) : (
          liveTickets.map(renderTicketCard)
        )}
      </View>

      {/* Ticket history */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionBar, styles.sectionBarBlue]} />
          <Text style={styles.sectionTitle}>Ticket History</Text>
          {historyTickets.length > 0 && (
            <View style={[styles.sectionCount, styles.sectionCountMuted]}>
              <Text style={[styles.sectionCountText, { color: palette.textMuted }]}>
                {historyTickets.length}
              </Text>
            </View>
          )}
        </View>

        {historyTickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={28} color={palette.textFaint} />
            <Text style={styles.emptyTitle}>No past tickets yet</Text>
            <Text style={styles.emptyText}>
              Tickets appear here once your trip ends.
            </Text>
          </View>
        ) : (
          historyTickets.map(renderTicketCard)
        )}
      </View>

      <View style={styles.versionRow}>
        <Text style={styles.versionText}>qfare · v1.0.0</Text>
        <Text style={styles.privacyLink} onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }}>
          Privacy Policy
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 20, paddingBottom: 32 },

  topBar: { marginBottom: 24, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandPill: {
    alignSelf: 'flex-start', backgroundColor: palette.surfaceMuted, borderWidth: 1,
    borderColor: palette.border, borderRadius: 14, paddingHorizontal: 16,
    paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 1,
  },
  brandQ: { color: palette.accent, fontSize: 20, fontWeight: '900' },
  brandFare: { color: palette.text, fontSize: 20, fontWeight: '900' },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center',
  },

  userDetailsCard: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 16, padding: 14, marginBottom: 16, gap: 10,
  },
  userDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userDetailText: { color: palette.textMuted, fontSize: 13, flex: 1 },

  avatarSection: { alignItems: 'center', marginBottom: 20, gap: 10 },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: palette.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: palette.accent,
  },
  avatarInitials: { color: '#fff', fontSize: 30, fontWeight: '900' },
  profileName: { color: palette.text, fontSize: 20, fontWeight: '800' },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.28)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
  },
  memberBadgeText: { color: palette.accent, fontSize: 12, fontWeight: '700' },

  statsCard: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 20, padding: 18, flexDirection: 'row', marginBottom: 20,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: palette.text, fontSize: 22, fontWeight: '900' },
  statLabel: {
    color: palette.textFaint, fontSize: 11.5, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  statDivider: { width: 1, backgroundColor: palette.border, marginHorizontal: 4 },

  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  sectionBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: palette.accent },
  sectionBarBlue: { backgroundColor: palette.blue },
  sectionTitle: { color: palette.text, fontSize: 15, fontWeight: '800', flex: 1 },
  sectionCount: {
    backgroundColor: palette.accentSoft, borderWidth: 1,
    borderColor: 'rgba(0,200,150,0.28)', borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  sectionCountMuted: { backgroundColor: palette.surfaceStrong, borderColor: palette.border },
  sectionCountText: { color: palette.accent, fontSize: 11, fontWeight: '800' },

  // Ticket card
  ticketCard: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 18, marginBottom: 10, overflow: 'hidden', flexDirection: 'row',
  },
  ticketCardActive: { borderColor: 'rgba(0, 200, 150, 0.30)' },
  ticketStripe: { width: 4 },
  stripeActive: { backgroundColor: palette.accent },
  stripeExpired: { backgroundColor: palette.border },
  ticketBody: { flex: 1, padding: 14, gap: 8 },

  ticketTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeCodeBadge: {
    backgroundColor: palette.blueSoft, borderWidth: 1,
    borderColor: 'rgba(68, 153, 255, 0.30)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  routeCodeText: { color: palette.blue, fontSize: 11, fontWeight: '800' },
  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: palette.accentSoft, borderWidth: 1,
    borderColor: 'rgba(0,200,150,0.30)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.accent },
  activePillText: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  expiredPill: {
    backgroundColor: palette.surfaceStrong, borderWidth: 1,
    borderColor: palette.border, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  expiredPillText: { color: palette.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  routeName: { color: palette.text, fontSize: 13.5, fontWeight: '700' },

  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  journeyStop: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  journeyStopText: { color: palette.accent, fontSize: 12.5, fontWeight: '700', flex: 1 },

  ticketBottomRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', marginTop: 2,
  },
  metaGroup: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: palette.textFaint },
  metaText: { color: palette.textFaint, fontSize: 11 },
  fareText: { color: palette.textMuted, fontSize: 15, fontWeight: '900' },
  fareTextActive: { color: palette.gold },

  liveEmptyCard: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  liveEmptyIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center',
  },
  liveEmptyTitle: { color: palette.textMuted, fontSize: 13.5, fontWeight: '700', marginBottom: 3 },
  liveEmptyText: { color: palette.textFaint, fontSize: 12, lineHeight: 17 },

  emptyState: {
    backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border,
    borderRadius: 18, padding: 24, alignItems: 'center', gap: 8,
  },
  emptyTitle: { color: palette.textMuted, fontSize: 14, fontWeight: '700' },
  emptyText: { color: palette.textFaint, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },

  versionRow: { alignItems: 'center', marginTop: 6 },
  versionText: { color: palette.textFaint, fontSize: 12, fontWeight: '600' },
  privacyLink: {
    color: palette.blue,
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 8,
    textDecorationLine: 'underline',
  },
});

export default ProfileScreen;

