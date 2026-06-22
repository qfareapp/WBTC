import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { RootStackParamList } from '../navigation/AppNavigator';
import { palette } from '../lib/theme';

const HELP_WHATSAPP_NUMBER = '919831003953';
const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 10 : 16;

const buildWhatsAppUrl = (message: string) =>
  `https://wa.me/${HELP_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type SupportOption = {
  id: string;
  label: string;
  description?: string;
  nextNodeId: string;
};

type SupportNode = {
  id: string;
  title: string;
  message: string;
  helperText?: string;
  allowEscalation?: boolean;
  resolutionHints?: string[];
  recentBookingScope?: string;
  options: SupportOption[];
};

type SupportBooking = {
  bookingId: string;
  busNumber: string | null;
  routeId: string | null;
  source: string | null;
  destination: string | null;
  fare: number;
  passengerCount: number;
  status: string | null;
  paymentMode: string | null;
  paymentStatus: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  bookedAt: string | null;
  paymentCapturedAt: string | null;
};

type SupportResponse = {
  ok: boolean;
  node: SupportNode;
  context?: {
    recentBookings?: SupportBooking[];
  };
};

const LOCAL_SUPPORT_TREE: Record<string, SupportNode> = {
  root: {
    id: 'root',
    title: 'QFare Support',
    message: 'Tell us what you need help with. Choose the option that matches your issue.',
    helperText: 'You can continue with guided support or switch to WhatsApp anytime.',
    allowEscalation: true,
    options: [
      {
        id: 'booking_issue',
        label: 'Booking issue',
        description: 'Ticket missing, wrong stop selected, or route-related booking trouble.',
        nextNodeId: 'booking_issue',
      },
      {
        id: 'payment_issue',
        label: 'Payment issue',
        description: 'Money debited, refund pending, or payment verification problem.',
        nextNodeId: 'payment_issue',
      },
      {
        id: 'account_issue',
        label: 'Account or profile issue',
        description: 'Login trouble, phone/address updates, or passenger profile questions.',
        nextNodeId: 'account_issue',
      },
    ],
  },
  booking_issue: {
    id: 'booking_issue',
    title: 'Booking issue',
    message: 'Pick the booking problem you are facing.',
    allowEscalation: true,
    options: [
      {
        id: 'ticket_not_received',
        label: 'Ticket not received',
        description: 'Payment completed but the ticket did not appear.',
        nextNodeId: 'ticket_not_received',
      },
      {
        id: 'wrong_stop_or_route',
        label: 'Wrong stop or route selected',
        description: 'You selected the wrong boarding or destination stop.',
        nextNodeId: 'wrong_stop_or_route',
      },
      {
        id: 'booking_id_help',
        label: 'How to share booking details',
        description: 'Need to know what info support needs from you.',
        nextNodeId: 'booking_id_help',
      },
    ],
  },
  payment_issue: {
    id: 'payment_issue',
    title: 'Payment issue',
    message: 'Choose the payment issue you need help with.',
    allowEscalation: true,
    options: [
      {
        id: 'money_debited_no_ticket',
        label: 'Money debited but no ticket',
        description: 'Amount was deducted but booking is missing.',
        nextNodeId: 'money_debited_no_ticket',
      },
      {
        id: 'refund_status',
        label: 'Refund status',
        description: 'You are waiting for a reversal or refund update.',
        nextNodeId: 'refund_status',
      },
      {
        id: 'duplicate_charge',
        label: 'Duplicate or extra charge',
        description: 'The same booking or payment seems charged more than once.',
        nextNodeId: 'duplicate_charge',
      },
    ],
  },
  account_issue: {
    id: 'account_issue',
    title: 'Account or profile issue',
    message: 'Choose the account or profile issue you need help with.',
    allowEscalation: true,
    options: [
      {
        id: 'login_issue',
        label: 'Login or OTP issue',
        description: 'OTP not received or trouble signing in.',
        nextNodeId: 'login_issue',
      },
      {
        id: 'update_contact_info',
        label: 'Update mobile or address',
        description: 'Need help updating profile contact information.',
        nextNodeId: 'update_contact_info',
      },
      {
        id: 'favorites_or_app_issue',
        label: 'App or favourites issue',
        description: 'Saved favourites or app behavior is not working as expected.',
        nextNodeId: 'favorites_or_app_issue',
      },
    ],
  },
  ticket_not_received: {
    id: 'ticket_not_received',
    title: 'Ticket not received',
    message:
      'First, open Profile > Live Tickets and pull to refresh once. If the ticket still does not appear, contact support and include your booking ID, route, payment time, and registered email.',
    helperText: 'Escalate if the ticket is still missing after one refresh.',
    allowEscalation: true,
    resolutionHints: ['Refresh Live Tickets once', 'Keep booking/payment details ready'],
    options: [],
  },
  wrong_stop_or_route: {
    id: 'wrong_stop_or_route',
    title: 'Wrong stop or route selected',
    message:
      'If the booking is not yet used, contact support immediately with your booking ID and the correct source/destination details. Include what you selected and what you intended to select.',
    allowEscalation: true,
    resolutionHints: ['Share booking ID', 'Mention correct and incorrect stop details'],
    options: [],
  },
  booking_id_help: {
    id: 'booking_id_help',
    title: 'How to share booking details',
    message:
      'For faster help, share: booking ID, route code, bus number if visible, travel date, payment time, and your registered QFare email or passenger ID.',
    allowEscalation: true,
    resolutionHints: ['Booking ID', 'Route code', 'Travel date and payment time'],
    options: [],
  },
  money_debited_no_ticket: {
    id: 'money_debited_no_ticket',
    title: 'Money debited but no ticket',
    message:
      'Please wait a short while and refresh your Live Tickets once. If the ticket is still missing, contact support with your payment reference, amount, time of payment, and passenger ID.',
    allowEscalation: true,
    resolutionHints: ['Refresh once', 'Keep payment reference and amount ready'],
    options: [],
  },
  refund_status: {
    id: 'refund_status',
    title: 'Refund status',
    message:
      'Refund timing depends on the payment provider and bank. Contact support with your booking ID or payment reference if the refund has not appeared within the expected bank settlement time.',
    allowEscalation: true,
    resolutionHints: ['Share booking ID or payment reference', 'Mention when the charge happened'],
    options: [],
  },
  duplicate_charge: {
    id: 'duplicate_charge',
    title: 'Duplicate or extra charge',
    message:
      'Contact support with both transaction references, the charged amounts, and your passenger ID. This helps the team verify whether one payment failed or both were captured.',
    allowEscalation: true,
    resolutionHints: ['Share both transaction references', 'Mention both charged amounts'],
    options: [],
  },
  login_issue: {
    id: 'login_issue',
    title: 'Login or OTP issue',
    message:
      'Check that you are using the same registered email address. If the OTP still does not arrive, contact support and mention the email, the approximate time you requested the OTP, and whether the issue is repeatable.',
    allowEscalation: true,
    resolutionHints: ['Confirm registered email', 'Mention OTP request time'],
    options: [],
  },
  update_contact_info: {
    id: 'update_contact_info',
    title: 'Update mobile or address',
    message:
      'You can update mobile number and address directly from the Profile screen. Use the Edit button inside Contact details, then save the updated information.',
    allowEscalation: true,
    resolutionHints: ['Profile > Contact details > Edit'],
    options: [],
  },
  favorites_or_app_issue: {
    id: 'favorites_or_app_issue',
    title: 'App or favourites issue',
    message:
      'If favourites, saved settings, or another in-app feature is not behaving correctly, contact support and describe the exact screen, the steps you took, and whether reopening the app changes the behavior.',
    allowEscalation: true,
    resolutionHints: ['Mention the exact screen', 'Describe the steps to reproduce'],
    options: [],
  },
};

const getLocalSupportNode = (nodeId?: string) =>
  LOCAL_SUPPORT_TREE[String(nodeId || 'root').trim() || 'root'] ?? LOCAL_SUPPORT_TREE.root;

// Per-option icon + color theming
const OPTION_META: Record<string, { icon: IoniconsName; color: string; bg: string }> = {
  booking_issue:           { icon: 'receipt-outline',        color: '#00b887', bg: 'rgba(0,184,135,0.13)'  },
  payment_issue:           { icon: 'card-outline',           color: '#1f78db', bg: 'rgba(31,120,219,0.13)' },
  account_issue:           { icon: 'person-circle-outline',  color: '#c98b0e', bg: 'rgba(201,139,14,0.13)' },
  ticket_not_received:     { icon: 'ticket-outline',         color: '#00b887', bg: 'rgba(0,184,135,0.13)'  },
  wrong_stop_or_route:     { icon: 'map-outline',            color: '#1f78db', bg: 'rgba(31,120,219,0.13)' },
  booking_id_help:         { icon: 'document-text-outline',  color: '#c98b0e', bg: 'rgba(201,139,14,0.13)' },
  money_debited_no_ticket: { icon: 'wallet-outline',         color: '#d74262', bg: 'rgba(215,66,98,0.13)'  },
  refund_status:           { icon: 'refresh-circle-outline', color: '#1f78db', bg: 'rgba(31,120,219,0.13)' },
  duplicate_charge:        { icon: 'copy-outline',           color: '#c98b0e', bg: 'rgba(201,139,14,0.13)' },
  login_issue:             { icon: 'key-outline',            color: '#d74262', bg: 'rgba(215,66,98,0.13)'  },
  update_contact_info:     { icon: 'pencil-outline',         color: '#00b887', bg: 'rgba(0,184,135,0.13)'  },
  favorites_or_app_issue:  { icon: 'phone-portrait-outline', color: '#1f78db', bg: 'rgba(31,120,219,0.13)' },
};
const DEFAULT_META = { icon: 'help-circle-outline' as IoniconsName, color: palette.accent, bg: palette.accentSoft };
const getOptionMeta = (id: string) => OPTION_META[id] ?? DEFAULT_META;

const getStatusColor = (status: string | null) => {
  if (!status) return palette.textFaint;
  const s = status.toLowerCase();
  if (s === 'paid' || s === 'captured' || s === 'confirmed') return '#00b887';
  if (s === 'pending' || s === 'created') return '#c98b0e';
  if (s === 'failed' || s === 'cancelled') return '#d74262';
  return palette.textFaint;
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Support'>;
  route: RouteProp<RootStackParamList, 'Support'>;
};

const SupportScreen: React.FC<Props> = ({ navigation }) => {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentNode, setCurrentNode] = useState<SupportNode | null>(null);
  const [history, setHistory] = useState<SupportNode[]>([]);
  const [recentBookings, setRecentBookings] = useState<SupportBooking[]>([]);

  const loadNode = async (nodeId?: string, mode: 'replace' | 'push' = 'replace') => {
    if (!token) {
      setError('Please sign in again to continue.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const path = nodeId ? `/api/public/support/menu/${encodeURIComponent(nodeId)}` : '/api/public/support/menu';
      const data = await apiGet<SupportResponse>(path, token);
      setCurrentNode(data.node);
      setRecentBookings(data.context?.recentBookings ?? []);
      setHistory(current =>
        mode === 'push'
          ? [...current, data.node]
          : current.length
            ? [current[0], data.node].filter((node, index, arr) => arr.findIndex(item => item.id === node.id) === index)
            : [data.node]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load support options.';
      if (message === 'Route not found') {
        const localNode = getLocalSupportNode(nodeId);
        setCurrentNode(localNode);
        setRecentBookings([]);
        setHistory(current => (mode === 'push' ? [...current, localNode] : [localNode]));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNode();
  }, []);

  const trail = useMemo(() => {
    if (!history.length) return [];
    return history.map(node => node.title);
  }, [history]);

  const handleOptionPress = async (option: SupportOption) => {
    await loadNode(option.nextNodeId, 'push');
  };

  const handleBackStep = () => {
    if (history.length <= 1) {
      navigation.goBack();
      return;
    }
    const nextHistory = history.slice(0, -1);
    const previousNode = nextHistory[nextHistory.length - 1];
    setHistory(nextHistory);
    setCurrentNode(previousNode);
  };

  const handleRestart = async () => {
    setHistory([]);
    await loadNode();
  };

  const handleEscalate = () => {
    const flowSummary = trail.filter(title => title !== 'QFare Support').join(' > ') || 'General support';
    const recentSummary = recentBookings.slice(0, 2).map(booking => {
      const paymentRef = booking.razorpayPaymentId || booking.razorpayOrderId || '--';
      return `Booking ${booking.bookingId} | Payment ref: ${paymentRef} | Status: ${booking.paymentStatus || booking.status || '--'}`;
    });
    const message = [
      'Hello Admin, I need help.',
      'Role: Passenger',
      `Name: ${user?.name?.trim() || '--'}`,
      `Passenger ID: ${user?.id || '--'}`,
      `Email: ${user?.email || '--'}`,
      `Support flow: ${flowSummary}`,
      currentNode ? `Current topic: ${currentNode.title}` : null,
      recentSummary.length ? 'Recent bookings:' : null,
      ...recentSummary,
    ]
      .filter(Boolean)
      .join('\n');

    Linking.openURL(buildWhatsAppUrl(message)).catch(() => {
      Alert.alert('Unable to open WhatsApp', 'Please make sure WhatsApp is installed and try again.');
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={palette.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Support Center</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* ── Hero banner ── */}
      <View style={styles.heroBanner}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="headset-outline" size={28} color={palette.accent} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSubtitle}>
            Select a topic for guided help, or jump straight to WhatsApp if it's urgent.
          </Text>
        </View>
      </View>

      {/* ── Breadcrumb trail ── */}
      {trail.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.trailScroll}
          contentContainerStyle={styles.trailContent}
        >
          {trail.map((title, index) => (
            <React.Fragment key={`${title}-${index}`}>
              {index > 0 && (
                <Ionicons name="chevron-forward" size={11} color={palette.textFaint} style={styles.trailArrow} />
              )}
              <View style={[styles.trailChip, index === trail.length - 1 && styles.trailChipActive]}>
                <Text style={[styles.trailChipText, index === trail.length - 1 && styles.trailChipTextActive]}>
                  {title}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </ScrollView>
      ) : null}

      {/* ── Loading ── */}
      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={styles.stateText}>Loading support options...</Text>
        </View>

      ) : error ? (
        /* ── Error ── */
        <View style={styles.stateBox}>
          <View style={styles.stateIconWrap}>
            <Ionicons name="alert-circle" size={28} color={palette.danger} />
          </View>
          <Text style={styles.stateTitle}>Something went wrong</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void loadNode(currentNode?.id)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={14} color="#fff" />
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>

      ) : currentNode ? (
        <>
          {/* ── Node info card ── */}
          <View style={styles.nodeCard}>
            <View style={styles.nodeAccentBar} />
            <View style={styles.nodeInner}>
              <Text style={styles.nodeTitle}>{currentNode.title}</Text>
              <Text style={styles.nodeMessage}>{currentNode.message}</Text>
              {currentNode.helperText ? (
                <View style={styles.nodeHelperRow}>
                  <Ionicons name="information-circle-outline" size={14} color={palette.blue} />
                  <Text style={styles.nodeHelperText}>{currentNode.helperText}</Text>
                </View>
              ) : null}
              {currentNode.resolutionHints?.length ? (
                <View style={styles.hintsList}>
                  {currentNode.resolutionHints.map(hint => (
                    <View key={hint} style={styles.hintItem}>
                      <View style={styles.hintCheck}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                      <Text style={styles.hintItemText}>{hint}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          {/* ── Back / Start over ── */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleBackStep} activeOpacity={0.8}>
              <Ionicons name="arrow-undo-outline" size={15} color={palette.textMuted} />
              <Text style={styles.actionBtnText}>{history.length > 1 ? 'Back' : 'Close'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => void handleRestart()} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={15} color={palette.textMuted} />
              <Text style={styles.actionBtnText}>Start over</Text>
            </TouchableOpacity>
          </View>

          {/* ── Options list ── */}
          {currentNode.options.length > 0 ? (
            <View style={styles.optionsList}>
              {currentNode.options.map(option => {
                const meta = getOptionMeta(option.id);
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.optionCard}
                    onPress={() => void handleOptionPress(option)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.optionIconWrap, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={20} color={meta.color} />
                    </View>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionTitle}>{option.label}</Text>
                      {option.description ? (
                        <Text style={styles.optionDesc}>{option.description}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.optionChevronWrap, { backgroundColor: meta.bg }]}>
                      <Ionicons name="chevron-forward" size={14} color={meta.color} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

          ) : (
            /* ── Leaf resolution card ── */
            <View style={styles.leafCard}>
              <View style={styles.leafIconWrap}>
                <Ionicons name="checkmark-circle" size={22} color={palette.accent} />
              </View>
              <View style={styles.leafCopy}>
                <Text style={styles.leafTitle}>Step completed</Text>
                <Text style={styles.leafText}>
                  If this didn't fully resolve your issue, tap the button below to chat with our team on WhatsApp.
                </Text>
              </View>
            </View>
          )}

          {/* ── Recent bookings ── */}
          {recentBookings.length > 0 ? (
            <View style={styles.recentSection}>
              <View style={styles.recentSectionHeader}>
                <Ionicons name="time-outline" size={15} color={palette.textMuted} />
                <Text style={styles.recentSectionTitle}>
                  {currentNode.recentBookingScope === 'payments' ? 'Recent payment bookings' : 'Recent bookings'}
                </Text>
              </View>
              {recentBookings.map(booking => {
                const status = booking.paymentStatus || booking.status || null;
                const statusColor = getStatusColor(status);
                return (
                  <View key={booking.bookingId} style={styles.recentCard}>
                    <View style={styles.recentTopRow}>
                      <Text style={styles.recentId} numberOfLines={1}>{booking.bookingId}</Text>
                      <View style={[
                        styles.recentStatusBadge,
                        { backgroundColor: `${statusColor}1a`, borderColor: `${statusColor}44` },
                      ]}>
                        <Text style={[styles.recentStatusText, { color: statusColor }]}>
                          {(status || '--').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {(booking.source || booking.destination) ? (
                      <View style={styles.recentRoute}>
                        <View style={styles.recentDotGreen} />
                        <Text style={styles.recentRouteStop} numberOfLines={1}>{booking.source || '--'}</Text>
                        <Ionicons name="arrow-forward" size={11} color={palette.textFaint} />
                        <View style={styles.recentDotRed} />
                        <Text style={styles.recentRouteStop} numberOfLines={1}>{booking.destination || '--'}</Text>
                      </View>
                    ) : null}
                    <View style={styles.recentMetaRow}>
                      <Text style={styles.recentMeta}>Rs {booking.fare.toFixed(2)}</Text>
                      <View style={styles.recentMetaDot} />
                      <Text style={styles.recentMeta}>{booking.passengerCount} pax</Text>
                      {booking.paymentMode ? (
                        <>
                          <View style={styles.recentMetaDot} />
                          <Text style={styles.recentMeta}>{booking.paymentMode}</Text>
                        </>
                      ) : null}
                    </View>
                    {(booking.razorpayPaymentId || booking.razorpayOrderId) ? (
                      <Text style={styles.recentRef}>
                        Ref: {booking.razorpayPaymentId || booking.razorpayOrderId}
                      </Text>
                    ) : null}
                    {booking.bookedAt ? (
                      <Text style={styles.recentDate}>{new Date(booking.bookedAt).toLocaleString()}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* ── WhatsApp escalation ── */}
          {currentNode.allowEscalation ? (
            <TouchableOpacity style={styles.waBtn} onPress={handleEscalate} activeOpacity={0.85}>
              <View style={styles.waBtnIconWrap}>
                <Ionicons name="logo-whatsapp" size={22} color="#fff" />
              </View>
              <View style={styles.waBtnCopy}>
                <Text style={styles.waBtnTitle}>Chat with Support</Text>
                <Text style={styles.waBtnSub}>Your details are prefilled automatically</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 18, paddingTop: topInset, paddingBottom: 44 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerBack: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: palette.text, fontSize: 18, fontWeight: '800' },
  headerSpacer: { width: 42 },

  // Hero banner
  heroBanner: {
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  heroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: palette.accentSoft,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroCopy: { flex: 1 },
  heroTitle: { color: palette.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  heroSubtitle: { color: palette.textMuted, fontSize: 12.5, lineHeight: 18 },

  // Breadcrumb trail
  trailScroll: { marginBottom: 14 },
  trailContent: { alignItems: 'center', gap: 5, paddingVertical: 2 },
  trailArrow: { marginHorizontal: 1 },
  trailChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  trailChipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.borderStrong,
  },
  trailChipText: { color: palette.textFaint, fontSize: 11, fontWeight: '700' },
  trailChipTextActive: { color: palette.accent },

  // State box (loading / error)
  stateBox: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  stateIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: palette.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  stateText: { color: palette.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  retryBtn: {
    marginTop: 4,
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Node info card
  nodeCard: {
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 20,
    marginTop: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#10243c',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  nodeAccentBar: {
    width: 5,
    backgroundColor: palette.accent,
  },
  nodeInner: { flex: 1, padding: 18 },
  nodeTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
  nodeMessage: { color: palette.textMuted, fontSize: 13.5, lineHeight: 20, marginTop: 9 },
  nodeHelperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 12,
    backgroundColor: palette.blueSoft,
    borderRadius: 12,
    padding: 11,
  },
  nodeHelperText: { flex: 1, color: palette.blue, fontSize: 12, lineHeight: 17 },
  hintsList: { marginTop: 14, gap: 9 },
  hintItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hintCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hintItemText: { color: palette.text, fontSize: 12.5, fontWeight: '700', flex: 1 },

  // Actions row (back / start over)
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  actionBtn: {
    flex: 1,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnText: { color: palette.textMuted, fontSize: 12.5, fontWeight: '700' },

  // Options list
  optionsList: { gap: 10, marginTop: 12 },
  optionCard: {
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    shadowColor: '#10243c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
    elevation: 1,
  },
  optionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionCopy: { flex: 1 },
  optionTitle: { color: palette.text, fontSize: 13.5, fontWeight: '800' },
  optionDesc: { color: palette.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  optionChevronWrap: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Leaf / resolution card
  leafCard: {
    marginTop: 12,
    backgroundColor: palette.accentSoft,
    borderWidth: 1.5,
    borderColor: palette.borderStrong,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  leafIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(0,184,135,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  leafCopy: { flex: 1 },
  leafTitle: { color: palette.accent, fontSize: 13.5, fontWeight: '800' },
  leafText: { color: palette.text, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  // Recent bookings
  recentSection: { marginTop: 20, gap: 10 },
  recentSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  recentSectionTitle: { color: palette.textMuted, fontSize: 13, fontWeight: '700' },
  recentCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 14,
    gap: 7,
  },
  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recentId: { color: palette.text, fontSize: 11.5, fontWeight: '800', flex: 1 },
  recentStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  recentStatusText: { fontSize: 10, fontWeight: '800' },
  recentRoute: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  recentDotGreen: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00b887', flexShrink: 0 },
  recentDotRed: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d74262', flexShrink: 0 },
  recentRouteStop: { color: palette.textMuted, fontSize: 12, fontWeight: '600', flex: 1 },
  recentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  recentMeta: { color: palette.textFaint, fontSize: 11.5, fontWeight: '600' },
  recentMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: palette.textFaint },
  recentRef: { color: palette.textFaint, fontSize: 10.5 },
  recentDate: { color: palette.textFaint, fontSize: 10.5 },

  // WhatsApp escalation button
  waBtn: {
    marginTop: 18,
    backgroundColor: '#1ab452',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    shadowColor: '#1ab452',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    elevation: 6,
  },
  waBtnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  waBtnCopy: { flex: 1 },
  waBtnTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  waBtnSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11.5, marginTop: 2 },
});

export default SupportScreen;
